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
 * Per-buyer watermark seal: a faint signature and a stable install id in the
 * corner. Non-interactive; a light deterrent against silent redistribution.
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
