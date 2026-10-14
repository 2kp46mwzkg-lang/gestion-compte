// Lecteur de relevés de compte LCL (PDF).
//
// Entrée : la liste des pages, chacune avec les morceaux de texte et leur
// position, tels que pdf.js les fournit (voir pdf-extract.js).
// Sortie : un objet "relevé" avec les opérations, les soldes et un contrôle
// de cohérence (ancien solde + crédits - débits = nouveau solde).
//
// Le relevé LCL est un tableau à 5 colonnes : DATE | LIBELLE | VALEUR | DEBIT | CREDIT.
// Une opération commence sur une ligne qui a une date ; les lignes suivantes
// sans date sont la suite du libellé (référence, taux de change, etc.).

const DATE_RE = /^\d{2}\.\d{2}$/;
const VALEUR_RE = /^\d{2}\.\d{2}\.\d{2}$/;
const AMOUNT_RE = /^\d{1,3}(?:[   ]?\d{3})*,\d{2}$/;

export function normalize(s) {
  return (s || '')
    .replace(/\{/g, 'E') // LCL écrit parfois « d{pôts » pour « dépôts »
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[\s  ]+/g, ' ')
    .trim();
}

/** "1 966,30" -> 196630 (centimes) ; null si ce n'est pas un montant */
export function parseAmountCents(str) {
  const s = (str || '').trim();
  if (!AMOUNT_RE.test(s)) return null;
  const clean = s.replace(/[   ]/g, '').replace(',', '.');
  return Math.round(parseFloat(clean) * 100);
}

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Regroupe les morceaux de texte d'une page en lignes (même hauteur). */
function toLines(items) {
  const sorted = items
    .filter(i => i.str && i.str.trim())
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2) {
      last.items.push(it);
    } else {
      lines.push({ y: it.y, items: [it] });
    }
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map(i => i.str.trim()).join(' ');
    l.norm = normalize(l.text);
  }
  return lines;
}

function findHeader(lines) {
  for (const l of lines) {
    const get = word => l.items.find(i => normalize(i.str) === word);
    const date = get('DATE'), lib = get('LIBELLE'), val = get('VALEUR'), deb = get('DEBIT'), cre = get('CREDIT');
    if (date && lib && val && deb && cre) return { line: l, date, lib, val, deb, cre };
  }
  return null;
}

/** Devine l'année d'une date "JJ.MM" à partir de la période du relevé. */
function yearFor(month, period) {
  if (!period) return new Date().getFullYear();
  if (period.startYear === period.endYear) return period.startYear;
  // Relevé à cheval sur deux années (ex. 05.12 -> 04.01)
  return month >= period.startMonth ? period.startYear : period.endYear;
}

