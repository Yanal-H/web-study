import { useEffect, useState } from 'react';
import type { DeckNode } from './deck';
import { IconChevron, IconFlashcards } from '../../design/icons';

function defaultOpen(nodes: DeckNode[]): Set<string> {
  const open = new Set<string>();
  for (const node of nodes) {
    open.add(node.path);
    for (const child of node.children) open.add(child.path);
  }
  return open;
}

/**
 * Deck browser: decks, sub-decks and sub-sub-decks with rolled-up counts.
 * Clicking a row selects it; the study button studies that deck and everything
 * beneath it.
 */
export default function DeckTree({
  nodes,
  selected,
  onSelect,
  onStudy,
}: {
  nodes: DeckNode[];
  selected: string;
  onSelect: (path: string) => void;
  onStudy: (path: string) => void;
}) {
  // top two levels open by default — deep enough to orient, shallow enough to scan
  const [open, setOpen] = useState<Set<string>>(() => defaultOpen(nodes));

  // Async catalog arrival must open its top levels too; useState's initializer
  // runs only on the first empty render.
  useEffect(() => {
    setOpen((current) => new Set([...current, ...defaultOpen(nodes)]));
  }, [nodes]);

  function toggle(path: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (nodes.length === 0) {
    return <div className="muted" style={{ padding: 12, fontSize: 13.5 }}>No decks yet.</div>;
  }

  return (
    <div className="deck-tree" role="tree">
      <div className="deck-head">
        <span>Deck</span>
        <span className="dt-n" title="Due">Due</span>
        <span className="dt-n" title="New">New</span>
        <span className="dt-n" title="Total">All</span>
        <span />
      </div>
      {nodes.map((n) => (
        <DeckRow
          key={n.path}
          node={n}
          depth={0}
          open={open}
          toggle={toggle}
          selected={selected}
          onSelect={onSelect}
          onStudy={onStudy}
        />
      ))}
    </div>
  );
}

function DeckRow({
  node,
  depth,
  open,
  toggle,
  selected,
  onSelect,
  onStudy,
}: {
  node: DeckNode;
  depth: number;
  open: Set<string>;
  toggle: (p: string) => void;
  selected: string;
  onSelect: (p: string) => void;
  onStudy: (p: string) => void;
}) {
  const hasKids = node.children.length > 0;
  const isOpen = open.has(node.path);
  const ready = node.due + node.neu;
  return (
    <>
      <div
        className={`deck-row${selected === node.path ? ' selected' : ''}${ready ? ' has-work' : ''}`}
        style={{ ['--depth' as string]: depth }}
        role="treeitem"
        aria-expanded={hasKids ? isOpen : undefined}
        aria-selected={selected === node.path}
        tabIndex={0}
        onClick={() => onSelect(node.path)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onStudy(node.path);
          if (e.key === 'ArrowRight' && hasKids && !isOpen) toggle(node.path);
          if (e.key === 'ArrowLeft' && hasKids && isOpen) toggle(node.path);
        }}
      >
        <span className="dt-name">
          {hasKids ? (
            <button
              className={`dt-twisty${isOpen ? ' open' : ''}`}
              aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.path);
              }}
            >
              <IconChevron size={13} />
            </button>
          ) : (
            <span className="dt-leaf" aria-hidden="true" />
          )}
          <span className="dt-label">{node.name}</span>
        </span>
        <span className="dt-n dt-due">{node.due || ''}</span>
        <span className="dt-n dt-new">{node.neu || ''}</span>
        <span className="dt-n dt-total">{node.total}</span>
        <button
          className="dt-study"
          aria-label={`Study ${node.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onStudy(node.path);
          }}
        >
          <IconFlashcards size={14} />
        </button>
      </div>
      {hasKids && isOpen &&
        node.children.map((c) => (
          <DeckRow
            key={c.path}
            node={c}
            depth={depth + 1}
            open={open}
            toggle={toggle}
            selected={selected}
            onSelect={onSelect}
            onStudy={onStudy}
          />
        ))}
    </>
  );
}
