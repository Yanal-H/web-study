import { useCallback, useEffect, useRef, useState } from 'react';
import { listFiles, putFile, deleteFile, getBlob, formatBytes, type FileMeta } from '../../lib/blobs';
import { update } from '../../state/store';
import { useStore } from '../../state/useStore';
import { IconMusic, IconPlay, IconPause, IconSkip, IconTrash, IconPlus, IconClose } from '../../design/icons';
import { musicEngine, TRACKS } from '../../lib/music';
import { EQ_PRESETS, connectEq, setEqPreset, type EqPreset } from '../../lib/eq';

/**
 * Offline music. Tracks are the user's own audio files, stored in IndexedDB and
 * played from a blob URL — nothing streams, nothing is fetched, and the player
 * lives in the app shell so it keeps playing as you move between pages.
 */
export default function MusicPlayer() {
  const state = useStore();
  const cfg = (state.settings as Record<string, any>).sound || {};
  const [tracks, setTracks] = useState<FileMeta[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [source, setSource] = useState<'built-in' | 'files'>('built-in');
  const [builtIn, setBuiltIn] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const eqRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const volume = typeof cfg.musicVolume === 'number' ? cfg.musicVolume : 0.7;
  const eq = (cfg.eq as EqPreset) || 'flat';
  const current = tracks[index];

  const refresh = useCallback(async () => {
    try {
      setTracks(await listFiles('audio'));
    } catch {
      setTracks([]);
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // load the selected track into the audio element
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!current) return;
      const blob = await getBlob(current.id);
      if (!blob || cancelled) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const el = audioRef.current;
      if (!el) return;
      el.src = url;
      el.volume = volume;
      if (playing) {
        try {
          await el.play();
        } catch {
          // a browser that refuses autoplay needs one tap on Play
          setPlaying(false);
          setNotice('Tap play to start — the browser blocked autoplay.');
          setTimeout(() => setNotice(null), 3200);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    musicEngine().setVolume(volume);
  }, [volume]);

  useEffect(() => {
    setEqPreset(eq);
    musicEngine().setEq(eq);
  }, [eq]);

  useEffect(() => () => musicEngine().stop(), []);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  /**
   * Play a stored track. Selecting the track that is already current does not
   * change `current?.id`, so the load effect never fires — which is why picking
   * the only track in the list used to do nothing at all. Playback is started
   * here explicitly instead.
   */
  async function select(i: number) {
    const t = tracks[i];
    if (!t) return;
    musicEngine().stop();
    setBuiltIn(null);
    setIndex(i);
    const el = audioRef.current;
    if (!el) return;
    try {
      if (!el.src || tracks[index]?.id !== t.id) {
        const blob = await getBlob(t.id);
        if (!blob) throw new Error('the file is no longer stored on this device');
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        el.src = url;
      }
      el.volume = volume;
      if (!eqRef.current) eqRef.current = connectEq(el, eq);
      await el.play();
      setPlaying(true);
    } catch (err) {
      setPlaying(false);
      setNotice(playError(el, err));
      setTimeout(() => setNotice(null), 4200);
    }
  }

  function playBuiltIn(id: string) {
    const eng = musicEngine();
    // one thing plays at a time
    audioRef.current?.pause();
    setPlaying(false);
    if (builtIn === id) {
      eng.stop();
      setBuiltIn(null);
      return;
    }
    eng.setVolume(volume);
    if (eng.play(id)) setBuiltIn(id);
  }

  function toggle() {
    const el = audioRef.current;
    if (!el || !current) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    void select(index);
  }

  /** Select from an explicit list — used right after an import, before state settles. */
  async function selectFrom(rows: FileMeta[], i: number) {
    const t = rows[i];
    if (!t) return;
    musicEngine().stop();
    setBuiltIn(null);
    setIndex(i);
    const el = audioRef.current;
    if (!el) return;
    try {
      const blob = await getBlob(t.id);
      if (!blob) throw new Error('the file is no longer stored on this device');
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      el.src = url;
      el.volume = volume;
      if (!eqRef.current) eqRef.current = connectEq(el, eq);
      await el.play();
      setPlaying(true);
    } catch (err) {
      setPlaying(false);
      setNotice(playError(el, err));
      setTimeout(() => setNotice(null), 4200);
    }
  }

  function step(delta: number) {
    if (tracks.length === 0) return;
    setIndex((i) => {
      if (shuffle && tracks.length > 1) {
        let n = i;
        while (n === i) n = Math.floor(Math.random() * tracks.length);
        return n;
      }
      return (i + delta + tracks.length) % tracks.length;
    });
    setPlaying(true);
  }

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setAdding(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(list)) {
        const meta = await putFile(f, { kind: 'audio' });
        added.push(meta.id);
      }
      const rows = await listFiles('audio');
      setTracks(rows);
      // land on the track that was just added and start it, rather than
      // silently appending to a list the student cannot see
      const first = rows.findIndex((t) => t.id === added[0]);
      setSource('files');
      setNotice(`Added ${added.length} track${added.length === 1 ? '' : 's'}`);
      setTimeout(() => setNotice(null), 2600);
      // give React the new list before selecting into it
      setTimeout(() => void selectFrom(rows, first >= 0 ? first : 0), 0);
    } catch (err) {
      setNotice(`Could not add that file: ${(err as Error).message}`);
    } finally {
      setAdding(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    await deleteFile(id);
    const next = tracks.filter((t) => t.id !== id);
    setTracks(next);
    if (index >= next.length) setIndex(0);
    if (next.length === 0) setPlaying(false);
  }

  // hidden until the user opens it, unless there is already a library
  if (!mounted) return null;

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => step(1)}
        onError={() => {
          setPlaying(false);
          setNotice('That file could not be played on this device.');
          setTimeout(() => setNotice(null), 3200);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {!open && (
        <button
          className={`music-fab${playing ? ' spinning' : ''}`}
          aria-label="Music"
          title="Music"
          onClick={() => setOpen(true)}
        >
          <IconMusic size={17} />
        </button>
      )}

      {open && (
        <div className="music-panel" role="region" aria-label="Music player">
          <div className="mp-head">
            <span className="mp-title">Music</span>
            <button className="mp-x" aria-label="Close music" onClick={() => setOpen(false)}>
              <IconClose size={15} />
            </button>
          </div>

          <div className="mp-tabs">
            <button
              className={source === 'built-in' ? 'on' : ''}
              onClick={() => setSource('built-in')}
            >
              Built-in
            </button>
            <button className={source === 'files' ? 'on' : ''} onClick={() => setSource('files')}>
              My tracks{tracks.length ? ` · ${tracks.length}` : ''}
            </button>
          </div>

          {source === 'built-in' ? (
            <>
              <div className="mp-list">
                {TRACKS.map((t) => (
                  <div className={`mp-row${builtIn === t.id ? ' on' : ''}`} key={t.id}>
                    <button className="mp-row-main" onClick={() => playBuiltIn(t.id)}>
                      <span className="mp-row-name">
                        {t.name}
                        <span className="mp-blurb">{t.blurb}</span>
                      </span>
                      <span className="mp-row-size">{builtIn === t.id ? 'Playing' : `${t.bpm}`}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="mp-note">
                Played live in the browser — no files, no connection, nothing to license.
              </div>
            </>
          ) : (
          <>
          {current ? (
            <>
              <div className="mp-now" title={current.name}>
                {current.name.replace(/\.[a-z0-9]+$/i, '')}
              </div>
              <input
                className="mp-seek"
                type="range"
                min={0}
                max={Math.max(1, duration)}
                value={progress}
                aria-label="Seek"
                onChange={(e) => {
                  const t = Number(e.target.value);
                  if (audioRef.current) audioRef.current.currentTime = t;
                  setProgress(t);
                }}
              />
              <div className="mp-time">
                <span>{clock(progress)}</span>
                <span>{clock(duration)}</span>
              </div>
            </>
          ) : (
            <div className="mp-empty">Add your own tracks — they stay on this device.</div>
          )}

          <div className="mp-controls">
            <button aria-label="Previous" onClick={() => step(-1)} disabled={!current}>
              <IconSkip size={16} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <button className="mp-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} disabled={!current}>
              {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
            <button aria-label="Next" onClick={() => step(1)} disabled={!current}>
              <IconSkip size={16} />
            </button>
            <button
              className={`mp-shuffle${shuffle ? ' on' : ''}`}
              aria-pressed={shuffle}
              aria-label="Shuffle"
              onClick={() => setShuffle((s) => !s)}
            >
              Shuffle
            </button>
          </div>

          <label className="mp-vol mp-eq">
            Sound shape
            <select
              className="select"
              value={eq}
              aria-label="Sound shape"
              onChange={(e) =>
                update((s) => {
                  const snd = ((s.settings as Record<string, any>).sound ||= {});
                  snd.eq = e.target.value;
                })
              }
            >
              {EQ_PRESETS.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mp-vol">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                update((s) => {
                  const snd = ((s.settings as Record<string, any>).sound ||= {});
                  snd.musicVolume = v;
                });
              }}
            />
          </label>

          {tracks.length > 0 && (
            <div className="mp-list mp-files">
              {tracks.map((t, i) => (
                <div className={`mp-row${i === index ? ' on' : ''}`} key={t.id}>
                  <button className="mp-row-main" onClick={() => void select(i)}>
                    <span className="mp-row-name">{t.name.replace(/\.[a-z0-9]+$/i, '')}</span>
                    <span className="mp-row-size">{formatBytes(t.size)}</span>
                  </button>
                  <button className="mp-row-del" aria-label={`Remove ${t.name}`} onClick={() => void remove(t.id)}>
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="mp-add" onClick={() => fileRef.current?.click()} disabled={adding}>
            <IconPlus size={14} /> {adding ? 'Adding…' : 'Add tracks'}
          </button>
          {notice && <div className="mp-notice">{notice}</div>}
          <div className="mp-note">
            Any format this browser can decode: mp3, m4a, mp4, aac, ogg, opus, wav, flac, webm.
            A video file plays its sound. Files stay on this device and work offline.
          </div>
          <input
            ref={fileRef}
            type="file"
            // audio and video containers alike — an mp4 or webm plays its audio
            // track through the same element, which is what students actually have
            accept="audio/*,video/*,.mp3,.m4a,.m4b,.mp4,.aac,.ogg,.oga,.opus,.wav,.flac,.weba,.webm,.wma,.aif,.aiff,.mkv,.mov,.3gp,.amr"
            multiple
            hidden
            onChange={(e) => void add(e.target.files)}
          />
          </>
          )}
        </div>
      )}
    </>
  );
}

/** Turn a media failure into something a student can act on. */
function playError(el: HTMLAudioElement | null, err: unknown): string {
  const code = el?.error?.code;
  if (code === 4) return 'This browser cannot decode that file. Try an mp3 or m4a.';
  if (code === 3) return 'That file looks damaged and could not be decoded.';
  if (code === 2) return 'The file could not be read from storage.';
  const msg = (err as Error)?.message || '';
  if (/NotAllowedError|gesture|user activation/i.test(msg))
    return 'Tap play once — the browser blocked audio until you interact.';
  return msg ? `Could not play that track: ${msg}` : 'Could not play that track.';
}

function clock(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
