// ClickUp calls, made from the device with Michael's own named token (kept in this device's settings only).
// Deals list and statuses come from the sales master (sbi-skills/sales-master/sales_rules.py).
import { folderIdFromLink } from "./google";
import type { Job } from "./store";

const API = "https://api.clickup.com/api/v2";
let token = "";
let dealsList = "900301389267";

export function configureClickUp(t: string, listId?: string) {
  token = (t || "").trim();
  if (listId) dealsList = listId;
}
export const clickupConfigured = () => !!token;

// Deal statuses in pipeline order (sales_rules.STATUSES). The first five come before the site visit.
const PIPELINE = [
  "inquiries recieved", "active outreach", "qualified lead", "ballpark budget", "initial meeting booked",
  "meet/inspection completed", "design concept", "plans- layout/rayon", "pricing", "proposal build",
  "presentation meeting ready", "presentation sent", "re-price proposal", "re-present proposal", "contracts requested",
];
const NEEDS_VISIT = new Set(PIPELINE.slice(0, 5));
// Michael, 7 Nov 2026: leave out parked, won, lost and declined deals.
const LEFT_OUT = new Set(["on hold drip feed", "client ghosting", "closed won", "done lost after proposal", "declined_no proposal"]);
const WON = "closed won";
export const stageOf = (status: string) => (NEEDS_VISIT.has(status) ? "visit" : "active");
// New deals start here, as sales-lead-info does; a ClickUp automation then adds the P1–P5 subtasks.
const NEW_STATUS = "inquiries recieved";

async function call(path: string, init: RequestInit = {}) {
  if (!token) throw new Error("Add your ClickUp token in Settings first.");
  const res = await fetch(API + path, { ...init, headers: { ...(init.headers || {}), Authorization: token } });
  if (!res.ok) {
    let msg = res.status + " " + res.statusText;
    try {
      const j = await res.json();
      msg = j.err || j.error || msg;
    } catch {
      /* not json */
    }
    throw new Error("ClickUp: " + msg);
  }
  return res.json();
}

function toJob(t: any): Job {
  const field = (t.custom_fields || []).find((f: any) => /job folder/i.test(f.name || ""));
  const status = (t.status?.status || "").toLowerCase();
  return {
    id: t.id,
    name: t.name,
    status,
    sold: status === WON,
    folderId: folderIdFromLink(field?.value),
    url: t.url || `https://app.clickup.com/t/${t.id}`,
  };
}

/**
 * Live sales deals: those still needing a site visit first, then the rest, each in pipeline order.
 * One quick request: open deals only, no subtasks.
 */
export async function listJobs(): Promise<Job[]> {
  const out: Job[] = [];
  for (let page = 0; page < 10; page++) {
    const j = await call(`/list/${dealsList}/task?include_closed=false&subtasks=false&archived=false&page=${page}`);
    for (const t of j.tasks || []) {
      if (t.parent) continue;
      const job = toJob(t);
      // Only real sales stages: leaves out parked/closed deals and stray tasks with other statuses.
      if (!LEFT_OUT.has(job.status) && PIPELINE.includes(job.status)) out.push(job);
    }
    if (j.last_page || (j.tasks || []).length < 100) break;
  }
  const rank = (s: string) => (PIPELINE.indexOf(s) < 0 ? 99 : PIPELINE.indexOf(s));
  return out.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
}

export async function getJob(id: string): Promise<Job> {
  return toJob(await call(`/task/${id}`));
}

/** Creates a new deal at inquiries recieved. Returns the job (no folder yet). */
export async function createDeal(name: string, note: string): Promise<Job> {
  const t = await call(`/list/${dealsList}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, status: NEW_STATUS, description: note }),
  });
  return toJob(t);
}

/**
 * Where a comment about the site visit goes: the deal's Site Visit Canvas subtask, then Site measure,
 * then the deal itself (sales core rule 5: comments about a step go on its subtask).
 */
export async function findPostTarget(dealId: string): Promise<{ id: string; name: string }> {
  const t = await call(`/task/${dealId}?include_subtasks=true`);
  const subs: any[] = t.subtasks || [];
  const hit = subs.find((s) => /site visit canvas/i.test(s.name)) || subs.find((s) => /site measure/i.test(s.name));
  return hit ? { id: hit.id, name: hit.name } : { id: t.id, name: t.name };
}

export async function postComment(taskId: string, text: string) {
  return call(`/task/${taskId}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment_text: text, notify_all: false }),
  });
}

export async function attachFile(taskId: string, blob: Blob, filename: string) {
  const fd = new FormData();
  fd.append("attachment", blob, filename);
  return call(`/task/${taskId}/attachment`, { method: "POST", body: fd });
}
