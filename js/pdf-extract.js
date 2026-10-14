// Lecture d'un PDF dans le navigateur avec pdf.js (copie locale dans lib/pdfjs).
// Le fichier ne quitte jamais l'appareil : tout se passe ici, en mémoire.

// Safari (iPhone) ne sait pas parcourir un flux de données avec « for await »,
// alors que pdf.js s'en sert. On ajoute cette fonction si elle manque.
function patchReadableStream() {
  if (typeof ReadableStream === 'undefined' || ReadableStream.prototype[Symbol.asyncIterator]) return;
  const iterate = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: iterate, configurable: true, writable: true });
  if (!ReadableStream.prototype.values) {
    Object.defineProperty(ReadableStream.prototype, 'values', { value: iterate, configurable: true, writable: true });
  }
}
patchReadableStream();

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../lib/pdfjs/pdf.min.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjsPromise;
}

/** Lit le texte d'une page sans « for await » (compatible avec tous les navigateurs) */
async function pageTextItems(page) {
  const reader = page.streamTextContent().getReader();
  const items = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.items) items.push(...value.items);
  }
  return items;
}

/**
 * Renvoie les pages du PDF : [{ items: [{ str, x, y, w }] }]
 * x / y = position du début du texte (en points, origine en bas à gauche), w = largeur.
 */
export async function extractPages(arrayBuffer, pdfjsLib) {
  const lib = pdfjsLib || await loadPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = await pageTextItems(page);
    pages.push({
      items: items
        .filter(i => typeof i.str === 'string' && i.str.trim() !== '')
        .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })),
    });
  }
  try { await task.destroy(); } catch (e) { /* sans importance */ }
  return pages;
}
