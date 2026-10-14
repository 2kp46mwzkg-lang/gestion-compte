// Mon budget : interface (affichage, import des relevés, classement, réglages)

import { extractPages } from './pdf-extract.js';
import { parseLCL } from './lcl.js';
import { CATEGORIES, CAT } from './categories.js';
import {
  allTransactions, monthsWithData, summarize, insights, coverage, history,
  monthLabel, spent, euros, MONTHS_FR,
} from './analysis.js';
import * as store from './store.js';

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
let state = store.load();
let txs = [];
const ui = { tab: 'mois', month: null, cat: null, search: '' };

const $ = sel => document.querySelector(sel);
const view = $('#view');

function refresh() {
  txs = allTransactions(state);
  const months = monthsWithData(txs);
  if (!ui.month || !months.includes(ui.month)) ui.month = defaultMonth(months);
}

/** Le mois affiché par défaut : le plus récent qui est (presque) complet */
function defaultMonth(months) {
  for (let i = months.length - 1; i >= 0; i--) {
    if (coverage(state, months[i]).covered >= 25) return months[i];
  }
  return months[months.length - 1] || null;
}

function persist() {
  if (!store.save(state)) toast("Impossible d'enregistrer sur cet appareil (stockage plein ou navigation privée).");
}

// ---------------------------------------------------------------------------
// Petits utilitaires d'affichage
// ---------------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = c => (c > 0 ? '+' : c < 0 ? '−' : '') + euros(Math.abs(c));
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const dateObj = iso => new Date(iso + 'T12:00:00');
const fmtDay = iso => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj(iso));
const fmtDate = iso => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj(iso));
const fmtShort = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '?';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function busy(on, text) {
  $('#busy').hidden = !on;
  if (text) $('#busy-text').textContent = text;
}

// ---------------------------------------------------------------------------
// Rendu principal
// ---------------------------------------------------------------------------
function render() {
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const hasData = Object.keys(state.statements).length > 0;
  if (!hasData && ui.tab !== 'reglages') { view.innerHTML = renderEmpty(); return; }
  if (ui.tab === 'mois') view.innerHTML = renderMonth();
  else if (ui.tab === 'operations') view.innerHTML = renderOperations();
  else if (ui.tab === 'historique') view.innerHTML = renderHistory();
  else view.innerHTML = renderSettings();
}

function renderEmpty() {
  return `
  <section class="empty">
    <h2>Tes relevés, rangés mois par mois</h2>
    <p>Importe ton relevé de compte LCL en PDF : l'appli classe chaque opération et te montre où part ton argent, avec des pistes pour dépenser moins.</p>
    <ol class="steps">
      <li><strong>Télécharge ton relevé en PDF</strong> depuis l'appli ou le site LCL (rubrique des relevés de compte).</li>
      <li><strong>Importe-le ici.</strong> Tu peux en choisir plusieurs d'un coup, par exemple les 6 derniers mois.</li>
      <li><strong>Classe les opérations inconnues une seule fois.</strong> L'appli retient le commerçant pour les mois suivants.</li>
    </ol>
    <div class="btn-row">
      <button class="btn btn-primary" type="button" data-action="import">Importer un relevé</button>
      <button class="btn" type="button" data-action="restore">Restaurer une sauvegarde</button>
    </div>
    <div class="privacy"><span aria-hidden="true">🔒</span><span>Tes relevés sont lus directement sur ton téléphone. Rien n'est envoyé sur Internet, ni sur GitHub : les données restent dans ce navigateur.</span></div>
  </section>`;
}

function monthNav() {
  const months = monthsWithData(txs);
  const i = months.indexOf(ui.month);
  return `
  <div class="month-nav">
    <h2>${esc(monthLabel(ui.month))}</h2>
    <div class="arrows">
      <button class="icon-btn" type="button" data-action="month" data-dir="-1" aria-label="Mois précédent" ${i <= 0 ? 'disabled' : ''}>‹</button>
      <button class="icon-btn" type="button" data-action="month" data-dir="1" aria-label="Mois suivant" ${i >= months.length - 1 ? 'disabled' : ''}>›</button>
    </div>
  </div>`;
}

