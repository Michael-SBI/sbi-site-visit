// Google sign-in (Google Identity Services token flow) and the Drive calls the app needs.
// Scope is full Drive: job folders come from ClickUp, so the app must reach folders it didn't create.
// The OAuth client is Internal to spokebi.com.au, so only staff accounts can sign in.

const SCOPE = "https://www.googleapis.com/auth/drive";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ALL = "supportsAllDrives=true";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
export const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  shortcutDetails?: { targetId: string; targetMimeType: string };
  thumbnailLink?: string;
  appProperties?: Record<string, string>;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
};

let clientId = "";
let hostedDomain = "";
let token: { value: string; expires: number } | null = null;
let gisLoading: Promise<void> | null = null;

export function configureGoogle(id: string, hd: string) {
  clientId = id;
  hostedDomain = hd;
  try {
    const saved = JSON.parse(sessionStorage.getItem("sbi-gtoken") || "null");
    if (saved && saved.expires > Date.now() + 60_000) token = saved;
  } catch {
    /* ignore */
  }
}

export const googleConfigured = () => !!clientId;
export const signedIn = () => !!token && token.expires > Date.now() + 60_000;

function loadGis(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisLoading = null;
        reject(new Error("Couldn't load Google sign-in. Check the internet connection."));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

// Load the sign-in script early so the popup opens straight from the button tap.
export function preloadGoogle() {
  if (clientId) loadGis().catch(() => {});
}

/** Gets an access token, showing Google's popup if needed. Call from a tap. */
export async function signIn(interactive = true): Promise<string> {
  if (signedIn()) return token!.value;
  if (!clientId) throw new Error("Google sign-in isn't set up yet. Add the client ID in Settings.");
  await loadGis();
  const google = (window as any).google;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      hd: hostedDomain || undefined,
      prompt: interactive ? "" : "none",
      callback: (resp: any) => {
        if (resp.error) return reject(new Error("Google sign-in failed: " + resp.error));
        token = { value: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        try {
          sessionStorage.setItem("sbi-gtoken", JSON.stringify(token));
        } catch {
          /* ignore */
        }
        resolve(token.value);
      },
      error_callback: (err: any) =>
        reject(new Error(err?.type === "popup_closed" ? "Sign-in was closed." : "Google sign-in was blocked: " + (err?.type || "unknown"))),
    });
    client.requestAccessToken();
  });
}

export function signOut() {
  const google = (window as any).google;
  if (token && google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => {});
  token = null;
  try {
    sessionStorage.removeItem("sbi-gtoken");
  } catch {
    /* ignore */
  }
}

async function call(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const t = await signIn();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: "Bearer " + t } });
  if (res.status === 401 && retry) {
    token = null;
    return call(url, init, false);
  }
  if (!res.ok) {
    let msg = res.status + " " + res.statusText;
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
    } catch {
      /* not json */
    }
    const err: any = new Error("Drive: " + msg);
    err.status = res.status;
    throw err;
  }
  return res;
}

const FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,parents,shortcutDetails,thumbnailLink,appProperties,lastModifyingUser(displayName,emailAddress)";

export const currentToken = () => (signedIn() ? token!.value : null);

/**
 * Site visits saved since `sinceIso`, newest first, across My Drive and the shared drives.
 * Found by the app's own tag on the file (appProperties svr=1) or the drawing's file type.
 */
export async function searchVisits(sinceIso: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  const q = encodeURIComponent(
    `(appProperties has { key='svr' and value='1' } or mimeType='${EXCALIDRAW_MIME}') and modifiedTime > '${sinceIso}' and trashed=false`,
  );
  do {
    const r = await call(
      `${API}/files?q=${q}&${ALL}&includeItemsFromAllDrives=true&corpora=allDrives&pageSize=100` +
        `&fields=nextPageToken,files(${FIELDS})` + (pageToken ? `&pageToken=${pageToken}` : ""),
    );
    const j = await r.json();
    out.push(...j.files);
    pageToken = j.nextPageToken || "";
  } while (pageToken && out.length < 500);
  return out.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""));
}

