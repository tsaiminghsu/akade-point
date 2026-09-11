import { Injectable } from '@nestjs/common';
import type { VisionProvider } from '@arip/sdk';

@Injectable()
export class VisionService {
  private readonly providers = new Map<string, VisionProvider>();

  register(provider: VisionProvider): void {
    this.providers.set(provider.name, provider);
  }

  listProviders(): Array<{ name: string; supportedModels: string[] }> {
    return [...this.providers.values()].map((p) => ({
      name: p.name,
      supportedModels: p.supportedModels,
    }));
  }
}
