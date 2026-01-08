const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export interface DeployContainerRequest {
  name: string;
  image: string;
  port?: number;
  containerPort?: number;
  cpuLimit?: string;
  memoryLimit?: string;
  envVars?: string[];
  projectName?: string;
  projectDescription?: string;
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

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // Response body is not JSON or empty
      }

      throw new Error(errorMessage);
    }

    return response.json();
  }

  private async makeRequest<T>(
    url: string,
    options?: RequestInit
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      return this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to the backend server. Please ensure the server is running.');
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ status: string; message: string }> {
    return this.makeRequest(`${this.baseUrl}/api/health`);
  }

  async deployContainer(data: DeployContainerRequest): Promise<DeploymentResponse> {
    return this.makeRequest(`${this.baseUrl}/api/containers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listContainers(): Promise<{ containers: ContainerResponse[] }> {
    return this.makeRequest(`${this.baseUrl}/api/containers`);
  }

  async listAppContainers(): Promise<{ containers: any[] }> {
    return this.makeRequest(`${this.baseUrl}/api/app/containers`);
  }

  async getContainer(id: string): Promise<any> {
    return this.makeRequest(`${this.baseUrl}/api/containers/${id}`);
  }

  async startContainer(id: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`${this.baseUrl}/api/containers/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async stopContainer(id: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`${this.baseUrl}/api/containers/${id}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async deleteContainer(id: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`${this.baseUrl}/api/containers/${id}`, {
      method: 'DELETE',
    });
  }

  async getContainerLogs(id: string): Promise<{ logs: string }> {
    return this.makeRequest(`${this.baseUrl}/api/containers/${id}/logs`);
  }

  async getMonitoringLogs(limit?: number, level?: string): Promise<any> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (level) params.append('level', level);
    
    return this.makeRequest(`${this.baseUrl}/api/monitoring/logs?${params.toString()}`);
  }

  async getMonitoringStats(): Promise<any> {
    return this.makeRequest(`${this.baseUrl}/api/monitoring/stats`);
  }

  async clearMonitoringLogs(): Promise<any> {
    return this.makeRequest(`${this.baseUrl}/api/monitoring/logs`, {
      method: 'DELETE',
    });
  }
}

export const backendAPI = new BackendAPI();
