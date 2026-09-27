/**
 * Icons come from Hugeicons, the same set the MorganHacks organizer console
 * uses, so the two apps feel like siblings. One size and one stroke weight
 * everywhere: 18px at 1.5, which is what the plan settles on.
 *
 * Each glyph is wrapped in a named component so call sites read as
 * `<PlayIcon />` rather than `<Icon icon={PlayIcon} />`, and so swapping a
 * glyph is a one line change here instead of a search across every screen.
 */
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Activity03Icon,
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Delete02Icon,
  Logout03Icon,
  PauseIcon as HugePauseIcon,
  PlayIcon as HugePlayIcon,
  ReloadIcon,
  RocketIcon,
  Search01Icon,
  ServerStack01Icon,
  Settings01Icon,
  StopIcon as HugeStopIcon,
  Tick02Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';

export const ICON_SIZE = 18;
export const ICON_STROKE = 1.5;

export interface IconProps {
  /** Overrides the 18px default only where something is a mark, not an icon. */
  size?: number;
  className?: string;
  title?: string;
}

/** For a glyph not covered by the named components below. */
export function Icon({
  icon,
  size = ICON_SIZE,
  className,
  title,
}: IconProps & { icon: IconSvgElement }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={ICON_STROKE}
      className={className}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      focusable="false"
    />
  );
}

function named(icon: IconSvgElement) {
  return function NamedIcon(props: IconProps) {
    return <Icon icon={icon} {...props} />;
  };
}

/* The mapping, in one place. */
export const ServerIcon = named(ServerStack01Icon);
export const PlusIcon = named(Add01Icon);
export const PlayIcon = named(HugePlayIcon);
export const StopIcon = named(HugeStopIcon);
export const PauseIcon = named(HugePauseIcon);
export const RestartIcon = named(ReloadIcon);
export const RedeployIcon = named(RocketIcon);
export const TrashIcon = named(Delete02Icon);
export const CopyIcon = named(Copy01Icon);
export const CheckIcon = named(Tick02Icon);
export const ChevronRightIcon = named(ArrowRight01Icon);
export const DownIcon = named(ArrowDown01Icon);
export const ExternalIcon = named(ArrowUpRight01Icon);
export const ActivityIcon = named(Activity03Icon);
export const SettingsIcon = named(Settings01Icon);
export const EyeIcon = named(ViewIcon);
export const EyeOffIcon = named(ViewOffIcon);
export const LogoutIcon = named(Logout03Icon);
export const SearchIcon = named(Search01Icon);
