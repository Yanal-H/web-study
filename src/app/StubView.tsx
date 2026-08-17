import type { ReactNode } from 'react';

interface StubViewProps {
  title: string;
  sub: string;
  storageNote?: string;
  children?: ReactNode;
}

/**
 * Phase 0 placeholder view. Renders and navigates, reads no state semantics beyond
 * what it declares. Real feature work lands in later phases — this only proves the
 * router, shell, and code-splitting are wired.
 */
export default function StubView({ title, sub, storageNote, children }: StubViewProps) {
  return (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </header>
      <div className="card">
        {children ?? (
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            This view is scaffolded for Phase 0. Its full experience arrives in a later phase.
          </p>
        )}
        {storageNote && (
          <div className="stub-note">
            Persisted data for this area already lives under <code>{storageNote}</code> and is loaded
            losslessly by the ported state layer.
          </div>
        )}
      </div>
    </>
  );
}
