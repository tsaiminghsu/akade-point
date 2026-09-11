import { Injectable } from '@nestjs/common';
import { ProviderManagerService } from './provider-manager.service';
import type { WorkflowDefinition, WorkflowExecutionContext } from '@arip/sdk';

@Injectable()
export class WorkflowService {
  constructor(private readonly providerManager: ProviderManagerService) {}

  listProviders() {
    return this.providerManager.listProviders();
  }

  private provider(name = 'node-red') {
    return this.providerManager.getProvider(name);
  }

  listWorkflows(providerName?: string) {
    return this.provider(providerName).listWorkflows();
  }

  createWorkflow(
    definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>,
    providerName?: string,
  ) {
    return this.provider(providerName).createWorkflow(definition);
  }

  getWorkflow(id: string, providerName?: string) {
    return this.provider(providerName).getWorkflow(id);
  }

  deleteWorkflow(id: string, providerName?: string) {
    return this.provider(providerName).deleteWorkflow(id);
  }

  executeWorkflow(context: WorkflowExecutionContext, providerName?: string) {
    return this.provider(providerName).executeWorkflow(context);
  }

  getStatus(executionId: string, providerName?: string) {
    return this.provider(providerName).getStatus(executionId);
  }

  getHistory(workflowId: string, providerName?: string) {
    return this.provider(providerName).getHistory(workflowId);
  }
}
