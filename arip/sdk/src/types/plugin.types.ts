import type { EventBusInterface } from './event.types';

export type PluginCategory =
  | 'workflow'
  | 'ai'
  | 'vision'
  | 'map'
  | 'notification'
  | 'device'
  | 'telemetry';

export interface PluginConfigField {
  type: 'string' | 'number' | 'boolean' | 'secret';
  label: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: PluginCategory;
  entrypoint: string;
  permissions: string[];
  config?: Record<string, PluginConfigField>;
}

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface PluginContext {
  config: Record<string, unknown>;
  eventBus: EventBusInterface;
  logger: PluginLogger;
}

export interface ARIPPlugin {
  manifest: PluginManifest;
  onLoad(context: PluginContext): Promise<void>;
  onUnload(): Promise<void>;
}
