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
  Loader2
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
            Ship Your Code
            <br />
            <span className="gradient-text">Not Infrastructure</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Deploy Docker containers with custom domains in seconds. 
            No infrastructure to manage, no servers to configure. Just push and deploy.
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

        {/* Terminal Preview */}
        <div className="max-w-3xl mx-auto mt-20 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="glass rounded-2xl overflow-hidden border border-border/50">
            <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border/50">
              <div className="w-3 h-3 rounded-full bg-destructive/80" />
              <div className="w-3 h-3 rounded-full bg-warning/80" />
              <div className="w-3 h-3 rounded-full bg-success/80" />
              <span className="ml-2 text-sm text-muted-foreground font-mono">terminal</span>
            </div>
            <div className="p-6 font-mono text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-primary">$</span>
                <span>clouddeploy create my-app --image nginx:latest</span>
              </div>
              <div className="text-muted-foreground">
                ⣾ Creating container...
              </div>
              <div className="text-success">
                ✓ Container created successfully!
              </div>
              <div className="text-muted-foreground">
                ⣾ Deploying to cloud...
              </div>
              <div className="text-success">
                ✓ Deployed to: https://my-app.clouddeploy.app
              </div>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-primary">$</span>
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need to Ship</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A complete platform for deploying, managing, and scaling your containers.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-primary/30 transition-all group">
              <div className="p-3 rounded-xl bg-primary/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Container className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Docker Containers</h3>
              <p className="text-muted-foreground">
                Deploy any Docker image with one click. Full support for private registries and custom configurations.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-accent/30 transition-all group">
              <div className="p-3 rounded-xl bg-accent/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Globe className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Custom Domains</h3>
              <p className="text-muted-foreground">
                Connect your own domains with automatic SSL. Simple DNS configuration with instant propagation.
              </p>
            </div>

            <div className="p-8 rounded-2xl glass border border-border/50 hover:border-success/30 transition-all group">
              <div className="p-3 rounded-xl bg-success/10 w-fit mb-6 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-success" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Secure by Default</h3>
              <p className="text-muted-foreground">
                Every deployment comes with SSL, isolated networking, and enterprise-grade security built in.
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
            Join developers who ship faster with CloudDeploy. 
            No credit card required.
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
