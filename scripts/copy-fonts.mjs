// Copies Excalidraw's fonts into public/fonts so the app draws text offline.
// Xiaolai (13 MB of Chinese glyphs) is left out; Excalidraw falls back to its CDN for it.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
const src = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const dest = "public/fonts";
if (existsSync(dest)) rmSync(dest, { recursive: true });
mkdirSync(dest, { recursive: true });
for (const name of readdirSync(src)) {
  if (name === "Xiaolai") continue;
  cpSync(join(src, name), join(dest, name), { recursive: true });
}
console.log("fonts copied");
