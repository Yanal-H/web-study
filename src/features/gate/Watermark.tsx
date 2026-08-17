import { useEffect, useState } from 'react';
import { useAuth } from '../auth/session';

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
 * Watermark seal: a faint signature, the signed-in account, and a stable install
 * id in the corner. Non-interactive.
 *
 * This is the honest half of the "nobody can take it" goal. A signed-in student
 * can always extract what their browser has received — that is true of every web
 * app and cannot be engineered away. What CAN be done is make each copy carry the
 * name of the account it was served to, so a leaked screenshot or PDF points
 * somewhere. A deterrent, and deliberately described as one.
 */
export default function Watermark() {
  const [id, setId] = useState('');
  const auth = useAuth();
  useEffect(() => {
    setId(getInstallId());
  }, []);
  return (
    <div className="watermark" aria-hidden="true">
      <div className="wm-sign">Yanal</div>
      {auth.email && <div className="wm-user">{auth.email}</div>}
      <div className="wm-id">{id}</div>
    </div>
  );
}
