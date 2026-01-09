import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import Docker from 'dockerode';
import getPort from 'get-port';
import { exec } from 'child_process';
import { promisify } from 'util';
import { errorHandler, notFoundHandler, asyncHandler, AppError } from './middleware/errorHandler';
import { query } from './db';
import { validateDeployContainer, validateContainerId } from './middleware/validation';
import { logger } from './services/logger';
import { AuthRequest, authenticateToken, requireAdmin } from './middleware/auth';
import authRoutes from './routes/auth';

const execAsync = promisify(exec);

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
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentLength = req.headers['content-length'];
    const hasBody = contentLength && !isNaN(parseInt(contentLength)) && parseInt(contentLength) > 0;
    
    if (hasBody) {
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
  publicUrl?: string;
  status: string;
  createdAt: string;
}

const containerMetadata: Map<string, ContainerMetadata> = new Map();

// Helper function to generate local URL
function generateLocalUrl(port: number): string {
  return `http://localhost:${port}`;
}

// Helper function to setup Cloudflare tunnel for a container
async function setupCloudfareTunnel(containerName: string, localPort: number, existingHostname?: string): Promise<string | null> {
  try {
    // Use host home directory when backend is on host machine
    const defaultCertPath = process.env.HOME ? `${process.env.HOME}/.cloudflared/cert.pem` : `${process.env.USERPROFILE}/.cloudflared/cert.pem`;
    const certPath = process.env.CF_CERT_FILE || defaultCertPath;
    const domain = process.env.CF_DOMAIN || 'tobiolajide.com';
    const tunnelName = process.env.CF_TUNNEL_NAME || 'lumen';
    
    // Use existing hostname if provided, otherwise generate a new one
    let hostname: string;
    if (existingHostname) {
      // Extract hostname from full URL if needed
      hostname = existingHostname.replace(/^https?:\/\//, '');
      logger.info('Refreshing Cloudflare tunnel with existing hostname', { containerName, hostname, localPort });
    } else {
      // Generate hostname from container name
      const nameSlug = containerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const rand = Math.random().toString(36).substring(2, 10);
      hostname = `dep-${nameSlug}-${rand}.${domain}`;
      logger.info('Setting up new Cloudflare tunnel', { containerName, hostname, localPort });
    }
    
    // When running in a container, use host.docker.internal to reach the host machine
    // where the deployed containers are running via Docker socket
    const localServiceHost = process.env.DOCKER_HOST ? 'host.docker.internal' : '127.0.0.1';
    const localService = `http://${localServiceHost}:${localPort}`;
    
    const env = {
      ...process.env,
      CF_HOSTNAME: hostname,
      CONTAINER_NAME: containerName,
      LOCAL_SERVICE: localService,
      CERT_FILE: certPath,
      CF_TUNNEL_NAME: tunnelName,
      DEFAULT_DOMAIN: domain
    };
    
    const scriptPath = process.env.PUBLIC_URL_SCRIPT || './scripts/public-url.sh';
    const { stdout, stderr } = await execAsync(scriptPath, { env, cwd: process.cwd() });
    
    logger.info('Cloudflare tunnel setup complete', { hostname, stdout });
    if (stderr) {
      logger.warn('Tunnel setup stderr', { stderr });
    }
    
    return `https://${hostname}`;
  } catch (error: any) {
    logger.error('Failed to setup Cloudflare tunnel', { 
      containerName, 
      error: error.message, 
      stderr: error.stderr,
      stdout: error.stdout 
    });
    return null;
  }
}

// Helper function to refresh tunnel configuration after container restart/recreation
async function refreshTunnelConfiguration(containerId: string, containerName: string): Promise<void> {
  const enablePublicUrl = process.env.ENABLE_PUBLIC_URL !== 'false';
  if (!enablePublicUrl) {
    logger.info('Public URL disabled, skipping tunnel refresh', { containerId });
    return;
  }

  try {
    // Get existing public URL from metadata or database
    const meta = containerMetadata.get(containerId);
    let existingHostname: string | undefined;
    
    if (meta?.publicUrl) {
      existingHostname = meta.publicUrl;
    } else {
      // Try to get from database
      const dbResult = await query(
        `SELECT public_url FROM deploy_containers WHERE docker_container_id = $1`,
        [containerId]
      );
      if (dbResult.rows.length > 0 && dbResult.rows[0].public_url) {
        existingHostname = dbResult.rows[0].public_url;
      }
    }

    if (existingHostname) {
      // Get actual port from Docker inspect
      const container = docker.getContainer(containerId);
      const inspectData = await container.inspect();
      
      // Extract host port from port bindings
      let hostPort: number | undefined;
      const ports = inspectData.NetworkSettings?.Ports;
      if (ports) {
        // Get the first mapped port
        for (const [containerPort, bindings] of Object.entries(ports)) {
          if (bindings && Array.isArray(bindings) && bindings.length > 0 && bindings[0].HostPort) {
            hostPort = parseInt(bindings[0].HostPort, 10);
            break;
          }
        }
      }
      
      if (!hostPort) {
        logger.warn('Could not determine host port from Docker inspect, skipping tunnel refresh', { containerId });
        return;
      }
      
      logger.info('Refreshing tunnel configuration for container', { 
        containerId, 
        containerName, 
        hostPort,
        existingHostname 
      });
      
      // Refresh the tunnel with the existing hostname but new port
      const publicUrl = await setupCloudfareTunnel(containerName, hostPort, existingHostname);
      
      if (publicUrl) {
        // Update metadata
        if (meta) {
          meta.publicUrl = publicUrl;
          meta.port = hostPort;
          containerMetadata.set(containerId, meta);
        }
        
        // Update database
        await query(
          `UPDATE deploy_containers SET public_url = $1, port = $2, updated_at = now() 
           WHERE docker_container_id = $3`,
          [publicUrl, hostPort, containerId]
        ).catch((err) => {
          logger.warn('Failed to update public URL in database', { containerId, error: err.message });
        });
        
        logger.info('Tunnel configuration refreshed successfully', { containerId, publicUrl, hostPort });
      }
    } else {
      logger.info('No existing public URL found, skipping tunnel refresh', { containerId });
    }
  } catch (error: any) {
    logger.error('Failed to refresh tunnel configuration', {
      containerId,
      error: error.message,
      stack: error.stack
    });
    // Don't throw - tunnel refresh is best-effort
  }
}

// Helper function to find an available port with retries
async function getAvailablePort(maxRetries = 10): Promise<number> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Generate random port in range 8000-65535
      const randomStart = Math.floor(Math.random() * 57536) + 8000;
      const portRange = Array.from({ length: 1000 }, (_, idx) => randomStart + idx);
      const port = await getPort({ port: portRange });
      
      // Verify port is actually available by trying to bind to it
      return port;
    } catch (error) {
      logger.warn(`Port selection attempt ${i + 1} failed, retrying...`, { error });
      if (i === maxRetries - 1) {
        throw new AppError('Unable to find available port after multiple attempts', 500);
      }
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new AppError('Failed to allocate port', 500);
}