function coverageNotice(m) {
  const cov = coverage(state, m);
  if (cov.complete) return '';
  const monthName = MONTHS_FR[cov.month - 1];
  let msg;
  if (cov.covered === 0) {
    msg = `<strong>Aucun relevé ne couvre ce mois.</strong> Seuls quelques paiements carte faits fin ${monthName} et débités le mois suivant apparaissent ici.`;
  } else {
    const miss = cov.missing;
    const parts = [];
    const startGap = miss[0] === 1 ? miss.filter((d, k) => d === k + 1) : [];
    const endGap = miss.length && miss[miss.length - 1] === cov.total ? miss.slice(startGap.length) : [];
    if (startGap.length) parts.push(`du 1er au ${startGap[startGap.length - 1]} ${monthName} : importe le relevé précédent`);
    if (endGap.length) parts.push(`à partir du ${endGap[0] === 1 ? '1er' : endGap[0]} ${monthName} : importe le relevé suivant quand il sera disponible`);
    if (!parts.length) parts.push(`${miss.length} jours`);
    msg = `<strong>Mois incomplet.</strong> Il manque les opérations ${parts.join(', et ')}.`;
  }
  return `<div class="notice"><span aria-hidden="true">ℹ️</span><span>${msg}</span></div>`;
}

// ----- Onglet « Mois » -----------------------------------------------------
function renderMonth() {
  const m = ui.month;
  const mtx = txs.filter(t => t.month === m);
  const sum = summarize(mtx);
  const cov = coverage(state, m);

  // Bande « où est passé l'argent »
  const R = Math.max(0, sum.revenus);
  const segs = [
    { cls: 'seg-fixe', color: 'var(--c-fixe)', label: 'Charges fixes', hint: 'Logement, crédits, assurances, abonnements, frais', v: Math.max(0, sum.fixes), cat: 'fixes' },
    { cls: 'seg-var', color: 'var(--c-var)', label: 'Dépenses courantes', hint: 'Courses, restos, transport, loisirs…', v: Math.max(0, sum.variables), cat: 'variables' },
    { cls: 'seg-save', color: 'var(--c-save)', label: 'Épargne', hint: 'Livrets, PEA, assurance vie, arrondis', v: Math.max(0, sum.epargne), cat: 'epargne' },
    { cls: 'seg-transfer', color: 'var(--c-transfer)', label: 'Vers mes autres comptes', hint: 'Revolut, compte de dépôts…', v: Math.max(0, sum.transferts), cat: 'transferts' },
  ];
  const S = segs.reduce((s, x) => s + x.v, 0);
  const base = Math.max(R, S) || 1;
  const rest = R - S;
  const band = segs.filter(s => s.v > 0).map(s => `<span class="${s.cls}" style="width:${pct(s.v, base)}%" title="${esc(s.label)} : ${euros(s.v)}"></span>`).join('')
    + (rest > 0 ? `<span class="seg-rest" style="width:${pct(rest, base)}%" title="Reste : ${euros(rest)}"></span>` : '')
    + (rest < 0 && R > 0 ? '' : '');

  const legend = segs.filter(s => s.v > 0).map(s => `
    <li><span class="dot" style="background:${s.color}"></span>
      <span>${s.label}<span class="hint">${s.hint}</span></span>
      <span class="amount">${euros(s.v)}</span></li>`).join('') + `
    <li class="${rest >= 0 ? 'rest' : 'neg'}"><span class="dot" style="${rest >= 0 ? 'background:var(--c-rest);box-shadow:inset 0 0 0 1.5px var(--c-in)' : 'background:var(--c-alert)'}"></span>
      <span>${rest >= 0 ? 'Reste ce mois-ci' : 'Plus de sorties que de rentrées'}<span class="hint">${rest >= 0 ? 'Rentrées moins toutes les sorties' : 'La différence a été prise sur le solde du compte'}</span></span>
      <span class="amount">${signed(rest)}</span></li>`;

  // Pistes d'économies
  const ins = insights(state, txs, m);
  const insHtml = ins.length ? `
    <section class="section">
      <div class="section-head"><h3>À regarder ce mois-ci</h3></div>
      <ul class="insights">${ins.map(i => `
        <li class="insight ${i.level}">
          <span class="ico" aria-hidden="true">${i.icon}</span>
          <h4>${esc(i.title)}</h4>
          <p>${esc(i.text)}</p>
          ${i.items ? `<ul>${i.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${i.action === 'a_classer' ? '<button class="btn btn-primary" type="button" data-action="filter-cat" data-cat="a_classer">Classer maintenant</button>' : ''}
        </li>`).join('')}
      </ul>
    </section>` : '';

  // Catégories de dépenses
  const prevMonths = monthsWithData(txs).filter(x => x < m && coverage(state, x).covered >= 25).slice(-6);
  const prevSums = prevMonths.map(x => summarize(txs.filter(t => t.month === x)));
  const depCats = CATEGORIES.filter(c => c.type === 'depense')
    .map(c => ({ c, s: spent(sum, c.id), n: sum.byCat[c.id].count, b: state.budgets?.[c.id] || 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.s - a.s);
  const scale = Math.max(1, ...depCats.map(x => Math.max(x.s, x.b)));
  const catsHtml = depCats.map(({ c, s, n, b }) => {
    let meta = plural(n, 'opération', 'opérations');
    if (prevSums.length && cov.covered >= 25 && c.id !== 'a_classer') {
      const avg = prevSums.reduce((acc, ps) => acc + spent(ps, c.id), 0) / prevSums.length;
      const d = s - avg;
      if (Math.abs(d) >= 1000) meta = `<span class="${d > 0 ? 'delta-up' : 'delta-down'}">${d > 0 ? '▲' : '▼'} ${euros(Math.abs(Math.round(d)))}</span> vs moyenne`;
    }
    if (b) meta += `, budget ${euros(b)}`;
    return `
    <li><button class="cat-row" type="button" data-action="filter-cat" data-cat="${c.id}">
      <span class="cat-ico" aria-hidden="true">${c.icon}</span>
      <span class="cat-name">${esc(c.label)}</span>
      <span class="cat-amount amount">${euros(s)}</span>
      <span class="cat-meta">${meta}</span>
      <span class="bar ${c.fixe ? 'fixe' : ''} ${c.id === 'a_classer' ? 'todo' : ''} ${b && s > b ? 'over' : ''}"><i style="width:${pct(s, scale)}%"></i>${b ? `<span class="budget-mark" style="left:${pct(b, scale)}%" title="Budget"></span>` : ''}</span>
    </button></li>`;
  }).join('');

  const otherCats = CATEGORIES.filter(c => c.type !== 'depense')
    .map(c => ({ c, net: sum.byCat[c.id].net, n: sum.byCat[c.id].count }))
    .filter(x => x.n > 0);
  const otherHtml = otherCats.map(({ c, net, n }) => `
    <li><button class="cat-row" type="button" data-action="filter-cat" data-cat="${c.id}">
      <span class="cat-ico" aria-hidden="true">${c.icon}</span>
      <span class="cat-name">${esc(c.label)}</span>
      <span class="cat-amount amount">${signed(net)}</span>
      <span class="cat-meta">${plural(n, 'opération', 'opérations')}</span>
    </button></li>`).join('');

  return `
    ${monthNav()}
    ${coverageNotice(m)}
    <section class="flow" aria-label="Répartition de l'argent du mois">
      <p class="flow-lead">Rentré sur le compte</p>
      <p class="flow-total amount">${euros(R)}</p>
      <div class="band" role="img" aria-label="Répartition des sorties d'argent">${band}</div>
      <ul class="legend">${legend}</ul>
    </section>
    ${insHtml}
    <section class="section">
      <div class="section-head"><h3>Où part l'argent</h3><button class="btn btn-ghost" type="button" data-tab="operations">Toutes les opérations</button></div>
      ${depCats.length ? `<ul class="cats">${catsHtml}</ul>` : '<p class="notice">Aucune dépense ce mois-ci.</p>'}
    </section>
    ${otherHtml ? `<section class="section"><div class="section-head"><h3>Rentrées, épargne et transferts</h3></div><ul class="cats">${otherHtml}</ul></section>` : ''}`;
}

// ----- Onglet « Opérations » -----------------------------------------------
function renderOperations() {
  const q = ui.search.trim();
  const monthTx = txs.filter(t => t.month === ui.month);
  const present = CATEGORIES.filter(c => monthTx.some(t => t.cat === c.id));
  const todoCount = monthTx.filter(t => t.cat === 'a_classer').length;
  const chips = [
    `<button class="chip" type="button" data-action="chip" data-cat="" aria-pressed="${!ui.cat}">Toutes</button>`,
    todoCount ? `<button class="chip" type="button" data-action="chip" data-cat="a_classer" aria-pressed="${ui.cat === 'a_classer'}">❓ À classer (${todoCount})</button>` : '',
    ...present.filter(c => c.id !== 'a_classer').map(c => `<button class="chip" type="button" data-action="chip" data-cat="${c.id}" aria-pressed="${ui.cat === c.id}">${c.icon} ${esc(c.label)}</button>`),
  ].join('');

  return `
    <div id="ops-nav" ${q ? 'hidden' : ''}>${monthNav()}</div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Rechercher (tous les mois)" value="${esc(ui.search)}" data-input="search" aria-label="Rechercher une opération">
      <div class="chips" id="ops-chips" role="group" aria-label="Filtrer par catégorie" ${q ? 'hidden' : ''}>${chips}</div>
    </div>
    <div id="ops-results">${opsResults()}</div>`;
}

/** Liste des opérations (mois affiché + filtre, ou recherche dans tous les mois) */
function opsResults() {
  const q = ui.search.trim().toLowerCase();
  let list = q
    ? txs.filter(t => (t.name + ' ' + t.label + ' ' + t.details.join(' ') + ' ' + CAT[t.cat].label).toLowerCase().includes(q))
    : txs.filter(t => t.month === ui.month);
  if (ui.cat && !q) list = list.filter(t => t.cat === ui.cat);

  // Regroupement par jour
  const days = new Map();
  for (const t of list) {
    if (!days.has(t.effDate)) days.set(t.effDate, []);
    days.get(t.effDate).push(t);
  }
  const out = list.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const inn = list.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const daysHtml = [...days.entries()].map(([d, l]) => `
    <div class="day">
      <h4>${esc(cap(fmtDay(d)))}${q ? ' ' + d.slice(0, 4) : ''}</h4>
      <ul class="ops">${l.map(opRow).join('')}</ul>
    </div>`).join('');

  return `
    ${q ? `<p class="list-total"><span>Recherche dans tous les mois</span></p>` : ''}
    ${list.length ? `
      <p class="list-total"><span>${plural(list.length, 'opération', 'opérations')}</span><span>${inn ? `Entrées <span class="amount">+${euros(inn)}</span>, ` : ''}sorties <span class="amount">−${euros(out)}</span></span></p>
      ${daysHtml}` : '<p class="notice">Aucune opération ne correspond.</p>'}`;
}

function opRow(t) {
  const c = CAT[t.cat];
  const sub = t.cat === 'a_classer' ? `<span class="todo">À classer</span> ${t.sub ? '– ' + esc(t.sub) : ''}` : `${esc(c.label)}${t.sub && t.sub !== 'Carte bancaire' ? ' – ' + esc(t.sub) : ''}`;
  return `<li><button class="op" type="button" data-action="open-tx" data-id="${esc(t.id)}">
    <span class="op-ico" aria-hidden="true">${c.icon}</span>
    <span class="op-text"><span class="op-name">${esc(t.name)}</span><span class="op-sub">${sub}</span></span>
    <span class="op-amount amount ${t.amount > 0 ? 'in' : ''}">${signed(t.amount)}</span>
  </button></li>`;
}

// ----- Onglet « Historique » -----------------------------------------------
function renderHistory() {
  const h = history(state, txs);
  if (!h.length) return '<p class="notice">Pas encore de données.</p>';
  const last = h.slice(-12);

  // Graphique : rentrées et sorties (empilées) par mois
  const W = 360, H = 190, padL = 36, padB = 22, padT = 8;
  const innerW = W - padL - 6, innerH = H - padB - padT;
  const maxV = Math.max(1, ...last.map(x => Math.max(x.revenus, x.fixes + x.variables + Math.max(0, x.epargne) + Math.max(0, x.transferts))));
  const step = niceStep(maxV / 100 / 3) * 100;
  const top = Math.ceil(maxV / step) * step;
  const y = v => padT + innerH - (v / top) * innerH;
  const gw = innerW / last.length;
  const bw = Math.max(4, Math.min(22, gw / 2 - 3));
  let svg = '';
  for (let v = 0; v <= top; v += step) {
    svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v / 100).toLocaleString('fr-FR')}</text>`;
  }
  last.forEach((x, i) => {
    const gx = padL + i * gw + gw / 2;
    const partial = x.coverage.covered < 25;
    const op = partial ? 0.45 : 1;
    const tip = `${cap(monthLabel(x.month))}${partial ? ' (incomplet)' : ''}\nRentrées : ${euros(x.revenus)}\nCharges fixes : ${euros(x.fixes)}\nDépenses courantes : ${euros(x.variables)}\nÉpargne : ${euros(x.epargne)}\nAutres comptes : ${euros(x.transferts)}`;
    svg += `<g opacity="${op}"><title>${esc(tip)}</title>`;
    svg += `<rect x="${gx - bw - 1}" y="${y(Math.max(0, x.revenus))}" width="${bw}" height="${Math.max(0, innerH + padT - y(Math.max(0, x.revenus)))}" rx="3" fill="var(--c-in)"/>`;
    let acc = 0;
    for (const [v, col] of [[x.fixes, 'var(--c-fixe)'], [x.variables, 'var(--c-var)'], [x.epargne, 'var(--c-save)'], [x.transferts, 'var(--c-transfer)']]) {
      if (v <= 0) continue;
      const y1 = y(acc + v), y0 = y(acc);
      svg += `<rect x="${gx + 1}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1 - 2)}" rx="2" fill="${col}"/>`;
      acc += v;
    }
    const [yy, mm] = x.month.split('-');
    svg += `<text x="${gx}" y="${H - 8}" text-anchor="middle">${MONTHS_FR[+mm - 1].slice(0, 4)}${i === 0 || mm === '01' ? ' ' + yy.slice(2) : ''}${partial ? '*' : ''}</text></g>`;
  });

  // Tableau par catégorie (6 derniers mois)
  const cols = h.slice(-6);
  const complete = cols.filter(x => x.coverage.covered >= 25);
  const rowsCats = CATEGORIES.filter(c => c.type === 'depense' && cols.some(x => x.byCat[c.id].count));
  const cell = (x, v) => `<td class="amount ${x.coverage.covered < 25 ? 'partial' : ''}">${v ? Math.round(v / 100).toLocaleString('fr-FR') : '–'}</td>`;
  const avgCell = f => `<td class="amount">${complete.length ? Math.round(complete.reduce((s, x) => s + f(x), 0) / complete.length / 100).toLocaleString('fr-FR') : '–'}</td>`;
  const table = `
    <table>
      <thead><tr><th>En euros</th>${cols.map(x => `<th class="${x.coverage.covered < 25 ? 'partial' : ''}">${cap(MONTHS_FR[+x.month.slice(5) - 1].slice(0, 4))}${x.coverage.covered < 25 ? '*' : ''}</th>`).join('')}<th>Moyenne</th></tr></thead>
      <tbody>
        <tr class="total"><td>Rentrées</td>${cols.map(x => cell(x, x.revenus)).join('')}${avgCell(x => x.revenus)}</tr>
        <tr class="total"><td>Dépenses</td>${cols.map(x => cell(x, x.depenses)).join('')}${avgCell(x => x.depenses)}</tr>
        ${rowsCats.map(c => `<tr><td>${c.icon} ${esc(c.label)}</td>${cols.map(x => cell(x, -x.byCat[c.id].net)).join('')}${avgCell(x => -x.byCat[c.id].net)}</tr>`).join('')}
        <tr class="total"><td>Épargne</td>${cols.map(x => cell(x, x.epargne)).join('')}${avgCell(x => x.epargne)}</tr>
        <tr class="total"><td>Autres comptes</td>${cols.map(x => cell(x, x.transferts)).join('')}${avgCell(x => x.transferts)}</tr>
      </tbody>
    </table>`;

  return `
    <div class="month-nav"><h2>Historique</h2></div>
    <section class="section">
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rentrées et sorties par mois">${svg}</svg>
        <div class="chart-legend">
          <span style="--sw:var(--c-in)">Rentrées</span>
          <span style="--sw:var(--c-fixe)">Charges fixes</span>
          <span style="--sw:var(--c-var)">Dépenses courantes</span>
          <span style="--sw:var(--c-save)">Épargne</span>
          <span style="--sw:var(--c-transfer)">Autres comptes</span>
        </div>
      </div>
      <div class="section-head"><h3>Par catégorie</h3></div>
      <div class="table-wrap">${table}</div>
      <p class="notice" style="margin-top:10px">* Mois incomplet : il manque des relevés. La moyenne n'utilise que les mois complets.</p>
    </section>`;
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// ----- Onglet « Réglages » -------------------------------------------------
const prettyKey = k => k.replace(/^CB /, '').replace(' | ', ' – ').toLowerCase().replace(/(^|[\s–-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

function renderSettings() {
  const sts = Object.values(state.statements).sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || ''));
  const stHtml = sts.length ? `<ul class="rows">${sts.map(s => `
    <li>
      <span class="grow">
        <span class="title">${s.number ? `Relevé n° ${esc(s.number)}, ` : ''}du ${fmtShort(s.periodStart)} au ${fmtShort(s.periodEnd)}</span>
        <span class="meta">${plural(s.transactions.length, 'opération', 'opérations')}, ${esc(s.accountLabel)}. ${s.checks?.ok ? '<span class="ok">Soldes vérifiés</span>' : '<span class="ko">Soldes à vérifier</span>'}</span>
      </span>
      <button class="x-btn" type="button" data-action="del-statement" data-id="${esc(s.id)}" aria-label="Supprimer ce relevé">✕</button>
    </li>`).join('')}</ul>` : '<p>Aucun relevé importé.</p>';

  const budgetHtml = CATEGORIES.filter(c => c.type === 'depense' && c.id !== 'a_classer').sort((a, b) => (a.fixe ? 1 : 0) - (b.fixe ? 1 : 0)).map(c => `
    <li><span class="grow"><span class="title">${c.icon} ${esc(c.label)}</span></span>
      <input class="budget-input amount" type="number" inputmode="decimal" min="0" step="10" placeholder="—" aria-label="Budget mensuel ${esc(c.label)}"
        data-budget="${c.id}" value="${state.budgets?.[c.id] ? state.budgets[c.id] / 100 : ''}"> €
    </li>`).join('');

  const rules = Object.entries(state.rules).sort((a, b) => a[0].localeCompare(b[0]));
  const options = sel => CATEGORIES.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('');
  const rulesHtml = rules.length ? `<ul class="rows">${rules.map(([k, cat]) => `
    <li>
      <span class="grow"><span class="title">${esc(prettyKey(k))}</span></span>
      <select class="small-select" data-rule="${esc(k)}" aria-label="Catégorie">${options(cat)}</select>
      <button class="x-btn" type="button" data-action="del-rule" data-key="${esc(k)}" aria-label="Supprimer la règle">✕</button>
    </li>`).join('')}</ul>` : "<p>Aucune règle pour l'instant. Quand tu changes la catégorie d'une opération, l'appli s'en souvient ici.</p>";

  const saved = state.savedAt ? `Dernier enregistrement sur cet appareil : ${fmtDate(state.savedAt.slice(0, 10))}.` : '';

  return `
    <div class="month-nav"><h2>Réglages</h2></div>
    <section class="section">
      <div class="section-head"><h3>Relevés importés</h3><button class="btn btn-ghost" type="button" data-action="import">Importer</button></div>
      <div class="panel">${stHtml}</div>
    </section>
    <section class="section">
      <div class="section-head"><h3>Budgets mensuels</h3></div>
      <div class="panel"><p>Fixe un plafond par catégorie : l'appli te prévient quand tu t'en approches ou que tu le dépasses.</p><ul class="rows">${budgetHtml}</ul></div>
    </section>
    <section class="section">
      <div class="section-head"><h3>Règles apprises</h3></div>
      <div class="panel">${rulesHtml}</div>
    </section>
    <section class="section">
      <div class="section-head"><h3>Sauvegarde</h3></div>
      <div class="panel">
        <p>Tes données sont enregistrées dans ce navigateur, sur cet appareil seulement. Exporte une sauvegarde de temps en temps (dans Fichiers ou iCloud Drive) : elle permet de tout retrouver sur un autre appareil, ou si le navigateur efface ses données. ${saved}</p>
        <div class="btn-row">
          <button class="btn btn-primary" type="button" data-action="backup" ${sts.length ? '' : 'disabled'}>Exporter une sauvegarde</button>
          <button class="btn" type="button" data-action="restore">Restaurer une sauvegarde</button>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h3>Sur iPhone</h3></div>
      <div class="panel"><p>Dans Safari, touche le bouton Partager puis « Sur l'écran d'accueil ». L'appli s'ouvre alors en plein écran comme une vraie appli, et Safari conserve mieux ses données.</p></div>
    </section>
    <section class="section">
      <div class="section-head"><h3>Confidentialité</h3></div>
      <div class="panel">
        <p>Les relevés sont lus directement sur ton appareil. Aucune donnée n'est envoyée sur Internet, ni sur GitHub : le dépôt ne contient que le code de l'appli.</p>
        <button class="btn btn-danger" type="button" data-action="wipe" ${sts.length ? '' : 'disabled'}>Effacer toutes mes données</button>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Feuille du bas
// ---------------------------------------------------------------------------
let sheetState = null;

function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="grab" aria-hidden="true"></div>` + html;
  s.hidden = false;
  $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  const f = s.querySelector('[autofocus]') || s.querySelector('h2');
  if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
}

function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  sheetState = null;
}

