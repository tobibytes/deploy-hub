import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppDetail } from '@rig/shared/client';
import { CPU_CORES, MEMORY_MB } from '@rig/shared/client';
import { ApiError, streamLogs } from '../lib/api.js';
import { useApp, useAppAction, useDeployProgress, useStats } from '../lib/queries.js';
import { PageHead } from '../layout/Shell.js';
import {
  Actions,
  Button,
  Card,
  ConfirmDialog,
  CopyField,
  Facts,
  Field,
  Input,
  Select,
  Sparkline,
  StatusPill,
  TabPanel,
  Tabs,
  Timeline,
  Well,
  cx,
  useToast,
} from '../ui/kit.js';
import {
  DownIcon,
  ExternalIcon,
  EyeIcon,
  EyeOffIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RedeployIcon,
  RestartIcon,
  StopIcon,
  TrashIcon,
} from '../ui/icons.js';
import { actionWords, bytes, cpuLabel, when, withTime } from '../lib/format.js';
import s from './pages.module.css';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'logs', label: 'Logs' },
  { value: 'environment', label: 'Environment' },
  { value: 'activity', label: 'Activity' },
  { value: 'settings', label: 'Settings' },
];

export function AppDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useApp(id);
  const actions = useAppAction(id);
  const [tab, setTab] = useState('overview');

  const app = query.data;

  if (query.isError) {
    const message = query.error instanceof ApiError ? query.error.message : 'Could not load this app.';
    return (
      <>
        <PageHead title="App" back={{ to: '/apps', label: 'Apps' }} />
        <Well className={s.errorWell}>{message}</Well>
      </>
    );
  }

  if (!app) {
    return <PageHead title="Loading" back={{ to: '/apps', label: 'Apps' }} />;
  }

  const busy =
    actions.start.isPending ||
    actions.stop.isPending ||
    actions.restart.isPending ||
    actions.redeploy.isPending ||
    app.status === 'deploying';

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.say(`${label} ${app!.name}`);
    } catch (error) {
      toast.complain(error instanceof ApiError ? error.message : `Could not ${label.toLowerCase()} ${app!.name}.`);
    }
  }

  return (
    <>
      <div className={s.detailHead}>
        <PageHead
          title={
            <span className={s.detailTitleRow}>
              {app.name} <StatusPill status={app.status} />
            </span>
          }
          back={{ to: '/apps', label: 'Apps' }}
        />

        <div className={s.detailUrl}>
          <CopyField value={app.url} label="the app URL" />
          <a href={app.url} target="_blank" rel="noreferrer">
            <Button>
              <ExternalIcon />
              Visit
            </Button>
          </a>
        </div>

        <Actions>
          {app.status === 'running' ? (
            <Button disabled={busy} onClick={() => void run('Stopped', () => actions.stop.mutateAsync())}>
              <StopIcon />
              Stop
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void run('Started', () => actions.start.mutateAsync())}>
              <PlayIcon />
              Start
            </Button>
          )}
          <Button
            disabled={busy || app.status !== 'running'}
            onClick={() => void run('Restarted', () => actions.restart.mutateAsync())}
          >
            <RestartIcon />
            Restart
          </Button>
          <Button disabled={busy} onClick={() => void run('Redeploying', () => actions.redeploy.mutateAsync())}>
            <RedeployIcon />
            Redeploy
          </Button>
        </Actions>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab}>
        <TabPanel value="overview">
          <Overview app={app} />
        </TabPanel>
        <TabPanel value="logs">{tab === 'logs' ? <Logs app={app} /> : null}</TabPanel>
        <TabPanel value="environment">
          <Environment app={app} />
        </TabPanel>
        <TabPanel value="activity">
          <ActivityTab app={app} />
        </TabPanel>
        <TabPanel value="settings">
          <SettingsTab app={app} onDeleted={() => void navigate('/apps', { replace: true })} />
        </TabPanel>
      </Tabs>
    </>
  );
}