// Auth routes
app.use('/api/auth', authRoutes);

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

// Deploy a new container (also persists to database)
app.post('/api/containers', authenticateToken, validateDeployContainer, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, image, port: requestedPort, containerPort: requestedContainerPort, cpuLimit, memoryLimit, envVars, projectName, projectDescription } = req.body;
  const userId = req.userId; // Get userId from authenticated request
  
  logger.info('Deploying new container', { name, image }, undefined, userId);

  // Pull the image first
  logger.info(`Pulling image: ${image}`, undefined, undefined, userId);
  let stream;
  try {
    stream = await docker.pull(image);
  } catch (error: any) {
    logger.error('Failed to pull image', { image, error: error.message }, undefined, userId);
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
    logger.info('Image pulled successfully', { image }, undefined, userId);
  } catch (error: any) {
    logger.error('Error during image pull', { image, error: error.message }, undefined, userId);
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
    logger.info('Container created', { name, containerId: container.id }, undefined, userId);
  } catch (error: any) {
    logger.error('Failed to create container', { name, image, error: error.message }, undefined, userId);
    if (error.statusCode === 409) {
      throw new AppError(`A container with name "${name}" already exists. Please choose a different name.`, 409);
    }
    throw new AppError(`Failed to create container: ${error.message}`, 500);
  }

  // Start the container
  try {
    await container.start();
    logger.info('Container started', { name, containerId: container.id }, undefined, userId);
  } catch (error: any) {
    logger.error('Failed to start container', { name, containerId: container.id, error: error.message }, undefined, userId);
    // Try to remove the failed container
    try {
      await container.remove();
    } catch (removeError) {
      logger.warn('Failed to cleanup container after start failure', { containerId: container.id }, userId);
    }
    throw new AppError(`Container created but failed to start: ${error.message}`, 500);
  }

  const localUrl = generateLocalUrl(hostPort);
  
  // Setup public URL via Cloudflare tunnel (best-effort)
  let publicUrl: string | null = null;
  const enablePublicUrl = process.env.ENABLE_PUBLIC_URL !== 'false';
  if (enablePublicUrl) {
    publicUrl = await setupCloudfareTunnel(name, hostPort);
  }
  
  // Store metadata
  const metadata: ContainerMetadata = {
    containerId: container.id,
    name,
    image,
    port: hostPort,
    localUrl,
    publicUrl: publicUrl || undefined,
    status: 'running',
    createdAt: new Date().toISOString()
  };
  
  containerMetadata.set(container.id, metadata);

  // Persist to database (best-effort)
  try {
    // Use authenticated user's ID
    // Upsert project by name for this user
    const projectResult = await query<{ id: string }>(
      `INSERT INTO deploy_projects (user_id, name, description, framework)
       VALUES ($1, $2, $3, 'docker')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [userId, projectName || name, projectDescription || null]
    ).catch(async (e) => {
      // If above fails due to unique constraints not matching, try to find by name
      const existing = await query<{ id: string }>(`SELECT id FROM deploy_projects WHERE user_id = $1 AND name = $2 LIMIT 1`, [userId, projectName || name]);
      return { rows: existing.rows } as any;
    });
    const projectId = projectResult.rows[0]?.id || (
      await query<{ id: string }>(`SELECT id FROM deploy_projects WHERE user_id = $1 AND name = $2 LIMIT 1`, [userId, projectName || name])
    ).rows[0]?.id;

    await query(
      `INSERT INTO deploy_containers (
        project_id, user_id, name, image, status, port, container_port, docker_container_id, local_url, public_url, cpu_limit, memory_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [projectId, userId, name, image, 'running', hostPort, containerPort, container.id, localUrl, publicUrl, cpuLimit || '0.5', memoryLimit || '512Mi']
    );

    await query(
      `INSERT INTO deploy_deployments (container_id, user_id, status, finished_at)
       VALUES (
         (SELECT id FROM deploy_containers WHERE docker_container_id = $1 LIMIT 1),
         $2,
         'success',
         now()
       )`,
      [container.id, userId]
    );
  } catch (dbErr: any) {
    logger.warn('Failed to persist container metadata to DB', { error: dbErr?.message }, userId);
  }

  logger.info(`Container ${name} deployed successfully`, { containerId: container.id, localUrl }, undefined, userId);

  res.json({
    success: true,
    containerId: container.id,
    name,
    image,
    port: hostPort,
    localUrl,
    publicUrl,
    status: 'running',
    message: publicUrl 
      ? `Container deployed successfully. Local: ${localUrl}, Public: ${publicUrl}`
      : `Container deployed successfully and available at ${localUrl}`
  });
}));

