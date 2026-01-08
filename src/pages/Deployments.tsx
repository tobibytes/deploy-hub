import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { errorService } from '@/services/errorService';
import { 
  Activity, 
  Loader2,
  Clock,
  Terminal,
  GitCommit,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DeploymentData {
  id: string;
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';
  commit_hash: string | null;
  logs: string[] | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  containers: {
    name: string;
    image: string;
    projects: {
      name: string;
    };
  };
}

export default function Deployments() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState<DeploymentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDeployments();
    }
  }, [user]);

  const fetchDeployments = async () => {
    try {
      const { data, error } = await supabase
        .from('deployments')
        .select('*, containers(name, image, projects(name))')
        .order('created_at', { ascending: false });

      if (error) {
        errorService.logError('Failed to fetch deployments', error);
        throw error;
      }
      setDeployments(data as unknown as DeploymentData[]);
    } catch (error: any) {
      console.error('Error fetching deployments:', error);
      errorService.logError('Error fetching deployments', error);
      toast.error('Failed to load deployments');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLogs = (deploymentId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deploymentId)) {
        newSet.delete(deploymentId);
      } else {
        newSet.add(deploymentId);
      }
      return newSet;
    });
  };

  const getDuration = (started: string | null, finished: string | null) => {
    if (!started) return '-';
    const start = new Date(started);
    const end = finished ? new Date(finished) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    const remainingSecs = diffSecs % 60;
    return `${diffMins}m ${remainingSecs}s`;
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Deployments</h1>
            <p className="text-muted-foreground mt-1">
              View deployment history and logs
            </p>
          </div>
          <Button variant="outline" onClick={fetchDeployments}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Deployments List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : deployments.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Activity className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No deployments yet</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Deployments will appear here when you create and deploy containers.
              </p>
              <Button variant="glow" onClick={() => navigate('/dashboard/containers')}>
                Create Your First Container
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {deployments.map((deployment) => (
              <Card key={deployment.id} className="glass border-border/50 overflow-hidden">
                <CardContent className="py-0">
                  {/* Main Row */}
                  <div 
                    className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4 cursor-pointer"
                    onClick={() => toggleLogs(deployment.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-xl",
                        deployment.status === 'success' && "bg-success/10",
                        deployment.status === 'failed' && "bg-destructive/10",
                        deployment.status === 'building' && "bg-primary/10",
                        deployment.status === 'deploying' && "bg-accent/10",
                        deployment.status === 'pending' && "bg-warning/10",
                        deployment.status === 'cancelled' && "bg-muted",
                      )}>
                        <Activity className={cn(
                          "h-5 w-5",
                          deployment.status === 'success' && "text-success",
                          deployment.status === 'failed' && "text-destructive",
                          deployment.status === 'building' && "text-primary animate-pulse",
                          deployment.status === 'deploying' && "text-accent animate-pulse",
                          deployment.status === 'pending' && "text-warning",
                          deployment.status === 'cancelled' && "text-muted-foreground",
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{deployment.containers.name}</h3>
                          <StatusBadge status={deployment.status} />
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span>{deployment.containers.projects.name}</span>
                          <span>·</span>
                          <span className="font-mono text-xs">{deployment.containers.image}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{getDuration(deployment.started_at, deployment.finished_at)}</span>
                      </div>
                      {deployment.commit_hash && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <GitCommit className="h-4 w-4" />
                          <span className="font-mono">{deployment.commit_hash.slice(0, 7)}</span>
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        {expandedLogs.has(deployment.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Logs */}
                  {expandedLogs.has(deployment.id) && (
                    <div className="border-t border-border py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Terminal className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Deployment Logs</span>
                      </div>
                      <div className="bg-background rounded-lg p-4 font-mono text-sm max-h-64 overflow-y-auto">
                        {deployment.logs && deployment.logs.length > 0 ? (
                          deployment.logs.map((log, index) => (
                            <div 
                              key={index} 
                              className={cn(
                                "py-1",
                                log.includes('error') || log.includes('Error') 
                                  ? "text-destructive" 
                                  : log.includes('success') || log.includes('running')
                                    ? "text-success"
                                    : "text-muted-foreground"
                              )}
                            >
                              <span className="text-primary/50 mr-2">[{format(new Date(deployment.created_at), 'HH:mm:ss')}]</span>
                              {log}
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">No logs available</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
