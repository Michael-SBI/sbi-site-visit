import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToCanvas,
  getCommonBounds,
  getNonDeletedElements,
  hashElementsVersion,
  loadFromBlob,
  newElementWith,
  serializeAsJSON,
  FONT_FAMILY,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { Icon } from "./components/icons";
import { Ask, AskField } from "./components/Modal";
import { JobPicker } from "./components/JobPicker";
import { FileBrowser } from "./components/FileBrowser";
import { SettingsPanel } from "./components/Settings";
import { SiteVisits } from "./components/SiteVisits";
import * as G from "./lib/google";
import * as CU from "./lib/clickup";
import { buildPdf, isSheet } from "./lib/exportPdf";
import { newId, parsePageRange, pdfPageCount, photoForCanvas, renderPdf, saveToDevice } from "./lib/media";
import * as N from "./lib/naming";
import * as Store from "./lib/store";
import type { DrawingMeta, Job, Settings } from "./lib/store";

const VERSION = "1.2.4";
const UNIT = 1.5; // canvas units per PDF point

// Clean markup defaults: red, sharp, no hand-drawn wobble, a plain font.
const DEFAULT_APPSTATE = {
  viewBackgroundColor: "#ffffff",
  currentItemStrokeColor: "#e03131",
  currentItemBackgroundColor: "transparent",
  currentItemRoughness: 0,
  currentItemStrokeWidth: 1,
  currentItemFontFamily: FONT_FAMILY.Nunito,
  currentItemRoundness: "sharp",
  currentItemArrowType: "sharp",
};
// What the autosave keeps of the editor's state.
const KEEP = [
  "viewBackgroundColor", "scrollX", "scrollY", "zoom", "penMode", "penDetected",
  "currentItemStrokeColor", "currentItemBackgroundColor", "currentItemRoughness", "currentItemStrokeWidth",
  "currentItemFontFamily", "currentItemFontSize", "currentItemOpacity", "currentItemRoundness", "currentItemArrowType",
];
const pick = (o: any, ks: string[]) => Object.fromEntries(ks.filter((k) => o && k in o).map((k) => [k, o[k]]));

const STAMPS: { word: string; color: string }[] = [
  { word: "CHECKED", color: "#2f9e44" },
  { word: "QUERY", color: "#f08c00" },
  { word: "CHANGE", color: "#e03131" },
  { word: "REMOVE", color: "#e03131" },
  { word: "NEW", color: "#1971c2" },
];
const HIGHLIGHT = { currentItemStrokeColor: "#fcc419", currentItemOpacity: 35, currentItemStrokeWidth: 4 };

/** Plans and photos: the Imports layer. */
const isImport = (el: any) => isSheet(el) || !!el?.customData?.sbiPhoto;

