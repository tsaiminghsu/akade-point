import { Module, Global } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { MqttBridgeService } from './mqtt-bridge.service';

@Global()
@Module({
  providers: [EventBusService, MqttBridgeService],
  exports: [EventBusService],
})
export class EventBusModule {}
