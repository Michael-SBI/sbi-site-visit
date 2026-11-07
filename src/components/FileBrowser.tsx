import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./icons";
import { DriveFile, isFolder, listChildren, targetId } from "../lib/google";

const OPENABLE = /\.(pdf|png|jpe?g|webp|excalidraw)$/i;
const kind = (f: DriveFile) =>
  isFolder(f) ? "folder" : /\.excalidraw$/i.test(f.name) ? "drawing" : /\.pdf$/i.test(f.name) || f.mimeType === "application/pdf" ? "pdf" : "image";

export function FileBrowser(props: {
  rootId: string;
  rootName: string;
  startPath?: { id: string; name: string }[];
  onOpen: (f: DriveFile) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState<{ id: string; name: string }[]>(props.startPath || [{ id: props.rootId, name: props.rootName }]);
  const [items, setItems] = useState<DriveFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = path[path.length - 1];

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    listChildren(here.id)
      .then((list) => live && setItems(list.filter((f) => isFolder(f) || OPENABLE.test(f.name) || f.mimeType === "application/pdf" || f.mimeType.startsWith("image/"))))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [here.id]);

  return (
    <Modal title="Open from the job folder" onClose={props.onClose} wide>
      <div className="svr-crumbs">
        {path.map((p, i) => (
          <button key={p.id + i} className="svr-crumb" onClick={() => setPath(path.slice(0, i + 1))} disabled={i === path.length - 1}>
            {p.name}
          </button>
        ))}
      </div>
      {error && <p className="svr-error">{error}</p>}
      {!items && !error && <p className="svr-muted">Loading…</p>}
      <div className="svr-files">
        {items?.map((f) => {
          const k = kind(f);
          return (
            <button
              key={f.id}
              className={"svr-file " + k}
              onClick={() => (k === "folder" ? setPath([...path, { id: targetId(f), name: f.name }]) : props.onOpen(f))}
            >
              <Icon name={k === "folder" ? "folder" : k === "drawing" ? "drawing" : k === "pdf" ? "pdf" : "image"} />
              <span className="svr-file-name">{f.name}</span>
              {f.modifiedTime && k !== "folder" && <span className="svr-muted small">{new Date(f.modifiedTime).toLocaleDateString("en-AU")}</span>}
            </button>
          );
        })}
        {items && items.length === 0 && <p className="svr-muted">Nothing here the app can open.</p>}
      </div>
    </Modal>
  );
}