function openTx(id) {
  const t = txs.find(x => x.id === id);
  if (!t) return;
  const same = txs.filter(x => x.key === t.key);
  sheetState = { id, cat: t.cat };
  const raw = [t.label, ...t.details].join('\n');
  const when = t.cardDate && t.cardDate !== t.date
    ? `Payé le ${fmtDate(t.cardDate)}, débité le ${fmtShort(t.date)}`
    : `Le ${fmtDate(t.date)}`;
  const learned = t.catSource === 'regle' || t.catSource === 'manuel';
  const applyLabel = same.length > 1
    ? `Appliquer aussi aux ${same.length - 1} autre${same.length > 2 ? 's' : ''} opération${same.length > 2 ? 's' : ''} « ${esc(t.name)} » et aux prochaines`
    : `Retenir ce choix pour les prochaines opérations « ${esc(t.name)} »`;
  openSheet(`
    <h2 id="sheet-title">${esc(t.name)}</h2>
    <p class="big amount ${t.amount > 0 ? 'in' : ''}">${signed(t.amount)}</p>
    <p class="meta">${when}${t.account ? `, ${esc(t.account)}` : ''}</p>
    <div class="raw">${esc(raw)}</div>
    <strong>Catégorie</strong>
    <div class="cat-grid" role="group" aria-label="Choisir une catégorie">
      ${pickOrder(t.amount).map(c => `<button class="cat-pick" type="button" data-action="pick-cat" data-cat="${c.id}" aria-pressed="${c.id === t.cat}"><span aria-hidden="true">${c.icon}</span>${esc(c.label)}</button>`).join('')}
    </div>
    <label class="check"><input type="checkbox" id="apply-all" checked><span>${applyLabel}</span></label>
    ${learned ? '<p><button class="btn btn-ghost" type="button" data-action="reset-cat">Revenir au classement automatique</button></p>' : ''}
    <div class="sheet-actions">
      <button class="btn" type="button" data-action="close-sheet">Annuler</button>
      <button class="btn btn-primary" type="button" data-action="save-cat">Enregistrer</button>
    </div>`);
}