/* ---------------------------------------------------------------- Overview */

function Overview({ app }: { app: AppDetail }) {
  const stats = useStats(app.id, app.status === 'running');
  const progress = useDeployProgress(app.id, app.status === 'deploying');

  // A short rolling window, kept in the component so it resets when you leave.
  const [cpuSeries, setCpuSeries] = useState<number[]>([]);
  const [memSeries, setMemSeries] = useState<number[]>([]);

  useEffect(() => {
    if (!stats.data) return;
    setCpuSeries((prev) => [...prev, stats.data.cpuPercent].slice(-40));
    setMemSeries((prev) => [...prev, stats.data.memoryBytes].slice(-40));
  }, [stats.data]);

  const steps = progress.data?.steps ?? [];

  return (
    <div className={s.overview}>
      {app.status === 'deploying' && steps.length > 0 ? (
        <Card title="Deploying">
          <Timeline
            entries={steps.map((step) => ({
              key: step.step,
              title: step.label,
              detail: step.detail ?? undefined,
              state: step.state,
              color:
                step.state === 'failed'
                  ? 'var(--stop)'
                  : step.state === 'done'
                    ? 'var(--ok)'
                    : step.state === 'active'
                      ? 'var(--warn)'
                      : 'var(--line)',
            }))}
          />
        </Card>
      ) : null}

      {app.lastError ? (
        <Well className={s.errorWell}>{app.lastError}</Well>
      ) : null}

      <Facts
        items={[
          { label: 'Image', value: app.image, mono: true },
          { label: 'Port inside the container', value: app.internalPort },
          { label: 'Address', value: app.hostname, mono: true },
          { label: 'Memory limit', value: `${app.memoryMb} MB` },
          { label: 'CPU limit', value: cpuLabel(app.cpuCores) },
          { label: 'Created', value: when(app.createdAt) },
        ]}
      />

      {app.status === 'running' && stats.data ? (
        <div className={s.sparks}>
          <Sparkline
            label="CPU"
            value={stats.data.cpuPercent.toFixed(1)}
            unit="%"
            points={cpuSeries}
            max={Math.max(app.cpuCores * 100, 10)}
          />
          <Sparkline
            label="Memory"
            value={bytes(stats.data.memoryBytes)}
            points={memSeries}
            max={app.memoryMb * 1024 * 1024}
          />
        </div>
      ) : app.status === 'running' ? (
        <p className={s.envEmpty}>
          {stats.isError
            ? stats.error instanceof ApiError
              ? stats.error.message
              : 'CPU and memory are not available right now.'
            : 'Waiting for the first CPU and memory reading.'}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Logs */

function Logs({ app }: { app: AppDetail }) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [atBottom, setAtBottom] = useState(true);

  const viewRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    setLines([]);
    setError(null);
    const stop = streamLogs(
      app.id,
      (line) => {
        if (pausedRef.current) return;
        // Keep a bounded buffer so a chatty app cannot grow the page forever.
        setLines((prev) => (prev.length > 2000 ? [...prev.slice(-1800), line] : [...prev, line]));
      },
      setError,
    );
    return stop;
  }, [app.id]);

  const shown = useMemo(() => {
    if (!filter.trim()) return lines;
    const needle = filter.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [lines, filter]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !atBottom) return;
    view.scrollTop = view.scrollHeight;
  }, [shown, atBottom]);

  function onScroll() {
    const view = viewRef.current;
    if (!view) return;
    setAtBottom(view.scrollHeight - view.scrollTop - view.clientHeight < 40);
  }

  function jumpToLatest() {
    const view = viewRef.current;
    if (!view) return;
    view.scrollTop = view.scrollHeight;
    setAtBottom(true);
  }

  return (
    <Card
      title="Logs"
      subtitle={`The last ${Math.min(lines.length, 200)} lines, then whatever comes next.`}
      action={
        <div className={s.logsBar}>
          <Button size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      }
    >
      <div className={s.logsBar} style={{ marginBottom: 10 }}>
        <Input
          className={s.logsFilter}
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          mono
          aria-label="Filter the log lines"
        />
        <Button size="sm" onClick={() => setLines([])}>
          Clear
        </Button>
      </div>

      {error ? <Well className={cx(s.errorWell)}>{error}</Well> : null}

      <Well mono className={s.logView} ref={viewRef} onScroll={onScroll}>
        {shown.length === 0 ? (
          <span className={s.logEmpty}>
            {lines.length === 0 ? 'Waiting for output.' : 'No lines match that filter.'}
          </span>
        ) : (
          shown.map((line, index) => (
            <span className={s.logLine} key={index}>
              {line || ' '}
            </span>
          ))
        )}
        {!atBottom ? (
          <div className={s.jumpChip}>
            <Button size="sm" onClick={jumpToLatest}>
              <DownIcon />
              Jump to latest
            </Button>
          </div>
        ) : null}
      </Well>
    </Card>
  );
}

