# SBI Site Visit Record: guide for Claude (read before changing anything)

Michael's markup app for plans and site photos, replacing the Concepts subscription (built 7 Nov 2026).
Live at https://michael-sbi.github.io/sbi-site-visit/ from this **public** repo. **Pushing to `main` publishes it**
(`.github/workflows/pages.yml`, about a minute), and installed copies reload themselves, so test before pushing.

- **What it's built to:** the criteria doc [SBI Markup App: build criteria](https://claude.ai/artifact/RienCyp5XTePuTJBoSf9KH)
  (Claude Docs). Must-haves M1–M25 with "Done when" tests, the ideas list (Priority/Status dropdowns), decisions.
  New work: Michael adds a row and sets Priority; Claude gives it an M-number and a Done-when test, then builds.
  Plan first and wait for his yes (his CLAUDE.md); small corrections to something just built can go straight in.
- **Team-facing write-up:** SBI Knowledge topic `sbi-skills/sbi-knowledge/references/site-visit-record-app.md`.
  Change it (by PR, per his process-rule steps) whenever what users see changes.
- **Users:** Michael only for now (tablet, phone, PC). Anyone with a spokebi Google account who can see the job
  folder can open a drawing from a ClickUp link.

## Stack and files

Vite 6 + React 19 + TypeScript, `@excalidraw/excalidraw` **0.18.1** (pinned), pdf.js 5, jsPDF 3, idb-keyval,
vite-plugin-pwa 1 (Workbox). No server: the browser talks to Google Drive and ClickUp directly.