// Start a container
app.post('/api/containers/:id/start', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get container name for tunnel refresh
    const dbResult = await query(
      `SELECT name FROM deploy_containers WHERE docker_container_id = $1`,
      [req.params.id]
    );
    
    const container = docker.getContainer(req.params.id);
    await container.start();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'running';
      containerMetadata.set(req.params.id, meta);
    }
    
    // Update DB status
    try {
      await query(`UPDATE deploy_containers SET status = 'running', updated_at = now() WHERE docker_container_id = $1`, [req.params.id]);
    } catch {}
    
    // Refresh tunnel configuration if container has public URL (best-effort)
    if (dbResult.rows.length > 0 && dbResult.rows[0].name) {
      const containerName = dbResult.rows[0].name;
      await refreshTunnelConfiguration(req.params.id, containerName);
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
    
    // Update DB status
    try {
      await query(`UPDATE deploy_containers SET status = 'stopped', updated_at = now() WHERE docker_container_id = $1`, [req.params.id]);
    } catch {}
    logger.info('Container stopped', { containerId: req.params.id });
    res.json({ success: true, message: 'Container stopped successfully' });
  } catch (error: any) {
    logger.error('Error stopping container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 304) {
      throw new AppError('Container is already stopped', 400);
    }
    if (error.statusCode === 404) {
      // Container doesn't exist in Docker - might have been recreated with new ID
      // Clean up the database record
      await query(`DELETE FROM deploy_containers WHERE docker_container_id = $1`, [req.params.id]).catch(() => {});
      throw new AppError(`Container not found. It may have been recreated. Please refresh the page.`, 404);
    }
    throw new AppError(`Failed to stop container: ${error.message}`, 500);
  }
}));

