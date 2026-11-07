import { ReactNode, useEffect } from "react";
import { Icon } from "./icons";

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [props.onClose]);
  return (
    <div className="svr-backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={"svr-modal" + (props.wide ? " wide" : "")} role="dialog" aria-label={props.title}>
        <div className="svr-modal-head">
          <h2>{props.title}</h2>
          <button className="svr-icon-btn" onClick={props.onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="svr-modal-body">{props.children}</div>
        {props.footer && <div className="svr-modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

/** A one-question dialog: a few text fields and two buttons. */
export type AskField = { key: string; label: string; value?: string; placeholder?: string; hint?: string };
export function Ask(props: {
  title: string;
  text?: ReactNode;
  fields?: AskField[];
  ok: string;
  cancel?: string;
  onOk: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const out: Record<string, string> = {};
    for (const f of props.fields || []) out[f.key] = String(fd.get(f.key) || "").trim();
    props.onOk(out);
  };
  return (
    <Modal title={props.title} onClose={props.onCancel}>
      <form onSubmit={submit} className="svr-form">
        {props.text && <div className="svr-text">{props.text}</div>}
        {(props.fields || []).map((f, i) => (
          <label key={f.key} className="svr-field">
            <span>{f.label}</span>
            <input name={f.key} defaultValue={f.value || ""} placeholder={f.placeholder} autoFocus={i === 0}
              autoComplete="off" />
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
        <div className="svr-actions">
          <button type="button" className="svr-btn ghost" onClick={props.onCancel}>
            {props.cancel || "Cancel"}
          </button>
          <button type="submit" className="svr-btn primary">
            {props.ok}
          </button>
        </div>
      </form>
    </Modal>
  );
}
