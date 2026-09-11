import axios, { AxiosInstance, AxiosError } from 'axios';

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow '${id}' not found in Node-RED`);
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowConflictError';
  }
}

export class NodeRedApiClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        'Node-RED-API-Version': 'v2',
      },
      timeout: 15_000,
    });
  }

  async request<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: unknown,
    retries = 3,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.http.request<T>({ method, url: path, data });
        return response.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        if (axiosErr.response?.status === 404) throw new WorkflowNotFoundError(path);
        if (axiosErr.response?.status === 409) throw new WorkflowConflictError(String(axiosErr.response.data));
        lastError = axiosErr;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }
    throw lastError;
  }

  getFlows() {
    return this.request<unknown[]>('get', '/flows');
  }

  getFlow(id: string) {
    return this.request<Record<string, unknown>>('get', `/flow/${id}`);
  }

  postFlows(body: unknown) {
    return this.request<void>('post', '/flows', body);
  }

  putFlow(id: string, body: unknown) {
    return this.request<void>('put', `/flow/${id}`, body);
  }

  deleteFlow(id: string) {
    return this.request<void>('delete', `/flow/${id}`);
  }

  postInject(nodeId: string) {
    return this.request<void>('post', `/inject/${nodeId}`);
  }
}
