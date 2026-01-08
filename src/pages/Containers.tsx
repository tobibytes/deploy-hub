import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/components/dashboard/StatusBadge';
import EnvVariablesDialog from '@/components/EnvVariablesDialog';
// Supabase removed; data now comes from backend APIs
import { backendAPI } from '@/lib/backend-api';
import { errorService } from '@/services/errorService';
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
  Settings2,
  ExternalLink
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
  containerId?: string;
  docker_container_id?: string;
  name: string;
  image: string;
  status: 'pending' | 'building' | 'running' | 'stopped' | 'failed' | 'deploying' | 'exited' | 'created';
  port: number | null;
  local_url?: string;
  localUrl?: string;
  publicUrl?: string;
  cpu_limit: string | null;
  memory_limit: string | null;
  project_id: string;
  created_at: string;
  projects: Project;
  environment_variables?: Record<string, string>;
}

export default function Containers() {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<ContainerData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stoppingContainerId, setStoppingContainerId] = useState<string | null>(null);
  const [envVarsDialogOpen, setEnvVarsDialogOpen] = useState(false);
  const [selectedContainerForEnv, setSelectedContainerForEnv] = useState<ContainerData | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    image: '',
    projectName: '',
    projectDescription: '',
    containerPort: '80',
    cpuLimit: '0.5',
    memoryLimit: '512Mi',
  });

  // Auth optional; do not redirect when unauthenticated
  useEffect(() => {}, []);

  useEffect(() => {
    fetchContainers();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [containers]);

  const fetchContainers = async () => {
    try {
      const { containers } = await backendAPI.listAppContainers();
      const mapped = containers.map((c: any) => ({
        id: c.id,
        docker_container_id: c.docker_container_id,
        name: c.name,
        image: c.image,
        status: c.status,
        port: c.port,
        localUrl: c.local_url,
        publicUrl: c.public_url,
        cpu_limit: c.cpu_limit,
        memory_limit: c.memory_limit,
        project_id: c.project_id,
        created_at: c.created_at,
        projects: { id: c.project_id, name: c.project_name }
      }));
      setContainers(mapped);
    } catch (error: any) {
      console.error('Error fetching containers:', error);
      errorService.logError('Error fetching containers', error);
      toast.error('Failed to load containers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    const unique = Array.from(new Map(containers.map(c => [c.projects?.id, c.projects])).values()).filter(Boolean) as Project[];
    setProjects(unique);
  };

  const generateUniqueName = async (baseName: string): Promise<string> => {
    const existingNames = new Set((containers || []).map((c: any) => c.name));
    
    if (!existingNames.has(baseName)) {
      return baseName;
    }

    // Generate unique name by appending number
    let counter = 1;
    let newName = `${baseName}-${counter}`;
    while (existingNames.has(newName)) {
      counter++;
      newName = `${baseName}-${counter}`;
    }
    
    return newName;
  };

  const createContainer = async () => {
    // Validate and trim required fields
    const trimmedName = formData.name?.trim();
    const trimmedImage = formData.image?.trim();
    const trimmedProjectName = formData.projectName?.trim();
    
    if (!trimmedName || !trimmedImage || !trimmedProjectName) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate container name format
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
    if (!nameRegex.test(trimmedName)) {
      toast.error('Container name must start with alphanumeric character and contain only letters, numbers, underscores, periods, and hyphens');
      return;
    }

    // Validate image format (basic check)
    if (!trimmedImage.includes(':') && !trimmedImage.includes('/')) {
      toast.warning('Consider specifying an image tag (e.g., nginx:alpine)');
    }

    // Validate container port
    const containerPort = parseInt(formData.containerPort);
    if (isNaN(containerPort) || containerPort < 1 || containerPort > 65535) {
      toast.error('Container port must be between 1 and 65535');
      return;
    }

    setIsCreating(true);
    try {
      // Generate unique name if duplicate exists
      const uniqueName = await generateUniqueName(trimmedName);
      if (uniqueName !== trimmedName) {
        toast.info(`Name already exists. Using "${uniqueName}" instead.`);
      }

      // Project creation handled on backend

      // Update status in UI
      toast.info('Building and deploying container...');

      // Deploy container using backend API
      const deployment = await backendAPI.deployContainer({
        name: uniqueName,
        image: trimmedImage,
        containerPort: formData.containerPort ? parseInt(formData.containerPort) : undefined,
        cpuLimit: formData.cpuLimit,
        memoryLimit: formData.memoryLimit,
        projectName: formData.projectName,
        projectDescription: formData.projectDescription,
      });

      errorService.logInfo('Container deployed successfully', { 
        containerId: deployment.containerId,
        name: uniqueName 
      });

      // Persistence handled by backend

      // Create deployment record
      await fetchContainers();

      toast.success(
        <div>
          <p>Container deployed successfully!</p>
          {deployment.publicUrl && (
            <p className="text-sm mt-2">
              Public: <a 
                href={deployment.publicUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline"
                aria-label={`Open container at ${deployment.publicUrl} in new tab`}
              >
                {deployment.publicUrl}
              </a>
            </p>
          )}
          <p className="text-sm mt-1">
            Local: <a 
              href={deployment.localUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="underline"
              aria-label={`Open container at ${deployment.localUrl} in new tab`}
            >
              {deployment.localUrl}
            </a>
          </p>
        </div>
      );
      
      setDialogOpen(false);
      setFormData({
        name: '',
        image: '',
        projectName: '',
        projectDescription: '',
        containerPort: '80',
        cpuLimit: '0.5',
        memoryLimit: '512Mi',
      });
      
      fetchContainers();
    } catch (error: any) {
      console.error('Error creating container:', error);
      errorService.logError('Failed to create container', error, { 
        name: formData.name,
        image: formData.image 
      });
      toast.error(error.message || 'Failed to create container');
    } finally {
      setIsCreating(false);
    }
  };

  const updateContainerStatus = async (containerId: string, action: 'start' | 'stop') => {
    try {
      const containerData = containers.find(c => c.id === containerId);

      if (!containerData || !containerData.docker_container_id) {
        const error = new Error('Container not found or missing Docker ID');
        errorService.logError('Container validation failed', error, { containerId });
        toast.error('Container not found or missing Docker ID');
        return;
      }

      if (action === 'start') {
        await backendAPI.startContainer(containerData.docker_container_id!);
        errorService.logInfo('Container started', { containerId, name: containerData.name });
        toast.success('Container started successfully');
      } else {
        await backendAPI.stopContainer(containerData.docker_container_id!);
        errorService.logInfo('Container stopped', { containerId, name: containerData.name });
        toast.success('Container stopped successfully');
      }
      
      // Update local state and refresh UI
      setStoppingContainerId(null);
      if (selectedContainer?.id === containerId) {
        setSelectedContainer({
          ...selectedContainer,
          status: action === 'start' ? 'running' : 'stopped'
        });
      }
      fetchContainers();
    } catch (error: any) {
      console.error('Error updating container:', error);
      errorService.logError(`Failed to ${action} container`, error, { containerId });
      setStoppingContainerId(null);
      toast.error(error.message || `Failed to ${action} container`);
    }
  };

  const deleteContainer = async (containerId: string) => {
    try {
      const containerData = containers.find(c => c.id === containerId);

      if (!containerData) {
        const error = new Error('Container not found');
        errorService.logError('Container not found for deletion', error, { containerId });
        toast.error('Container not found');
        return;
      }

      // Delete from Docker if we have a docker_container_id
      if (containerData.docker_container_id) {
        try {
          await backendAPI.deleteContainer(containerData.docker_container_id);
        } catch (error: any) {
          console.warn('Container may already be deleted from Docker:', error);
          errorService.logWarning('Container already deleted from Docker', { 
            containerId,
            error: error.message 
          });
        }
      }

      // Backend deletes from DB as well

      errorService.logInfo('Container deleted', { containerId, name: containerData.name });
      fetchContainers();
      toast.success('Container deleted successfully');
    } catch (error: any) {
      console.error('Error deleting container:', error);
      errorService.logError('Failed to delete container', error, { containerId });
      toast.error(error.message || 'Failed to delete container');
    }
  };

  // Do not gate UI behind auth; backend handles ownership

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
            <DialogContent className="sm:max-w-lg glass-strong flex flex-col max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create Container</DialogTitle>
                <DialogDescription>
                  Deploy a new Docker container to the cloud
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 overflow-y-auto pr-4">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    placeholder="my-awesome-app"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    className="bg-input"
                    disabled={isCreating}
                    aria-label="Project name"
                    required
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
                    disabled={isCreating}
                    aria-label="Project description"
                  />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="name">Container Name *</Label>
                    <Input
                      id="name"
                      placeholder="web-server"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-input"
                      disabled={isCreating}
                      aria-label="Container name"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Alphanumeric, underscores, periods, hyphens
                    </p>
                  </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Docker Image *</Label>
                  <Input
                    id="image"
                    placeholder="nginx:latest or user/image:tag"
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="bg-input font-mono text-sm"
                    disabled={isCreating}
                    aria-label="Docker image"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Examples: nginx:alpine, node:18-alpine, httpd:alpine
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="containerPort">Container Port</Label>
                  <Input
                    id="containerPort"
                    type="number"
                    placeholder="80"
                    value={formData.containerPort}
                    onChange={(e) => setFormData({ ...formData, containerPort: e.target.value })}
                    className="bg-input"
                    disabled={isCreating}
                    min="1"
                    max="65535"
                    aria-label="Container port"
                  />
                  <p className="text-xs text-muted-foreground">
                    Port inside the container (80 for nginx/apache, 3000 for node apps)
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CPU Limit</Label>
                    <Select
                      value={formData.cpuLimit}
                      onValueChange={(value) => setFormData({ ...formData, cpuLimit: value })}
                      disabled={isCreating}
                    >
                      <SelectTrigger className="bg-input" aria-label="CPU limit">
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
                      disabled={isCreating}
                    >
                      <SelectTrigger className="bg-input" aria-label="Memory limit">
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
              <Card 
                key={container.id} 
                className="glass border-border/50 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => {
                  setSelectedContainer(container);
                  setDetailsOpen(true);
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between" onClick={(e) => e.stopPropagation()}>
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
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedContainerForEnv(container);
                            setEnvVarsDialogOpen(true);
                          }}
                        >
                          <Settings2 className="h-4 w-4 mr-2" />
                          Environment Variables
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
                  <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              updateContainerStatus(container.id, 'stop');
                            }}
                            disabled={stoppingContainerId === container.id}
                          >
                            {stoppingContainerId === container.id ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Stopping...
                              </>
                            ) : (
                              <>
                                <Square className="h-3 w-3 mr-1" />
                                Stop
                              </>
                            )}
                          </Button>
                        ) : container.status === 'stopped' || container.status === 'exited' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateContainerStatus(container.id, 'start');
                            }}
                            disabled={stoppingContainerId === container.id}
                          >
                            {stoppingContainerId === container.id ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Starting...
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                Start
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            {container.status}
                          </Button>
                        )}
                      </div>
                    </div>
                    {container.localUrl && container.status === 'running' && (
                      <div className="space-y-2">
                        {/* <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-md border border-primary/20">
                          <Globe className="h-4 w-4 text-primary" />
                          <a 
                            href={container.localUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline font-mono flex items-center gap-1"
                          >
                            {container.localUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div> */}
                        {container.publicUrl && (
                          <div className="flex items-center gap-2 p-2 bg-green-500/5 rounded-md border border-green-500/20">
                            <Globe className="h-4 w-4 text-green-600" />
                            <a 
                              href={container.publicUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-green-600 hover:underline font-mono flex items-center gap-1"
                            >
                              {container.publicUrl}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="pt-2 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                      <span>Project: {container.projects?.name}</span>
                      <span>
                        {container.cpu_limit} vCPU · {container.memory_limit}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Container Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-xl glass-strong">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Container className="h-5 w-5 text-primary" />
              {selectedContainer?.name}
            </DialogTitle>
            <DialogDescription>
              Container details and management
            </DialogDescription>
          </DialogHeader>

          {selectedContainer && (
            <div className="space-y-6 mt-6">
              {/* Status Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Status</h3>
                <div className="flex items-center gap-3">
                  <StatusBadge status={selectedContainer.status} />
                  <div className="flex items-center gap-2">
                    {selectedContainer.status === 'running' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateContainerStatus(selectedContainer.id, 'stop')}
                        disabled={stoppingContainerId === selectedContainer.id}
                      >
                        {stoppingContainerId === selectedContainer.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Stopping...
                          </>
                        ) : (
                          <>
                            <Square className="h-3 w-3 mr-1" />
                            Stop
                          </>
                        )}
                      </Button>
                    ) : (selectedContainer.status === 'stopped' || selectedContainer.status === 'exited') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateContainerStatus(selectedContainer.id, 'start')}
                        disabled={stoppingContainerId === selectedContainer.id}
                      >
                        {stoppingContainerId === selectedContainer.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Start
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Image and Port Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Image</p>
                  <p className="font-mono text-sm break-all">{selectedContainer.image}</p>
                </div>
                {selectedContainer.port && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Port</p>
                    <p className="font-mono text-sm">{selectedContainer.port}</p>
                  </div>
                )}
              </div>

              {/* Resources Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">CPU Limit</p>
                  <p className="text-sm">{selectedContainer.cpu_limit} vCPU</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Memory Limit</p>
                  <p className="text-sm">{selectedContainer.memory_limit}</p>
                </div>
              </div>

              {/* Project Section */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Project</p>
                <p className="text-sm">{selectedContainer.projects?.name}</p>
              </div>

              {/* Public URL Section */}
              {selectedContainer.publicUrl && selectedContainer.status === 'running' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Public URL</p>
                  <a 
                    href={selectedContainer.publicUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:underline font-mono flex items-center gap-2 p-2 bg-green-500/5 rounded-md border border-green-500/20"
                  >
                    {selectedContainer.publicUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* URL Section */}
              {selectedContainer.localUrl && selectedContainer.status === 'running' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Local URL</p>
                  <a 
                    href={selectedContainer.localUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline font-mono flex items-center gap-2 p-2 bg-primary/5 rounded-md border border-primary/20"
                  >
                    {selectedContainer.localUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Docker Container ID Section */}
              {selectedContainer.docker_container_id && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Docker Container ID</p>
                  <p className="font-mono text-xs text-muted-foreground break-all">{selectedContainer.docker_container_id}</p>
                </div>
              )}

              {/* Created At Section */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(selectedContainer.created_at).toLocaleString()}</p>
              </div>

              {/* Environment Variables Section */}
              {selectedContainer.environment_variables && Object.keys(selectedContainer.environment_variables).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Environment Variables</p>
                  <div className="bg-secondary/30 rounded-md p-3 space-y-1 max-h-40 overflow-auto">
                    {Object.entries(selectedContainer.environment_variables).map(([key, value]) => (
                      <div key={key} className="text-xs font-mono">
                        <span className="text-primary">{key}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="text-green-400">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-6 pt-4 border-t border-border">
            <Button 
              variant="destructive" 
              onClick={() => {
                setDetailsOpen(false);
                deleteContainer(selectedContainer!.id);
              }}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Environment Variables Dialog */}
      {selectedContainerForEnv && (
        <EnvVariablesDialog
          open={envVarsDialogOpen}
          onOpenChange={setEnvVarsDialogOpen}
          containerId={selectedContainerForEnv.docker_container_id || ''}
          containerName={selectedContainerForEnv.name}
        />
      )}
    </DashboardLayout>
  );
}
