import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

/** Tiny subsequence fuzzy match — returns a score or -1 for no match. */
function fuzzy(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
      score += streak;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : -1;
}

export function CommandPalette({
  commands,
  onClose,
  search,
}: {
  commands: Command[];
  onClose: () => void;
  search?: (query: string) => Command[];
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    if (!q.trim()) return commands;
    const navMatches = commands
      .map((c) => ({ c, s: Math.max(fuzzy(q, c.label), fuzzy(q, c.hint || '')) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c);
    const contentMatches = search ? search(q) : [];
    return [...navMatches, ...contentMatches];
  }, [q, commands, search]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[sel];
      if (cmd) {
        onClose();
        cmd.run();
      }
    }
  }

  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="cmdk-input-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to… or search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search commands"
          />
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">No matches</div>}
          {results.map((c, i) => (
            <div
              key={c.id}
              className="cmdk-item"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                onClose();
                c.run();
              }}
            >
              {c.icon && <span className="ci-ico">{c.icon}</span>}
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.hint && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{c.hint}</span>}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
