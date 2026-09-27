import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixTabs from '@radix-ui/react-tabs';
import type { AppStatus } from '@rig/shared/client';
import s from './ui.module.css';
import { CheckIcon, ChevronRightIcon, CopyIcon } from './icons.js';

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Button */

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
  size?: 'sm' | 'md';
  busy?: boolean;
  full?: boolean;
  iconOnly?: boolean;
}

/** Three kinds only, plus a quiet variant for icon buttons inside rows. */
export function Button({
  kind = 'secondary',
  size = 'md',
  busy = false,
  full = false,
  iconOnly = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        s.btn,
        kind === 'primary' && s.btnPrimary,
        kind === 'danger' && s.btnDanger,
        kind === 'quiet' && s.btnQuiet,
        size === 'sm' && s.btnSm,
        iconOnly && s.btnIcon,
        full && s.btnFull,
        className,
      )}
      disabled={disabled ?? busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className={s.spinner} /> : null}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cx(s.card, flush && s.cardPad0, className)}>
      {title ? (
        <header className={s.cardHead}>
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------- Facts */

export function Facts({ items }: { items: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className={s.facts}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={cx(item.mono && s.factMono, 'tnum')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------- StatusPill */

const STATUS_STYLE: Record<AppStatus, { color: string; label: string }> = {
  running: { color: 'var(--ok)', label: 'Running' },
  deploying: { color: 'var(--warn)', label: 'Deploying' },
  failed: { color: 'var(--stop)', label: 'Failed' },
  stopped: { color: 'var(--idle)', label: 'Stopped' },
};

export function StatusPill({ status, small = false }: { status: AppStatus; small?: boolean }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cx(s.pill, small && s.pillSm, status === 'deploying' && s.pillPulse)}
      style={{ ['--c' as string]: style.color }}
    >
      <span className={s.pillDot} />
      {style.label}
    </span>
  );
}

export function Pill({ children, color = 'var(--muted)' }: { children: ReactNode; color?: string }) {
  return (
    <span className={cx(s.pill, s.pillSm)} style={{ ['--c' as string]: color }}>
      <span className={s.pillDot} />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- ListRow */

export function List({ children, stagger = true }: { children: ReactNode; stagger?: boolean }) {
  return <ul className={cx(s.list, stagger && 'stagger')}>{children}</ul>;
}

export function ListRow({
  icon,
  iconColor = 'var(--accent)',
  title,
  detail,
  trailing,
  href,
  onClick,
  arrow = false,
}: {
  icon: ReactNode;
  iconColor?: string;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  arrow?: boolean;
}) {
  const body = (
    <>
      <span className={s.ico} style={{ ['--c' as string]: iconColor }}>
        {icon}
      </span>
      <span className={s.rowText}>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {trailing || arrow ? (
        <span className={s.rowTrail}>
          {trailing}
          {arrow ? <ChevronRightIcon className={s.go} /> : null}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <li>
        <a className={s.row} href={href}>
          {body}
        </a>
      </li>
    );
  }
  if (onClick) {
    return (
      <li>
        <button type="button" className={s.row} onClick={onClick}>
          {body}
        </button>
      </li>
    );
  }
  return (
    <li>
      <div className={s.row}>{body}</div>
    </li>
  );
}

/** Wraps children in the row shape without the list semantics, for custom links. */
export function RowShell({ children }: { children: ReactNode }) {
  return <div className={s.row}>{children}</div>;
}

export const rowClasses = {
  row: s.row,
  ico: s.ico,
  text: s.rowText,
  trail: s.rowTrail,
  go: s.go,
};

/* -------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  value,
  onChange,
  children,
}: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onChange}>
      <RadixTabs.List className={s.tabs}>
        {tabs.map((tab) => (
          <RadixTabs.Trigger key={tab.value} value={tab.value} className={s.tab}>
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Content value={value} className={s.tabPanel}>
      {children}
    </RadixTabs.Content>
  );
}

/* -------------------------------------------------------------------- Well */

// Typed as a plain div so callers can pass a ref (React 19 treats ref as a prop)
// and scroll handlers, which the log view needs.
export function Well({
  children,
  mono = false,
  className,
  ...rest
}: ComponentProps<'div'> & { mono?: boolean }) {
  return (
    <div className={cx(s.well, mono && s.wellMono, className)} {...rest}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- CopyField */

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be refused, in which case the text is selectable.
      return;
    }
    setCopied(true);
  }, [value]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className={s.copy}>
      <span>{value}</span>
      <button
        type="button"
        className={cx(s.copyBtn, copied && s.copyDone)}
        onClick={() => void copy()}
        aria-label={label ? `Copy ${label}` : 'Copy'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Timeline */

export interface TimelineEntry {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  color?: string;
  state?: 'waiting' | 'active' | 'done' | 'failed';
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className={s.tl}>
      {entries.map((entry) => (
        <li key={entry.key}>
          <div
            className={cx(
              s.tlItem,
              entry.state === 'done' && s.tlPop,
              entry.state === 'active' && s.tlActive,
              entry.state === 'waiting' && s.tlWaiting,
            )}
            style={{ ['--c' as string]: entry.color ?? (entry.state === 'waiting' ? 'var(--line)' : 'var(--accent)') }}
          >
            <strong>{entry.title}</strong>
            {entry.detail ? <small>{entry.detail}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- StatTiles */

export function StatTiles({ tiles }: { tiles: { label: string; value: number; loud?: boolean }[] }) {
  return (
    <div className={s.stats}>
      {tiles.map((tile) => (
        <div key={tile.label} className={cx(s.stat, tile.loud && tile.value > 0 && s.statLoud)}>
          <span className={s.statValue}>{tile.value}</span>
          <span className={s.statLabel}>{tile.label}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */

/**
 * The organizer console's empty state: a faint sketch of a document rather than
 * a picture of the missing thing. It says "nothing here yet" without competing
 * with the one button that fixes it.
 */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <div className={s.sketch} aria-hidden="true">
        <div className={cx(s.sketchBar, s.sketchHeading)} style={{ width: '55%' }} />
        <div className={s.sketchSpacer} />
        {['90%', '78%', '85%'].map((width) => (
          <div key={width} className={s.sketchBar} style={{ width }} />
        ))}
        <div className={s.sketchSpacer} />
        <div className={cx(s.sketchBar, s.sketchSubheading)} style={{ width: '35%' }} />
        {['65%', '52%', '70%'].map((width) => (
          <div key={width} className={s.sketchRow}>
            <div className={s.sketchBullet} />
            <div className={s.sketchBar} style={{ width }} />
          </div>
        ))}
      </div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- Toast */

interface ToastItem {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

interface ToastApi {
  say: (text: string) => void;
  complain: (text: string) => void;
}

const ToastContext = createContext<ToastApi>({ say: () => {}, complain: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const push = useCallback((text: string, kind: 'ok' | 'error') => {
    const id = next.current++;
    setItems((current) => [...current, { id, text, kind }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ say: (text) => push(text, 'ok'), complain: (text) => push(text, 'error') }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={s.toasts} role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cx(s.toast, item.kind === 'error' && s.toastError)}>
            <span className={s.toastDot} />
            <span className={s.toastBody}>{item.text}</span>
            <button
              type="button"
              className={s.toastClose}
              aria-label="Dismiss"
              onClick={() => setItems((current) => current.filter((t) => t.id !== item.id))}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------- Field, Input, Select */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <span className={s.error}>{error}</span> : hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  bad?: boolean;
}

export function Input({ mono = false, bad = false, className, ...rest }: InputProps) {
  return <input className={cx(s.input, mono && s.inputMono, bad && s.inputBad, className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cx(s.select, className)} {...rest}>
      {children}
    </select>
  );
}

/** A labelled field wired to its input, which is what most forms need. */
export function TextField({
  label,
  hint,
  error,
  mono,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null; mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <Input id={id} mono={mono} bad={Boolean(error)} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  busy = false,
  danger = false,
  confirmDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
  confirmDisabled?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={s.scrim} />
        <RadixDialog.Content className={s.dialog}>
          <RadixDialog.Title className={s.dialogTitle}>{title}</RadixDialog.Title>
          <div className={s.dialogText}>{children}</div>
          <div className={s.dialogActions}>
            <Button onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              kind={danger ? 'danger' : 'primary'}
              onClick={onConfirm}
              busy={busy}
              disabled={confirmDisabled || busy}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* --------------------------------------------------------------- Sparkline */

export function Sparkline({
  label,
  value,
  points,
  max,
  unit = '',
}: {
  label: string;
  value: string;
  points: number[];
  max?: number;
  unit?: string;
}) {
  const width = 240;
  const height = 44;
  const ceiling = Math.max(max ?? 0, ...points, 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point / ceiling) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastX = (points.length - 1) * step;
  const lastY = height - ((points.at(-1) ?? 0) / ceiling) * height;

  return (
    <div className={s.spark}>
      <div className={s.sparkHead}>
        <span className={s.sparkLabel}>{label}</span>
        <span className={s.sparkValue}>
          {value}
          {unit}
        </span>
      </div>
      <svg className={s.sparkSvg} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--line)" strokeWidth="1" />
        {points.length > 1 ? (
          <>
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            <circle cx={lastX} cy={lastY} r="2.6" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------- misc */

export function Tags({ items }: { items: string[] }) {
  return (
    <div className={s.tags}>
      {items.map((item) => (
        <span key={item} className={s.tag}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function Divider() {
  return <hr className={s.divider} />;
}

export function Spread({ children }: { children: ReactNode }) {
  return <div className={s.spread}>{children}</div>;
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className={s.actions}>{children}</div>;
}

export { cx };
