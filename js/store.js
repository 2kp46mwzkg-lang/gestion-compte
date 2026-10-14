// Stockage des données sur l'appareil (navigateur), et sauvegarde dans un fichier.
// Rien n'est envoyé sur Internet ni sur GitHub.

const KEY = 'mon-budget:v1';

export function emptyState() {
  return { version: 1, statements: {}, rules: {}, overrides: {}, budgets: {}, savedAt: null };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('Lecture impossible du stockage local', e);
    return emptyState();
  }
}

export function save(state) {
  try {
    state.savedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Enregistrement impossible', e);
    return false;
  }
}

/** Demande au navigateur de ne pas effacer les données (utile sur iPhone). */
export async function askPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* non disponible */ }
  return false;
}

/** Ajoute (ou remplace) un relevé. Renvoie true si c'était un nouveau relevé. */
export function addStatement(state, parsed, fileName) {
  const id = `${parsed.accountKey}|${parsed.periodStart || 'x'}|${parsed.periodEnd || 'x'}`;
  const isNew = !state.statements[id];
  state.statements[id] = {
    ...parsed,
    id,
    fileName: fileName || null,
    importedAt: new Date().toISOString(),
    transactions: parsed.transactions.map((t, i) => ({ ...t, id: `${id}#${i}` })),
  };
  return { id, isNew };
}

export function removeStatement(state, id) {
  delete state.statements[id];
  for (const k of Object.keys(state.overrides)) if (k.startsWith(id + '#')) delete state.overrides[k];
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'mon-budget', ...state }, null, 1);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== 'mon-budget' || !data.statements) {
    throw new Error("Ce fichier n'est pas une sauvegarde de Mon budget.");
  }
  const { app, ...rest } = data;
  return { ...emptyState(), ...rest };
}
