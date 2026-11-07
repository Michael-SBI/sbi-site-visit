// Turning PDFs and photos into images the canvas can hold.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type RenderedPage = {
  page: number;
  dataURL: string;
  mimeType: string;
  wPt: number; // page size in PDF points (1/72 inch)
  hPt: number;
  px: number; // rendered width in pixels
};

const MAX_EDGE = 4000; // px: sharp enough to read an A1 sheet's dimensions zoomed in
const MAX_AREA = 12_000_000; // px²: keeps big sheets within what a tablet's browser can draw
const DPI = 200;

export async function pdfPageCount(data: ArrayBuffer): Promise<number> {
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

export async function renderPdf(
  data: ArrayBuffer,
  pages: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<RenderedPage[]> {
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const out: RenderedPage[] = [];
  try {
    for (const n of pages) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      let scale = Math.min(DPI / 72, MAX_EDGE / Math.max(base.width, base.height));
      if (base.width * base.height * scale * scale > MAX_AREA) scale = Math.sqrt(MAX_AREA / (base.width * base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
      // WebP keeps line drawings crisp at a fraction of PNG's size.
      let mimeType = "image/webp";
      let dataURL = canvas.toDataURL(mimeType, 0.9);
      if (!dataURL.startsWith("data:image/webp")) {
        mimeType = "image/jpeg";
        dataURL = canvas.toDataURL(mimeType, 0.9);
      }
      out.push({ page: n, dataURL, mimeType, wPt: base.width, hPt: base.height, px: canvas.width });
      canvas.width = canvas.height = 0;
      page.cleanup();
      onProgress?.(out.length, pages.length);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/** "1-3, 5" -> [1,2,3,5], kept within 1..max. */
export function parsePageRange(text: string, max: number): number[] {
  const set = new Set<number>();
  for (const part of text.split(",")) {
    const m = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) set.add(i);
  }
  return [...set].sort((x, y) => x - y);
}

/** A photo turned the right way up and shrunk for the canvas (the original goes to Drive untouched). */
export async function photoForCanvas(file: Blob, maxEdge = 2000): Promise<{ dataURL: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const dataURL = canvas.toDataURL("image/jpeg", 0.85);
  const out = { dataURL, w: canvas.width, h: canvas.height };
  canvas.width = canvas.height = 0;
  return out;
}

export function saveToDevice(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const newId = () =>
  (crypto as any).randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
