// Lecture d'un PDF dans le navigateur avec pdf.js (copie locale dans lib/pdfjs).
// Le fichier ne quitte jamais l'appareil : tout se passe ici, en mémoire.

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
    const content = await page.getTextContent();
    pages.push({
      items: content.items
        .filter(i => typeof i.str === 'string' && i.str.trim() !== '')
        .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })),
    });
  }
  try { await task.destroy(); } catch (e) { /* sans importance */ }
  return pages;
}