/* ------------------------------------------------------------- Environment */

function Environment({ app }: { app: AppDetail }) {
  const actions = useAppAction(app.id);
  const toast = useToast();
  const [rows, setRows] = useState(() => Object.entries(app.env).map(([key, value]) => ({ key, value })));
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const original = useMemo(() => JSON.stringify(Object.entries(app.env).sort()), [app.env]);
  const current = JSON.stringify(
    rows
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), row.value])
      .sort(),
  );
  const changed = original !== current;

  async function save() {
    setError(null);
    const env: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        setError(`"${key}" is not a valid environment name. Use letters, numbers and underscores.`);
        return;
      }
      env[key] = row.value;
    }
    try {
      await actions.update.mutateAsync({ env });
      toast.say(`Saved and redeploying ${app.name}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the environment.');
    }
  }

  return (
    <Card
      title="Environment"
      subtitle="Saving redeploys the app, which restarts it. Values are encrypted before they are stored."
    >
      <div className={s.envRows}>
        {rows.length === 0 ? <span className={s.envEmpty}>Nothing set.</span> : null}
        {rows.map((row, index) => (
          <div className={s.envRow} key={index}>
            <Input
              value={row.key}
              onChange={(e) => setRows((r) => r.map((x, i) => (i === index ? { ...x, key: e.target.value } : x)))}
              placeholder="NAME"
              aria-label={`Environment name ${index + 1}`}
              mono
              autoCapitalize="none"
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
              <Input
                type={revealed[index] ? 'text' : 'password'}
                value={row.value}
                onChange={(e) => setRows((r) => r.map((x, i) => (i === index ? { ...x, value: e.target.value } : x)))}
                placeholder="value"
                aria-label={`Environment value for ${row.key || `row ${index + 1}`}`}
                mono
                autoCapitalize="none"
                spellCheck={false}
              />
              <Button
                kind="quiet"
                iconOnly
                aria-label={revealed[index] ? 'Hide this value' : 'Show this value'}
                onClick={() => setRevealed((r) => ({ ...r, [index]: !r[index] }))}
              >
                {revealed[index] ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            <Button
              kind="quiet"
              iconOnly
              aria-label={`Remove ${row.key || 'this value'}`}
              onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>

      {error ? <span className={s.formError}>{error}</span> : null}

      <div className={s.formFoot} style={{ marginTop: 14 }}>
        <Button size="sm" onClick={() => setRows((r) => [...r, { key: '', value: '' }])}>
          <PlusIcon />
          Add a value
        </Button>
        <Button
          kind="primary"
          disabled={!changed || actions.update.isPending}
          busy={actions.update.isPending}
          onClick={() => void save()}
        >
          Save and redeploy
        </Button>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Activity */

function ActivityTab({ app }: { app: AppDetail }) {
  if (app.events.length === 0) {
    return (
      <Card title="Activity">
        <p className={s.envEmpty}>Nothing has happened yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Activity">
      <Timeline
        entries={app.events.map((event) => ({
          key: event.id,
          title: actionWords(event.action),
          detail: withTime(event.message, event.createdAt),
          color: event.status === 'error' ? 'var(--stop)' : 'var(--accent)',
          state: 'done',
        }))}
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- Settings */

function SettingsTab({ app, onDeleted }: { app: AppDetail; onDeleted: () => void }) {
  const actions = useAppAction(app.id);
  const toast = useToast();

  const [image, setImage] = useState(app.image);
  const [port, setPort] = useState(String(app.internalPort));
  const [memoryMb, setMemoryMb] = useState(String(app.memoryMb));
  const [cpuCores, setCpuCores] = useState(String(app.cpuCores));
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const changed =
    image !== app.image ||
    Number(port) !== app.internalPort ||
    Number(memoryMb) !== app.memoryMb ||
    Number(cpuCores) !== app.cpuCores;

  async function save() {
    setError(null);
    try {
      await actions.update.mutateAsync({
        image: image.trim(),
        internalPort: Number(port),
        memoryMb: Number(memoryMb),
        cpuCores: Number(cpuCores),
      });
      toast.say(`Saved and redeploying ${app.name}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the changes.');
    }
  }

  async function remove() {
    try {
      await actions.remove.mutateAsync();
      toast.say(`Deleted ${app.name}. ${app.hostname} no longer resolves.`);
      onDeleted();
    } catch (caught) {
      toast.complain(caught instanceof ApiError ? caught.message : `Could not delete ${app.name}.`);
      setConfirming(false);
    }
  }

  return (
    <>
      <Card title="Settings" subtitle="Saving redeploys the app.">
        <div className={s.form}>
          <Field label="Docker image" htmlFor="set-image">
            <Input id="set-image" value={image} onChange={(e) => setImage(e.target.value)} mono spellCheck={false} />
          </Field>
          <div className={s.twoUp}>
            <Field label="Port inside the container" htmlFor="set-port">
              <Input
                id="set-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </Field>
            <Field label="Memory" htmlFor="set-memory" hint={`${MEMORY_MB.min} to ${MEMORY_MB.max} MB`}>
              <Select id="set-memory" value={memoryMb} onChange={(e) => setMemoryMb(e.target.value)}>
                {[64, 128, 256, 512, 768, 1024].map((mb) => (
                  <option key={mb} value={mb}>
                    {mb} MB
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="CPU" htmlFor="set-cpu" hint={`${CPU_CORES.min} to ${CPU_CORES.max} cores`}>
            <Select id="set-cpu" value={cpuCores} onChange={(e) => setCpuCores(e.target.value)}>
              {[0.1, 0.25, 0.5, 1, 1.5, 2].map((cores) => (
                <option key={cores} value={cores}>
                  {cores} core{cores === 1 ? '' : 's'}
                </option>
              ))}
            </Select>
          </Field>

          {error ? <span className={s.formError}>{error}</span> : null}

          <div className={s.formFoot}>
            <Button
              kind="primary"
              disabled={!changed || actions.update.isPending}
              busy={actions.update.isPending}
              onClick={() => void save()}
            >
              Save and redeploy
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Danger zone" className={s.danger}>
        <p className={s.dangerText}>
          Deleting removes the container and the record of the app. {app.hostname} stops working straight away. This
          cannot be undone.
        </p>
        <Button kind="danger" onClick={() => setConfirming(true)}>
          <TrashIcon />
          Delete {app.name}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) setTyped('');
        }}
        title={`Delete ${app.name}`}
        confirmLabel="Delete for good"
        danger
        busy={actions.remove.isPending}
        confirmDisabled={typed !== app.name}
        onConfirm={() => void remove()}
      >
        <p style={{ marginBottom: 12 }}>
          Type <strong>{app.name}</strong> to confirm. The container and {app.hostname} both go away.
        </p>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={app.name}
          aria-label="Type the app name to confirm"
          mono
          autoCapitalize="none"
          spellCheck={false}
        />
      </ConfirmDialog>
    </>
  );
}
