import { useEffect, useState } from 'react';

const INSTALL_ID_KEY = 'foundation_install_id';

/** Stable per-install id, generated once and persisted. Forms the buyer seal. */
function getInstallId(): string {
  try {
    let id = localStorage.getItem(INSTALL_ID_KEY);
    if (!id) {
      id =
        'FDN-' +
        Date.now().toString(36).toUpperCase() +
        '-' +
        Math.random().toString(36).slice(2, 6).toUpperCase();
      localStorage.setItem(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return 'FDN-LOCAL';
  }
}

/**
 * Watermark seal: a faint signature and non-identifying install id. The prior
 * version exposed the student's email in every screen and screenshot; an install
 * marker preserves the lightweight deterrent without leaking personal identity.
 *
 * A signed-in student can always extract what their browser has received. The
 * stable installation marker is therefore only a modest redistribution
 * deterrent, not a promise that web content cannot be copied.
 */
export default function Watermark() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(getInstallId());
  }, []);
  return (
    <div className="watermark" aria-hidden="true">
      <div className="wm-sign">Yanal</div>
      <div className="wm-id">{id}</div>
    </div>
  );
}
