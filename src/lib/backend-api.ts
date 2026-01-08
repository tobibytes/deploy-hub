const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface DeployContainerRequest {
  name: string;
  image: string;
  port?: number;
  cpuLimit?: string;
  memoryLimit?: string;
  envVars?: string[];
}

export interface ContainerResponse {
  id: string;
  containerId: string;
  name: string;
  image: string;
  status: string;
  port?: number;
  localUrl?: string;
  created?: number;
  ports?: any[];
}

export interface DeploymentResponse {
  success: boolean;
  containerId: string;
  name: string;
  image: string;
  port: number;
  localUrl: string;
  status: string;
  message: string;
}

class BackendAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = BACKEND_URL;
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/health`);
    if (!response.ok) {
      throw new Error('Backend server is not responding');
    }
    return response.json();
  }

  async deployContainer(data: DeployContainerRequest): Promise<DeploymentResponse> {
    const response = await fetch(`${this.baseUrl}/api/containers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to deploy container');
    }

    return response.json();
  }

  async listContainers(): Promise<{ containers: ContainerResponse[] }> {
    const response = await fetch(`${this.baseUrl}/api/containers`);
    if (!response.ok) {
      throw new Error('Failed to list containers');
    }
    return response.json();
  }

  async getContainer(id: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/containers/${id}`);
    if (!response.ok) {
      throw new Error('Failed to get container details');
    }
    return response.json();
  }

  async startContainer(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/containers/${id}/start`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to start container');
    }

    return response.json();
  }

  async stopContainer(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/containers/${id}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to stop container');
    }

    return response.json();
  }

  async deleteContainer(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/containers/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete container');
    }

    return response.json();
  }

  async getContainerLogs(id: string): Promise<{ logs: string }> {
    const response = await fetch(`${this.baseUrl}/api/containers/${id}/logs`);
    if (!response.ok) {
      throw new Error('Failed to get container logs');
    }
    return response.json();
  }
}

export const backendAPI = new BackendAPI();
