import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { 
  Cloud, 
  Container, 
  Globe, 
  Zap, 
  Shield, 
  ArrowRight,
  Github,
  Terminal,
  Loader2,
  RefreshCw
} from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px] animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/3 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-xl gradient-primary">
              <Cloud className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold gradient-text">CloudDeploy</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button variant="glow">
                Get Started
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 container mx-auto px-4 pt-24 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 mb-8 animate-fade-in">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm">Deploy containers in seconds</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight animate-slide-up">
            Deploy Docker Containers
            <br />
            <span className="gradient-text">Without the Hassle</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Deploy any Docker image in seconds. Manage containers, view logs, and expose them to the internet with automatic public URLs.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/auth">
              <Button size="xl" variant="glow" className="text-lg px-8">
                Start Deploying Free
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Button size="xl" variant="outline" className="text-lg px-8">
              <Github className="h-5 w-5 mr-2" />
              View on GitHub
            </Button>
          </div>
        </div>

        {/* How It Works Preview */}
        <div className="max-w-4xl mx-auto mt-20 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="glass rounded-2xl p-6 border border-border/50 flex gap-4 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                  <span className="text-lg font-bold text-primary">1</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-lg mb-2">Choose a Docker Image</h4>
                <p className="text-muted-foreground">Pick any Docker image from Docker Hub or your private registry. Nginx, Node.js, PostgreSQL, or anything else you need.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-secondary/50 text-sm font-mono">nginx:latest</span>
                  <span className="px-3 py-1 rounded-full bg-secondary/50 text-sm font-mono">node:18-alpine</span>
                  <span className="px-3 py-1 rounded-full bg-secondary/50 text-sm font-mono">postgres:15</span>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="glass rounded-2xl p-6 border border-border/50 flex gap-4 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                  <span className="text-lg font-bold text-accent">2</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-lg mb-2">Deploy in Seconds</h4>
                <p className="text-muted-foreground">Click deploy and your container starts automatically. We handle port allocation, networking, and resource management for you.</p>
                <div className="mt-3 font-mono text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">
                  🚀 Container deployed • Port: 27067 • Status: Running
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="glass rounded-2xl p-6 border border-border/50 flex gap-4 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/20">
                  <span className="text-lg font-bold text-success">3</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-lg mb-2">Share with a Public URL</h4>
                <p className="text-muted-foreground">Every container gets an automatic public URL via Cloudflare Tunnel. No firewall setup needed—access from anywhere instantly.</p>
                <div className="mt-3 flex items-center gap-2 font-mono text-sm text-primary bg-secondary/30 rounded-lg p-3 truncate">
                  <Globe className="h-4 w-4 flex-shrink-0" />
                  https://dep-na9-9d2jab0u.tobiolajide.com
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="glass rounded-2xl p-6 border border-border/50 flex gap-4 items-start">
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/20">
                  <span className="text-lg font-bold text-warning">4</span>
                </div>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-lg mb-2">Manage & Monitor</h4>
                <p className="text-muted-foreground">View logs, manage environment variables, restart containers, or set custom domains. Full control from a beautiful dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Developers</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Everything you need to deploy and manage Docker containers locally with a beautiful dashboard.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-primary/30 transition-all group">
              <div className="p-3 rounded-xl bg-primary/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Container className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Deploy Any Image</h3>
              <p className="text-muted-foreground">
                Deploy from Docker Hub or private registries. Set resource limits, ports, and environment variables with ease.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-accent/30 transition-all group">
              <div className="p-3 rounded-xl bg-accent/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Globe className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Instant Public URLs</h3>
              <p className="text-muted-foreground">
                Every container automatically gets a public URL via Cloudflare Tunnel. No port forwarding, no firewall hassles.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-success/30 transition-all group">
              <div className="p-3 rounded-xl bg-success/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Full Control</h3>
              <p className="text-muted-foreground">
                View logs, manage environment variables, restart containers, or connect custom domains in seconds.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-primary/30 transition-all group">
              <div className="p-3 rounded-xl bg-primary/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Terminal className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Real-Time Logs</h3>
              <p className="text-muted-foreground">
                Stream container logs live. Debug faster with full access to container output and error messages.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-accent/30 transition-all group">
              <div className="p-3 rounded-xl bg-accent/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Lightweight & Fast</h3>
              <p className="text-muted-foreground">
                No heavy infrastructure. Works on your local machine or a VPS. Start deploying in seconds.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-success/30 transition-all group">
              <div className="p-3 rounded-xl bg-success/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <RefreshCw className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Deployment History</h3>
              <p className="text-muted-foreground">
                Track all your deployments, view logs, and rollback when needed. Full audit trail included.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 container mx-auto px-4 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Deploy?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Start deploying Docker containers in seconds. No credit card required.
          </p>
          <Link to="/auth">
            <Button size="xl" variant="glow" className="text-lg px-10">
              Get Started Now
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg gradient-primary">
                <Cloud className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold gradient-text">CloudDeploy</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 CloudDeploy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