/** Ordre des catégories proposé : les plus probables d'abord selon le sens de l'opération */
function pickOrder(amount) {
  const rank = c => {
    if (amount > 0) return { revenu: 0, epargne: 1, interne: 2, depense: 3 }[c.type];
    if (c.id === 'a_classer') return 9;
    return c.type === 'depense' ? (c.fixe ? 1 : 0) : c.type === 'epargne' ? 2 : c.type === 'interne' ? 3 : 4;
  };
  return CATEGORIES.slice().sort((a, b) => rank(a) - rank(b));
}

function saveCategory() {
  const t = txs.find(x => x.id === sheetState.id);
  if (!t) return closeSheet();
  const cat = sheetState.cat;
  const all = $('#apply-all').checked;
  if (all) {
    state.rules[t.key] = cat;
    for (const x of txs) if (x.key === t.key) delete state.overrides[x.id];
  } else {
    state.overrides[t.id] = cat;
  }
  persist();
  refresh();
  closeSheet();
  render();
  const n = all ? txs.filter(x => x.key === t.key).length : 1;
  toast(`Classé dans « ${CAT[cat].label} »${n > 1 ? ` (${n} opérations)` : ''}`);
}

function resetCategory() {
  const t = txs.find(x => x.id === sheetState.id);
  if (!t) return closeSheet();
  delete state.overrides[t.id];
  delete state.rules[t.key];
  persist(); refresh(); closeSheet(); render();
  toast('Classement automatique rétabli');
}

