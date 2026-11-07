// Everything kept on the device: the drawing in progress (autosave), its images,
// the cached jobs list and settings. IndexedDB, because plan images are too big for localStorage.
import { createStore, get, set, del, keys } from "idb-keyval";

const db = createStore("sbi-site-visit", "kv");

export type Job = {
  id: string; // ClickUp task id
  name: string;
  status: string;
  sold: boolean;
  folderId: string | null; // Drive job folder from 🤝 23, null if not linked yet
  url: string;
};

export type DrawingMeta = {
  name: string | null; // file name without extension, set at first save
  job: Job | null;
  drive: {
    folderId: string | null; // where the two files live
    excalidrawId: string | null;
    pdfId: string | null;
    pdfLink: string | null;
  };
  photos: Record<string, string>; // excalidraw fileId -> Drive file id (uploaded originals)
  attachedToDeal: string[]; // Drive/photo keys already attached to the ClickUp deal
  savedHash: number | null; // scene hash at the last Drive save
  savedAt: string | null; // ISO time of the last Drive save
  postedAt: string | null;
};

export const emptyMeta = (): DrawingMeta => ({
  name: null,
  job: null,
  drive: { folderId: null, excalidrawId: null, pdfId: null, pdfLink: null },
  photos: {},
  attachedToDeal: [],
  savedHash: null,
  savedAt: null,
  postedAt: null,
});

export type Autosave = {
  elements: any[];
  appState: any;
  fileIds: string[];
  meta: DrawingMeta;
  at: string;
};

export const loadAutosave = () => get<Autosave>("current", db);
export const saveAutosave = (a: Autosave) => set("current", a, db);
export const clearAutosave = () => del("current", db);

// Image data is written once per file id, not on every autosave.
export const putFile = (id: string, file: any) => set("file:" + id, file, db);
export const getFile = (id: string) => get<any>("file:" + id, db);
export async function hasFile(id: string) {
  return (await get("file:" + id, db)) !== undefined;
}
export async function pruneFiles(keep: Set<string>) {
  for (const k of await keys(db)) {
    if (typeof k === "string" && k.startsWith("file:") && !keep.has(k.slice(5))) await del(k, db);
  }
}

// Original photo blobs waiting to upload (no job picked yet, or offline).
export type PendingPhoto = { fileId: string; blob: Blob; name: string };
export const getPending = async () => (await get<PendingPhoto[]>("pendingPhotos", db)) || [];
export const setPending = (p: PendingPhoto[]) => set("pendingPhotos", p, db);

export const getCachedJobs = () => get<{ jobs: Job[]; at: string }>("jobs", db);
export const setCachedJobs = (jobs: Job[]) => set("jobs", { jobs, at: new Date().toISOString() }, db);

// Small settings live in localStorage (per device).
export type Settings = {
  clickupToken: string;
  initials: string;
  savePhotosToDevice: boolean;
  googleClientId: string; // overrides config.json when set
};
const SETTINGS_KEY = "sbi-svr-settings";
export function loadSettings(): Settings {
  const d: Settings = { clickupToken: "", initials: "", savePhotosToDevice: true, googleClientId: "" };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return d;
  }
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private window: settings last for this visit only */
  }
}
