// Calculs : bilan du mois, historique, charges récurrentes et pistes d'économies.
// Tous les montants sont en centimes (entiers) pour éviter les erreurs d'arrondi.

import { CATEGORIES, CAT, categorize, merchantKey, displayName, holderTokens } from './categories.js';
import { normalize } from './lcl.js';

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}
export const monthOf = dateIso => dateIso.slice(0, 7);
const daysInMonth = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };

/** Toutes les opérations de tous les relevés, enrichies (catégorie, nom, date effective…) */
export function allTransactions(state) {
  const out = [];
  for (const st of Object.values(state.statements)) {
    const ctx = { holderTokens: holderTokens(st.holder) };
    st.transactions.forEach((t, i) => {
      const tx = { ...t, id: t.id || `${st.id}#${i}`, statementId: st.id, account: st.accountLabel };
      // Date d'achat réelle pour les paiements carte, sinon date de l'opération
      tx.effDate = tx.cardDate || tx.date;
      tx.month = monthOf(tx.effDate);
      tx.key = merchantKey(tx);
      const c = categorize(tx, state, ctx);
      tx.cat = c.cat; tx.catSource = c.source;
      const d = displayName(tx);
      tx.name = d.name; tx.sub = d.sub;
      out.push(tx);
    });
  }
  out.sort((a, b) => b.effDate.localeCompare(a.effDate) || a.id.localeCompare(b.id));
  return out;
}

export function monthsWithData(txs) {
  return [...new Set(txs.map(t => t.month))].sort();
}

/** Nombre de jours du mois couverts par les relevés importés */
export function coverage(state, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = daysInMonth(monthKey);
  const covered = new Set();
  for (const st of Object.values(state.statements)) {
    if (!st.periodStart || !st.periodEnd) continue;
    for (let d = 1; d <= total; d++) {
      const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
      if (iso >= st.periodStart && iso <= st.periodEnd) covered.add(d);
    }
  }
  const missing = [];
  for (let d = 1; d <= total; d++) if (!covered.has(d)) missing.push(d);
  return { total, covered: covered.size, complete: covered.size === total, missing, year: y, month: m };
}

/** Bilan d'un ensemble d'opérations (un mois) */
export function summarize(txs) {
  const byCat = {};
  for (const c of CATEGORIES) byCat[c.id] = { net: 0, count: 0, txs: [] };
  for (const t of txs) {
    const b = byCat[t.cat] || (byCat[t.cat] = { net: 0, count: 0, txs: [] });
    b.net += t.amount; b.count++; b.txs.push(t);
  }
  let revenus = 0, depenses = 0, fixes = 0, variables = 0, epargne = 0, transferts = 0;
  for (const c of CATEGORIES) {
    const net = byCat[c.id].net;
    if (c.type === 'revenu') revenus += net;
    else if (c.type === 'depense') { depenses -= net; if (c.fixe) fixes -= net; else variables -= net; }
    else if (c.type === 'epargne') epargne -= net;
    else if (c.type === 'interne') transferts -= net;
  }
  const flux = txs.reduce((s, t) => s + t.amount, 0);
  return { byCat, revenus, depenses, fixes, variables, epargne, transferts, flux, count: txs.length };
}

/** Montant dépensé (positif) d'une catégorie de dépense dans un bilan */
export const spent = (sum, catId) => -(sum.byCat[catId]?.net || 0);

const euros = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0€';
const eurosRound = c => Math.round(c / 100).toLocaleString('fr-FR') + '\u00a0€';
const shortDate = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function sumCommissions(txs) {
  let total = 0; const list = [];
  for (const t of txs) {
    for (const d of t.details) {
      const m = d.match(/COM CHANGE\s+([\d]+,\d{2})\s*E/i);
      if (m) { const c = Math.round(parseFloat(m[1].replace(',', '.')) * 100); total += c; list.push({ t, c }); }
    }
  }
  return { total, list };
}

/**
 * Pistes d'économies et points d'attention pour un mois.
 * Renvoie une liste de { level: 'alerte'|'conseil'|'info'|'bravo', icon, title, text, items? }
 */