export function parseLCL(pages) {
  const result = {
    bank: 'LCL',
    holder: null,
    accountKey: null,
    accountLabel: null,
    number: null,
    periodStart: null,
    periodEnd: null,
    openingBalance: null,
    closingBalance: null,
    totals: null,
    transactions: [],
    feesRecap: null,
    warnings: [],
  };

  const allLines = pages.map(p => toLines(p.items));
  const flat = allLines.flat();

  // --- En-tête : banque, période, titulaire, compte ---
  const isLCL = flat.some(l => /CREDIT LYONNAIS|LCL/.test(l.norm));
  if (!isLCL) {
    throw new Error("Ce PDF ne ressemble pas à un relevé LCL.");
  }

  let period = null;
  for (const l of flat) {
    const m = l.text.match(/du\s+(\d{2})\.(\d{2})\.(\d{4})\s+au\s+(\d{2})\.(\d{2})\.(\d{4})(?:\s*-\s*N°\s*(\d+))?/i);
    if (m) {
      period = { startYear: +m[3], startMonth: +m[2], endYear: +m[6], endMonth: +m[5] };
      result.periodStart = iso(+m[3], +m[2], +m[1]);
      result.periodEnd = iso(+m[6], +m[5], +m[4]);
      result.number = m[7] || null;
      break;
    }
  }
  if (!period) result.warnings.push("Période du relevé introuvable : l'année des opérations est devinée.");

  for (let i = 0; i < flat.length; i++) {
    if (/TITULAIRE DU COMPTE/.test(flat[i].norm) && flat[i + 1]) {
      result.holder = flat[i + 1].items.filter(it => it.x < 250).map(it => it.str.trim()).join(' ');
      break;
    }
  }
  if (!result.holder) {
    const idx = flat.findIndex(l => /^INDICATIF :/.test(l.norm));
    if (idx > 0) result.holder = flat[idx - 1].text;
  }

  const ibanLine = flat.find(l => /IBAN\s*:/.test(l.text));
  if (ibanLine) {
    const iban = ibanLine.text.split(/IBAN\s*:/)[1].replace(/\s+/g, '').toUpperCase();
    result.accountKey = 'LCL-' + iban;
    result.accountLabel = 'LCL ••••' + iban.slice(-6);
  } else {
    const compte = flat.find(l => /COMPTE : /.test(l.norm));
    if (compte) {
      const num = compte.norm.split('COMPTE : ')[1].replace(/\s+/g, '');
      result.accountKey = 'LCL-' + num;
      result.accountLabel = 'LCL ••••' + num.slice(-6);
    } else {
      result.accountKey = 'LCL-inconnu';
      result.accountLabel = 'LCL';
    }
  }

  // --- Tableau des écritures ---
  let current = null;
  let finished = false;

  for (const lines of allLines) {
    if (finished) break;
    const h = findHeader(lines);
    if (!h) continue;

    const dateMaxX = h.date.x + h.date.w + 6;
    const libMaxX = h.val.x - 3;
    const amountMinX = h.val.x + h.val.w + 4;
    const creditMinRight = h.cre.x; // un montant dont le bord droit dépasse le début de "CREDIT" est un crédit

    for (const line of lines) {
      if (line.y >= h.line.y - 1) continue; // au-dessus du tableau
      if (/^PAGE \d+ \/ \d+$/.test(line.norm) || /CREDIT LYONNAIS-SA/.test(line.norm)) break;

      let dateStr = null, valStr = null;
      const lib = [];
      const deb = [], cre = [];
      for (const it of line.items) {
        const s = it.str.trim();
        if (!s) continue;
        if (it.x < dateMaxX && DATE_RE.test(s)) { dateStr = s; continue; }
        if (it.x < libMaxX) { lib.push(s); continue; }
        if (it.x < amountMinX && VALEUR_RE.test(s)) { valStr = s; continue; }
        if (it.x >= amountMinX) {
          if (it.x + it.w >= creditMinRight) cre.push(s); else deb.push(s);
        }
      }
      const libText = lib.join(' ').replace(/\s+/g, ' ').trim();
      const libNorm = normalize(libText);
      const debit = deb.length ? parseAmountCents(deb.join(' ')) : null;
      const credit = cre.length ? parseAmountCents(cre.join(' ')) : null;
      const signed = credit != null ? credit : (debit != null ? -debit : null);

      if (libNorm === 'ANCIEN SOLDE') {
        result.openingBalance = signed;
        current = null;
        continue;
      }
      if (libNorm.startsWith('SOLDE INTERMEDIAIRE')) {
        current = null;
        continue;
      }
      if (libNorm === 'TOTAUX') {
        result.totals = { debit: debit || 0, credit: credit || 0 };
        current = null;
        continue;
      }
      if (libNorm.startsWith('SOLDE EN EUROS') || libNorm.startsWith('NOUVEAU SOLDE')) {
        result.closingBalance = signed;
        finished = true;
        break;
      }

      if (dateStr && libText) {
        const [d, m] = dateStr.split('.').map(Number);
        const date = iso(yearFor(m, period), m, d);
        let valueDate = null;
        if (valStr) {
          const [vd, vm, vy] = valStr.split('.').map(Number);
          valueDate = iso(2000 + vy, vm, vd);
        }
        let cardDate = null;
        const cm = libText.match(/(\d{2})\/(\d{2})\/(\d{2})\s*$/);
        if (cm && /^CB\b/i.test(libText)) cardDate = iso(2000 + +cm[3], +cm[2], +cm[1]);
        current = { date, valueDate, cardDate, label: libText, details: [], amount: signed };
        if (signed == null) result.warnings.push(`Montant introuvable pour « ${libText} » (${dateStr}).`);
        result.transactions.push(current);
        continue;
      }
      if (!dateStr && libText && current) {
        current.details.push(libText);
      }
    }
  }

  // --- Récapitulatif des frais (en bas du relevé) ---
  const recapIdx = flat.findIndex(l => /RECAPITULATIF DES FRAIS/.test(l.norm));
  if (recapIdx >= 0) {
    const head = flat[recapIdx];
    const m = head.text.match(/du\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/);
    const recap = {
      from: m ? iso(+m[3], +m[2], +m[1]) : null,
      to: m ? iso(+m[6], +m[5], +m[4]) : null,
      lines: [],
      total: null,
    };
    for (let i = recapIdx + 1; i < flat.length && i < recapIdx + 25; i++) {
      const l = flat[i];
      const label = l.items.filter(it => it.x < 400).map(it => it.str.trim()).join(' ').trim();
      const amountItems = l.items.filter(it => it.x >= 400);
      const amount = amountItems.length ? parseAmountCents(amountItems.map(it => it.str).join(' ')) : null;
      if (/^TOTAL\b/.test(normalize(label))) { recap.total = amount; break; }
      if (/SOUS TOTAUX/.test(normalize(label))) continue;
      if (label && amount != null) recap.lines.push({ label, amount });
    }
    if (recap.total != null || recap.lines.length) result.feesRecap = recap;
  }

  // --- Contrôles ---
  const sumDebit = result.transactions.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const sumCredit = result.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const checks = { sumDebit, sumCredit, balanceOk: null, totalsOk: null };
  if (result.openingBalance != null && result.closingBalance != null) {
    checks.computedClosing = result.openingBalance + sumCredit - sumDebit;
    checks.balanceOk = checks.computedClosing === result.closingBalance;
  }
  if (result.totals) {
    // Chez LCL, l'ancien solde est inclus dans la colonne des totaux.
    const op = result.openingBalance || 0;
    const expDebit = sumDebit + (op < 0 ? -op : 0);
    const expCredit = sumCredit + (op > 0 ? op : 0);
    checks.totalsOk = expDebit === result.totals.debit && expCredit === result.totals.credit;
  }
  checks.ok = checks.balanceOk !== false && checks.totalsOk !== false && (checks.balanceOk || checks.totalsOk) === true;
  result.checks = checks;

  if (!result.transactions.length) {
    throw new Error("Aucune opération trouvée dans ce PDF. Est-ce bien un relevé de compte LCL ?");
  }
  return result;
}
