import { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import type { Job } from "../lib/store";

export function JobPicker(props: {
  jobs: Job[];
  loadedAt: string | null;
  loading: boolean;
  error: string | null;
  current: Job | null;
  onRefresh: () => void;
  onPick: (j: Job) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!props.loadedAt) props.onRefresh();
  }, []);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return props.jobs.filter((j) => words.every((w) => j.name.toLowerCase().includes(w)));
  }, [q, props.jobs]);
  const live = shown.filter((j) => !j.sold);
  const sold = shown.filter((j) => j.sold);
  const row = (j: Job) => (
    <button key={j.id} className={"svr-job" + (props.current?.id === j.id ? " current" : "")} onClick={() => props.onPick(j)}>
      <span className="svr-job-name">{j.name}</span>
      <span className="svr-job-meta">
        <span className="svr-chip">{j.status}</span>
        {!j.folderId && <span className="svr-chip warn">no job folder</span>}
      </span>
    </button>
  );
  return (
    <Modal
      title="Pick the job"
      onClose={props.onClose}
      wide
      footer={
        <>
          <span className="svr-muted">
            {props.loading ? "Loading from ClickUp…" : props.loadedAt ? `List from ${new Date(props.loadedAt).toLocaleString("en-AU")}` : ""}
          </span>
          <button className="svr-btn ghost" onClick={props.onRefresh} disabled={props.loading}>
            <Icon name="refresh" size={16} /> Refresh
          </button>
          <button className="svr-btn primary" onClick={props.onNew}>
            <Icon name="plus" size={16} /> New job
          </button>
        </>
      }
    >
      <input className="svr-search" placeholder="Search deals and jobs" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {props.error && <p className="svr-error">{props.error}</p>}
      <div className="svr-job-list">
        {live.length > 0 && <h3>Live deals</h3>}
        {live.map(row)}
        {sold.length > 0 && <h3>Sold jobs</h3>}
        {sold.map(row)}
        {!props.loading && shown.length === 0 && <p className="svr-muted">No deals match. Tap New job to create one.</p>}
      </div>
    </Modal>
  );
}
