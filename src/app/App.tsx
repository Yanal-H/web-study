import { Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ROUTES, prefetchRoutes } from './routes';
import Watermark from '../features/gate/Watermark';

function BrandMark() {
  return (
    <div className="mark">
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
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

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // After first paint, warm every route chunk so the service worker caches the
  // whole app and offline navigation works to any view after a single visit.
  useEffect(() => {
    const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
    const run = () => prefetchRoutes();
    if (win.requestIdleCallback) win.requestIdleCallback(run);
    else setTimeout(run, 1200);
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="name" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Yanal
          </div>
        </div>
        <button className="menu-btn" type="button" onClick={() => setNavOpen(true)}>
          Menu
        </button>
      </div>

      <div className="app">
        <div
          className={'scrim' + (navOpen ? ' show' : '')}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
        <aside className={'sidebar' + (navOpen ? ' open' : '')} id="sidebar">
          <div className="brand">
            <BrandMark />
            <div>
              <div className="name">Yanal</div>
              <div className="tag">Med School Toolkit</div>
            </div>
          </div>

          <nav>
            {ROUTES.map((r) => (
              <NavLink
                key={r.path}
                to={'/' + r.path}
                end={r.path === ''}
                className={({ isActive }) => 'navitem' + (isActive ? ' active' : '')}
                onClick={() => setNavOpen(false)}
              >
                <span className="dot" />
                {r.label}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-foot">by Yanal · Cairo 2026</div>
        </aside>

        <main className="main">
          <Suspense
            fallback={<div className="route-fallback">Loading…</div>}
            key={location.pathname}
          >
            <Routes>
              {ROUTES.map((r) => (
                <Route key={r.path} path={r.path} element={<r.Component />} />
              ))}
              <Route path="*" element={<FallbackRoute />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <Watermark />
    </>
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