// Delete a container
app.delete('/api/containers/:id', validateContainerId, asyncHandler(async (req: Request, res: Response) => {
  try {
    logger.info('Delete container request', { containerId: req.params.id });
    const container = docker.getContainer(req.params.id);
    
    // Stop first if running
    try {
      await container.stop();
      logger.info('Container stopped before deletion', { containerId: req.params.id });
    } catch (e: any) {
      if (e.statusCode !== 304 && e.statusCode !== 404) {
        logger.warn('Container may already be stopped', { containerId: req.params.id, error: e.message });
      }
    }
    
    // Remove the container
    await container.remove();
    logger.info('Container removed from Docker', { containerId: req.params.id });
    
    // Remove metadata and DB record
    containerMetadata.delete(req.params.id);
    try {
      const result = await query(`DELETE FROM deploy_containers WHERE docker_container_id = $1`, [req.params.id]);
      logger.info('Container deleted from DB', { containerId: req.params.id, rowsAffected: result.rowCount });
    } catch (dbErr: any) {
      logger.error('Failed to delete from DB', { containerId: req.params.id, error: dbErr.message });
    }
    
    logger.info('Container deleted successfully', { containerId: req.params.id });
    res.json({ success: true, message: 'Container deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting container', { containerId: req.params.id, error: error.message, stack: error.stack });
    if (error.statusCode === 404) {
      // Container doesn't exist in Docker - clean up DB and return success
      containerMetadata.delete(req.params.id);
      await query(`DELETE FROM deploy_containers WHERE docker_container_id = $1`, [req.params.id]).catch(() => {});
      logger.info('Container already removed from Docker, cleaned up database', { containerId: req.params.id });
      return res.json({ success: true, message: 'Container deleted successfully (already removed from Docker)' });
    }
    throw new AppError(`Failed to delete container: ${error.message}`, 500);
  }
}));

// Application containers listing from DB (joined with project) - filtered by user
app.get('/api/app/containers', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const result = await query(
      `SELECT c.id,
              c.docker_container_id,
              c.name,
              c.image,
              c.status,
              c.port,
              c.local_url,
              c.public_url,
              c.cpu_limit,
              c.memory_limit,
              c.project_id,
              c.created_at,
              p.name as project_name
       FROM deploy_containers c
       LEFT JOIN deploy_projects p ON p.id = c.project_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    res.json({ containers: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch app containers from DB', { error: error?.message });
    throw new AppError('Failed to fetch containers', 500);
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

// Get environment variables for a container
app.get('/api/containers/:id/env', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT environment_variables FROM deploy_containers WHERE docker_container_id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError('Container not found', 404);
    }
    
    const envVars = result.rows[0].environment_variables || {};
    logger.info('Retrieved environment variables', { containerId: req.params.id });
    res.json({ environmentVariables: envVars });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error('Error getting environment variables', { containerId: req.params.id, error: error.message });
    throw new AppError('Failed to get environment variables', 500);
  }
}));

// Update environment variables for a container
app.put('/api/containers/:id/env', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const { environmentVariables } = req.body;
    
    if (!environmentVariables || typeof environmentVariables !== 'object') {
      throw new AppError('Invalid environment variables format', 400);
    }
    
    // Get container info from database
    const dbResult = await query(
      `SELECT id, docker_container_id, image, port, container_port, name, cpu_limit, memory_limit 
       FROM deploy_containers 
       WHERE docker_container_id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    
    if (dbResult.rows.length === 0) {
      throw new AppError('Container not found', 404);
    }
    
    const containerData = dbResult.rows[0];
    const containerPort = containerData.container_port || 80; // Default to 80 if not set
    
    // Update the database with new env vars
    await query(
      `UPDATE deploy_containers SET environment_variables = $1, updated_at = now() 
       WHERE docker_container_id = $2 AND user_id = $3`,
      [JSON.stringify(environmentVariables), req.params.id, req.userId]
    );
    
    // Try to recreate the container with new env vars
    try {
      const container = docker.getContainer(req.params.id);
      
      // Stop the container
      await container.stop().catch(() => {}); // Ignore if already stopped
      
      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Remove the old container
      await container.remove({ force: true }).catch(() => {});
      
      // Prepare environment variables array
      const envArray = Object.entries(environmentVariables)
        .map(([key, value]) => `${key}=${value}`);
      
      // Prepare port bindings (format: "80/tcp" -> [{ HostPort: "8080" }])
      const exposedPorts: any = {};
      const portBindings: any = {};
      
      if (containerData.port) {
        const containerPortStr = `${containerPort}/tcp`;
        exposedPorts[containerPortStr] = {};
        portBindings[containerPortStr] = [{ HostPort: containerData.port.toString() }];
      }
      
      // Create a new container with the same settings but new env vars
      const newContainer = await docker.createContainer({
        Image: containerData.image,
        name: containerData.name,
        Env: envArray,
        ExposedPorts: exposedPorts,
        HostConfig: {
          PortBindings: portBindings,
          Memory: parseMemoryLimit(containerData.memory_limit || '512Mi'),
          CpuQuota: Math.round(parseFloat(containerData.cpu_limit || '0.5') * 100000),
          CpuPeriod: 100000,
          RestartPolicy: {
            Name: 'unless-stopped'
          }
        },
      });
      
      // Update the database with the new container ID
      await query(
        `UPDATE deploy_containers SET docker_container_id = $1, status = 'running', updated_at = now() 
         WHERE id = $2`,
        [newContainer.id, containerData.id]
      );
      
      // Start the new container
      await newContainer.start();
      
      // Refresh tunnel configuration for the new container (best-effort)
      await refreshTunnelConfiguration(newContainer.id, containerData.name);
      
      logger.info('Environment variables updated and container recreated', { 
        oldContainerId: req.params.id,
        newContainerId: newContainer.id,
        envVarsCount: Object.keys(environmentVariables).length 
      });
      
      res.json({ 
        success: true, 
        message: 'Environment variables updated and container restarted successfully',
        environmentVariables,
        newContainerId: newContainer.id
      });
    } catch (dockerErr: any) {
      logger.error('Error recreating container with new env vars', { containerId: req.params.id, error: dockerErr.message });
      // Even if restart fails, the variables were saved in DB
      res.json({ 
        success: true, 
        message: 'Environment variables saved, but failed to restart container. Please restart manually.',
        environmentVariables,
        restartError: dockerErr.message
      });
    }
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error('Error updating environment variables', { containerId: req.params.id, error: error.message });
    throw new AppError('Failed to update environment variables', 500);
  }
}));

