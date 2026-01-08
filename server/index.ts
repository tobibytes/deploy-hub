import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import Docker from 'dockerode';
import getPort from 'get-port';
import { errorHandler, notFoundHandler, asyncHandler, AppError } from './middleware/errorHandler';
import { validateDeployContainer, validateContainerId } from './middleware/validation';
import { logger } from './services/logger';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Initialize Docker with error handling
let docker: Docker;
try {
  docker = new Docker({ socketPath: '/var/run/docker.sock' });
  logger.info('Docker connection initialized');
} catch (error) {
  logger.error('Failed to initialize Docker connection', { error: error instanceof Error ? error.message : String(error) });
  throw error;
}

// Middleware
app.use(cors());
app.use(express.json({ 
  limit: '10mb',
  // Handle JSON parsing errors
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      throw new AppError('Invalid JSON in request body', 400);
    }
  }
}));

// Middleware to check Content-Type for POST/PUT/PATCH requests with body
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length'] && parseInt(req.headers['content-length']) > 0) {
    const contentType = req.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Content-Type must be application/json for requests with body',
        statusCode: 400,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip, 
    userAgent: req.get('user-agent') 
  });
  next();
});

// Store container metadata (in production, this would be in a database)
// NOTE: This in-memory store will be lost on server restart. In production:
// 1. Sync with Supabase database on startup to restore state
// 2. Or query Docker directly and update database accordingly
// 3. Consider implementing a persistence layer or state recovery mechanism
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
async function getAvailablePort(): Promise<number> {
  // Use get-port to find an actually available port in the range 8080-8999
  const portRange = Array.from({ length: 920 }, (_, i) => 8080 + i);
  return await getPort({ port: portRange });
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    docker: 'connected'
  });
});

// List all containers
app.get('/api/containers', asyncHandler(async (req: Request, res: Response) => {
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
    
    logger.info('Listed containers successfully', { count: containerDetails.length });
    res.json({ containers: containerDetails });
  } catch (error: any) {
    logger.error('Error listing containers', { error: error.message, stack: error.stack });
    throw new AppError(`Failed to list containers: ${error.message}`, 500);
  }
}));

// Get container details
app.get('/api/containers/:id', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    const meta = containerMetadata.get(req.params.id) || {};
    
    logger.info('Retrieved container details', { containerId: req.params.id });
    res.json({
      ...info,
      metadata: meta
    });
  } catch (error: any) {
    logger.error('Error getting container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to get container details: ${error.message}`, 500);
  }
}));

// Deploy a new container
app.post('/api/containers', validateDeployContainer, asyncHandler(async (req: Request, res: Response) => {
  const { name, image, port: requestedPort, containerPort: requestedContainerPort, cpuLimit, memoryLimit, envVars } = req.body;
  
  logger.info('Deploying new container', { name, image });

  // Pull the image first
  logger.info(`Pulling image: ${image}`);
  let stream;
  try {
    stream = await docker.pull(image);
  } catch (error: any) {
    logger.error('Failed to pull image', { image, error: error.message });
    throw new AppError(`Failed to pull Docker image "${image}". Please verify the image name is correct and accessible.`, 400);
  }
  
  // Wait for pull to complete
  try {
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err: any, output: any) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
    logger.info('Image pulled successfully', { image });
  } catch (error: any) {
    logger.error('Error during image pull', { image, error: error.message });
    throw new AppError(`Failed to pull Docker image: ${error.message}`, 500);
  }

  // Determine port mapping
  const hostPort = requestedPort || await getAvailablePort();
  const containerPort = requestedContainerPort || 80;
  
  const portBindings: any = {};
  portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort.toString() }];

  // Parse resource limits
  const memoryBytes = memoryLimit ? parseMemoryLimit(memoryLimit) : 512 * 1024 * 1024;
  const cpuQuota = cpuLimit ? Math.floor(parseFloat(cpuLimit) * 100000) : 50000;

  // Create container
  let container;
  try {
    container = await docker.createContainer({
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
    logger.info('Container created', { name, containerId: container.id });
  } catch (error: any) {
    logger.error('Failed to create container', { name, image, error: error.message });
    if (error.statusCode === 409) {
      throw new AppError(`A container with name "${name}" already exists. Please choose a different name.`, 409);
    }
    throw new AppError(`Failed to create container: ${error.message}`, 500);
  }

  // Start the container
  try {
    await container.start();
    logger.info('Container started', { name, containerId: container.id });
  } catch (error: any) {
    logger.error('Failed to start container', { name, containerId: container.id, error: error.message });
    // Try to remove the failed container
    try {
      await container.remove();
    } catch (removeError) {
      logger.warn('Failed to cleanup container after start failure', { containerId: container.id });
    }
    throw new AppError(`Container created but failed to start: ${error.message}`, 500);
  }

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

  logger.info(`Container ${name} deployed successfully`, { containerId: container.id, localUrl });

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
}));

// Start a container
app.post('/api/containers/:id/start', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'running';
      containerMetadata.set(req.params.id, meta);
    }
    
    logger.info('Container started', { containerId: req.params.id });
    res.json({ success: true, message: 'Container started successfully' });
  } catch (error: any) {
    logger.error('Error starting container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 304) {
      throw new AppError('Container is already running', 400);
    }
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to start container: ${error.message}`, 500);
  }
}));

// Stop a container
app.post('/api/containers/:id/stop', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'stopped';
      containerMetadata.set(req.params.id, meta);
    }
    
    logger.info('Container stopped', { containerId: req.params.id });
    res.json({ success: true, message: 'Container stopped successfully' });
  } catch (error: any) {
    logger.error('Error stopping container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 304) {
      throw new AppError('Container is already stopped', 400);
    }
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to stop container: ${error.message}`, 500);
  }
}));

// Delete a container
app.delete('/api/containers/:id', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    
    // Stop first if running
    try {
      await container.stop();
      logger.info('Container stopped before deletion', { containerId: req.params.id });
    } catch (e: any) {
      if (e.statusCode !== 304) {
        logger.warn('Container may already be stopped', { containerId: req.params.id });
      }
    }
    
    // Remove the container
    await container.remove();
    
    // Remove metadata
    containerMetadata.delete(req.params.id);
    
    logger.info('Container deleted', { containerId: req.params.id });
    res.json({ success: true, message: 'Container deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to delete container: ${error.message}`, 500);
  }
}));

// Get container logs
app.get('/api/containers/:id/logs', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: true
    });
    
    logger.info('Retrieved container logs', { containerId: req.params.id });
    res.json({ logs: logs.toString('utf8') });
  } catch (error: any) {
    logger.error('Error getting container logs', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to get container logs: ${error.message}`, 500);
  }
}));

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

// Monitoring endpoints
app.get('/api/monitoring/logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const level = req.query.level as 'error' | 'warn' | 'info' | undefined;
  
  const logs = logger.getLogs(limit, level);
  res.json({ logs, count: logs.length });
});

app.get('/api/monitoring/stats', (req: Request, res: Response) => {
  const stats = logger.getStats();
  res.json(stats);
});

app.delete('/api/monitoring/logs', (req: Request, res: Response) => {
  logger.clearLogs();
  res.json({ success: true, message: 'Logs cleared successfully' });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`✅ Docker connection established`);
  logger.info('Backend server started', { port: PORT });
});
