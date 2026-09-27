import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CPU_CORES, MEMORY_MB, checkAppName, checkMountPath } from '@rig/shared/client';
import { api, ApiError } from '../lib/api.js';
import { keys, useDeployProgress, useServerInfo } from '../lib/queries.js';
import { PageHead } from '../layout/Shell.js';
import {
  Actions,
  Button,
  Card,
  CopyField,
  Field,
  Input,
  Select,
  TextField,
  Timeline,
  Well,
  cx,
} from '../ui/kit.js';
import { ExternalIcon, PlusIcon, TrashIcon } from '../ui/icons.js';
import s from './pages.module.css';

interface EnvRow {
  key: string;
  value: string;
}

export function NewAppPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const server = useServerInfo();

  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [port, setPort] = useState('80');
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [volumePath, setVolumePath] = useState('');
  const [memoryMb, setMemoryMb] = useState(String(MEMORY_MB.default));
  const [cpuCores, setCpuCores] = useState(String(CPU_CORES.default));

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);

  const domain = server.data?.domain ?? '';
  const nameCheck = useMemo(
    () => (name ? checkAppName(name, server.data?.reservedNames ?? []) : { ok: true as const }),
    [name, server.data?.reservedNames],
  );
  const nameProblem = !nameCheck.ok ? nameCheck.reason : null;

  const mountCheck = volumePath.trim() ? checkMountPath(volumePath.trim()) : { ok: true as const };
  const mountProblem = !mountCheck.ok ? mountCheck.reason : null;

  const progress = useDeployProgress(deployingId ?? '', Boolean(deployingId));

  function setEnvRow(index: number, patch: Partial<EnvRow>) {
    setEnv((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    if (nameProblem) {
      setFieldError({ field: 'name', message: nameProblem });
      return;
    }
    if (mountProblem) {
      setFieldError({ field: 'volumePath', message: mountProblem });
      return;
    }

    const envMap: Record<string, string> = {};
    for (const row of env) {
      const key = row.key.trim();
      if (!key) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        setFieldError({ field: 'env', message: `"${key}" is not a valid environment name.` });
        return;
      }
      envMap[key] = row.value;
    }

    setSubmitting(true);
    try {
      const app = await api.createApp({
        name,
        image: image.trim(),
        internalPort: Number(port),
        env: envMap,
        memoryMb: Number(memoryMb),
        cpuCores: Number(cpuCores),
        volumePath: volumePath.trim() || null,
      });
      void client.invalidateQueries({ queryKey: keys.apps });
      setDeployingId(app.id);
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError) {
        if (caught.field) setFieldError({ field: caught.field, message: caught.message });
        else setFormError(caught.message);
      } else {
        setFormError('Could not create the app.');
      }
    }
  }

  /* ----------------------------- deploying view ----------------------------- */

  if (deployingId) {
    const steps = progress.data?.steps ?? [];
    const failed = progress.data?.error ?? null;
    const done = steps.length > 0 && steps.every((step) => step.state === 'done');

    return (
      <>
        <PageHead
          title={name}
          subtitle={failed ? 'The deploy did not finish.' : done ? 'Your app is live.' : 'Deploying.'}
          back={{ to: '/apps', label: 'Apps' }}
        />
        <Card title="Deploy">
          {steps.length === 0 ? (
            <p className={s.envEmpty}>Starting.</p>
          ) : (
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
          )}

          {failed ? <Well className={cx(s.errorWell)}>{failed}</Well> : null}

          {done ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <CopyField value={`https://${name}.${domain}`} label="the app URL" />
              <Actions>
                <Button kind="primary" onClick={() => void navigate(`/apps/${deployingId}`)}>
                  Open the app
                </Button>
                <a href={`https://${name}.${domain}`} target="_blank" rel="noreferrer">
                  <Button>
                    <ExternalIcon />
                    Visit the site
                  </Button>
                </a>
              </Actions>
            </div>
          ) : (
            <Actions>
              <Button onClick={() => void navigate(`/apps/${deployingId}`)}>Open the app</Button>
            </Actions>
          )}
        </Card>
      </>
    );
  }

  /* --------------------------------- form --------------------------------- */

  return (
    <>
      <PageHead title="New app" back={{ to: '/apps', label: 'Apps' }} />
      <Card>
        <form className={s.form} onSubmit={submit}>
          <Field
            label="Name"
            htmlFor="app-name"
            error={fieldError?.field === 'name' ? fieldError.message : nameProblem}
            hint={
              name && domain ? (
                <span className={cx(s.urlPreview, nameProblem && s.urlPreviewBad)}>
                  https://{name}.{domain}
                </span>
              ) : (
                'This becomes the address, so use lowercase letters, numbers and hyphens.'
              )
            }
          >
            <Input
              id="app-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().trim())}
              placeholder="hello"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              mono
              bad={Boolean(nameProblem)}
              required
            />
          </Field>

          <TextField
            label="Docker image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="nginxdemos/hello"
            hint={
              server.data?.platform && server.data.platform !== 'unknown'
                ? `The image needs a ${server.data.platform} build to run on this server.`
                : "The image needs a build for this server's processor."
            }
            error={fieldError?.field === 'image' ? fieldError.message : null}
            mono
            autoCapitalize="none"
            spellCheck={false}
            required
          />

          <TextField
            label="Port inside the container"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            hint="The port the app listens on. Nothing is published on the server itself."
            error={fieldError?.field === 'internalPort' ? fieldError.message : null}
            required
          />

          <Field
            label="Environment"
            error={fieldError?.field === 'env' ? fieldError.message : null}
            hint="Values are encrypted before they are stored."
          >
            <div className={s.envRows}>
              {env.length === 0 ? <span className={s.envEmpty}>Nothing set.</span> : null}
              {env.map((row, index) => (
                <div className={s.envRow} key={index}>
                  <Input
                    value={row.key}
                    onChange={(e) => setEnvRow(index, { key: e.target.value })}
                    placeholder="NAME"
                    aria-label={`Environment name ${index + 1}`}
                    mono
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <Input
                    value={row.value}
                    onChange={(e) => setEnvRow(index, { value: e.target.value })}
                    placeholder="value"
                    aria-label={`Environment value ${index + 1}`}
                    mono
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <Button
                    kind="quiet"
                    iconOnly
                    aria-label={`Remove ${row.key || 'this value'}`}
                    onClick={() => setEnv((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ))}
              <div>
                <Button size="sm" onClick={() => setEnv((rows) => [...rows, { key: '', value: '' }])}>
                  <PlusIcon />
                  Add a value
                </Button>
              </div>
            </div>
          </Field>

          <TextField
            label="Keep data at"
            value={volumePath}
            onChange={(e) => setVolumePath(e.target.value)}
            placeholder="/data"
            hint={
              volumePath.trim()
                ? 'Anything the app writes here survives a redeploy. Everywhere else does not.'
                : 'Leave empty unless the app writes files it needs to keep.'
            }
            error={fieldError?.field === 'volumePath' ? fieldError.message : mountProblem}
            mono
            autoCapitalize="none"
            spellCheck={false}
          />

          <details className={s.disclosure}>
            <summary className={s.disclosureSummary}>Advanced</summary>
            <div className={s.disclosureBody}>
              <div className={s.twoUp}>
                <Field label="Memory" htmlFor="memory" hint={`${MEMORY_MB.min} to ${MEMORY_MB.max} MB`}>
                  <Select id="memory" value={memoryMb} onChange={(e) => setMemoryMb(e.target.value)}>
                    {[64, 128, 256, 512, 768, 1024].map((mb) => (
                      <option key={mb} value={mb}>
                        {mb} MB
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="CPU" htmlFor="cpu" hint="A share of the server's cores.">
                  <Select id="cpu" value={cpuCores} onChange={(e) => setCpuCores(e.target.value)}>
                    {[0.1, 0.25, 0.5, 1, 1.5, 2].map((cores) => (
                      <option key={cores} value={cores}>
                        {cores} core{cores === 1 ? '' : 's'}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </details>

          {formError ? <span className={s.formError}>{formError}</span> : null}

          <div className={s.formFoot}>
            <Button onClick={() => void navigate('/apps')} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              kind="primary"
              busy={submitting}
              disabled={!name || !image || Boolean(nameProblem) || Boolean(mountProblem) || submitting}
            >
              Deploy
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
