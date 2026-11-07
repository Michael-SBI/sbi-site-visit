import { useState } from "react";
import { Modal } from "./Modal";
import type { Settings as S } from "../lib/store";

export function SettingsPanel(props: {
  settings: S;
  configClientId: string;
  googleSignedIn: boolean;
  onSave: (s: S) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
  version: string;
}) {
  const [s, setS] = useState<S>(props.settings);
  const set = (k: keyof S, v: any) => setS({ ...s, [k]: v });
  return (
    <Modal
      title="Settings"
      onClose={props.onClose}
      footer={
        <>
          <span className="svr-muted small">Version {props.version}</span>
          <button className="svr-btn ghost" onClick={props.onClose}>Cancel</button>
          <button className="svr-btn primary" onClick={() => props.onSave(s)}>Save settings</button>
        </>
      }
    >
      <div className="svr-form">
        <section>
          <h3>Google Drive</h3>
          <p className="svr-text">
            {props.googleSignedIn ? "Signed in. Drive access lasts an hour, then the app asks again on your next save." : "Not signed in yet."}
          </p>
          <div className="svr-actions left">
            {props.googleSignedIn ? (
              <button className="svr-btn ghost" onClick={props.onSignOut}>Sign out</button>
            ) : (
              <button className="svr-btn primary" onClick={props.onSignIn}>Sign in with Google</button>
            )}
          </div>
          <label className="svr-field">
            <span>Google client ID {props.configClientId ? "(set for everyone in config.json)" : ""}</span>
            <input value={s.googleClientId} placeholder={props.configClientId || "xxxx.apps.googleusercontent.com"}
              onChange={(e) => set("googleClientId", e.target.value.trim())} autoComplete="off" />
            <small>Only needed if config.json doesn't have it yet. Leave blank to use config.json.</small>
          </label>
        </section>
        <section>
          <h3>ClickUp</h3>
          <label className="svr-field">
            <span>Your ClickUp token</span>
            <input type="password" value={s.clickupToken} placeholder="pk_…" onChange={(e) => set("clickupToken", e.target.value.trim())}
              autoComplete="off" />
            <small>Kept on this device only. Use a named token (Site Visit Record tablet) so you can switch it off if the tablet goes missing.</small>
          </label>
        </section>
        <section>
          <h3>Stamps and photos</h3>
          <label className="svr-field">
            <span>Your initials (on stamps)</span>
            <input value={s.initials} maxLength={4} onChange={(e) => set("initials", e.target.value.toUpperCase())} />
          </label>
          <label className="svr-check">
            <input type="checkbox" checked={s.savePhotosToDevice} onChange={(e) => set("savePhotosToDevice", e.target.checked)} />
            <span>Save a copy of each photo to this device (Gallery, Download album)</span>
          </label>
        </section>
      </div>
    </Modal>
  );
}
