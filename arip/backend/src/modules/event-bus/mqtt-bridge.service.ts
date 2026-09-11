import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { EventBusService } from './event-bus.service';
import { ARIP_EVENTS } from '@arip/sdk';

@Injectable()
export class MqttBridgeService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MqttBridgeService.name);
  private client!: mqtt.MqttClient;

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit() {
    const brokerUrl = this.config.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883');
    const clientId = this.config.get<string>('MQTT_CLIENT_ID', 'arip-backend-bridge');

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      clean: false,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log(`MQTT bridge connected to ${brokerUrl}`);
      this.client.subscribe('arip/devices/+/telemetry');
      this.client.subscribe('arip/devices/+/status');
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT error', err.message);
    });
  }

  private handleMessage(topic: string, message: Buffer) {
    try {
      const parts = topic.split('/');
      const deviceId = parts[2];
      const messageType = parts[3];
      const payload = JSON.parse(message.toString());

      if (messageType === 'telemetry') {
        void this.eventBus.publish(ARIP_EVENTS.DEVICE.TELEMETRY, { deviceId, ...payload }, 'mqtt-bridge');
      } else if (messageType === 'status') {
        void this.eventBus.publish(ARIP_EVENTS.DEVICE.STATUS_CHANGED, { deviceId, ...payload }, 'mqtt-bridge');
      }
    } catch (err) {
      this.logger.warn(`Failed to parse MQTT message from ${topic}`);
    }
  }

  publishCommand(deviceId: string, command: unknown): void {
    const topic = `arip/devices/${deviceId}/command`;
    this.client.publish(topic, JSON.stringify(command));
  }

  async onApplicationShutdown() {
    await new Promise<void>((resolve) => {
      this.client.end(false, {}, () => resolve());
    });
    this.logger.log('MQTT bridge disconnected');
  }
}
