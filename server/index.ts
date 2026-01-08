import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import Docker from 'dockerode';

const app: Express = express();
const PORT = process.env.PORT || 3001;
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Middleware
app.use(cors());
app.use(express.json());

// Store container metadata (in production, this would be in a database)
interface ContainerMetadata {
  containerId: string;
  name: string;
  image: string;
  port?: number;
  localUrl?: string;
  status: string;
  createdAt: string;
}

const containerMetadata: Map<string, ContainerMetadata> = new Map();

// Helper function to generate local URL
function generateLocalUrl(port: number): string {
  return `http://localhost:${port}`;
}

// Helper function to find an available port
function getAvailablePort(): number {
  // In production, you'd check for actually available ports
  // For now, we'll use a range starting from 8080
  const usedPorts = Array.from(containerMetadata.values())
    .map(c => c.port)
    .filter(p => p !== undefined);
  
  for (let port = 8080; port < 9000; port++) {
    if (!usedPorts.includes(port)) {
      return port;
    }
  }
  return 8080;
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// List all containers
app.get('/api/containers', async (req: Request, res: Response) => {
  try {
    const containers = await docker.listContainers({ all: true });
    
    const containerDetails = containers.map(container => {
      const meta = containerMetadata.get(container.Id) || {};
      return {
        id: container.Id,
        name: container.Names[0]?.replace('/', '') || 'unknown',
        image: container.Image,
        status: container.State,
        created: container.Created,
        ports: container.Ports,
        ...meta
      };
    });
    
    res.json({ containers: containerDetails });
  } catch (error: any) {
    console.error('Error listing containers:', error);
    res.status(500).json({ error: 'Failed to list containers', message: error.message });
  }
});

// Get container details
app.get('/api/containers/:id', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    const meta = containerMetadata.get(req.params.id) || {};
    
    res.json({
      ...info,
      metadata: meta
    });
  } catch (error: any) {
    console.error('Error getting container:', error);
    res.status(500).json({ error: 'Failed to get container details', message: error.message });
  }
});

// Deploy a new container
app.post('/api/containers', async (req: Request, res: Response) => {
  try {
    const { name, image, port: requestedPort, cpuLimit, memoryLimit, envVars } = req.body;
    
    if (!name || !image) {
      return res.status(400).json({ error: 'Name and image are required' });
    }

    // Pull the image first
    console.log(`Pulling image: ${image}`);
    const stream = await docker.pull(image);
    
    // Wait for pull to complete
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err: any, output: any) => {
        if (err) reject(err);
        else resolve(output);
      });
    });

    // Determine port mapping
    // Host port is where we expose on localhost
    // Container port is typically 80 for web servers, 3000 for node apps, etc.
    const hostPort = requestedPort || getAvailablePort();
    const containerPort = 80; // Default to port 80 inside the container
    
    const portBindings: any = {};
    portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort.toString() }];

    // Parse resource limits
    const memoryBytes = memoryLimit ? parseMemoryLimit(memoryLimit) : 512 * 1024 * 1024;
    const cpuQuota = cpuLimit ? Math.floor(parseFloat(cpuLimit) * 100000) : 50000;

    // Create container
    const container = await docker.createContainer({
      Image: image,
      name: name,
      Env: envVars || [],
      ExposedPorts: {
        [`${containerPort}/tcp`]: {}
      },
      HostConfig: {
        PortBindings: portBindings,
        Memory: memoryBytes,
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      }
    });

    // Start the container
    await container.start();

    const localUrl = generateLocalUrl(hostPort);
    
    // Store metadata
    const metadata: ContainerMetadata = {
      containerId: container.id,
      name,
      image,
      port: hostPort,
      localUrl,
      status: 'running',
      createdAt: new Date().toISOString()
    };
    
    containerMetadata.set(container.id, metadata);

    console.log(`Container ${name} deployed successfully at ${localUrl}`);

    res.json({
      success: true,
      containerId: container.id,
      name,
      image,
      port: hostPort,
      localUrl,
      status: 'running',
      message: `Container deployed successfully and available at ${localUrl}`
    });
  } catch (error: any) {
    console.error('Error deploying container:', error);
    res.status(500).json({ 
      error: 'Failed to deploy container', 
      message: error.message,
      details: error.json || error.toString()
    });
  }
});

// Start a container
app.post('/api/containers/:id/start', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'running';
      containerMetadata.set(req.params.id, meta);
    }
    
    res.json({ success: true, message: 'Container started successfully' });
  } catch (error: any) {
    console.error('Error starting container:', error);
    res.status(500).json({ error: 'Failed to start container', message: error.message });
  }
});

// Stop a container
app.post('/api/containers/:id/stop', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'stopped';
      containerMetadata.set(req.params.id, meta);
    }
    
    res.json({ success: true, message: 'Container stopped successfully' });
  } catch (error: any) {
    console.error('Error stopping container:', error);
    res.status(500).json({ error: 'Failed to stop container', message: error.message });
  }
});

// Delete a container
app.delete('/api/containers/:id', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    
    // Stop first if running
    try {
      await container.stop();
    } catch (e) {
      // Container might already be stopped
    }
    
    // Remove the container
    await container.remove();
    
    // Remove metadata
    containerMetadata.delete(req.params.id);
    
    res.json({ success: true, message: 'Container deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting container:', error);
    res.status(500).json({ error: 'Failed to delete container', message: error.message });
  }
});

// Get container logs
app.get('/api/containers/:id/logs', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: true
    });
    
    res.json({ logs: logs.toString('utf8') });
  } catch (error: any) {
    console.error('Error getting container logs:', error);
    res.status(500).json({ error: 'Failed to get container logs', message: error.message });
  }
});

// Helper function to parse memory limit
function parseMemoryLimit(limit: string): number {
  const units: { [key: string]: number } = {
    'Mi': 1024 * 1024,
    'Gi': 1024 * 1024 * 1024,
    'MB': 1000 * 1000,
    'GB': 1000 * 1000 * 1000
  };
  
  for (const [unit, multiplier] of Object.entries(units)) {
    if (limit.endsWith(unit)) {
      const value = parseFloat(limit.replace(unit, ''));
      return value * multiplier;
    }
  }
  
  return parseInt(limit);
}

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`✅ Docker connection established`);
});
