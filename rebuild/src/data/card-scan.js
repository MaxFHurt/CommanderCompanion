// Read a card's title from the camera. Uses the browser's own text reader when it has one
// (Chrome on Android), otherwise loads Tesseract (an open-source text reader) the first time a
// scan is made — iPad and iPhone Safari have no built-in reader.

const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
// Where the title sits inside the guide frame (fractions of the frame): the top band, left of the mana cost.
export const TITLE_BAND = { x: 0.05, y: 0.035, w: 0.72, h: 0.075 };

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const script = document.createElement('script');
    script.src = src; script.async = true;
    script.onload = () => (window.Tesseract ? resolve() : reject(new Error('The text reader did not load.')));
    script.onerror = () => reject(new Error('The text reader could not be downloaded. Check the internet connection.'));
    document.head.appendChild(script);
  });
}

/** Start loading the reader early (when the camera opens) so the first scan is quick. */
export function prepareReader() {
  if ('TextDetector' in window) return Promise.resolve(null);
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(TESSERACT_SRC);
      const worker = await window.Tesseract.createWorker('eng');
      // One line of text, letters and the punctuation card names use.
      await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ,'-" });
      return worker;
    })().catch(error => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

/** Copy the title band out of the camera picture, enlarged and in high-contrast grey. */
export function titleCanvas(video, frame = { x: 0, y: 0, w: 1, h: 1 }) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) throw new Error('The camera is not ready yet.');
  const sx = (frame.x + TITLE_BAND.x * frame.w) * vw, sy = (frame.y + TITLE_BAND.y * frame.h) * vh;
  const sw = TITLE_BAND.w * frame.w * vw, sh = TITLE_BAND.h * frame.h * vh;
  const scale = Math.max(1, 900 / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = g.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  // Grey, then stretch the contrast; card titles are dark text on a light bar (or the reverse).
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) { const v = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; d[i] = v; if (v < min) min = v; if (v > max) max = v; }
  const span = Math.max(1, max - min);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const v = ((d[i] - min) / span) * 255; d[i] = d[i + 1] = d[i + 2] = v; sum += v; }
  // Tesseract reads dark text on light best: flip light-on-dark titles.
  if (sum / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  g.putImageData(img, 0, 0);
  return canvas;
}

/** Tidy what the reader returned into something a card name search can use. */
export function cleanTitle(text) {
  return String(text || '').replace(/[^A-Za-z ,'\-]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(w => w.length > 1 || /^[aA]$/.test(w)).join(' ');
}

/** Read the title of the card inside the guide frame. Resolves to the text read ('' if nothing). */
export async function readCardTitle(video, frame) {
  if ('TextDetector' in window) {
    const blocks = await new window.TextDetector().detect(titleCanvas(video, frame));
    return cleanTitle(blocks.map(b => b.rawValue).sort((a, b) => b.length - a.length)[0] || '');
  }
  const worker = await prepareReader();
  const { data } = await worker.recognize(titleCanvas(video, frame));
  return cleanTitle(data?.text || '');
}
