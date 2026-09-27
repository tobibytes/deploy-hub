import type { ReactNode } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useHealth, useMe } from '../lib/queries.js';
import { ActivityIcon, ChevronRightIcon, ServerIcon, SettingsIcon } from '../ui/icons.js';
import { cx } from '../ui/kit.js';
import s from './Shell.module.css';

const NAV = [
  { to: '/apps', label: 'Apps', icon: ServerIcon },
  { to: '/activity', label: 'Activity', icon: ActivityIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Shell() {
  const me = useMe();
  const health = useHealth();

  const healthState = health.isError ? 'bad' : health.data?.ok ? 'ok' : health.data ? 'bad' : 'unknown';
  const healthText =
    healthState === 'ok'
      ? 'All parts reachable'
      : healthState === 'bad'
        ? (health.data?.checks.find((c) => !c.ok)?.name ?? 'server') + ' is unreachable'
        : 'Checking';

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <Link to="/apps" className={s.mark}>
          <ServerIcon size={24} className={s.markGlyph} />
          <span className={s.markName}>Rig</span>
        </Link>

        <nav className={s.nav}>
          {NAV.map(({ to, label, icon: Glyph }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cx(s.navLink, isActive && s.navActive)}>
              <Glyph />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className={s.sideFoot}>
          <span className={s.health} title={health.data?.checks.map((c) => `${c.name}: ${c.detail}`).join('\n')}>
            <span
              className={cx(s.healthDot, healthState === 'ok' && s.healthOk, healthState === 'bad' && s.healthBad)}
            />
            {healthText}
          </span>
          {me.data ? <span className={s.who}>{me.data.email}</span> : null}
        </div>
      </aside>

      <main className={s.main}>
        <div className={s.topbar}>
          <Link to="/apps" className={s.mark}>
            <ServerIcon size={24} className={s.markGlyph} />
            <span className={s.markName}>Rig</span>
          </Link>
          <span className={s.health}>
            <span
              className={cx(s.healthDot, healthState === 'ok' && s.healthOk, healthState === 'bad' && s.healthBad)}
            />
          </span>
        </div>
        <div className={s.inner}>
          <Outlet />
        </div>
      </main>

      <nav className={s.tabbar}>
        {NAV.map(({ to, label, icon: Glyph }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx(s.tabbarLink, isActive && s.tabbarActive)}>
            <Glyph size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  action,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className={s.pageHead}>
      <div>
        {back ? (
          <Link to={back.to} className={s.back}>
            <ChevronRightIcon size={15} />
            {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