// ---------------------------------------------------------------------------
// Import des relevés
// ---------------------------------------------------------------------------
async function importPdfs(files) {
  if (!files.length) return;
  busy(true, 'Lecture du relevé…');
  const report = [];
  let lastId = null;
  for (const f of files) {
    try {
      busy(true, `Lecture de ${f.name}…`);
      const pages = await extractPages(await f.arrayBuffer());
      const parsed = parseLCL(pages);
      const { id, isNew } = store.addStatement(state, parsed, f.name);
      report.push({ ok: true, parsed, isNew, name: f.name });
      lastId = id;
    } catch (e) {
      console.error(e);
      let msg = e && e.message ? e.message : String(e);
      if (e && e.name === 'PasswordException') msg = 'Ce PDF est protégé par un mot de passe.';
      else if (e && e.name === 'InvalidPDFException') msg = "Ce fichier n'est pas un PDF lisible.";
      report.push({ ok: false, name: f.name, error: msg });
    }
  }
  persist();
  store.askPersistence();
  refresh();
  if (lastId) {
    const st = state.statements[lastId];
    const counts = {};
    for (const t of txs.filter(x => x.statementId === lastId)) counts[t.month] = (counts[t.month] || 0) + 1;
    ui.month = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ui.month;
    ui.tab = 'mois'; ui.cat = null; ui.search = '';
    void st;
  }
  busy(false);
  render();
  window.scrollTo(0, 0);
  openSheet(`
    <h2 id="sheet-title">Import terminé</h2>
    <ul class="report">${report.map(r => r.ok ? `
      <li>${r.isNew ? '✅' : '🔁'} <strong>${r.parsed.number ? `Relevé n° ${esc(r.parsed.number)}` : esc(r.name)}</strong>, du ${fmtShort(r.parsed.periodStart)} au ${fmtShort(r.parsed.periodEnd)}
        <span class="meta">${plural(r.parsed.transactions.length, 'opération lue', 'opérations lues')}${r.isNew ? '' : ' (déjà importé : mis à jour)'}.
        ${r.parsed.checks.ok
          ? `Soldes vérifiés : ${euros(r.parsed.openingBalance)} au départ, ${euros(r.parsed.closingBalance)} à la fin.`
          : '<span class="ko">Attention : la somme des opérations ne retombe pas sur le solde du relevé. Vérifie que toutes les opérations ont bien été lues.</span>'}
        ${r.parsed.warnings.length ? '<br>' + r.parsed.warnings.map(esc).join('<br>') : ''}</span>
      </li>` : `
      <li>❌ <strong>${esc(r.name)}</strong><span class="meta">${esc(r.error)}</span></li>`).join('')}
    </ul>
    <div class="sheet-actions"><button class="btn btn-primary" type="button" data-action="close-sheet">Voir le mois</button></div>`);
}

