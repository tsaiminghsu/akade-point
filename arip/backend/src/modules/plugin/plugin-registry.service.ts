import { Injectable, Logger } from '@nestjs/common';
import type { ARIPPlugin, PluginManifest } from '@arip/sdk';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly plugins = new Map<string, ARIPPlugin>();

  async load(plugin: ARIPPlugin, config: Record<string, unknown> = {}): Promise<void> {
    await plugin.onLoad({
      config,
      eventBus: { publish: async () => {}, subscribe: () => () => {} },
      logger: {
        info: (msg: string, ...args: unknown[]) => this.logger.log(msg, ...args),
        warn: (msg: string, ...args: unknown[]) => this.logger.warn(msg, ...args),
        error: (msg: string, ...args: unknown[]) => this.logger.error(msg, ...args),
        debug: (msg: string, ...args: unknown[]) => this.logger.debug(msg, ...args),
      },
    });
    this.plugins.set(plugin.manifest.id, plugin);
    this.logger.log(`Plugin loaded: ${plugin.manifest.name} v${plugin.manifest.version}`);
  }

  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.onUnload();
      this.plugins.delete(pluginId);
    }
  }

  listManifests(): PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest);
  }
}
