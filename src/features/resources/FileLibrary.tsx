import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState } from '../../design/primitives';
import { IconUpload, IconTrash, IconDownload, IconResources } from '../../design/icons';
import { useToast } from '../../design/Toast';
import {
  listFiles,
  putFile,
  deleteFile,
  getBlob,
  download,
  usage,
  requestPersistence,
  formatBytes,
  type FileMeta,
} from '../../lib/blobs';

/**
 * Books, PDFs and slides stored on the device. Files go into IndexedDB, so they
 * survive reloads, work with no connection and are only limited by disk.
 */
export default function FileLibrary() {
  const toast = useToast();
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<FileMeta | null>(null);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, sp] = await Promise.all([listFiles(), usage()]);
      setFiles(rows.filter((f) => f.kind !== 'audio'));
      setSpace(sp);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      await requestPersistence();
      for (const file of Array.from(list)) await putFile(file);
      toast(`${list.length} file${list.length === 1 ? '' : 's'} added`, 'success');
      await refresh();
    } catch (err) {
      toast(`Could not store that file: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(f: FileMeta) {
    await deleteFile(f.id);
    toast(`${f.name} removed`);
    if (open?.id === f.id) setOpen(null);
    await refresh();
  }

  const shown = query.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
    : files;

  return (
    <>
      <div
        className={`drop-zone${dragging ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files);
        }}
      >
        <div className="dz-main">
          <div className="dz-title">Drop books, PDFs or slides here</div>
          <div className="dz-sub">
            Stored on this device only. They open in the app and work with no connection.
          </div>
        </div>
        <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <IconUpload size={16} /> {busy ? 'Storing…' : 'Add files'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => void add(e.target.files)}
        />
      </div>

      {space && (
        <div className="space-bar" title={`${formatBytes(space.used)} of about ${formatBytes(space.quota)}`}>
          <div
            className="space-fill"
            style={{ width: `${space.quota ? Math.min(100, (space.used / space.quota) * 100) : 0}%` }}
          />
          <span>
            {formatBytes(space.used)} used{space.quota ? ` of about ${formatBytes(space.quota)}` : ''}
          </span>
        </div>
      )}

      {files.length > 6 && (
        <input
          className="input"
          style={{ margin: '12px 0' }}
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {files.length === 0 ? (
        <EmptyState icon={<IconResources size={22} />} title="No files yet">
          Add the books and handouts you actually revise from. Nothing is uploaded anywhere.
        </EmptyState>
      ) : (
        <div className="file-list">
          {shown.map((f) => (
            <div className="file-row" key={f.id}>
              <span className={`file-ext ext-${f.kind}`}>{extOf(f.name)}</span>
              <button className="file-main" onClick={() => setOpen(f)}>
                <span className="file-name">{f.name}</span>
                <span className="file-meta">
                  {formatBytes(f.size)} · added {new Date(f.added).toLocaleDateString('en-GB')}
                </span>
              </button>
              <button className="btn btn--ghost btn--icon" aria-label={`Download ${f.name}`} onClick={() => void download(f.id)}>
                <IconDownload size={15} />
              </button>
              <button className="btn btn--ghost btn--icon" aria-label={`Delete ${f.name}`} onClick={() => void remove(f)}>
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {open && <FileViewer meta={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return (m ? m[1]! : 'file').toUpperCase().slice(0, 4);
}

/** Full-screen viewer. PDFs and images render natively from a blob URL. */
function FileViewer({ meta, onClose }: { meta: FileMeta; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(meta.id);
      if (!blob || cancelled) {
        if (!cancelled) setError('That file is no longer stored on this device.');
        return;
      }
      if (/\.(txt|md|csv|json)$/i.test(meta.name) || meta.type.startsWith('text/')) {
        setText(await blob.text());
        return;
      }
      const u = URL.createObjectURL(blob);
      revoke = u;
      setUrl(u);
    })().catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [meta.id, meta.name, meta.type]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isPdf = meta.type === 'application/pdf' || /\.pdf$/i.test(meta.name);
  const isImage = meta.kind === 'image';

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={meta.name}>
      <div className="viewer-bar">
        <span className="viewer-title">{meta.name}</span>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" onClick={() => void download(meta.id)}>
            <IconDownload size={15} /> Download
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <div className="viewer-body">
        {error && <div className="viewer-msg">{error}</div>}
        {!error && text != null && <pre className="viewer-text">{text}</pre>}
        {!error && url && isPdf && <iframe className="viewer-frame" src={url} title={meta.name} />}
        {!error && url && isImage && <img className="viewer-img" src={url} alt={meta.name} />}
        {!error && url && !isPdf && !isImage && (
          <div className="viewer-msg">
            This format has no in-app preview.
            <br />
            <Button style={{ marginTop: 12 }} onClick={() => void download(meta.id)}>
              <IconDownload size={15} /> Download to open it
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
