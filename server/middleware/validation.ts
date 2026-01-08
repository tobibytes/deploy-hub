import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export const validateDeployContainer = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, image } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('Container name is required and must be a non-empty string', 400);
  }

  if (!image || typeof image !== 'string' || image.trim().length === 0) {
    throw new AppError('Docker image is required and must be a non-empty string', 400);
  }

  // Validate container name format (Docker naming rules)
  const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!nameRegex.test(name)) {
    throw new AppError(
      'Container name must start with an alphanumeric character and can only contain alphanumeric characters, underscores, periods, and hyphens',
      400
    );
  }

  // Validate optional fields
  if (req.body.port !== undefined) {
    const port = parseInt(req.body.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new AppError('Port must be a number between 1 and 65535', 400);
    }
  }

  if (req.body.containerPort !== undefined) {
    const containerPort = parseInt(req.body.containerPort);
    if (isNaN(containerPort) || containerPort < 1 || containerPort > 65535) {
      throw new AppError('Container port must be a number between 1 and 65535', 400);
    }
  }

  if (req.body.cpuLimit !== undefined) {
    const cpuLimit = parseFloat(req.body.cpuLimit);
    if (isNaN(cpuLimit) || cpuLimit <= 0) {
      throw new AppError('CPU limit must be a positive number', 400);
    }
  }

  if (req.body.memoryLimit !== undefined && typeof req.body.memoryLimit !== 'string') {
    throw new AppError('Memory limit must be a string (e.g., "512Mi", "1Gi")', 400);
  }

  next();
};

export const validateContainerId = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new AppError('Container ID is required', 400);
  }

  next();
};
