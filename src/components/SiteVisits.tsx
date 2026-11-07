import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import type { DriveFile } from "../lib/google";
import type { Job } from "../lib/store";

const DAY = 864e5;
const when = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";
const stripExt = (n: string) => n.replace(/\.excalidraw$/i, "");

/** A preview from Drive. Shown straight from Google; if that's refused, fetched with the sign-in token. */
function Thumb({ f, token }: { f: DriveFile; token: string | null }) {
  const [src, setSrc] = useState<string | null>(f.thumbnailLink || null);
  const [failed, setFailed] = useState(!f.thumbnailLink);
  const [tried, setTried] = useState(false);
  useEffect(() => () => {
    if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
  }, [src]);
  const onError = async () => {
    if (tried || !f.thumbnailLink || !token) return setFailed(true);
    setTried(true);
    try {
      const r = await fetch(f.thumbnailLink, { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error();
      setSrc(URL.createObjectURL(await r.blob()));
    } catch {
      setFailed(true);
    }
  };
  if (failed || !src)
    return (
      <div className="svr-thumb empty">
        <Icon name="drawing" size={34} />
      </div>
    );
  return <img className="svr-thumb" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onError} />;
}

export function SiteVisits(props: {
  load: (sinceIso: string) => Promise<DriveFile[]>;
  token: string | null;
  currentJob: Job | null;
  unsaved: { name: string; job: string } | null;
  onOpen: (f: DriveFile) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState(30);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyJob, setOnlyJob] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    setError(null);
    props
      .load(new Date(Date.now() - days * DAY).toISOString().slice(0, 19))
      .then((list) => live && setFiles(list))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [days]);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (files || []).filter((f) => {
      const p = f.appProperties || {};
      if (onlyJob && props.currentJob && p.jobId !== props.currentJob.id) return false;
      const hay = `${f.name} ${p.jobName || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [files, q, onlyJob]);

  return (
    <Modal
      title="Site visits"
      wide
      onClose={props.onClose}
      footer={
        <>
          <span className="svr-muted">
            {files ? `${shown.length} saved in the last ${days === 30 ? "month" : `${Math.round(days / 30)} months`}` : "Loading from Drive…"}
          </span>
          <button className="svr-btn ghost" onClick={() => { setFiles(null); setDays(days + 30); }} disabled={!files}>
            Show older
          </button>
        </>
      }
    >
      <div className="svr-visits-tools">
        <input className="svr-search" placeholder="Search by name or job" value={q} onChange={(e) => setQ(e.target.value)} />
        {props.currentJob && (
          <div className="svr-seg" role="group" aria-label="Which visits">
            <button className={!onlyJob ? "on" : ""} onClick={() => setOnlyJob(false)}>All jobs</button>
            <button className={onlyJob ? "on" : ""} onClick={() => setOnlyJob(true)}>This job</button>
          </div>
        )}
      </div>
      {error && <p className="svr-error">{error}</p>}
      <div className="svr-visits">
        {props.unsaved && (
          <button className="svr-visit unsaved" onClick={props.onClose}>
            <div className="svr-thumb empty"><Icon name="save" size={30} /></div>
            <div className="svr-visit-body">
              <strong>{props.unsaved.name}</strong>
              <span className="svr-visit-job">{props.unsaved.job}</span>
              <span className="svr-flag warn">Not saved to Drive: on this device only</span>
            </div>
          </button>
        )}
        {shown.map((f) => {
          const p = f.appProperties || {};
          const counts = [
            p.sheets && `${p.sheets} sheet${p.sheets === "1" ? "" : "s"}`,
            p.photos && `${p.photos} photo${p.photos === "1" ? "" : "s"}`,
          ].filter(Boolean).join(" · ");
          return (
            <button key={f.id} className="svr-visit" onClick={() => props.onOpen(f)}>
              <Thumb f={f} token={props.token} />
              <div className="svr-visit-body">
                <strong>{stripExt(f.name)}</strong>
                {p.jobName && <span className="svr-visit-job">{p.jobName}</span>}
                <span className="svr-muted small">
                  Saved {when(f.modifiedTime)}
                  {f.lastModifyingUser?.displayName ? ` by ${f.lastModifyingUser.displayName}` : ""}
                </span>
                {counts && <span className="svr-muted small">{counts}</span>}
                {p.svr && (
                  <span className={"svr-flag" + (p.posted === "1" ? " ok" : "")}>
                    {p.posted === "1" ? "Posted to ClickUp" : "Not posted to ClickUp"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {files && shown.length === 0 && !props.unsaved && (
          <p className="svr-muted">
            No site visits saved {onlyJob ? "for this job " : ""}in this period. Tap Show older to look further back.
          </p>
        )}
      </div>
    </Modal>
  );
}
