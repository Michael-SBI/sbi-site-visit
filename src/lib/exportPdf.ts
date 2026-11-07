// The PDF copy: one page per plan sheet (cropped to the sheet, markup included), then one page for
// anything drawn off the sheets (sketches, photos, notes). Every page gets the SBI strip along the bottom.
import { exportToCanvas, getCommonBounds, getNonDeletedElements } from "@excalidraw/excalidraw";
import { jsPDF } from "jspdf";
import { ddmmyy } from "./naming";

const STRIP = 26; // pt
const GRAPHITE = "#1A1A1A";
const LIME = "#6CB33F";

export const isSheet = (el: any) => el?.type === "image" && el?.customData?.sbiSheet;

function overlaps(a: [number, number, number, number], b: [number, number, number, number]) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function bounds(el: any): [number, number, number, number] {
  const [x1, y1, x2, y2] = getCommonBounds([el]);
  return [x1, y1, x2, y2];
}

export async function buildPdf(opts: {
  elements: readonly any[];
  files: any;
  jobName: string;
  fileName: string;
}): Promise<Blob> {
  const all = getNonDeletedElements(opts.elements as any) as any[];
  if (!all.length) throw new Error("Nothing on the canvas to save yet.");
  const sheets = all.filter(isSheet).sort((a, b) => a.x - b.x || a.y - b.y);
  const appState = {
    exportBackground: true,
    viewBackgroundColor: "#ffffff",
    exportWithDarkMode: false,
    frameRendering: { enabled: true, clip: false, name: false, outline: false },
  };

  type Page = { canvas: HTMLCanvasElement; wPt: number; hPt: number; label: string };
  const pages: Page[] = [];

  for (const sheet of sheets) {
    // A stand-in frame the size of the sheet: Excalidraw crops the export to it.
    const frame = { ...sheet, type: "frame", name: null, id: "sbi-export-" + sheet.id, locked: false };
    const wPt = sheet.customData.wPt || sheet.width / 1.5;
    const hPt = sheet.customData.hPt || sheet.height / 1.5;
    const targetPx = Math.min(4000, Math.max(1600, (sheet.customData.px as number) || wPt * 2.5));
    const canvas = await exportToCanvas({
      elements: all,
      appState,
      files: opts.files,
      exportingFrame: frame as any,
      getDimensions: (w: number, h: number) => {
        const s = Math.min(targetPx / w, 4096 / Math.max(w, h));
        return { width: Math.round(w * s), height: Math.round(h * s), scale: s };
      },
    } as any);
    const src = sheet.customData.source ? `${sheet.customData.source} p${sheet.customData.page}` : "";
    pages.push({ canvas, wPt, hPt, label: src });
  }

  // Everything that doesn't touch a sheet goes on one more page.
  const sheetBoxes = sheets.map(bounds);
  const loose = all.filter((el) => !isSheet(el) && !sheetBoxes.some((b) => overlaps(bounds(el), b)));
  if (loose.length) {
    const canvas = await exportToCanvas({
      elements: loose,
      appState,
      files: opts.files,
      exportPadding: 24,
      maxWidthOrHeight: 3600,
    } as any);
    // Fit to A3 (1191 x 842 pt) in whichever orientation suits it.
    const land = canvas.width >= canvas.height;
    const boxW = land ? 1191 : 842;
    const boxH = land ? 842 : 1191;
    const s = Math.min(boxW / canvas.width, boxH / canvas.height);
    pages.push({ canvas, wPt: canvas.width * s, hPt: canvas.height * s, label: "Notes and photos" });
  }

  let pdf: jsPDF | null = null;
  const date = ddmmyy();
  pages.forEach((p, i) => {
    const w = p.wPt;
    const h = p.hPt + STRIP;
    const orientation = w > h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "pt", format: [w, h], orientation, compress: true });
    else pdf.addPage([w, h], orientation);
    const img = p.canvas.toDataURL("image/jpeg", 0.88);
    pdf.addImage(img, "JPEG", 0, 0, w, p.hPt, undefined, "FAST");
    p.canvas.width = p.canvas.height = 0;
    // SBI strip: job, date, sheet n of m.
    pdf.setFillColor(GRAPHITE);
    pdf.rect(0, p.hPt, w, STRIP, "F");
    pdf.setFillColor(LIME);
    pdf.rect(0, p.hPt, 6, STRIP, "F");
    pdf.setTextColor("#FFFFFF");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const y = p.hPt + STRIP / 2 + 3;
    pdf.text("SBI SITE VISIT RECORD", 14, y);
    pdf.setFont("helvetica", "normal");
    const right = `${date}   ·   Sheet ${i + 1} of ${pages.length}`;
    const rightW = pdf.getTextWidth(right);
    pdf.text(right, w - 12 - rightW, y);
    const left = 14 + pdf.getTextWidth("SBI SITE VISIT RECORD") + 14;
    let mid = [opts.jobName, p.label].filter(Boolean).join("   ·   ");
    const room = w - 12 - rightW - 14 - left;
    while (mid.length > 4 && pdf.getTextWidth(mid) > room) mid = mid.slice(0, -2);
    if (room > 40) pdf.text(mid, left, y);
  });
  pdf!.setProperties({ title: opts.fileName, creator: "SBI Site Visit Record" });
  return pdf!.output("blob");
}