// Restart a container
app.post('/api/containers/:id/restart', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    // Verify container belongs to user and get container name
    const result = await query(
      `SELECT name FROM deploy_containers WHERE docker_container_id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError('Container not found', 404);
    }
    
    const containerName = result.rows[0].name;
    const container = docker.getContainer(req.params.id);
    await container.restart();
    
    // Update metadata
    const meta = containerMetadata.get(req.params.id);
    if (meta) {
      meta.status = 'running';
      containerMetadata.set(req.params.id, meta);
    }
    
    // Update DB status
    try {
      await query(`UPDATE deploy_containers SET status = 'running', updated_at = now() WHERE docker_container_id = $1`, [req.params.id]);
    } catch {}
    
    // Refresh tunnel configuration with current port (best-effort)
    await refreshTunnelConfiguration(req.params.id, containerName);
    
    logger.info('Container restarted', { containerId: req.params.id });
    res.json({ success: true, message: 'Container restarted successfully' });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error('Error restarting container', { containerId: req.params.id, error: error.message });
    if (error.statusCode === 404) {
      throw new AppError(`Container not found: ${req.params.id}`, 404);
    }
    throw new AppError(`Failed to restart container: ${error.message}`, 500);
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

// Monitoring endpoints - require authentication
app.get('/api/monitoring/logs', authenticateToken, (req: AuthRequest, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const level = req.query.level as 'error' | 'warn' | 'info' | undefined;
  const userId = req.userId; // Get userId from authenticated request
  
  const logs = logger.getLogs(limit, level, userId);
  res.json({ logs, count: logs.length });
});

app.get('/api/monitoring/stats', authenticateToken, (req: AuthRequest, res: Response) => {
  const userId = req.userId; // Get userId from authenticated request
  const stats = logger.getStats(userId);
  res.json(stats);
});

app.delete('/api/monitoring/logs', authenticateToken, (req: AuthRequest, res: Response) => {
  // Note: This clears ALL logs, not just user's logs
  // You might want to implement user-specific log clearing if needed
  logger.clearLogs();
  res.json({ success: true, message: 'Logs cleared successfully' });
});

// Admin endpoints - show all logs (no user filter)
app.get('/api/admin/logs', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const level = req.query.level as 'error' | 'warn' | 'info' | undefined;
  
  // Get all logs without user filter for admin view
  const logs = logger.getLogs(limit, level);
  res.json({ logs, count: logs.length });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, (req: AuthRequest, res: Response) => {
  // Get stats for all logs
  const stats = logger.getStats();
  res.json(stats);
});

// Get deployments for a user
app.get('/api/deployments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await query(
      `SELECT 
        d.id,
        d.status,
        d.started_at,
        d.finished_at,
        d.created_at,
        c.name as container_name,
        c.image as container_image,
        p.name as project_name
       FROM deploy_deployments d
       JOIN deploy_containers c ON d.container_id = c.id
       LEFT JOIN deploy_projects p ON c.project_id = p.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({ 
      deployments: result.rows,
      count: result.rows.length,
      limit,
      offset
    });
  } catch (error: any) {
    logger.error('Error fetching deployments', { error: error.message });
    throw new AppError('Failed to fetch deployments', 500);
  }
}));

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`✅ Docker connection established`);
  logger.info('Backend server started', { port: PORT });
});