| File | What it does |
|---|---|
| `src/App.tsx` | Everything on screen: top bar, tools, imports layer, save, post, visits, autosave. `VERSION` constant at the top: bump it every release (shows in Settings and the logo's tooltip). |
| `src/main.tsx` | Mounts the app; **auto-reload on update** (controllerchange → flush autosave → reload, waits while a pointer is down or the app is busy); update check on return to the app and every 30 min. |
| `src/lib/google.ts` | Google Identity Services token sign-in, Drive calls (list, search visits, resumable upload, patch, download). |
| `src/lib/clickup.ts` | Deals list, new deal, Post target, comment, attachment. Token from Settings (per device). |
| `src/lib/exportPdf.ts` | The PDF: one page per sheet (crop by a stand-in frame), loose items on one extra page, SBI strip. |
| `src/lib/media.ts` | PDF pages to images (200 dpi, max 4000 px edge, 12 MP), photos (oriented, 2000 px), page ranges. |
| `src/lib/naming.ts` | Filing-rule names and subfolder matchers (by number: `4.0`, `4.5`, `2.0`). |
| `src/lib/store.ts` | IndexedDB autosave (scene + images by file id), cached jobs, pending photo uploads; settings in localStorage. |
| `src/components/*` | Job picker, Drive file browser, Site visits grid, Settings, dialogs, icons. |
| `public/config.json` | Google client ID, hosted domain, Deals list id. Fetched at start (network first). Not secret. |
| `vite.config.ts` | Base `/sbi-site-visit/`, PWA manifest (icons in `public/icons`), Workbox precache with `globIgnores` for unused Excalidraw diagram/language chunks (keeps updates ~7 MB). |
| `scripts/copy-fonts.mjs` | Copies Excalidraw fonts to `public/fonts` (offline text). Runs before dev and build. |

## Accounts and set-up (done 7 Nov 2026)

- **Google:** OAuth web client "Site Visit Record web", id in `public/config.json`, in Google Cloud project
  `gws-cli-500402` (the same project as the gws CLI). Consent screen renamed **SBI Tools**, audience **Internal**
  (spokebi.com.au only, no verification). Authorised JavaScript origins: `https://michael-sbi.github.io` and
  `http://localhost:5174`. Scope: full `drive` (job folders come from ClickUp, so `drive.file` can't reach them).
- **ClickUp:** each device's owner pastes a named personal token in Settings. **Never** put a token in this repo
  (it's public) and never type one into the app yourself. api.clickup.com allows browser CORS.
- **GitHub Pages** needs the repo public on Michael's plan (private Pages was refused).

## How it behaves (decisions to keep)

- **Job list:** open deals in the Deals list (`900301389267`), first the five stages before the site visit
  (inquiries recieved, active outreach, qualified lead, ballpark budget, initial meeting booked), then the rest
  in pipeline order. Leaves out on hold drip feed, client ghosting, closed won, lost and declined, and any status
  not in the pipeline. `PIPELINE` in `clickup.ts` mirrors `sales_rules.STATUSES`: **update it when the sales master
  renames a status.** One request (`include_closed=false&subtasks=false`); refreshed each time the picker opens.
- **New job:** deal at `inquiries recieved`, named `Client- Job`; a ClickUp automation adds P1–P5 (as sales-lead-info).
- **Where saves go** (SBI filing rules, `sbi-knowledge/references/filing-and-naming.md`): job with `🤝 23` folder →
  plan markups in `4.0 PLANS/4.5 SBI drawings & markups` (made if missing), sketches in
  `2.0 SITE- PICS_IMAGES_DOCS_NOTES/Site Measures`, photos in `2.0 SITE-…`; no folder → My Drive
  `SBI Site Visit Record/{deal}` (+ `Photos`). Names: `YYMMDD SBI - Markup of [source] - FOR INFO` /
  `YYMMDD SBI - Site visit record`. Each save writes `.pdf` + `.excalidraw`; re-saves update the same file ids.
- **Drawing file metadata:** `appProperties` (svr=1, v, jobId, jobName, sheets, photos, posted, pdfId; max 124 bytes
  per key+value, `fitProp` trims) and `contentHints.thumbnail` (JPEG, **base64url without padding**). A refused
  thumbnail never blocks the save (retries without it). The Visits screen is one Drive search on these.
  `thumbnailLink` loads in an `<img>` without auth.
- **Imports layer (M25):** plan sheets (`customData.sbiSheet`) and photos (`customData.sbiPhoto`) sit under all
  markup, newest import above older ones, `locked` unless the Imports button unlocks them. A new import comes in
  selected and free; it locks when deselected (`placing` ref). Older drawings settle on first change after load.
  Excalidraw has no real layers: this is array order plus `locked` (eraser and select-all skip locked items).
- **Post:** comment (not on the parent deal) on the subtask matching `site visit canvas`, else `site measure`, else
  the deal, with the PDF link and an app link `?open=<excalidraw Drive id>`. No folder → PDF and photos also
  attached to the deal. Sold jobs → copy link only.
- **Canvas units:** 1 PDF point = 1.5 units. Stamps and photos are sized in plan units (clamped), not screen size.
- **Top bar:** only buttons Excalidraw doesn't have (Highlight, Stamp, Imports, Photo, Visits, Add). Don't add
  copies of Excalidraw's own tools. Phones (≤640 px) get two rows; menus must not sit inside an overflow container.

## Testing (do this before every push)

1. Dev server: the `site-visit-dev` entry in `G:\My Drive\@CLAUDE CODE_MICHAEL\.claude\launch.json`
   (port 5174, open `http://localhost:5174/sbi-site-visit/`). Tablet 1280×800 and phone (mobile preset) sizes.
2. Dev-only hooks on `window.__svr`: `api`, `buildPdf`, `makeThumb`, `visitProps`, `G`, `N`, and
   **`setJob(job)`** to test saving without a ClickUp token. `window.__svrMockVisits = async (sinceIso) => [...]`
   stands in for Drive on the Visits screen.
3. Feed files with a `DataTransfer` drop on `.svr-app` (PDFs) or by setting `files` on the gallery input
   (images). Test plans go in `public/__test/` (git-ignored); delete them after.
4. Drive tests: make a throwaway folder in My Drive with `gws` (`2.0 SITE- PICS_IMAGES_DOCS_NOTES`, `4.0 PLANS`),
   `setJob` with its id, save from Michael's Chrome (Claude in Chrome, `localhost:5174`; sign-in is silent there),
   check with `gws drive files list`, then **trash** the folder. Never test in a real job folder, never create a
   real deal or post to a real deal without his yes.
5. `npx tsc --noEmit -p .` and `npm run build`, then commit (Michael-SBI identity, Co-Authored-By line) and push.
   Watch the run (`gh run watch`), then check the live bundle.
6. Update the criteria doc (M-number row) and, if users see a change, the SBI Knowledge topic.

## Known limits and ideas

- Pen feel (M23): Excalidraw uses perfect-freehand with streamline 0.5 and no coalesced/predicted pointer events.
  Plan: own ink overlay. Not built, waiting on Michael's tablet test against Concepts.
- PDF is raster (~200 dpi A3, ~120 dpi A1). M26 (idea): embed original pages as vectors and draw markup on top.
- No scale and measure yet; no live co-editing.