// ---------------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------------
async function backup() {
  const name = `mon-budget-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([store.exportJSON(state)], { type: 'application/json' });
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (isApple && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Sauvegarde Mon budget' });
      toast('Sauvegarde prête : choisis « Enregistrer dans Fichiers »');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  toast('Sauvegarde téléchargée');
}

async function restore(file) {
  try {
    const next = store.importJSON(await file.text());
    const n = Object.keys(next.statements).length;
    const hasData = Object.keys(state.statements).length > 0;
    if (hasData && !confirm(`Remplacer les données de cet appareil par cette sauvegarde (${plural(n, 'relevé', 'relevés')}) ?`)) return;
    state = next;
    persist(); refresh(); ui.tab = 'mois'; render();
    toast(`Sauvegarde restaurée : ${plural(n, 'relevé', 'relevés')}`);
  } catch (e) {
    toast(e.message || 'Fichier de sauvegarde illisible.');
  }
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    ui.tab = tabBtn.dataset.tab;
    if (ui.tab !== 'operations') ui.cat = null;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'import') $('#file-pdf').click();
  else if (a === 'restore') $('#file-backup').click();
  else if (a === 'backup') backup();
  else if (a === 'month') {
    const months = monthsWithData(txs);
    const i = months.indexOf(ui.month) + Number(el.dataset.dir);
    if (months[i]) { ui.month = months[i]; render(); }
  } else if (a === 'filter-cat') {
    ui.cat = el.dataset.cat; ui.tab = 'operations'; ui.search = '';
    render(); window.scrollTo(0, 0);
  } else if (a === 'chip') {
    ui.cat = el.dataset.cat || null; render();
  } else if (a === 'open-tx') openTx(el.dataset.id);
  else if (a === 'pick-cat' && sheetState) {
    sheetState.cat = el.dataset.cat;
    document.querySelectorAll('.cat-pick').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === sheetState.cat)));
  } else if (a === 'save-cat' && sheetState) saveCategory();
  else if (a === 'reset-cat' && sheetState) resetCategory();
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'del-statement') {
    const st = state.statements[el.dataset.id];
    if (st && confirm(`Supprimer le relevé du ${fmtShort(st.periodStart)} au ${fmtShort(st.periodEnd)} ?`)) {
      store.removeStatement(state, el.dataset.id); persist(); refresh(); render();
    }
  } else if (a === 'del-rule') {
    delete state.rules[el.dataset.key]; persist(); refresh(); render();
  } else if (a === 'wipe') {
    if (confirm('Effacer tous les relevés, règles et budgets de cet appareil ? Pense à exporter une sauvegarde avant.')) {
      state = store.emptyState(); persist(); refresh(); ui.tab = 'mois'; render();
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.dataset.input === 'search') {
    // On ne redessine que la liste : le clavier de l'iPhone reste ouvert
    ui.search = e.target.value;
    const q = ui.search.trim();
    $('#ops-nav').hidden = !!q;
    $('#ops-chips').hidden = !!q;
    $('#ops-results').innerHTML = opsResults();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'file-pdf') { importPdfs([...t.files]); t.value = ''; }
  else if (t.id === 'file-backup') { if (t.files[0]) restore(t.files[0]); t.value = ''; }
  else if (t.dataset.budget) {
    const v = parseFloat(String(t.value).replace(',', '.'));
    if (v > 0) state.budgets[t.dataset.budget] = Math.round(v * 100); else delete state.budgets[t.dataset.budget];
    persist();
    toast('Budget enregistré');
  } else if (t.dataset.rule) {
    state.rules[t.dataset.rule] = t.value; persist(); refresh();
    toast('Règle mise à jour');
  }
});

$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

// Démarrage
refresh();
render();
