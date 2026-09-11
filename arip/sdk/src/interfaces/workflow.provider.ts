export interface WorkflowNode {
  id: string;
  type: string;
  label?: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowConnection {
  sourceNodeId: string;
  sourceOutput: number;
  targetNodeId: string;
  targetInput: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  variables: Record<string, unknown>;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowExecutionContext {
  workflowId: string;
  triggeredBy: 'manual' | 'webhook' | 'schedule' | 'event';
  payload?: Record<string, unknown>;
  variables?: Record<string, unknown>;
}

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  nodeId?: string;
  message: string;
  data?: unknown;
}

export interface WorkflowWebhookConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  secret?: string;
}

export interface WorkflowVersion {
  version: string;
  createdAt: Date;
  description?: string;
  snapshot: WorkflowDefinition;
}

export interface WorkflowProvider {
  readonly name: string;
  readonly version: string;

  // CRUD
  createWorkflow(
    definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorkflowDefinition>;
  getWorkflow(id: string): Promise<WorkflowDefinition>;
  updateWorkflow(id: string, patch: Partial<WorkflowDefinition>): Promise<WorkflowDefinition>;
  deleteWorkflow(id: string): Promise<void>;
  listWorkflows(): Promise<WorkflowDefinition[]>;

  // Execution
  executeWorkflow(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult>;
  stopWorkflow(executionId: string): Promise<void>;
  pauseWorkflow(executionId: string): Promise<void>;
  resumeWorkflow(executionId: string): Promise<void>;
  getStatus(executionId: string): Promise<WorkflowStatus>;

  // Observability
  getLogs(executionId: string, since?: Date): Promise<WorkflowLog[]>;
  getHistory(workflowId: string, limit?: number): Promise<WorkflowExecutionResult[]>;

  // Variables
  getVariables(workflowId: string): Promise<Record<string, unknown>>;
  setVariables(workflowId: string, vars: Record<string, unknown>): Promise<void>;

  // Webhooks
  registerWebhook(workflowId: string, config: WorkflowWebhookConfig): Promise<string>;
  unregisterWebhook(webhookId: string): Promise<void>;

  // Triggers
  triggerByEvent(
    workflowId: string,
    event: string,
    payload: unknown,
  ): Promise<WorkflowExecutionResult>;

  // Versioning
  createVersion(workflowId: string, description?: string): Promise<WorkflowVersion>;
  listVersions(workflowId: string): Promise<WorkflowVersion[]>;
  restoreVersion(workflowId: string, version: string): Promise<WorkflowDefinition>;
}
