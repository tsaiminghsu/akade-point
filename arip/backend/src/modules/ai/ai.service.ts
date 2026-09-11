import { Injectable } from '@nestjs/common';
import type { AIProvider } from '@arip/sdk';

@Injectable()
export class AiService {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  listProviders(): Array<{ name: string; capabilities: string[] }> {
    return [...this.providers.values()].map((p) => ({
      name: p.name,
      capabilities: p.capabilities,
    }));
  }

  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }
}
