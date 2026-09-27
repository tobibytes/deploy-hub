import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe } from '../lib/queries.js';
import s from './pages.module.css';

/**
 * Everything behind this waits for the session check, so a signed out visitor
 * never sees the dashboard frame flash before being sent to the login page.
 */
export function RequireSession() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <div className={s.booting}>
        <span className={s.bootingDot} />
        <span>Opening Rig</span>
      </div>
    );
  }

  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
