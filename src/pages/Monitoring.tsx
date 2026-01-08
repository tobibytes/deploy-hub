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
  Download
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface ErrorLog {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
  url?: string;
  userAgent?: string;
}

interface BackendLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  context?: Record<string, any>;
  stack?: string;
}

export default function Monitoring() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [frontendLogs, setFrontendLogs] = useState<ErrorLog[]>([]);
  const [backendLogs, setBackendLogs] = useState<BackendLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [frontendStats, setFrontendStats] = useState({ total: 0, errors: 0, warnings: 0, info: 0 });
  const [backendStats, setBackendStats] = useState({ total: 0, errors: 0, warnings: 0, info: 0 });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
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
      // Fetch frontend logs from localStorage
      const feLogs = errorService.getLogs();
      setFrontendLogs(feLogs);
      setFrontendStats(errorService.getStats());

      // Fetch backend logs
      try {
        const beLogsResponse = await backendAPI.getMonitoringLogs(100);
        setBackendLogs(beLogsResponse.logs || []);
        
        const beStatsResponse = await backendAPI.getMonitoringStats();
        setBackendStats(beStatsResponse);
      } catch (error: any) {
        console.error('Failed to fetch backend logs:', error);
        errorService.logWarning('Failed to fetch backend logs', { error: error.message });
      }
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to load monitoring data');
    } finally {
      setIsLoading(false);
    }
  };

  const clearFrontendLogs = () => {
    errorService.clearLogs();
    setFrontendLogs([]);
    setFrontendStats({ total: 0, errors: 0, warnings: 0, info: 0 });
    toast.success('Frontend logs cleared');
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
        JSON.stringify(log.context || {}).toLowerCase().includes(searchQuery.toLowerCase())
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

  const renderLogCard = (log: ErrorLog | BackendLog, index: number) => {
    const normalizedLevel = (log.level === 'warn' ? 'warning' : log.level) as 'error' | 'warning' | 'info';
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
                      {normalizedLevel.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{log.message}</p>
                </div>
              </div>
              {log.context && Object.keys(log.context).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View context
                  </summary>
                  <pre className="mt-2 p-2 bg-background rounded border border-border overflow-auto">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                </details>
              )}
              {log.stack && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View stack trace
                  </summary>
                  <pre className="mt-2 p-2 bg-background rounded border border-border overflow-auto text-xs">
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

  const renderStats = (stats: any) => (
    <div className="grid grid-cols-4 gap-4">
      <Card className="glass border-border/50">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </div>
        </CardContent>
      </Card>
      <Card className="glass border-border/50">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-destructive">{stats.errors}</p>
            <p className="text-sm text-muted-foreground">Errors</p>
          </div>
        </CardContent>
      </Card>
      <Card className="glass border-border/50">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-500">{stats.warnings}</p>
            <p className="text-sm text-muted-foreground">Warnings</p>
          </div>
        </CardContent>
      </Card>
      <Card className="glass border-border/50">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-500">{stats.info}</p>
            <p className="text-sm text-muted-foreground">Info</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

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
            <h1 className="text-3xl font-bold">Error Monitoring</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage application errors and logs
            </p>
          </div>
          <Button variant="outline" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card className="glass border-border/50">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filter by level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Frontend and Backend */}
        <Tabs defaultValue="frontend" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="frontend">Frontend Logs</TabsTrigger>
            <TabsTrigger value="backend">Backend Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="frontend" className="space-y-4">
            {/* Frontend Stats */}
            {renderStats(frontendStats)}

            {/* Frontend Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLogs(frontendLogs, 'frontend-logs.json')}
                disabled={frontendLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFrontendLogs}
                disabled={frontendLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Logs
              </Button>
            </div>

            {/* Frontend Logs */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filterLogs(frontendLogs).length === 0 ? (
              <Card className="glass border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <Activity className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No frontend logs</h3>
                  <p className="text-muted-foreground text-center">
                    {searchQuery || filterLevel !== 'all'
                      ? 'No logs match your search criteria'
                      : 'Frontend error logs will appear here when errors occur'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filterLogs(frontendLogs).map((log, index) => renderLogCard(log, index))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="backend" className="space-y-4">
            {/* Backend Stats */}
            {renderStats(backendStats)}

            {/* Backend Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportLogs(backendLogs, 'backend-logs.json')}
                disabled={backendLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearBackendLogs}
                disabled={backendLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Logs
              </Button>
            </div>

            {/* Backend Logs */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filterLogs(backendLogs).length === 0 ? (
              <Card className="glass border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <Activity className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No backend logs</h3>
                  <p className="text-muted-foreground text-center">
                    {searchQuery || filterLevel !== 'all'
                      ? 'No logs match your search criteria'
                      : 'Backend error logs will appear here when errors occur'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filterLogs(backendLogs).map((log, index) => renderLogCard(log, index))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
