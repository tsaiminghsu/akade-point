import { createId } from '@paralleldrive/cuid2';
import type {
  WorkflowProvider,
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowExecutionResult,
  WorkflowStatus,
  WorkflowLog,
  WorkflowWebhookConfig,
  WorkflowVersion,
} from '@arip/sdk';
import { NodeRedApiClient } from './node-red-api.client';

/**
 * Maps Node-RED's flow JSON structure to ARIP's WorkflowDefinition.
 * Node-RED flows are arrays of node objects; we wrap them in our schema.
 */
export class NodeRedAdapter implements WorkflowProvider {
  readonly name = 'node-red';
  readonly version = '3.x';

  private readonly client: NodeRedApiClient;

  constructor(baseUrl: string, apiKey: string) {
    this.client = new NodeRedApiClient(baseUrl, apiKey);
  }

  async createWorkflow(
    definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorkflowDefinition> {
    const tabNode = {
      id: createId(),
      type: 'tab',
      label: definition.name,
      disabled: false,
      info: definition.description ?? '',
      env: Object.entries(definition.variables).map(([name, value]) => ({ name, value, type: 'str' })),
    };
    await this.client.postFlows([tabNode]);
    return {
      ...definition,
      id: tabNode.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getWorkflow(id: string): Promise<WorkflowDefinition> {
    const flow = await this.client.getFlow(id) as Record<string, unknown>;
    return this.mapFlowToDefinition(flow);
  }

  async updateWorkflow(id: string, patch: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> {
    const existing = await this.client.getFlow(id) as Record<string, unknown>;
    const merged = { ...existing };
    if (patch.name) merged['label'] = patch.name;
    if (patch.description) merged['info'] = patch.description;
    await this.client.putFlow(id, merged);
    return this.mapFlowToDefinition(merged);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.client.deleteFlow(id);
  }

  async listWorkflows(): Promise<WorkflowDefinition[]> {
    const allNodes = await this.client.getFlows() as Array<Record<string, unknown>>;
    const tabs = allNodes.filter((n) => n['type'] === 'tab');
    return tabs.map((t) => this.mapFlowToDefinition(t));
  }

  async executeWorkflow(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult> {
    const executionId = createId();
    const allNodes = await this.client.getFlows() as Array<Record<string, unknown>>;
    const injectNode = allNodes.find(
      (n) => n['type'] === 'inject' && n['z'] === context.workflowId,
    );
    if (injectNode) {
      await this.client.postInject(injectNode['id'] as string);
    }
    return {
      executionId,
      workflowId: context.workflowId,
      status: 'running',
      startedAt: new Date(),
    };
  }

  async stopWorkflow(_executionId: string): Promise<void> {
    // Node-RED has no stop API — execution state is tracked externally via Redis
  }

  async pauseWorkflow(executionId: string): Promise<void> {
    await this.client.putFlow(executionId, { disabled: true });
  }

  async resumeWorkflow(executionId: string): Promise<void> {
    await this.client.putFlow(executionId, { disabled: false });
  }

  async getStatus(_executionId: string): Promise<WorkflowStatus> {
    // In full implementation: read from Redis key arip:nr:execution:{id}:status
    return 'running';
  }

  async getLogs(_executionId: string, _since?: Date): Promise<WorkflowLog[]> {
    // In full implementation: return logs collected via NestJS webhook callback
    return [];
  }

  async getHistory(_workflowId: string, _limit = 20): Promise<WorkflowExecutionResult[]> {
    // In full implementation: query PostgreSQL workflow_executions table
    return [];
  }

  async getVariables(workflowId: string): Promise<Record<string, unknown>> {
    const flow = await this.client.getFlow(workflowId) as Record<string, unknown>;
    const env = (flow['env'] as Array<{ name: string; value: unknown }>) ?? [];
    return Object.fromEntries(env.map((e) => [e.name, e.value]));
  }

  async setVariables(workflowId: string, vars: Record<string, unknown>): Promise<void> {
    const flow = await this.client.getFlow(workflowId) as Record<string, unknown>;
    (flow as Record<string, unknown>)['env'] = Object.entries(vars).map(([name, value]) => ({
      name,
      value,
      type: 'str',
    }));
    await this.client.putFlow(workflowId, flow);
  }

  async registerWebhook(workflowId: string, config: WorkflowWebhookConfig): Promise<string> {
    const webhookId = createId();
    const httpInNode = {
      id: createId(),
      type: 'http in',
      z: workflowId,
      name: `webhook-${webhookId}`,
      url: config.path,
      method: config.method.toLowerCase(),
    };
    const httpResponseNode = {
      id: createId(),
      type: 'http response',
      z: workflowId,
      name: `webhook-resp-${webhookId}`,
      wires: [],
    };
    await this.client.postFlows([httpInNode, httpResponseNode]);
    return webhookId;
  }

  async unregisterWebhook(webhookId: string): Promise<void> {
    await this.client.deleteFlow(webhookId);
  }

  async triggerByEvent(
    workflowId: string,
    _event: string,
    _payload: unknown,
  ): Promise<WorkflowExecutionResult> {
    return this.executeWorkflow({
      workflowId,
      triggeredBy: 'event',
    });
  }

  async createVersion(workflowId: string, description?: string): Promise<WorkflowVersion> {
    const definition = await this.getWorkflow(workflowId);
    const version = new Date().toISOString();
    // In full implementation: persist to PostgreSQL workflow_versions
    return { version, createdAt: new Date(), description, snapshot: definition };
  }

  async listVersions(_workflowId: string): Promise<WorkflowVersion[]> {
    // In full implementation: query PostgreSQL workflow_versions
    return [];
  }

  async restoreVersion(workflowId: string, _version: string): Promise<WorkflowDefinition> {
    // In full implementation: load snapshot from DB, PUT to Node-RED
    return this.getWorkflow(workflowId);
  }

  private mapFlowToDefinition(flow: Record<string, unknown>): WorkflowDefinition {
    const env = (flow['env'] as Array<{ name: string; value: unknown }>) ?? [];
    return {
      id: flow['id'] as string,
      name: (flow['label'] as string) ?? 'Untitled',
      description: (flow['info'] as string) ?? undefined,
      nodes: [],
      connections: [],
      variables: Object.fromEntries(env.map((e) => [e.name, e.value])),
      version: '1.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
