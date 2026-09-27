import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api.js';
import { keys, useMe } from '../lib/queries.js';
import { Button, Card, TextField } from '../ui/kit.js';
import { ServerIcon } from '../ui/icons.js';
import s from './pages.module.css';

export function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me.data) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/apps'} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api.login(email, password);
      client.setQueryData(keys.me, user);
      await client.invalidateQueries();
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from && from !== '/login' ? from : '/apps', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <div className={s.loginPage}>
      <div className={s.loginBox}>
        <div className={s.loginMark}>
          <ServerIcon size={28} />
          <span>Rig</span>
        </div>
        <p className={s.loginLede}>Sign in to manage your apps.</p>

        <Card>
          <form className={s.loginForm} onSubmit={submit}>
            <TextField
              label="Email"
              type="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
            />
            <Button type="submit" kind="primary" full busy={busy} disabled={!email || !password}>
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
