import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Status = 'pending' | 'building' | 'running' | 'stopped' | 'failed' | 'deploying' | 'success' | 'cancelled';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  building: {
    label: 'Building',
    className: 'bg-primary/10 text-primary border-primary/20 animate-pulse',
  },
  running: {
    label: 'Running',
    className: 'bg-success/10 text-success border-success/20',
  },
  stopped: {
    label: 'Stopped',
    className: 'bg-muted text-muted-foreground border-border',
  },
  failed: {
    label: 'Failed',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  deploying: {
    label: 'Deploying',
    className: 'bg-accent/10 text-accent border-accent/20 animate-pulse',
  },
  success: {
    label: 'Success',
    className: 'bg-success/10 text-success border-success/20',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-medium border",
        config.className,
        className
      )}
    >
      <span className={cn(
        "w-2 h-2 rounded-full mr-2",
        status === 'running' && "bg-success animate-pulse",
        status === 'building' && "bg-primary animate-pulse",
        status === 'deploying' && "bg-accent animate-pulse",
        status === 'pending' && "bg-warning",
        status === 'stopped' && "bg-muted-foreground",
        status === 'failed' && "bg-destructive",
        status === 'success' && "bg-success",
        status === 'cancelled' && "bg-muted-foreground",
      )} />
      {config.label}
    </Badge>
  );
}
