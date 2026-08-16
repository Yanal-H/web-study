import { useMemo } from 'react';
import type { DeckNode } from './deck';
import { findNode } from './engineBridge';
import { IconChevron, IconFlashcards } from '../../design/icons';

/**
 * Decks as a contents page.
 *
 * You see the big topics first — one card each, with its own colour — and open
 * one to see what sits under it. Drilling in rather than expanding in place
 * keeps a bank of hundreds of decks readable, because you only ever look at one
 * level at a time, with a breadcrumb showing where you are.
 */
export default function DeckBrowser({
  nodes,
  path,
  onPath,
  onStudy,
}: {
  nodes: DeckNode[];
  /** current location in the tree; empty string is the top */
  path: string;
  onPath: (p: string) => void;
  onStudy: (p: string) => void;
}) {
  const current = path ? findNode(nodes, path) : undefined;
  const level = path ? (current?.children ?? []) : nodes;
  const crumbs = useMemo(() => {
    if (!path) return [];
    const parts = path.split('::');
    return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('::') }));
  }, [path]);

  return (
    <div className="deck-browser">
      <nav className="deck-crumbs" aria-label="Deck path">
        <button className={path ? '' : 'here'} onClick={() => onPath('')}>
          All topics
        </button>
        {crumbs.map((c, i) => (
          <span key={c.path}>
            <span className="crumb-sep">›</span>
            <button className={i === crumbs.length - 1 ? 'here' : ''} onClick={() => onPath(c.path)}>
              {c.name}
            </button>
          </span>
        ))}
      </nav>

      {current && (
        <div className="deck-current">
          <div>
            <div className="dc-name">{current.name}</div>
            <div className="dc-sub">
              {current.total} cards
              {current.children.length ? ` · ${current.children.length} sub-topics` : ''}
              {current.due ? ` · ${current.due} due` : ''}
              {current.neu ? ` · ${current.neu} new` : ''}
            </div>
          </div>
          <button className="dc-study" onClick={() => onStudy(current.path)}>
            <IconFlashcards size={16} /> Study this topic
          </button>
        </div>
      )}

      {level.length === 0 ? (
        <div className="muted" style={{ padding: '18px 4px', fontSize: 13.5 }}>
          {current ? 'Nothing nested here — study the topic above.' : 'No decks yet.'}
        </div>
      ) : (
        <ol className="deck-contents">
          {level.map((n, i) => (
            <DeckEntry
              key={n.path}
              node={n}
              index={i + 1}
              depth={path ? path.split('::').length : 0}
              onOpen={() => (n.children.length ? onPath(n.path) : onStudy(n.path))}
              onStudy={() => onStudy(n.path)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Stable colour per topic name, so a subject looks the same every visit. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function DeckEntry({
  node,
  index,
  depth,
  onOpen,
  onStudy,
}: {
  node: DeckNode;
  index: number;
  depth: number;
  onOpen: () => void;
  onStudy: () => void;
}) {
  const ready = node.due + node.neu;
  const pct = node.total ? Math.round(((node.total - ready) / node.total) * 100) : 0;
  const hue = hueOf(node.path.split('::')[0] + node.name);
  return (
    <li
      className={`deck-entry${ready ? ' has-work' : ''}`}
      style={{ ['--hue' as string]: hue, ['--depth' as string]: depth }}
    >
      <button className="de-open" onClick={onOpen}>
        <span className="de-num">{String(index).padStart(2, '0')}</span>
        <span className="de-body">
          <span className="de-name">{node.name}</span>
          <span className="de-meta">
            {node.children.length > 0 && <span className="de-kids">{node.children.length} sub-topics</span>}
            <span>{node.total} cards</span>
            {node.due > 0 && <span className="de-due">{node.due} due</span>}
            {node.neu > 0 && <span className="de-new">{node.neu} new</span>}
          </span>
          <span className="de-bar" aria-hidden="true">
            <span className="de-bar-fill" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="de-pct">{pct}%</span>
        {node.children.length > 0 && <IconChevron size={15} />}
      </button>
      <button className="de-study" aria-label={`Study ${node.name}`} onClick={onStudy}>
        <IconFlashcards size={15} />
      </button>
    </li>
  );
}
