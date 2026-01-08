import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Globe, 
  Plus, 
  Trash2, 
  Shield,
  ShieldCheck,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContainerOption {
  id: string;
  name: string;
  status: string;
}

interface DomainData {
  id: string;
  domain: string;
  is_verified: boolean;
  ssl_enabled: boolean;
  verification_token: string | null;
  container_id: string;
  created_at: string;
  containers: {
    name: string;
    status: string;
  };
}

export default function Domains() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [domains, setDomains] = useState<DomainData[]>([]);
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    domain: '',
    containerId: '',
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDomains();
      fetchContainers();
    }
  }, [user]);

  const fetchDomains = async () => {
    try {
      const { data, error } = await supabase
        .from('domains')
        .select('*, containers(name, status)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDomains(data as unknown as DomainData[]);
    } catch (error) {
      console.error('Error fetching domains:', error);
      toast.error('Failed to load domains');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContainers = async () => {
    try {
      const { data, error } = await supabase
        .from('containers')
        .select('id, name, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContainers(data || []);
    } catch (error) {
      console.error('Error fetching containers:', error);
    }
  };

  const generateVerificationToken = () => {
    return `clouddeploy-verify-${Math.random().toString(36).substring(2, 15)}`;
  };

  const createDomain = async () => {
    // Validate required fields
    if (!formData.domain?.trim() || !formData.containerId) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Enhanced domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    const trimmedDomain = formData.domain.trim().toLowerCase();
    
    // Remove protocol if present
    const cleanDomain = trimmedDomain.replace(/^https?:\/\//, '').replace(/^www\./, '');
    
    if (!domainRegex.test(cleanDomain)) {
      toast.error('Please enter a valid domain name (e.g., example.com)');
      return;
    }

    // Check for common issues
    if (cleanDomain.includes('/')) {
      toast.error('Domain should not contain path. Enter just the domain name.');
      return;
    }

    if (cleanDomain.split('.').length < 2) {
      toast.error('Please enter a complete domain with TLD (e.g., example.com)');
      return;
    }

    setIsCreating(true);
    try {
      const verificationToken = generateVerificationToken();

      const { error } = await supabase
        .from('domains')
        .insert({
          domain: cleanDomain,
          container_id: formData.containerId,
          user_id: user!.id,
          verification_token: verificationToken,
          is_verified: false,
          ssl_enabled: false,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('This domain is already registered');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Domain added successfully!');
      setDialogOpen(false);
      setFormData({ domain: '', containerId: '' });
      fetchDomains();
    } catch (error: any) {
      console.error('Error creating domain:', error);
      toast.error(error.message || 'Failed to add domain');
    } finally {
      setIsCreating(false);
    }
  };

  const verifyDomain = async (domainId: string) => {
    try {
      // Simulate verification (in real app, this would check DNS records)
      await supabase
        .from('domains')
        .update({ is_verified: true, ssl_enabled: true })
        .eq('id', domainId);

      toast.success('Domain verified and SSL enabled!');
      fetchDomains();
    } catch (error) {
      toast.error('Failed to verify domain');
    }
  };

  const deleteDomain = async (domainId: string) => {
    try {
      await supabase
        .from('domains')
        .delete()
        .eq('id', domainId);
      
      fetchDomains();
      toast.success('Domain deleted');
    } catch (error) {
      toast.error('Failed to delete domain');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
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
            <h1 className="text-3xl font-bold">Domains</h1>
            <p className="text-muted-foreground mt-1">
              Manage custom domains for your containers
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="glow" disabled={containers.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md glass-strong">
              <DialogHeader>
                <DialogTitle>Add Custom Domain</DialogTitle>
                <DialogDescription>
                  Connect a custom domain to your container
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name *</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    className="bg-input font-mono"
                    disabled={isCreating}
                    required
                    aria-label="Domain name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your domain without http:// or https://
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Container *</Label>
                  <Select
                    value={formData.containerId}
                    onValueChange={(value) => setFormData({ ...formData, containerId: value })}
                    disabled={isCreating}
                  >
                    <SelectTrigger className="bg-input" aria-label="Select container">
                      <SelectValue placeholder="Select a container" />
                    </SelectTrigger>
                    <SelectContent>
                      {containers.map((container) => (
                        <SelectItem key={container.id} value={container.id}>
                          {container.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="w-full" 
                  variant="glow" 
                  onClick={createDomain}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Add Domain
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Info Card */}
        {containers.length === 0 && (
          <Card className="glass border-warning/30 bg-warning/5">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium">No containers available</p>
                <p className="text-sm text-muted-foreground">
                  Create a container first before adding a custom domain.
                </p>
              </div>
              <Button variant="outline" className="ml-auto" onClick={() => navigate('/dashboard/containers')}>
                Create Container
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Domains List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : domains.length === 0 ? (
          <Card className="glass border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Globe className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No custom domains</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Add a custom domain to make your container accessible via your own URL.
              </p>
              {containers.length > 0 && (
                <Button variant="glow" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Domain
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {domains.map((domain) => (
              <Card key={domain.id} className="glass border-border/50 hover:border-primary/30 transition-all">
                <CardContent className="py-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-accent/10">
                        <Globe className="h-6 w-6 text-accent" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold font-mono">{domain.domain}</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(domain.domain)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a
                            href={`https://${domain.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Container: {domain.containers.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {domain.is_verified ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}

                      {domain.ssl_enabled ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          SSL Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          <Shield className="h-3 w-3 mr-1" />
                          No SSL
                        </Badge>
                      )}

                      <div className="flex items-center gap-2">
                        {!domain.is_verified && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verifyDomain(domain.id)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Verify
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteDomain(domain.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* DNS Instructions */}
                  {!domain.is_verified && (
                    <div className="mt-6 p-4 rounded-lg bg-secondary/50">
                      <p className="text-sm font-medium mb-3">DNS Configuration Required</p>
                      <div className="space-y-2 font-mono text-xs">
                        <div className="flex items-center justify-between p-2 rounded bg-background/50">
                          <span className="text-muted-foreground">Type: A Record</span>
                          <span>@</span>
                          <span className="text-primary">185.158.133.1</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => copyToClipboard('185.158.133.1')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded bg-background/50">
                          <span className="text-muted-foreground">Type: TXT</span>
                          <span>_clouddeploy</span>
                          <span className="text-primary truncate max-w-[150px]">{domain.verification_token}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(domain.verification_token || '')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
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
