import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Activity, 
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  Trash2,
  RefreshCw,
  Search,
  Download,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { errorService } from '@/services/errorService';
import { backendAPI } from '@/lib/backend-api';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BackendLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
  userId?: string;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [backendLogs, setBackendLogs] = useState<BackendLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [backendStats, setBackendStats] = useState({ total: 0, errors: 0, warnings: 0, info: 0 });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && !user.isAdmin) {
      // Redirect non-admin users to dashboard
      navigate('/dashboard');
      toast.error('Admin access required');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [user]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // Fetch all backend logs (admin view - no user filter)
      const beLogsResponse = await backendAPI.getAdminLogs(100);
      setBackendLogs(beLogsResponse.logs || []);
      
      const beStatsResponse = await backendAPI.getAdminStats();
      setBackendStats(beStatsResponse);
    } catch (error: any) {
      console.error('Failed to fetch admin logs:', error);
      errorService.logWarning('Failed to fetch admin logs', { error: error.message });
      toast.error('Failed to load admin logs');
    } finally {
      setIsLoading(false);
    }
  };

  const clearBackendLogs = async () => {
    try {
      await backendAPI.clearMonitoringLogs();
      setBackendLogs([]);
      setBackendStats({ total: 0, errors: 0, warnings: 0, info: 0 });
      toast.success('Backend logs cleared');
    } catch (error: any) {
      toast.error('Failed to clear backend logs');
    }
  };

  const exportLogs = (logs: any[], filename: string) => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported successfully');
  };

  const filterLogs = (logs: any[]) => {
    let filtered = logs;

    // Filter by level
    if (filterLevel !== 'all') {
      filtered = filtered.filter(log => {
        const logLevel = log.level === 'warn' ? 'warning' : log.level;
        return logLevel === filterLevel;
      });
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(log.context || {}).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.userId && log.userId.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return filtered;
  };

  const getLevelIcon = (level: string) => {
    const normalizedLevel = level === 'warn' ? 'warning' : level;
    switch (normalizedLevel) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getLevelBadgeVariant = (level: string): "default" | "destructive" | "secondary" | "outline" => {
    const normalizedLevel = level === 'warn' ? 'warning' : level;
    switch (normalizedLevel) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const renderLogCard = (log: BackendLog, index: number) => {
    const normalizedLevel = (log.level === 'warn' ? 'warning' : (log.level || 'info')) as 'error' | 'warning' | 'info';
    return (
      <Card key={index} className="glass border-border/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">{getLevelIcon(normalizedLevel)}</div>
            <div className="flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={getLevelBadgeVariant(normalizedLevel)}>
                      {normalizedLevel?.toUpperCase() || 'INFO'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                    </span>
                    {log.userId && (
                      <Badge variant="outline" className="text-xs">
                        User: {log.userId.substring(0, 8)}...
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{log.message}</p>
                </div>
              </div>
              {log.context && Object.keys(log.context).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View context
                  </summary>
                  <pre className="mt-2 p-2 bg-secondary/50 rounded overflow-x-auto">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                </details>
              )}
              {log.stack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View stack trace
                  </summary>
                  <pre className="mt-2 p-2 bg-secondary/50 rounded overflow-x-auto text-destructive">
                    {log.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const filteredBackendLogs = filterLogs(backendLogs);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Shield className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">System Admin</h1>
              <p className="text-muted-foreground mt-1">
                System-wide logs and monitoring
              </p>
            </div>
          </div>
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Logs</p>
                  <p className="text-2xl font-bold">{backendStats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Errors</p>
                  <p className="text-2xl font-bold">{backendStats.errors}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                  <p className="text-2xl font-bold">{backendStats.warnings}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Info className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Info</p>
                  <p className="text-2xl font-bold">{backendStats.info}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="glass border-border/50">
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-input"
                  />
                </div>
              </div>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="w-full md:w-[180px] bg-input">
                  <SelectValue placeholder="Filter by level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLogs(filteredBackendLogs, 'admin-logs.json')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={clearBackendLogs}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs List */}
        <Card className="glass border-border/50">
          <CardHeader>
            <CardTitle>System Logs</CardTitle>
            <CardDescription>
              Showing {filteredBackendLogs.length} of {backendLogs.length} logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredBackendLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No logs to display</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBackendLogs.map((log, index) => renderLogCard(log, index))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
