export interface ARIPEvent<T = unknown> {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  correlationId?: string;
  payload: T;
}

export interface EventSubscription {
  topic: string;
  handler: (event: ARIPEvent) => void | Promise<void>;
  filter?: (event: ARIPEvent) => boolean;
}

export interface EventBusInterface {
  publish<T>(type: string, payload: T, source: string): Promise<void>;
  subscribe(topic: string, handler: (event: ARIPEvent) => void): () => void;
}
