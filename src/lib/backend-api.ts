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
    const token = this.getAuthToken();
    return this.makeRequest(`${this.baseUrl}/api/containers`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  async listContainers(): Promise<{ containers: ContainerResponse[] }> {
    return this.makeRequest(`${this.baseUrl}/api/containers`);
  }

  async listAppContainers(): Promise<{ containers: any[] }> {
    const token = this.getAuthToken();
    return this.makeRequest(`${this.baseUrl}/api/app/containers`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
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
    const token = this.getAuthToken();
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (level) params.append('level', level);
    
    return this.makeRequest(`${this.baseUrl}/api/monitoring/logs?${params.toString()}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  async getMonitoringStats(): Promise<any> {
    const token = this.getAuthToken();
    return this.makeRequest(`${this.baseUrl}/api/monitoring/stats`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  async clearMonitoringLogs(): Promise<any> {
    const token = this.getAuthToken();
    return this.makeRequest(`${this.baseUrl}/api/monitoring/logs`, {
      method: 'DELETE',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  // Admin endpoints
  async getAdminLogs(limit?: number, level?: string): Promise<any> {
    const token = this.getAuthToken();
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (level) params.append('level', level);
    
    return this.makeRequest(`${this.baseUrl}/api/admin/logs?${params.toString()}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  async getAdminStats(): Promise<any> {
    const token = this.getAuthToken();
    return this.makeRequest(`${this.baseUrl}/api/admin/stats`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
  }

  // Auth endpoints
  async signup(email: string, password: string, fullName?: string): Promise<{ user: any; token: string }> {
    const response = await this.makeRequest<{ data: { user: any; token: string } }>(
      `${this.baseUrl}/api/auth/signup`,
      {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName }),
      }
    );
    // Store token in localStorage
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  }

  async signin(email: string, password: string): Promise<{ user: any; token: string }> {
    const response = await this.makeRequest<{ data: { user: any; token: string } }>(
      `${this.baseUrl}/api/auth/signin`,
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    // Store token in localStorage
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  }

  async getCurrentUser(): Promise<{ user: any }> {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    const response = await this.makeRequest<{ data: { user: any } }>(
      `${this.baseUrl}/api/auth/me`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    return response.data;
  }

  signout(): void {
    localStorage.removeItem('authToken');
  }

  getAuthToken(): string | null {
    return localStorage.getItem('authToken');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await this.makeRequest<{ success: boolean; message: string }>(
      `${this.baseUrl}/api/auth/change-password`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      }
    );
    return response;
  }

  async getContainerEnvironmentVariables(containerId: string): Promise<{ environmentVariables: Record<string, string> }> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    return this.makeRequest(
      `${this.baseUrl}/api/containers/${containerId}/env`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
  }

  async updateContainerEnvironmentVariables(
    containerId: string,
    environmentVariables: Record<string, string>
  ): Promise<{ success: boolean; message: string; environmentVariables: Record<string, string>; newContainerId?: string; restartError?: string }> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    return this.makeRequest(
      `${this.baseUrl}/api/containers/${containerId}/env`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ environmentVariables }),
      }
    );
  }

  async restartContainer(containerId: string): Promise<{ success: boolean; message: string }> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    return this.makeRequest(
      `${this.baseUrl}/api/containers/${containerId}/restart`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      }
    );
  }
}

export const backendAPI = new BackendAPI();