/** Changes a file's details (not its contents). */
export async function patchMeta(id: string, body: object) {
  const r = await call(`${API}/files/${id}?${ALL}&fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

/** appProperties allow 124 bytes per key + value: trims a value to fit. */
export function fitProp(key: string, value: string): string {
  const enc = new TextEncoder();
  let v = value;
  while (enc.encode(key + v).length > 124) v = Array.from(v).slice(0, -1).join("");
  return v;
}

export async function getFile(id: string): Promise<DriveFile> {
  const r = await call(`${API}/files/${id}?${ALL}&fields=${FIELDS}`);
  return r.json();
}

export async function listChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const r = await call(
      `${API}/files?q=${q}&${ALL}&includeItemsFromAllDrives=true&corpora=allDrives&pageSize=200` +
        `&orderBy=folder,name&fields=nextPageToken,files(${FIELDS})` +
        (pageToken ? `&pageToken=${pageToken}` : ""),
    );
    const j = await r.json();
    out.push(...j.files);
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

export const isFolder = (f: DriveFile) =>
  f.mimeType === FOLDER_MIME || (f.mimeType === SHORTCUT_MIME && f.shortcutDetails?.targetMimeType === FOLDER_MIME);
export const targetId = (f: DriveFile) => (f.mimeType === SHORTCUT_MIME ? f.shortcutDetails!.targetId : f.id);

/** Finds a child folder whose name starts with `prefix` (e.g. "4.0"), or matches exactly. */
export async function findChildFolder(parentId: string, match: (name: string) => boolean): Promise<string | null> {
  const kids = await listChildren(parentId);
  const hit = kids.find((k) => isFolder(k) && match(k.name.trim()));
  return hit ? targetId(hit) : null;
}

export async function createFolder(parentId: string, name: string): Promise<string> {
  const r = await call(`${API}/files?${ALL}&fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return (await r.json()).id;
}

export async function ensureChildFolder(parentId: string, exactName: string, match?: (name: string) => boolean) {
  const found = await findChildFolder(parentId, match || ((n) => n === exactName));
  return found || createFolder(parentId, exactName);
}

/** Creates a file in a folder. Resumable upload, so big plan sets go through. */
export async function createFile(folderId: string, name: string, mime: string, blob: Blob, extra: object = {}): Promise<DriveFile> {
  return upload(`${UPLOAD}/files?uploadType=resumable&${ALL}&fields=${FIELDS}`, "POST", { ...extra, name, parents: [folderId], mimeType: mime }, mime, blob);
}

/** Replaces a file's contents (and name) in place, keeping its id and its links. */
export async function updateFile(id: string, name: string, mime: string, blob: Blob, extra: object = {}): Promise<DriveFile> {
  return upload(`${UPLOAD}/files/${id}?uploadType=resumable&${ALL}&fields=${FIELDS}`, "PATCH", { ...extra, name }, mime, blob);
}

async function upload(url: string, method: string, meta: object, mime: string, blob: Blob): Promise<DriveFile> {
  const start = await call(url, {
    method,
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime },
    body: JSON.stringify(meta),
  });
  const session = start.headers.get("Location");
  if (!session) {
    // The browser hid the upload address: fall back to a single multipart request.
    return multipart(url.replace("uploadType=resumable", "uploadType=multipart"), method, meta, mime, blob);
  }
  const r = await call(session, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
  return r.json();
}

async function multipart(url: string, method: string, meta: object, mime: string, blob: Blob): Promise<DriveFile> {
  const b = "sbi" + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${b}\r\nContent-Type: ${mime}\r\n\r\n`,
    blob,
    `\r\n--${b}--`,
  ]);
  const r = await call(url, { method, headers: { "Content-Type": `multipart/related; boundary=${b}` }, body });
  return r.json();
}

export async function download(id: string): Promise<Blob> {
  const r = await call(`${API}/files/${id}?alt=media&${ALL}`);
  return r.blob();
}

/** Folder id from a Drive link (the 🤝 23 field) or a bare id. */
export function folderIdFromLink(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}