export function insights(state, txs, monthKey) {
  const out = [];
  const monthTxs = txs.filter(t => t.month === monthKey);
  if (!monthTxs.length) return out;
  const sum = summarize(monthTxs);
  const cov = coverage(state, monthKey);
  const full = cov.covered >= 25; // mois (presque) complet : projections et comparaisons possibles

  // 1. À classer
  const todo = monthTxs.filter(t => t.cat === 'a_classer');
  if (todo.length) {
    out.push({
      level: 'info', icon: '❓', action: 'a_classer', first: true,
      title: `${todo.length} opération${todo.length > 1 ? 's' : ''} à classer (${euros(-todo.reduce((s, t) => s + t.amount, 0))})`,
      text: "Classe-les une fois : l'appli retiendra le commerçant pour les mois suivants.",
    });
  }

  // 2. Paiements en double possibles
  const cardOps = monthTxs.filter(t => t.amount <= -500 && /^CB\b/.test(normalize(t.label)));
  const seen = new Map();
  const doubles = [];
  for (const t of cardOps) {
    const k = t.effDate + '|' + t.amount + '|' + t.key.replace(/^CB /, '').slice(0, 4);
    if (seen.has(k)) doubles.push([seen.get(k), t]); else seen.set(k, t);
  }
  for (const [a, b] of doubles) {
    out.push({
      level: 'alerte', icon: '⚠️',
      title: `Paiement en double ? 2 × ${euros(-a.amount)} le ${shortDate(a.effDate)}`,
      text: `« ${a.name} » et « ${b.name} » : même jour, même montant. Vérifie qu'il s'agit bien de deux achats différents, sinon demande un remboursement.`,
    });
  }

  // 3. Commissions de change
  const com = sumCommissions(monthTxs);
  if (com.total > 0) {
    const revolut = com.list.filter(x => /REVOLUT/.test(normalize(x.t.label)));
    const revTotal = revolut.reduce((s, x) => s + x.c, 0);
    const others = com.list.length - revolut.length;
    const parts = [];
    if (others > 0) parts.push(`${others} paiement${others > 1 ? 's' : ''} en devise étrangère (voyage, achat à l'étranger) : une carte sans frais à l'étranger éviterait ces commissions.`);
    if (revTotal > 0) parts.push(`${euros(revTotal)} sur tes paiements vers Revolut, qui passent en devise étrangère${full ? ` (≈ ${eurosRound(revTotal * 12)} par an si ça se répète chaque mois)` : ''}. En rechargeant Revolut en euros, puis en convertissant dans Revolut, tu éviterais cette commission LCL.`);
    out.push({ level: 'conseil', icon: '💱', title: `Commissions de change LCL : ${euros(com.total)}`, text: parts.join(' ') });
  }

  // 4. Frais bancaires (récapitulatif LCL du relevé qui couvre ce mois, sinon le plus récent)
  const frais = spent(sum, 'banque');
  const sts = Object.values(state.statements);
  const touching = sts.filter(s => s.periodStart && s.periodStart.slice(0, 7) <= monthKey && s.periodEnd.slice(0, 7) >= monthKey);
  const recaps = (touching.length ? touching : sts).map(s => s.feesRecap).filter(r => r && r.total);
  recaps.sort((a, b) => (b.to || '').localeCompare(a.to || ''));
  if (!full) {
    // mois partiel : pas de projection sur l'année
  } else if (recaps.length) {
    const r = recaps[0];
    const lines = r.lines.map(l => `${l.label.toLowerCase()} ${euros(l.amount)}`).join(', ');
    out.push({
      level: 'conseil', icon: '🏦',
      title: `Frais LCL : ${euros(r.total)} par mois ≈ ${eurosRound(r.total * 12)} par an`,
      text: `D'après le récapitulatif de ton relevé (${monthLabel(r.from ? r.from.slice(0, 7) : monthKey)}) : ${lines}. Ça vaut le coup de comparer avec une offre sans frais de tenue de compte, ou de demander un geste à ton conseiller.`,
    });
  } else if (frais > 0) {
    out.push({ level: 'conseil', icon: '🏦', title: `Frais bancaires : ${euros(frais)}`, text: `Soit environ ${eurosRound(frais * 12)} par an.` });
  }

  // 5. Agios
  const agios = monthTxs.filter(t => t.amount < 0 && /INTERETS DEBITEURS|AGIOS/.test(normalize(t.label)));
  if (agios.length) {
    out.push({ level: 'alerte', icon: '🔴', title: `Agios payés : ${euros(-agios.reduce((s, t) => s + t.amount, 0))}`, text: 'Le compte est passé à découvert. Garder un petit matelas en début de mois évite ces intérêts.' });
  }

  // 6. Budgets
  for (const c of CATEGORIES) {
    const b = state.budgets?.[c.id];
    if (!b) continue;
    const s = spent(sum, c.id);
    if (s > b) {
      out.push({ level: 'alerte', icon: c.icon, title: `${c.label} : budget dépassé de ${euros(s - b)}`, text: `${euros(s)} dépensés pour un budget de ${euros(b)}.` });
    } else if (s >= b * 0.9 && !cov.complete) {
      out.push({ level: 'info', icon: c.icon, title: `${c.label} : ${Math.round((s / b) * 100)} % du budget`, text: `Il reste ${euros(b - s)} pour ce mois.` });
    }
  }

  // 7. Comparaison avec la moyenne des mois précédents complets
  const prevMonths = monthsWithData(txs).filter(m => m < monthKey && coverage(state, m).covered >= 25).slice(-6);
  if (prevMonths.length && cov.covered >= 25) {
    const prevSums = prevMonths.map(m => summarize(txs.filter(t => t.month === m)));
    for (const c of CATEGORIES.filter(c => c.type === 'depense' && c.id !== 'a_classer')) {
      const avg = prevSums.reduce((s, ps) => s + spent(ps, c.id), 0) / prevSums.length;
      const now = spent(sum, c.id);
      if (now - avg >= 3000 && now > avg * 1.25) {
        out.push({
          level: 'conseil', icon: '📈',
          title: `${c.label} : +${euros(now - avg)} par rapport à d'habitude`,
          text: `${euros(now)} ce mois-ci, contre ${euros(Math.round(avg))} en moyenne sur ${prevMonths.length} mois.`,
        });
      }
    }
  }

  // 8. Restos & livraison
  const restos = sum.byCat.restos.txs.filter(t => t.amount < 0);
  if (restos.length) {
    const tot = -restos.reduce((s, t) => s + t.amount, 0);
    const livr = restos.filter(t => /DELIVEROO|UBER ?EATS|JUST ?EAT/.test(normalize(t.label)));
    const livrTot = -livr.reduce((s, t) => s + t.amount, 0);
    let text = `${restos.length} passage${restos.length > 1 ? 's' : ''}, ${euros(Math.round(tot / restos.length))} en moyenne.` + (full ? ` À ce rythme : environ ${eurosRound(tot * 12)} par an.` : '');
    if (livr.length) text += ` Dont ${livr.length} commande${livr.length > 1 ? 's' : ''} en livraison (${euros(livrTot)}) : c'est souvent le poste le plus facile à réduire.`;
    out.push({ level: 'conseil', icon: '🍽️', title: `Restos, cafés & livraison : ${euros(tot)}`, text });
  }

  // 9. Petites dépenses répétées (même commerçant, 3 fois ou plus)
  const byKey = {};
  for (const t of monthTxs.filter(t => t.amount < 0 && t.amount > -2500 && /^CB\b/.test(normalize(t.label)))) {
    (byKey[t.key] = byKey[t.key] || []).push(t);
  }
  const repeated = Object.values(byKey).filter(l => l.length >= 3).sort((a, b) => b.length - a.length);
  if (repeated.length) {
    out.push({
      level: 'info', icon: '☕', title: 'Petites dépenses qui reviennent souvent',
      text: 'Chacune paraît anodine, mais elles s\'additionnent :',
      items: repeated.slice(0, 5).map(l => `${l[0].name} : ${l.length} fois, ${euros(-l.reduce((s, t) => s + t.amount, 0))}`),
    });
  }

  // 10. Abonnements et prélèvements
  const recurring = monthTxs.filter(t => t.amount < 0 && (t.cat === 'abonnements' || t.cat === 'telecom' || /^PRLV/.test(normalize(t.label)) && CAT[t.cat]?.type === 'depense'));
  if (recurring.length) {
    const tot = -recurring.reduce((s, t) => s + t.amount, 0);
    out.push({
      level: 'conseil', icon: '🔁',
      title: `Abonnements & prélèvements : ${euros(tot)}` + (full ? ` ce mois ≈ ${eurosRound(tot * 12)} par an` : ''),
      text: 'Passe la liste en revue : un abonnement oublié, c\'est de l\'argent qui part tous les mois sans rien en retour. Pour résilier, le plus simple est souvent de passer par l\'espace client du service.',
      items: recurring.sort((a, b) => a.amount - b.amount).map(t => `${t.name} : ${euros(-t.amount)}`),
    });
  }

  // 11. Transferts vers d'autres comptes
  if (sum.transferts > 0) {
    out.push({
      level: 'info', icon: '🔄', title: `${euros(sum.transferts)} envoyés vers tes autres comptes`,
      text: "Ces sommes ne sont pas comptées comme des dépenses : ce qui est dépensé depuis ces comptes (Revolut, compte de dépôts…) n'apparaît pas ici.",
    });
  }

  // 12. Épargne
  if (sum.epargne > 0) {
    const arrondis = monthTxs.filter(t => /TOTAL OPTION SYSTEM/.test(normalize(t.label))).reduce((s, t) => s - t.amount, 0);
    const taux = full && sum.revenus > 0 ? Math.round((sum.epargne / sum.revenus) * 100) : null;
    out.push({
      level: 'bravo', icon: '🐷',
      title: `${euros(sum.epargne)} mis de côté${taux != null ? ` (${taux} % des revenus)` : ''}`,
      text: arrondis > 0 ? `Dont ${euros(arrondis)} grâce aux arrondis System'Épargne, sans y penser.` : 'Bien joué : l\'épargne automatique est la meilleure des habitudes.',
    });
  }

  const order = { alerte: 0, conseil: 1, info: 2, bravo: 3 };
  return out.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || order[a.level] - order[b.level]);
}

/** Totaux par mois pour l'historique */
export function history(state, txs) {
  return monthsWithData(txs).map(m => {
    const s = summarize(txs.filter(t => t.month === m));
    return { month: m, ...s, coverage: coverage(state, m) };
  });
}

export { euros, eurosRound, shortDate };