/** A small JPEG of the whole drawing, URL-safe base64 as Drive's thumbnail field wants it. */
async function makeThumb(elements: readonly any[], files: any): Promise<string | null> {
  try {
    const canvas = await exportToCanvas({
      elements: elements as any,
      files,
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
      exportPadding: 24,
      maxWidthOrHeight: 640,
    } as any);
    const b64 = canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
    canvas.width = canvas.height = 0;
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

/** What the Site visits list shows, stored on the drawing file (appProperties: 124 bytes each). */
function visitProps(job: Job, elements: readonly any[], pdfId: string, posted: boolean): Record<string, string> {
  return {
    svr: "1",
    v: VERSION,
    jobId: job.id,
    jobName: G.fitProp("jobName", job.name),
    sheets: String(elements.filter(isSheet).length),
    photos: String(elements.filter((e) => e.customData?.sbiPhoto).length),
    posted: posted ? "1" : "0",
    pdfId,
  };
}

type AskState = {
  title: string;
  text?: React.ReactNode;
  fields?: AskField[];
  ok: string;
  cancel?: string;
  resolve: (v: Record<string, string> | null) => void;
} | null;

export default function App() {
  const [ready, setReady] = useState<{ initialData: any } | null>(null);
  const [api, setApi] = useState<any>(null);
  const apiRef = useRef<any>(null);
  const metaRef = useRef<DrawingMeta>(Store.emptyMeta());
  const [meta, setMetaState] = useState<DrawingMeta>(metaRef.current);
  const [settings, setSettings] = useState<Settings>(Store.loadSettings());
  const [config, setConfig] = useState<{ googleClientId: string; googleHostedDomain: string; dealsListId: string }>({
    googleClientId: "",
    googleHostedDomain: "spokebi.com.au",
    dealsListId: "900301389267",
  });
  const [hash, setHash] = useState<number>(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [tool, setTool] = useState<string>("selection");
  const [highlighting, setHighlighting] = useState(false);
  const hlSaved = useRef<any>(null);
  const [importsLocked, setImportsLocked] = useState(true);
  const [panel, setPanel] = useState<null | "jobs" | "browse" | "settings" | "stamps" | "add" | "more" | "visits">(null);
  const [ask, setAsk] = useState<AskState>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsAt, setJobsAt] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [browseRoot, setBrowseRoot] = useState<{ id: string; name: string } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [, force] = useState(0);
  const storedFiles = useRef<Set<string>>(new Set());
  const saveTimer = useRef<any>(null);
  const photoCount = useRef(0);
  const afterJobPick = useRef<null | ((j: Job) => void)>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const deviceInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const setMeta = useCallback((m: DrawingMeta) => {
    metaRef.current = m;
    setMetaState(m);
    scheduleAutosave();
  }, []);

  const toast = (message: string, sticky = false) =>
    apiRef.current?.setToast({ message, closable: true, duration: sticky ? Infinity : 4500 });

  const askUser = (a: Omit<NonNullable<AskState>, "resolve">) =>
    new Promise<Record<string, string> | null>((resolve) => setAsk({ ...a, resolve }));

  // ---------- start-up: config, settings, last drawing ----------
  useEffect(() => {
    (async () => {
      let cfg = config;
      try {
        const r = await fetch("config.json", { cache: "no-store" });
        if (r.ok) cfg = { ...cfg, ...(await r.json()) };
      } catch {
        /* offline: defaults */
      }
      setConfig(cfg);
      G.configureGoogle(settings.googleClientId || cfg.googleClientId, cfg.googleHostedDomain);
      G.preloadGoogle();
      CU.configureClickUp(settings.clickupToken, cfg.dealsListId);
      const cached = await Store.getCachedJobs();
      if (cached) {
        setJobs(cached.jobs);
        setJobsAt(cached.at);
      }
      const saved = await Store.loadAutosave();
      let initialData: any = { appState: { ...DEFAULT_APPSTATE } };
      if (saved?.elements?.length) {
        const files: Record<string, any> = {};
        for (const id of saved.fileIds || []) {
          const f = await Store.getFile(id);
          if (f) {
            files[id] = f;
            storedFiles.current.add(id);
          }
        }
        initialData = { elements: saved.elements, appState: { ...DEFAULT_APPSTATE, ...saved.appState }, files };
        metaRef.current = { ...Store.emptyMeta(), ...saved.meta };
        setMetaState(metaRef.current);
        setHash(hashElementsVersion(saved.elements as any));
      } else if (saved?.meta?.job) {
        metaRef.current = { ...Store.emptyMeta(), job: saved.meta.job };
        setMetaState(metaRef.current);
      }
      setReady({ initialData });
    })();
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    if (api && ready?.initialData?.elements?.length) toast("Picked up where you left off.");
  }, [api]);

  /** Drawings from before the Imports layer: put plans and photos underneath and lock them. */
  function settleImports() {
    const a = apiRef.current;
    const all = a.getSceneElementsIncludingDeleted();
    const imports = all.filter(isImport);
    if (!imports.length) return;
    const ordered = [...imports, ...all.filter((e: any) => !isImport(e))];
    const changed = ordered.some((e: any, i: number) => e !== all[i]) || imports.some((e: any) => !e.locked);
    if (changed)
      a.updateScene({
        elements: ordered.map((e: any) => (isImport(e) && !e.locked ? newElementWith(e, { locked: true }) : e)),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    setImportsLocked(true);
  }

  // ---------- autosave to the device ----------
  function scheduleAutosave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(autosaveNow, 1200);
  }
  async function autosaveNow() {
    const a = apiRef.current;
    if (!a) return;
    const elements = a.getSceneElementsIncludingDeleted().filter((e: any) => !e.isDeleted);
    const files = a.getFiles();
    const fileIds: string[] = [...new Set<string>(elements.filter((e: any) => e.type === "image" && e.fileId).map((e: any) => e.fileId as string))];
    for (const id of fileIds) {
      if (!storedFiles.current.has(id) && files[id]) {
        await Store.putFile(id, files[id]);
        storedFiles.current.add(id);
      }
    }
    await Store.saveAutosave({
      elements,
      appState: pick(a.getAppState(), KEEP),
      fileIds: fileIds as string[],
      meta: metaRef.current,
      at: new Date().toISOString(),
    });
  }

  const lastHash = useRef(0);
  const settled = useRef(false);
  const placing = useRef<Set<string>>(new Set()); // new imports still being positioned
  const importsLockedRef = useRef(true);
  importsLockedRef.current = importsLocked;
  const onChange = useCallback((elements: readonly any[], appState: any) => {
    // The first time the restored drawing is on screen, settle its imports underneath and locked.
    if (!settled.current && elements.length) {
      settled.current = true;
      setTimeout(() => settleImports(), 0);
    }
    const h = hashElementsVersion(elements as any);
    if (h !== lastHash.current) {
      lastHash.current = h;
      setHash(h);
      scheduleAutosave();
    }
    // A new import stays free while it's selected, for placing and sizing; tapping off it locks it.
    if (placing.current.size && !Object.keys(appState.selectedElementIds || {}).some((id) => placing.current.has(id))) {
      const ids = placing.current;
      placing.current = new Set();
      if (importsLockedRef.current)
        setTimeout(() => {
          const a = apiRef.current;
          a.updateScene({
            elements: a.getSceneElementsIncludingDeleted().map((e: any) => (ids.has(e.id) && !e.locked ? newElementWith(e, { locked: true }) : e)),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }, 0);
    }
    const t = appState.activeTool?.type;
    setTool((prev) => (prev === t ? prev : t));
    // Leaving the highlighter puts the pen back the way it was.
    if (hlSaved.current && t !== "freedraw") {
      const saved = hlSaved.current;
      hlSaved.current = null;
      setHighlighting(false);
      setTimeout(() => apiRef.current?.updateScene({ appState: saved, captureUpdate: CaptureUpdateAction.NEVER }), 0);
    }
  }, []);

  const elementsNow = () => getNonDeletedElements(apiRef.current.getSceneElements()) as any[];
  const dirty = !!api && hash !== metaRef.current.savedHash && elementsNow().length > 0;

  // ---------- tools ----------
  function endHighlight() {
    if (hlSaved.current) {
      apiRef.current.updateScene({ appState: hlSaved.current, captureUpdate: CaptureUpdateAction.NEVER });
      hlSaved.current = null;
      setHighlighting(false);
    }
  }
  const freehand = () => {
    endHighlight();
    api.setActiveTool({ type: "freedraw" });
  };
  const highlighter = () => {
    if (hlSaved.current) return freehand();
    const s = api.getAppState();
    hlSaved.current = pick(s, ["currentItemStrokeColor", "currentItemOpacity", "currentItemStrokeWidth"]);
    api.updateScene({ appState: HIGHLIGHT, captureUpdate: CaptureUpdateAction.NEVER });
    api.setActiveTool({ type: "freedraw" });
    setHighlighting(true);
  };

  /** The middle of the screen, in canvas units, and the current zoom. */
  function viewCentre() {
    const s = api.getAppState();
    const z = s.zoom.value;
    return { x: -s.scrollX + s.width / 2 / z, y: -s.scrollY + s.height / 2 / z, z };
  }

  function addStamp(word: string, color: string) {
    setPanel(null);
    const { x, y, z } = viewCentre();
    // Sized to the plan, not the screen: about 60 mm wide on an A3 sheet, a little bigger when zoomed in close.
    const w = Math.min(300, Math.max(150, 180 / z));
    const h = w * 0.37;
    const fs = w * 0.1;
    const text = `${word}\n${settings.initials ? settings.initials + " " : ""}${N.ddmmyy()}`;
    const els = convertToExcalidrawElements([
      {
        type: "rectangle", x: x - w / 2, y: y - h / 2, width: w, height: h,
        strokeColor: color, backgroundColor: "#ffffff", fillStyle: "solid", strokeWidth: 2, roughness: 0, roundness: null,
        label: { text, fontSize: fs, strokeColor: color, fontFamily: FONT_FAMILY.Nunito },
      } as any,
    ]);
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...els],
      appState: { selectedElementIds: { [els[0].id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.setActiveTool({ type: "selection" });
  }

  /**
   * The Imports layer: plans and photos sit under all markup, newest import on top of older ones,
   * locked unless unlocked. Excalidraw has no real layers, so this is the stacking order plus the lock.
   */
  function withImports(newImports: any[] = []) {
    const all = api.getSceneElementsIncludingDeleted();
    const imports = all.filter(isImport);
    const markup = all.filter((e: any) => !isImport(e));
    // New imports come in free; selectNew() selects them and they lock when you tap off them.
    return [...imports, ...newImports.map((e) => ({ ...e, locked: false })), ...markup];
  }

  /** Selects freshly imported items so they can be moved and sized straight away. */
  function selectNew(els: any[]) {
    placing.current = new Set(els.map((e) => e.id));
    api.setActiveTool({ type: "selection" });
    api.updateScene({
      appState: { selectedElementIds: Object.fromEntries(els.map((e) => [e.id, true])) },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  function toggleLock() {
    const next = !importsLocked;
    setImportsLocked(next);
    api.updateScene({
      elements: withImports().map((el: any) => (isImport(el) ? newElementWith(el, { locked: next }) : el)),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    toast(next ? "Imports locked: erase and draw freely, plans and photos stay put." : "Imports unlocked: move, resize or delete a plan or photo, then lock them again.");
  }

  // ---------- adding plans and photos ----------
  function rightOfContent() {
    const els = elementsNow();
    if (!els.length) return { x: 0, y: 0 };
    const [, minY, maxX] = getCommonBounds(els);
    return { x: maxX + 150, y: minY };
  }

  async function importPdf(data: ArrayBuffer, name: string) {
    const count = await pdfPageCount(data);
    let pages = Array.from({ length: count }, (_, i) => i + 1);
    if (count > 8) {
      const a = await askUser({
        title: `${count} pages in this PDF`,
        text: "Which pages do you want on the canvas? Big sets are slow on the tablet.",
        fields: [{ key: "range", label: "Pages", value: `1-${Math.min(count, 8)}`, hint: `For example 1-3, 7. All of them: 1-${count}` }],
        ok: "Add pages",
      });
      if (!a) return;
      pages = parsePageRange(a.range, count);
      if (!pages.length) return toast("No pages matched.");
    }
    setBusy(`Adding ${name}…`);
    try {
      const rendered = await renderPdf(data, pages, (d, t) => setBusy(`Adding page ${d} of ${t}…`));
      const start = rightOfContent();
      let x = start.x;
      const files: any[] = [];
      const els: any[] = [];
      for (const p of rendered) {
        const fileId = newId();
        files.push({ id: fileId, dataURL: p.dataURL, mimeType: p.mimeType, created: Date.now() });
        const [el] = convertToExcalidrawElements([
          { type: "image", fileId, x, y: start.y, width: p.wPt * UNIT, height: p.hPt * UNIT } as any,
        ]);
        els.push({
          ...el, status: "saved",
          customData: { sbiSheet: true, source: N.stripExt(name), page: p.page, of: count, wPt: p.wPt, hPt: p.hPt, px: p.px },
        });
        x += p.wPt * UNIT + 120;
      }
      api.addFiles(files);
      api.updateScene({ elements: withImports(els), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      setTimeout(() => api.scrollToContent(els, { fitToContent: true, animate: true }), 50);
      selectNew(els);
      toast("Move or size the new pages if needed, then tap off them to lock them.");
    } catch (e: any) {
      toast("Couldn't read that PDF: " + e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(file: Blob, opts: { toDevice: boolean; upload: boolean; name?: string }) {
    try {
      const { dataURL, w, h } = await photoForCanvas(file);
      const fileId = newId();
      api.addFiles([{ id: fileId, dataURL, mimeType: "image/jpeg", created: Date.now() }]);
      const { x, y, z } = viewCentre();
      // Sized to the plan, not the screen: the long edge is about half an A3 sheet when zoomed out.
      const s = Math.min(900, Math.max(400, 560 / z)) / Math.max(w, h);
      const off = (photoCount.current++ % 5) * 40;
      const [el] = convertToExcalidrawElements([
        { type: "image", fileId, x: x - (w * s) / 2 + off, y: y - (h * s) / 2 + off, width: w * s, height: h * s } as any,
      ]);
      api.updateScene({
        elements: withImports([{ ...el, status: "saved", customData: { sbiPhoto: true } }]),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      selectNew([el]);
      const name = opts.name || N.photoName();
      if (opts.toDevice && settings.savePhotosToDevice) saveToDevice(file, name);
      if (opts.upload) {
        const pending = await Store.getPending();
        pending.push({ fileId, blob: file, name });
        await Store.setPending(pending);
        if (metaRef.current.job && G.signedIn() && navigator.onLine) uploadPendingPhotos().catch(() => {});
        else force((n) => n + 1);
      }
    } catch (e: any) {
      toast("Couldn't add that photo: " + e.message, true);
    }
  }

  async function onPickedFiles(list: FileList | null, from: "camera" | "gallery" | "device") {
    if (!list) return;
    for (const f of Array.from(list)) {
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") await importPdf(await f.arrayBuffer(), f.name);
      else if (/\.(excalidraw|json)$/i.test(f.name)) await openDrawing(f, null);
      // Every photo is a site photo: it goes to the job's photos folder. Only camera shots also save to the tablet.
      else if (f.type.startsWith("image/")) await addPhoto(f, { toDevice: from === "camera", upload: true });
    }
  }

  // PDFs dropped onto the canvas on the PC.
  const onDropCapture = (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.some((f) => /\.pdf$/i.test(f.name))) {
      e.preventDefault();
      e.stopPropagation();
      onPickedFiles(e.dataTransfer.files, "device");
    }
  };

  // ---------- jobs ----------
  async function refreshJobs() {
    if (!CU.clickupConfigured()) {
      setJobsError("Add your ClickUp token in Settings to load the deals.");
      return;
    }
    setJobsLoading(true);
    setJobsError(null);
    try {
      const list = await CU.listJobs();
      setJobs(list);
      setJobsAt(new Date().toISOString());
      await Store.setCachedJobs(list);
    } catch (e: any) {
      setJobsError(e.message + (navigator.onLine ? "" : " (offline: showing the last list)"));
    } finally {
      setJobsLoading(false);
    }
  }

  function chooseJob(then?: (j: Job) => void) {
    afterJobPick.current = then || null;
    setPanel("jobs");
  }

  function pickJob(j: Job) {
    const m = metaRef.current;
    const moved = m.job && m.job.id !== j.id;
    setMeta({
      ...m,
      job: j,
      // A different job means new files in its folder on the next save.
      drive: moved ? { folderId: null, excalidrawId: null, pdfId: null, pdfLink: null } : m.drive,
      savedHash: moved ? null : m.savedHash,
    });
    setPanel(null);
    const then = afterJobPick.current;
    afterJobPick.current = null;
    if (then) then(j);
    else toast(j.folderId ? `Job: ${j.name}` : `Job: ${j.name}. It has no job folder yet, so files go to My Drive and the deal.`);
  }

  async function newJob() {
    setPanel(null);
    const a = await askUser({
      title: "New job",
      text: "Creates a new deal in ClickUp at inquiries recieved. ClickUp adds its subtasks. Qualify and score it with Sales Lead Info later.",
      fields: [
        { key: "client", label: "Client or company", placeholder: "Bellcorp" },
        { key: "job", label: "Job and location", placeholder: "Erina fitout" },
      ],
      ok: "Create deal",
    });
    if (!a || !a.client) return a && toast("A client name is needed.");
    const name = N.dealName(a.client, a.job);
    const similar = jobs.filter((j) => j.name.toLowerCase().includes(a.client.toLowerCase())).slice(0, 5);
    if (similar.length) {
      const b = await askUser({
        title: "Already in ClickUp?",
        text: (
          <>
            <p>These deals have a similar name:</p>
            <ul>{similar.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
            <p>Create a new deal anyway? Or cancel and pick one from the list.</p>
          </>
        ),
        ok: "Create new deal",
      });
      if (!b) return chooseJob(afterJobPick.current || undefined);
    }
    setBusy("Creating the deal…");
    try {
      const job = await CU.createDeal(name, `Created from SBI Site Visit Record at a site visit on ${N.ddmmyy()}.`);
      setJobs((js) => [job, ...js]);
      pickJob(job);
      toast(`Deal created: ${job.name}`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  // ---------- Drive ----------
  async function photosFolder(job: Job): Promise<string> {
    if (job.folderId) return G.ensureChildFolder(job.folderId, N.SITE.name, N.SITE.match);
    const deal = await dealHome(job);
    return G.ensureChildFolder(deal, "Photos");
  }
  /** My Drive > SBI Site Visit Record > {deal}, for deals with no job folder yet. */
  async function dealHome(job: Job): Promise<string> {
    const app = await G.ensureChildFolder("root", N.APP_FOLDER);
    return G.ensureChildFolder(app, job.name.replace(/[\\/]/g, " "));
  }
  async function drawingFolder(job: Job, hasSheets: boolean): Promise<string> {
    if (!job.folderId) return dealHome(job);
    if (hasSheets) {
      const plans = await G.ensureChildFolder(job.folderId, N.PLANS.name, N.PLANS.match);
      return G.ensureChildFolder(plans, N.MARKUPS.name, N.MARKUPS.match);
    }
    const site = await G.ensureChildFolder(job.folderId, N.SITE.name, N.SITE.match);
    return G.ensureChildFolder(site, N.MEASURES.name, N.MEASURES.match);
  }

  async function uploadPendingPhotos() {
    const job = metaRef.current.job;
    if (!job) return;
    let pending = await Store.getPending();
    if (!pending.length) return;
    const folder = await photosFolder(job);
    for (const p of [...pending]) {
      const f = await G.createFile(folder, p.name, "image/jpeg", p.blob);
      metaRef.current = { ...metaRef.current, photos: { ...metaRef.current.photos, [p.fileId]: f.id } };
      pending = pending.filter((x) => x.fileId !== p.fileId);
      await Store.setPending(pending);
    }
    setMeta(metaRef.current);
  }

  function suggestedName() {
    const sheet = elementsNow().find(isSheet);
    return sheet ? N.markupName(sheet.customData.source) : N.siteRecordName();
  }

  async function saveToDrive(): Promise<boolean> {
    if (busy) return false;
    if (!elementsNow().length) {
      toast("Nothing on the canvas to save yet.");
      return false;
    }
    try {
      await G.signIn(); // first, while the tap still counts for Google's popup
    } catch (e: any) {
      toast(e.message, true);
      if (!G.googleConfigured()) setPanel("settings");
      return false;
    }
    let job = metaRef.current.job;
    if (!job) {
      chooseJob(() => saveToDrive());
      return false;
    }
    if (!metaRef.current.name) {
      const a = await askUser({
        title: "Name the record",
        fields: [{ key: "name", label: "File name", value: suggestedName(), hint: "From SBI's filing rules. Change it if you like." }],
        ok: "Save to Drive",
      });
      if (!a || !a.name) return false;
      setMeta({ ...metaRef.current, name: a.name.replace(/\.(pdf|excalidraw)$/i, "") });
    }
    const m = metaRef.current;
    const name = m.name!;
    setBusy("Saving to Drive…");
    try {
      const a = apiRef.current;
      const elements = elementsNow();
      const files = a.getFiles();
      const hasSheets = elements.some(isSheet);
      const folder = m.drive.folderId || (await drawingFolder(job!, hasSheets));

      setBusy("Making the PDF…");
      const pdf = await buildPdf({ elements, files, jobName: job!.name, fileName: name });

      setBusy("Saving to Drive…");
      const put = async (id: string | null, fname: string, mime: string, blob: Blob, extra: any = {}) => {
        const attempt = async (x: object) => {
          if (id) {
            try {
              return await G.updateFile(id, fname, mime, blob, x);
            } catch (e: any) {
              if (e.status !== 404) throw e; // 404: moved or deleted, so make a new one
            }
          }
          return G.createFile(folder, fname, mime, blob, x);
        };
        try {
          return await attempt(extra);
        } catch (e: any) {
          // A preview picture Drive won't take must never stop the save.
          if (!extra.contentHints || e.status !== 400) throw e;
          const { contentHints, ...rest } = extra;
          return attempt(rest);
        }
      };
      const pdfFile = await put(m.drive.pdfId, name + ".pdf", "application/pdf", pdf);
      const drive = { folderId: folder, pdfId: pdfFile.id, pdfLink: pdfFile.webViewLink || `https://drive.google.com/file/d/${pdfFile.id}/view`, excalidrawId: m.drive.excalidrawId };
      const scene = JSON.parse(serializeAsJSON(elements, a.getAppState(), files, "local"));
      scene.sbi = { app: "SBI Site Visit Record", version: VERSION, name, job, drive, photos: m.photos };
      const sceneBlob = new Blob([JSON.stringify(scene)], { type: G.EXCALIDRAW_MIME });
      // Details and a preview ride on the file, so the Site visits list never has to open it.
      const thumb = await makeThumb(elements, files);
      const extra: any = { appProperties: visitProps(job!, elements, pdfFile.id, !!m.postedAt) };
      if (thumb) extra.contentHints = { thumbnail: { image: thumb, mimeType: "image/jpeg" } };
      const exFile = await put(m.drive.excalidrawId, name + ".excalidraw", G.EXCALIDRAW_MIME, sceneBlob, extra);
      drive.excalidrawId = exFile.id;

      setMeta({ ...metaRef.current, drive, savedHash: hashElementsVersion(a.getSceneElements()), savedAt: new Date().toISOString() });
      setBusy("Uploading photos…");
      await uploadPendingPhotos();
      toast(`Saved to Drive: ${name}`);
      return true;
    } catch (e: any) {
      toast("Not saved: " + e.message + (navigator.onLine ? "" : " You're offline; it's kept on this device."), true);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    setPanel(null);
    const link = metaRef.current.drive.pdfLink;
    if (!link) return toast("Save to Drive first, then copy the link.");
    try {
      await navigator.clipboard.writeText(link);
      toast("PDF link copied.");
    } catch {
      toast(link, true);
    }
  }

  async function postToClickUp() {
    if (busy) return;
    if (!CU.clickupConfigured()) {
      toast("Add your ClickUp token in Settings first.");
      return setPanel("settings");
    }
    if (!metaRef.current.job) return chooseJob(() => postToClickUp());
    if (dirty || !metaRef.current.drive.pdfId) {
      const ok = await saveToDrive();
      if (!ok) return;
    }
    const m = metaRef.current;
    const job = m.job!;
    if (job.sold) {
      await copyLink();
      return toast("Sold job: its sales task is closed. Link copied: paste it on the project task it's for.", true);
    }
    setBusy("Posting to ClickUp…");
    try {
      const target = await CU.findPostTarget(job.id);
      const lines = [`Site Visit Record: ${m.name}`, m.drive.pdfLink];
      if (!job.folderId) {
        // No job folder yet: the files go on the deal (sales-stage rule), to be filed once the folder exists.
        setBusy("Attaching to the deal…");
        const pdf = await G.download(m.drive.pdfId!);
        await CU.attachFile(job.id, pdf, m.name + ".pdf");
        const files = apiRef.current.getFiles();
        const done = new Set(m.attachedToDeal);
        let n = 0;
        for (const el of elementsNow().filter((e) => e.customData?.sbiPhoto && !done.has(e.fileId))) {
          const f = files[el.fileId];
          if (!f) continue;
          const blob = await (await fetch(f.dataURL)).blob();
          await CU.attachFile(job.id, blob, `${N.yymmdd()} SBI - Site photo ${++n}.jpg`);
          done.add(el.fileId);
        }
        setMeta({ ...metaRef.current, attachedToDeal: [...done] });
        lines.push(`PDF${n ? ` and ${n} photo${n > 1 ? "s" : ""}` : ""} attached to the deal. No job folder yet: file them once it's linked.`);
      }
      setBusy("Posting to ClickUp…");
      await CU.postComment(target.id, lines.join("\n"));
      setMeta({ ...metaRef.current, postedAt: new Date().toISOString() });
      // Tick "posted" on the drawing for the Site visits list. Not worth failing the post over.
      if (m.drive.excalidrawId) G.patchMeta(m.drive.excalidrawId, { appProperties: { posted: "1" } }).catch(() => {});
      toast(`Posted to ClickUp: ${target.name}`);
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function openBrowser() {
    setPanel(null);
    const job = metaRef.current.job;
    if (!job) return chooseJob(() => openBrowser());
    try {
      await G.signIn();
      const root = job.folderId ? { id: job.folderId, name: job.name } : { id: await dealHome(job), name: job.name + " (My Drive)" };
      setBrowseRoot(root);
      setPanel("browse");
    } catch (e: any) {
      toast(e.message, true);
      if (!G.googleConfigured()) setPanel("settings");
    }
  }

  async function openFromDrive(f: G.DriveFile) {
    setPanel(null);
    setBusy(`Opening ${f.name}…`);
    try {
      const blob = await G.download(f.id);
      if (/\.excalidraw$/i.test(f.name)) await openDrawing(blob, f);
      else if (/\.pdf$/i.test(f.name) || f.mimeType === "application/pdf") {
        setBusy(null);
        await importPdf(await blob.arrayBuffer(), f.name);
      } else await addPhoto(blob, { toDevice: false, upload: false });
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  // The Site visits list. In the dev build a stand-in list can replace Drive for testing.
  const loadVisits = (sinceIso: string) =>
    (import.meta.env.DEV && (window as any).__svrMockVisits ? (window as any).__svrMockVisits(sinceIso) : G.searchVisits(sinceIso));

  async function openVisits() {
    setPanel(null);
    if (!(import.meta.env.DEV && (window as any).__svrMockVisits)) {
      try {
        await G.signIn(); // while the tap still counts for Google's popup
      } catch (e: any) {
        toast(e.message, true);
        if (!G.googleConfigured()) setPanel("settings");
        return;
      }
    }
    setPanel("visits");
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    const a = await askUser({
      title: "Not saved to Drive",
      text: "This drawing has changes that aren't in Drive yet. Carry on and lose them?",
      ok: "Carry on",
      cancel: "Go back",
    });
    return !!a;
  }

  async function openDrawing(blob: Blob, f: G.DriveFile | null) {
    if (!(await confirmDiscard())) return;
    try {
      const text = await blob.text();
      const sbi = JSON.parse(text).sbi || null;
      const data: any = await loadFromBlob(new Blob([text], { type: "application/json" }), null, null);
      const files = Object.values(data.files || {});
      if (files.length) apiRef.current.addFiles(files);
      apiRef.current.updateScene({
        elements: data.elements,
        appState: { ...pick(data.appState, KEEP) },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      apiRef.current.history.clear();
      settleImports();
      const m: DrawingMeta = {
        ...Store.emptyMeta(),
        name: sbi?.name || (f ? N.stripExt(f.name) : null),
        job: sbi?.job || metaRef.current.job,
        drive: {
          folderId: f?.parents?.[0] || sbi?.drive?.folderId || null,
          excalidrawId: f?.id || sbi?.drive?.excalidrawId || null,
          pdfId: sbi?.drive?.pdfId || null,
          pdfLink: sbi?.drive?.pdfLink || null,
        },
        photos: sbi?.photos || {},
        savedHash: f ? hashElementsVersion(apiRef.current.getSceneElements()) : null,
        savedAt: f?.modifiedTime || null,
      };
      setMeta(m);
      setTimeout(() => apiRef.current.scrollToContent(undefined, { fitToContent: true }), 50);
      toast(`Opened ${m.name || "drawing"}`);
    } catch (e: any) {
      toast("Couldn't open that drawing: " + e.message, true);
    }
  }

  async function newDrawing() {
    setPanel(null);
    if (!(await confirmDiscard())) return;
    apiRef.current.resetScene();
    apiRef.current.updateScene({ appState: { ...DEFAULT_APPSTATE }, captureUpdate: CaptureUpdateAction.NEVER });
    await Store.setPending([]);
    setMeta({ ...Store.emptyMeta(), job: metaRef.current.job });
    lastHash.current = 0;
    setHash(0);
    await Store.pruneFiles(new Set());
    storedFiles.current.clear();
  }

  async function pdfToDevice() {
    setPanel(null);
    if (!elementsNow().length) return toast("Nothing on the canvas yet.");
    setBusy("Making the PDF…");
    try {
      const name = metaRef.current.name || suggestedName();
      const pdf = await buildPdf({ elements: elementsNow(), files: apiRef.current.getFiles(), jobName: metaRef.current.job?.name || "", fileName: name });
      saveToDevice(pdf, name + ".pdf");
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  function saveSettings(s: Settings) {
    Store.saveSettings(s);
    setSettings(s);
    G.configureGoogle(s.googleClientId || config.googleClientId, config.googleHostedDomain);
    G.preloadGoogle();
    CU.configureClickUp(s.clickupToken, config.dealsListId);
    setPanel(null);
    toast("Settings saved.");
  }

  // ---------- render ----------
  const pendingCount = useRef(0);
  useEffect(() => {
    Store.getPending().then((p) => (pendingCount.current = p.length));
  });

  let status = "";
  if (busy) status = busy;
  else if (!api || !elementsNow().length) status = "";
  else if (!dirty && meta.savedAt)
    status = `Saved to Drive ${new Date(meta.savedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
  else status = online ? "Not saved to Drive" : "Offline · kept on this device";

  // For the auto-reload on update (main.tsx): save to the device first, and wait while busy.
  (window as any).__svrFlush = autosaveNow;
  (window as any).__svrBusy = () => !!busy || !!ask;

  if (import.meta.env.DEV)
    (window as any).__svr = {
      api: apiRef.current, buildPdf, meta: metaRef.current, N, makeThumb, visitProps, G,
      setJob: (j: Job) => setMeta({ ...metaRef.current, job: j }), // test a save without a ClickUp token
    };

  if (!ready) return <div className="svr-loading">Loading…</div>;

  const tb = (name: string, label: string, onClick: () => void, active = false, title?: string) => (
    <button className={"svr-tool" + (active ? " active" : "")} onClick={onClick} title={title || label} aria-pressed={active}>
      <Icon name={name} />
      <span className="lbl">{label}</span>
    </button>
  );

  return (
    <div className="svr-app" onDropCapture={onDropCapture}>
      <header className="svr-bar">
        <div className="svr-left">
          <img className="svr-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" title={`SBI Site Visit Record ${VERSION}`} />
          <button className={"svr-jobchip" + (meta.job ? "" : " empty")} onClick={() => chooseJob()}>
            <span>{meta.job ? meta.job.name : "Pick a job"}</span>
            <Icon name="down" size={16} />
          </button>
        </div>
        <div className="svr-tools">
          {tb("highlighter", "Highlight", highlighter, highlighting)}
          <div className="svr-pop">
            {tb("stamp", "Stamp", () => setPanel(panel === "stamps" ? null : "stamps"), panel === "stamps")}
            {panel === "stamps" && (
              <div className="svr-menu">
                {STAMPS.map((s) => (
                  <button key={s.word} onClick={() => addStamp(s.word, s.color)} style={{ color: s.color }}>
                    {s.word}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tb(importsLocked ? "lock" : "unlock", importsLocked ? "Imports" : "Unlocked", toggleLock, !importsLocked,
            importsLocked ? "Imports locked: plans and photos stay put under your markup. Tap to unlock." : "Imports unlocked: plans and photos can move. Tap to lock them.")}
          <span className="svr-sep" />
          {tb("camera", "Photo", () => cameraInput.current?.click())}
          {tb("visits", "Visits", openVisits, panel === "visits", "Site visits saved in the last month")}
          <div className="svr-pop">
            {tb("plus", "Add", () => setPanel(panel === "add" ? null : "add"), panel === "add")}
            {panel === "add" && (
              <div className="svr-menu">
                <button onClick={openBrowser}><Icon name="folder" size={18} /> From the job folder</button>
                <button onClick={() => { setPanel(null); galleryInput.current?.click(); }}><Icon name="image" size={18} /> Photos from the gallery</button>
                <button onClick={() => { setPanel(null); deviceInput.current?.click(); }}><Icon name="file" size={18} /> PDF or drawing from this device</button>
              </div>
            )}
          </div>
        </div>
        <div className="svr-right">
          <span className={"svr-status" + (dirty ? " dirty" : "")} aria-live="polite">{status}</span>
          <button className={"svr-btn primary" + (dirty ? " unsaved" : "")} onClick={() => saveToDrive()} disabled={!!busy}
            title={dirty ? "Not saved to Drive" : "Save to Drive"}>
            <Icon name="save" size={18} /> <span className="lbl">Save</span>
          </button>
          <button className="svr-btn" onClick={postToClickUp} disabled={!!busy} title="Post the PDF link to ClickUp">
            <Icon name="send" size={18} /> <span className="lbl">Post</span>
          </button>
          <div className="svr-pop">
            <button className="svr-icon-btn light" onClick={() => setPanel(panel === "more" ? null : "more")} aria-label="More">
              <Icon name="more" />
            </button>
            {panel === "more" && (
              <div className="svr-menu right">
                <button onClick={newDrawing}><Icon name="plus" size={18} /> New drawing</button>
                <button onClick={openBrowser}><Icon name="folder" size={18} /> Open from the job folder</button>
                <button onClick={copyLink}><Icon name="link" size={18} /> Copy the PDF link</button>
                <button onClick={pdfToDevice}><Icon name="pdf" size={18} /> Save the PDF to this device</button>
                <button onClick={() => setPanel("settings")}><Icon name="gear" size={18} /> Settings</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="svr-canvas" onPointerDown={() => panel && ["stamps", "add", "more"].includes(panel) && setPanel(null)}>
        <Excalidraw
          excalidrawAPI={(a: any) => {
            apiRef.current = a;
            setApi(a);
          }}
          initialData={ready.initialData}
          onChange={onChange}
          langCode="en"
          name={meta.name || "Site visit record"}
          UIOptions={{
            canvasActions: {
              loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false,
              toggleTheme: false, saveAsImage: true, changeViewBackgroundColor: true,
            },
            tools: { image: false },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Heading>SBI Site Visit Record</WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Heading>
                Pick the job, then Add a plan from its folder or take a Photo. Draw with the pen; your finger moves the page.
              </WelcomeScreen.Center.Heading>
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      </main>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { onPickedFiles(e.target.files, "camera"); e.target.value = ""; }} />
      <input ref={galleryInput} type="file" accept="image/*" multiple hidden
        onChange={(e) => { onPickedFiles(e.target.files, "gallery"); e.target.value = ""; }} />
      <input ref={deviceInput} type="file" accept=".pdf,application/pdf,.excalidraw,application/json,image/*" multiple hidden
        onChange={(e) => { onPickedFiles(e.target.files, "device"); e.target.value = ""; }} />

      {panel === "jobs" && (
        <JobPicker jobs={jobs} loadedAt={jobsAt} loading={jobsLoading} error={jobsError} current={meta.job}
          onRefresh={refreshJobs} onPick={pickJob} onNew={newJob} onClose={() => { afterJobPick.current = null; setPanel(null); }} />
      )}
      {panel === "browse" && browseRoot && (
        <FileBrowser rootId={browseRoot.id} rootName={browseRoot.name} onOpen={openFromDrive} onClose={() => setPanel(null)} />
      )}
      {panel === "visits" && (
        <SiteVisits
          load={loadVisits}
          token={G.currentToken()}
          currentJob={meta.job}
          unsaved={dirty ? { name: meta.name || suggestedName(), job: meta.job?.name || "No job picked yet" } : null}
          onOpen={(f) => openFromDrive(f)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "settings" && (
        <SettingsPanel settings={settings} configClientId={config.googleClientId} googleSignedIn={G.signedIn()} version={VERSION}
          onSave={saveSettings}
          onSignIn={() => G.signIn().then(() => { force((n) => n + 1); toast("Signed in to Google."); }).catch((e) => toast(e.message, true))}
          onSignOut={() => { G.signOut(); force((n) => n + 1); }}
          onClose={() => setPanel(null)} />
      )}
      {ask && (
        <Ask title={ask.title} text={ask.text} fields={ask.fields} ok={ask.ok} cancel={ask.cancel}
          onOk={(v) => { ask.resolve(v); setAsk(null); }}
          onCancel={() => { ask.resolve(null); setAsk(null); }} />
      )}
    </div>
  );
}
