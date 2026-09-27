import { Link, useNavigate } from 'react-router-dom';
import type { App } from '@rig/shared/client';
import { useApps, useListAction } from '../lib/queries.js';
import { PageHead } from '../layout/Shell.js';
import {
  Button,
  Card,
  EmptyState,
  List,
  StatTiles,
  StatusPill,
  Well,
  rowClasses,
  useToast,
} from '../ui/kit.js';
import { ChevronRightIcon, PlayIcon, PlusIcon, ServerIcon, StopIcon } from '../ui/icons.js';
import { ApiError } from '../lib/api.js';
import s from './pages.module.css';

const STATUS_COLOR: Record<App['status'], string> = {
  running: 'var(--ok)',
  deploying: 'var(--warn)',
  failed: 'var(--stop)',
  stopped: 'var(--idle)',
};

export function AppsPage() {
  const apps = useApps();
  const navigate = useNavigate();
  const toast = useToast();
  const actions = useListAction();

  const list = apps.data ?? [];
  const counts = {
    running: list.filter((a) => a.status === 'running').length,
    stopped: list.filter((a) => a.status === 'stopped').length,
    failed: list.filter((a) => a.status === 'failed').length,
  };

  async function toggle(app: App) {
    try {
      if (app.status === 'running') {
        await actions.stop.mutateAsync(app.id);
        toast.say(`Stopped ${app.name}`);
      } else {
        await actions.start.mutateAsync(app.id);
        toast.say(`Starting ${app.name}`);
      }
    } catch (error) {
      toast.complain(error instanceof ApiError ? error.message : `Could not change ${app.name}.`);
    }
  }

  return (
    <>
      <PageHead
        title="Apps"
        subtitle={list.length > 0 ? `${list.length} app${list.length === 1 ? '' : 's'} on this server` : undefined}
        action={
          <Button kind="primary" onClick={() => void navigate('/apps/new')}>
            <PlusIcon />
            New app
          </Button>
        }
      />

      {apps.isError ? (
        <Well className={s.errorWell}>
          {apps.error instanceof ApiError ? apps.error.message : 'Could not load your apps.'}
        </Well>
      ) : null}

      {list.length > 0 ? (
        <div className={s.appsHead}>
          <StatTiles
            tiles={[
              { label: 'Running', value: counts.running },
              { label: 'Stopped', value: counts.stopped },
              { label: 'Failed', value: counts.failed, loud: true },
            ]}
          />

          <Card flush>
            <List>
              {list.map((app) => (
                <li key={app.id}>
                  <Link className={rowClasses.row} to={`/apps/${app.id}`}>
                    <span className={rowClasses.ico} style={{ ['--c' as string]: STATUS_COLOR[app.status] }}>
                      <ServerIcon />
                    </span>
                    <span className={rowClasses.text}>
                      <strong>{app.name}</strong>
                      <small>{app.hostname}</small>
                    </span>
                    <span className={rowClasses.trail}>
                      <StatusPill status={app.status} small />
                      <Button
                        kind="quiet"
                        iconOnly
                        aria-label={app.status === 'running' ? `Stop ${app.name}` : `Start ${app.name}`}
                        title={app.status === 'running' ? 'Stop' : 'Start'}
                        disabled={app.status === 'deploying'}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void toggle(app);
                        }}
                      >
                        {app.status === 'running' ? <StopIcon /> : <PlayIcon />}
                      </Button>
                      <ChevronRightIcon className={rowClasses.go} />
                    </span>
                  </Link>
                </li>
              ))}
            </List>
          </Card>
        </div>
      ) : apps.isPending ? null : (
        <Card>
          <EmptyState
            title="No apps yet"
            text="Give Rig a Docker image and a port, and it will run it here on a public HTTPS address."
            action={
              <Button kind="primary" onClick={() => void navigate('/apps/new')}>
                <PlusIcon />
                New app
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
