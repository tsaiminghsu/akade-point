import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowProvider } from '@arip/sdk';
import { NodeRedAdapter } from './adapters/node-red/node-red.adapter';

@Injectable()
export class ProviderManagerService implements OnModuleInit {
  private readonly logger = new Logger(ProviderManagerService.name);
  private readonly registry = new Map<string, WorkflowProvider>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const nodeRedUrl = this.config.get<string>('NODE_RED_BASE_URL', 'http://localhost:1880');
    const nodeRedApiKey = this.config.get<string>('NODE_RED_API_KEY', '');
    this.register(new NodeRedAdapter(nodeRedUrl, nodeRedApiKey));
  }

  register(provider: WorkflowProvider): void {
    this.registry.set(provider.name, provider);
    this.logger.log(`Registered WorkflowProvider: ${provider.name} v${provider.version}`);
  }

  getProvider(name: string): WorkflowProvider {
    const provider = this.registry.get(name);
    if (!provider) throw new NotFoundException(`WorkflowProvider '${name}' not found`);
    return provider;
  }

  listProviders(): Array<{ name: string; version: string }> {
    return [...this.registry.values()].map((p) => ({ name: p.name, version: p.version }));
  }
}
