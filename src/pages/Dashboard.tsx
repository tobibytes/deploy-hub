import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { errorService } from '@/services/errorService';
import { backendAPI } from '@/lib/backend-api';
import { 
  Container, 
  Globe, 
  Activity, 
  Plus, 
  ArrowUpRight,
  Loader2,
  Server
} from 'lucide-react';
import { toast } from 'sonner';

interface Project {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  created_at: string;
}

interface ContainerData {
  id: string;
  name: string;
  image: string;
  status: 'pending' | 'building' | 'running' | 'stopped' | 'failed' | 'deploying';
  project_id: string;
  projects: Project;
}

interface Stats {
  containers: number;
  running: number;
  domains: number;
  deployments: number;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ containers: 0, running: 0, domains: 0, deployments: 0 });
  const [recentContainers, setRecentContainers] = useState<ContainerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch containers from backend
      const { containers } = await backendAPI.listAppContainers();
      const running = containers.filter((c: any) => c.status === 'running').length;

      setStats({
        containers: containers.length,
        running,
        domains: 0,
        deployments: 0,
      });

      // Map container data
      const recentData = containers.slice(0, 5).map((c: any) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        status: c.status,
        project_id: c.project_id,
        projects: {
          id: c.project_id,
          name: c.project_name,
          description: null,
          framework: 'docker',
          created_at: c.created_at
        }
      }));

      setRecentContainers(recentData as unknown as ContainerData[]);
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      errorService.logError('Error fetching dashboard data', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
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
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back! Here's your infrastructure overview.
            </p>
          </div>
          <Button variant="glow" onClick={() => navigate('/dashboard/containers')}>
            <Plus className="h-4 w-4 mr-2" />
            New Container
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Containers
              </CardTitle>
              <Container className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.containers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.running} running
              </p>
            </CardContent>
          </Card>

          <Card className="glass border-border/50 hover:border-success/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Running
              </CardTitle>
              <Server className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">{stats.running}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active instances
              </p>
            </CardContent>
          </Card>

          <Card className="glass border-border/50 hover:border-accent/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Custom Domains
              </CardTitle>
              <Globe className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.domains}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Connected domains
              </p>
            </CardContent>
          </Card>

          <Card className="glass border-border/50 hover:border-warning/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Deployments
              </CardTitle>
              <Activity className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.deployments}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total deployments
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Containers */}
        <Card className="glass border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Containers</CardTitle>
                <CardDescription>Your most recently deployed containers</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/containers')}>
                View All
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : recentContainers.length === 0 ? (
              <div className="text-center py-12">
                <Container className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No containers yet</h3>
                <p className="text-muted-foreground mb-4">
                  Deploy your first container to get started
                </p>
                <Button variant="glow" onClick={() => navigate('/dashboard/containers')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Container
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentContainers.map((container) => (
                  <div
                    key={container.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                    onClick={() => navigate(`/dashboard/containers`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Container className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{container.name}</p>
                        <p className="text-sm text-muted-foreground font-mono">{container.image}</p>
                      </div>
                    </div>
                    <StatusBadge status={container.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
