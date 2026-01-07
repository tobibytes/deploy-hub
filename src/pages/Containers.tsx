import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Container, 
  Plus, 
  Play, 
  Square, 
  Trash2, 
  Globe,
  Loader2,
  MoreVertical,
  RefreshCw,
  Settings2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  name: string;
}

interface ContainerData {
  id: string;
  name: string;
  image: string;
  status: 'pending' | 'building' | 'running' | 'stopped' | 'failed' | 'deploying';
  port: number | null;
  cpu_limit: string | null;
  memory_limit: string | null;
  project_id: string;
  created_at: string;
  projects: Project;
}

export default function Containers() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    image: '',
    projectName: '',
    projectDescription: '',
    port: '',
    cpuLimit: '0.5',
    memoryLimit: '512Mi',
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchContainers();
      fetchProjects();
    }
  }, [user]);

  const fetchContainers = async () => {
    try {
      const { data, error } = await supabase
        .from('containers')
        .select('*, projects(id, name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContainers(data as unknown as ContainerData[]);
    } catch (error) {
      console.error('Error fetching containers:', error);
      toast.error('Failed to load containers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const createContainer = async () => {
    if (!formData.name || !formData.image || !formData.projectName) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    try {
      // Create project first
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: formData.projectName,
          description: formData.projectDescription || null,
          user_id: user!.id,
          framework: 'docker',
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Create container
      const { data: container, error: containerError } = await supabase
        .from('containers')
        .insert({
          name: formData.name,
          image: formData.image,
          project_id: project.id,
          user_id: user!.id,
          port: formData.port ? parseInt(formData.port) : null,
          cpu_limit: formData.cpuLimit,
          memory_limit: formData.memoryLimit,
          status: 'pending',
        })
        .select()
        .single();

      if (containerError) throw containerError;

      // Create initial deployment
      await supabase.from('deployments').insert({
        container_id: container.id,
        user_id: user!.id,
        status: 'pending',
        logs: ['Deployment initiated...'],
      });

      toast.success('Container created successfully!');
      setDialogOpen(false);
      setFormData({
        name: '',
        image: '',
        projectName: '',
        projectDescription: '',
        port: '',
        cpuLimit: '0.5',
        memoryLimit: '512Mi',
      });
      
      // Simulate deployment process
      simulateDeployment(container.id);
      fetchContainers();
    } catch (error: any) {
      console.error('Error creating container:', error);
      toast.error(error.message || 'Failed to create container');
    } finally {
      setIsCreating(false);
    }
  };

  const simulateDeployment = async (containerId: string) => {
    // Simulate building phase
    await supabase
      .from('containers')
      .update({ status: 'building' })
      .eq('id', containerId);
    
    fetchContainers();

    // Wait 2 seconds then deploy
    setTimeout(async () => {
      await supabase
        .from('containers')
        .update({ status: 'deploying' })
        .eq('id', containerId);
      fetchContainers();

      // Wait 2 more seconds then mark as running
      setTimeout(async () => {
        await supabase
          .from('containers')
          .update({ status: 'running' })
          .eq('id', containerId);
        
        // Update deployment status
        const { data: deployments } = await supabase
          .from('deployments')
          .select('id')
          .eq('container_id', containerId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (deployments && deployments.length > 0) {
          await supabase
            .from('deployments')
            .update({ 
              status: 'success',
              finished_at: new Date().toISOString(),
              logs: ['Deployment initiated...', 'Building image...', 'Deploying container...', 'Container is now running!'],
            })
            .eq('id', deployments[0].id);
        }

        fetchContainers();
        toast.success('Container is now running!');
      }, 2000);
    }, 2000);
  };

  const updateContainerStatus = async (containerId: string, status: 'pending' | 'building' | 'running' | 'stopped' | 'failed' | 'deploying') => {
    try {
      await supabase
        .from('containers')
        .update({ status })
        .eq('id', containerId);
      
      fetchContainers();
      toast.success(`Container ${status === 'running' ? 'started' : 'stopped'}`);
    } catch (error) {
      toast.error('Failed to update container status');
    }
  };

  const deleteContainer = async (containerId: string) => {
    try {
      await supabase
        .from('containers')
        .delete()
        .eq('id', containerId);
      
      fetchContainers();
      toast.success('Container deleted');
    } catch (error) {
      toast.error('Failed to delete container');
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
            <h1 className="text-3xl font-bold">Containers</h1>
            <p className="text-muted-foreground mt-1">
              Manage your Docker containers and deployments
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="glow">
                <Plus className="h-4 w-4 mr-2" />
                New Container
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg glass-strong">
              <DialogHeader>
                <DialogTitle>Create Container</DialogTitle>
                <DialogDescription>
                  Deploy a new Docker container to the cloud
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    placeholder="my-awesome-app"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    className="bg-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectDescription">Project Description</Label>
                  <Textarea
                    id="projectDescription"
                    placeholder="A brief description of your project"
                    value={formData.projectDescription}
                    onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })}
                    className="bg-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Container Name *</Label>
                    <Input
                      id="name"
                      placeholder="web-server"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      placeholder="3000"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                      className="bg-input"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Docker Image *</Label>
                  <Input
                    id="image"
                    placeholder="nginx:latest or user/image:tag"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="bg-input font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CPU Limit</Label>
                    <Select
                      value={formData.cpuLimit}
                      onValueChange={(value) => setFormData({ ...formData, cpuLimit: value })}
                    >
                      <SelectTrigger className="bg-input">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.25">0.25 vCPU</SelectItem>
                        <SelectItem value="0.5">0.5 vCPU</SelectItem>
                        <SelectItem value="1">1 vCPU</SelectItem>
                        <SelectItem value="2">2 vCPU</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Memory</Label>
                    <Select
                      value={formData.memoryLimit}
                      onValueChange={(value) => setFormData({ ...formData, memoryLimit: value })}
                    >
                      <SelectTrigger className="bg-input">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="256Mi">256 MB</SelectItem>
                        <SelectItem value="512Mi">512 MB</SelectItem>
                        <SelectItem value="1Gi">1 GB</SelectItem>
                        <SelectItem value="2Gi">2 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button 
                  className="w-full" 
                  variant="glow" 
                  onClick={createContainer}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Container className="h-4 w-4 mr-2" />
                      Deploy Container
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Containers Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : containers.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Container className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No containers yet</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Deploy your first Docker container to the cloud. It only takes a few seconds.
              </p>
              <Button variant="glow" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Container
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {containers.map((container) => (
              <Card key={container.id} className="glass border-border/50 hover:border-primary/30 transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Container className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{container.name}</CardTitle>
                        <CardDescription className="font-mono text-xs">
                          {container.image}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-strong">
                        <DropdownMenuItem onClick={() => navigate('/dashboard/domains')}>
                          <Globe className="h-4 w-4 mr-2" />
                          Add Domain
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Settings2 className="h-4 w-4 mr-2" />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteContainer(container.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <StatusBadge status={container.status} />
                      {container.port && (
                        <span className="text-sm text-muted-foreground">
                          Port: {container.port}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {container.status === 'running' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateContainerStatus(container.id, 'stopped')}
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Stop
                        </Button>
                      ) : container.status === 'stopped' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateContainerStatus(container.id, 'running')}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Start
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled>
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          {container.status}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                    <span>Project: {container.projects?.name}</span>
                    <span>
                      {container.cpu_limit} vCPU · {container.memory_limit}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
