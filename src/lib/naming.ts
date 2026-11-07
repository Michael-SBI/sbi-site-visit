// File and folder names from SBI's filing rules (sbi-skills/sbi-knowledge/references/filing-and-naming.md).

export const yymmdd = (d = new Date()) =>
  String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");

export const ddmmyy = (d = new Date()) =>
  String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getFullYear()).slice(2);

const STATUS = "(FOR INFO|FOR PRICING|NOT APPROVED|APPROVED|FOR CONSTRUCTION)";
const RULED = new RegExp(`^\\d{6}\\s+(.+?)\\s+-\\s+(.+?)(?:\\s+-\\s+(Rev\\w+))?\\s+-\\s+${STATUS}$`, "i");

export const stripExt = (n: string) => n.replace(/\.(pdf|png|jpe?g|webp|excalidraw|json)$/i, "");
const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Our markups: `YYMMDD SBI - Markup of [whose drawing] RevX - FOR INFO` (in 4.5).
 * A source already named by the rule gives author, title and revision; anything else is used as it stands.
 */
export function markupName(sourceName: string, d = new Date()) {
  const base = stripExt(sourceName).trim();
  const m = base.match(RULED);
  const whose = m ? `${m[1]} ${m[2]}${m[3] ? " " + m[3] : ""}` : base;
  return clean(`${yymmdd(d)} SBI - Markup of ${whose} - FOR INFO`);
}

/** A sketch or photo record with no plan in it (2.0 SITE > Site Measures has no naming rule yet). */
export const siteRecordName = (d = new Date()) => `${yymmdd(d)} SBI - Site visit record`;

export const photoName = (d = new Date()) =>
  `${yymmdd(d)} SBI - Site photo ${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(
    d.getSeconds(),
  ).padStart(2, "0")}.jpg`;

/** New deals are named company-then-job in SBI's style; the TS comes when the lead is qualified. */
export const dealName = (client: string, job: string) => clean(job ? `${client}- ${job}` : client);

// Job folder subfolders, matched by their number so small name drift still finds them.
export const PLANS = { match: (n: string) => /^4\.0\b/.test(n), name: "4.0 PLANS" };
export const MARKUPS = { match: (n: string) => /^4\.5\b/.test(n), name: "4.5 SBI drawings & markups" };
export const SITE = { match: (n: string) => /^2\.0\b/.test(n), name: "2.0 SITE- PICS_IMAGES_DOCS_NOTES" };
export const MEASURES = { match: (n: string) => /^site measures$/i.test(n), name: "Site Measures" };
export const APP_FOLDER = "SBI Site Visit Record"; // in My Drive, for deals with no job folder yet
