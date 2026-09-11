import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createId } from '@paralleldrive/cuid2';
import type { ARIPEvent, EventBusInterface } from '@arip/sdk';

@Injectable()
export class EventBusService implements EventBusInterface, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private publisher!: Redis;
  private subscriber!: Redis;
  private readonly handlers = new Map<string, Set<(event: ARIPEvent) => void>>();
  private readonly CHANNEL_PREFIX = 'arip:events:';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('redis.url', 'redis://localhost:6379');
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);

    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const type = channel.replace(this.CHANNEL_PREFIX, '');
      const event: ARIPEvent = JSON.parse(message);
      const listeners = this.handlers.get(type);
      listeners?.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          this.logger.error(`Handler error for event ${type}`, err);
        }
      });
    });

    this.subscriber.psubscribe(`${this.CHANNEL_PREFIX}*`);
    this.logger.log('EventBus connected to Redis');
  }

  async onModuleDestroy() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }

  async publish<T>(type: string, payload: T, source: string): Promise<void> {
    const event: ARIPEvent<T> = {
      id: createId(),
      type,
      source,
      timestamp: new Date(),
      payload,
    };
    await this.publisher.publish(`${this.CHANNEL_PREFIX}${type}`, JSON.stringify(event));
  }

  subscribe(topic: string, handler: (event: ARIPEvent) => void): () => void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    this.handlers.get(topic)!.add(handler);
    return () => {
      this.handlers.get(topic)?.delete(handler);
    };
  }
}
