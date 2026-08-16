import { Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES, prefetchRoutes } from './routes';
import Watermark from '../features/gate/Watermark';
import { ToastProvider } from '../design/Toast';
import { CommandPalette } from '../design/CommandPalette';
import type { Command } from '../design/CommandPalette';
import { Dialog } from '../design/Dialog';
import { NAV_ICONS, IconMenu, IconSun, IconMoon, IconCommand } from '../design/icons';
import { useStore } from '../state/useStore';
import { toggleTheme, isDark, applyTheme } from '../state/theme';
import { applyHaki } from '../state/haki';
import HakiField from '../features/effects/HakiField';
import FocusTimer from '../features/timer/FocusTimer';
import MusicPlayer from '../features/music/MusicPlayer';
import { ensureContentLoaded } from '../data/bootstrap';

function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <div className="mark" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 24 24"
        width={size * 0.55}
        height={size * 0.55}
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
      </svg>
    </div>
  );
}

const PRIMARY = ['', 'study', 'subjects', 'flashcards', 'qbank'];
const TOOLS = ['planner', 'notes', 'calculators', 'mnemonics', 'resources'];

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const state = useStore();

  useEffect(() => {
    applyTheme();
  }, [state.theme]);

  useEffect(() => {
    applyHaki();
  }, [state.settings?.appearance?.haki]);

  useEffect(() => {
    const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
    const run = () => prefetchRoutes();
    if (win.requestIdleCallback) win.requestIdleCallback(run);
    else setTimeout(run, 1200);
  }, []);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if (!typing && e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Load the shipped packs into the card engine once, in the background.
  useEffect(() => {
    void ensureContentLoaded().catch((e) => console.error('content bootstrap failed', e));
  }, []);

  const commands = useMemo<Command[]>(() => {
    const dark = state.theme !== 'paper';
    const navCmds: Command[] = ROUTES.filter((r) => !r.hidden).map((r) => {
      const Icon = NAV_ICONS[r.path];
      return {
        id: 'nav-' + (r.path || 'dashboard'),
        label: 'Go to ' + r.label,
        hint: 'Page',
        icon: Icon ? <Icon size={16} /> : undefined,
        run: () => navigate('/' + r.path),
      };
    });
    return [
      ...navCmds,
      {
        id: 'toggle-theme',
        label: dark ? 'Switch to light theme' : 'Switch to dark theme',
        hint: 'Theme',
        icon: dark ? <IconSun size={16} /> : <IconMoon size={16} />,
        run: () => toggleTheme(),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        hint: '?',
        icon: <IconCommand size={16} />,
        run: () => setHelpOpen(true),
      },
    ];
  }, [navigate, state.theme]);

  // Global ⌘K content search — lazy-loaded so the content index stays out of the
  // initial bundle. Built when the palette opens.
  const [searchFn, setSearchFn] = useState<((q: string) => Command[]) | undefined>();
  useEffect(() => {
    if (!cmdOpen) return;
    let alive = true;
    void import('../lib/search').then((m) => {
      if (!alive) return;
      const docs = m.buildSearchDocs(state);
      setSearchFn(() => (query: string) =>
        m.searchDocs(docs, query, 18).map((d) => ({
          id: d.id,
          label: d.title.length > 80 ? d.title.slice(0, 80) + '…' : d.title,
          hint: m.KIND_LABEL[d.kind],
          run: () => navigate(d.route.replace(/#.*$/, '')),
        }))
      );
    });
    return () => {
      alive = false;
    };
  }, [cmdOpen, navigate, state]);

  const NavList = () => (
    <>
      <div className="nav-group-label">Learn</div>
      {ROUTES.filter((r) => PRIMARY.includes(r.path)).map((r) => (
        <NavItem key={r.path} path={r.path} label={r.label} onGo={() => setNavOpen(false)} />
      ))}
      <div className="nav-group-label">Tools</div>
      {ROUTES.filter((r) => TOOLS.includes(r.path)).map((r) => (
        <NavItem key={r.path} path={r.path} label={r.label} onGo={() => setNavOpen(false)} />
      ))}
      <div className="nav-group-label">System</div>
      {ROUTES.filter((r) => r.path === 'settings').map((r) => (
        <NavItem key={r.path} path={r.path} label={r.label} onGo={() => setNavOpen(false)} />
      ))}
    </>
  );

  return (
    <>
      <HakiField />
      <div className="topbar">
        <div className="brand">
          <BrandMark size={32} />
          <div className="name">Yanal</div>
        </div>
        <button className="menu-btn" type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation">
          <IconMenu size={18} /> Haki
        </button>
      </div>

      <div className="app">
        <div
          className={'scrim' + (navOpen ? ' show' : '')}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
        <aside className={'sidebar' + (navOpen ? ' open' : '')} id="sidebar">
          <span className="sidebar-edge" aria-hidden="true" />
          <div className="brand">
            <BrandMark />
            <div>
              <div className="name">Yanal</div>
              <div className="tag">Med School Toolkit</div>
            </div>
          </div>

          <nav aria-label="Primary">
            <NavList />
          </nav>

          <button
            className="btn btn--ghost btn--sm"
            style={{ margin: 'var(--sp-3) var(--sp-2) 0', justifyContent: 'flex-start', gap: 10 }}
            onClick={() => setCmdOpen(true)}
          >
            <IconCommand size={16} /> Command
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>⌘K</span>
          </button>
          <button
            className="btn btn--ghost btn--sm"
            style={{ margin: '2px var(--sp-2) 0', justifyContent: 'flex-start', gap: 10 }}
            onClick={() => toggleTheme()}
            aria-label="Toggle theme"
          >
            {isDark() ? <IconSun size={16} /> : <IconMoon size={16} />}
            {isDark() ? 'Light theme' : 'Dark theme'}
          </button>

          <div className="sidebar-foot">
            <span className="sig">Yanal</span>
            by Yanal · Cairo 2026
          </div>
        </aside>

        <main className="main">
          <div className="route-view" key={location.pathname}>
            <Suspense fallback={<div className="route-fallback">Loading…</div>}>
              <Routes>
                {ROUTES.map((r) => (
                  <Route key={r.path} path={r.path} element={<r.Component />} />
                ))}
                <Route path="*" element={<FallbackRoute />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>

      <div className="dock no-print">
        <FocusTimer />
        <MusicPlayer />
      </div>

      <Watermark />

      {cmdOpen && <CommandPalette commands={commands} search={searchFn} onClose={() => setCmdOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}

function NavItem({ path, label, onGo }: { path: string; label: string; onGo: () => void }) {
  const Icon = NAV_ICONS[path];
  return (
    <NavLink
      to={'/' + path}
      end={path === ''}
      className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')}
      onClick={onGo}
    >
      {Icon && <Icon className="nav-ico" size={18} />}
      {label}
    </NavLink>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['⌘K / Ctrl+K', 'Open the command palette'],
    ['?', 'Show this help'],
    ['↑ ↓', 'Move within the palette'],
    ['↵', 'Run the selected command'],
    ['esc', 'Close any overlay'],
  ];
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(([k, d]) => (
          <div key={k} className="row spread">
            <span className="muted" style={{ fontSize: 14 }}>
              {d}
            </span>
            <kbd>{k}</kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function FallbackRoute() {
  return (
    <>
      <header className="page-head">
        <h1>Not found</h1>
        <div className="sub">That page doesn&rsquo;t exist yet.</div>
      </header>
      <div className="card">
        <NavLink to="/">Back to the dashboard</NavLink>
      </div>
    </>
  );
}
