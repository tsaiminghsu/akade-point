import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEntity } from './device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { EventBusService } from '../event-bus/event-bus.service';
import { MqttBridgeService } from '../event-bus/mqtt-bridge.service';
import { ARIP_EVENTS } from '@arip/sdk';

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(DeviceEntity)
    private readonly repo: Repository<DeviceEntity>,
    private readonly eventBus: EventBusService,
    private readonly mqttBridge: MqttBridgeService,
  ) {}

  async create(dto: CreateDeviceDto): Promise<DeviceEntity> {
    const device = this.repo.create({ ...dto, status: 'offline', health: 'unknown', metadata: {} });
    const saved = await this.repo.save(device);
    await this.eventBus.publish(ARIP_EVENTS.DEVICE.CONNECTED, { deviceId: saved.id }, 'device-service');
    return saved;
  }

  findAll(): Promise<DeviceEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<DeviceEntity> {
    const device = await this.repo.findOneBy({ id });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto): Promise<DeviceEntity> {
    const device = await this.findOne(id);
    Object.assign(device, dto);
    return this.repo.save(device);
  }

  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);
    await this.repo.remove(device);
    await this.eventBus.publish(ARIP_EVENTS.DEVICE.DISCONNECTED, { deviceId: id }, 'device-service');
  }

  async sendCommand(id: string, command: Record<string, unknown>): Promise<void> {
    await this.findOne(id);
    this.mqttBridge.publishCommand(id, command);
    await this.eventBus.publish(ARIP_EVENTS.DEVICE.COMMAND_SENT, { deviceId: id, command }, 'device-service');
  }

  async markOnline(id: string): Promise<void> {
    await this.repo.update(id, { status: 'online', lastSeenAt: new Date() });
    await this.eventBus.publish(ARIP_EVENTS.DEVICE.STATUS_CHANGED, { deviceId: id, status: 'online' }, 'device-service');
  }
}
