import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import { useHealth, useMe, useServerInfo } from '../lib/queries.js';
import { PageHead } from '../layout/Shell.js';
import { Button, Card, Facts, TextField, cx, useToast } from '../ui/kit.js';
import { CheckIcon, LogoutIcon } from '../ui/icons.js';
import s from './pages.module.css';
import ui from '../ui/ui.module.css';

export function SettingsPage() {
  const me = useMe();
  const server = useServerInfo();
  const health = useHealth();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.say('Password changed. Other devices have been signed out.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut(everywhere: boolean) {
    try {
      await (everywhere ? api.logoutEverywhere() : api.logout());
    } finally {
      client.clear();
      void navigate('/login', { replace: true });
    }
  }

  return (
    <>
      <PageHead title="Settings" />

      <div className={s.settingsGrid}>
        <Card title="Account">
          <Facts
            items={[
              { label: 'Signed in as', value: me.data?.email ?? 'Loading', mono: true },
              { label: 'Role', value: me.data?.role === 'owner' ? 'Owner' : 'Member' },
            ]}
          />
        </Card>

        <Card title="Change password" subtitle="Changing it signs every other device out.">
          <form className={s.form} onSubmit={changePassword}>
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              hint="At least 10 characters."
              error={error}
              required
            />
            <div className={s.formFoot}>
              <Button type="submit" kind="primary" busy={busy} disabled={!current || next.length < 10}>
                Change password
              </Button>
            </div>
          </form>
        </Card>

        <Card title="This server">
          <Facts
            items={[
              { label: 'App domain', value: server.data?.domain ?? 'Loading', mono: true },
              { label: 'Architecture', value: server.data?.platform ?? 'Loading', mono: true },
              { label: 'Rig version', value: health.data?.version ?? 'Loading', mono: true },
              {
                label: 'Reserved names',
                value: server.data?.reservedNames.length ? server.data.reservedNames.join(', ') : 'None',
                mono: true,
              },
            ]}
          />

          <ul className={s.checkList} style={{ marginTop: 14 }}>
            {(health.data?.checks ?? []).map((check) => (
              <li className={s.checkRow} key={check.name}>
                <span
                  className={cx(ui.pillDot)}
                  style={{ ['--c' as string]: check.ok ? 'var(--ok)' : 'var(--stop)', background: check.ok ? 'var(--ok)' : 'var(--stop)' }}
                />
                <span className={s.checkName}>{check.name}</span>
                <code>{check.detail}</code>
              </li>
            ))}
            {health.isError ? (
              <li className={s.checkRow}>
                <span className={ui.pillDot} style={{ background: 'var(--stop)' }} />
                <span className={s.checkName}>server</span>
                <code>The health check could not be reached.</code>
              </li>
            ) : null}
          </ul>
        </Card>

        <Card title="Sessions">
          <div className={ui.actions}>
            <Button onClick={() => void signOut(false)}>
              <LogoutIcon />
              Sign out
            </Button>
            <Button onClick={() => void signOut(true)}>
              <CheckIcon />
              Sign out everywhere
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
