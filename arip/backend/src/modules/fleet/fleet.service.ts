import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FleetEntity } from './fleet.entity';
import { DeviceEntity } from '../device/device.entity';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { EventBusService } from '../event-bus/event-bus.service';
import { ARIP_EVENTS } from '@arip/sdk';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(FleetEntity)
    private readonly fleetRepo: Repository<FleetEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    private readonly eventBus: EventBusService,
  ) {}

  async create(dto: CreateFleetDto): Promise<FleetEntity> {
    const fleet = this.fleetRepo.create({ name: dto.name, description: dto.description, metadata: {}, devices: [] });
    if (dto.deviceIds?.length) {
      fleet.devices = await this.deviceRepo.findByIds(dto.deviceIds);
    }
    return this.fleetRepo.save(fleet);
  }

  findAll(): Promise<FleetEntity[]> {
    return this.fleetRepo.find({ relations: ['devices'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<FleetEntity> {
    const fleet = await this.fleetRepo.findOne({ where: { id }, relations: ['devices'] });
    if (!fleet) throw new NotFoundException(`Fleet ${id} not found`);
    return fleet;
  }

  async remove(id: string): Promise<void> {
    const fleet = await this.findOne(id);
    await this.fleetRepo.remove(fleet);
  }

  async assignDevice(fleetId: string, deviceId: string): Promise<FleetEntity> {
    const fleet = await this.findOne(fleetId);
    const device = await this.deviceRepo.findOneBy({ id: deviceId });
    if (!device) throw new NotFoundException(`Device ${deviceId} not found`);
    fleet.devices = [...fleet.devices.filter((d) => d.id !== deviceId), device];
    const saved = await this.fleetRepo.save(fleet);
    await this.eventBus.publish(ARIP_EVENTS.FLEET.DEVICE_ASSIGNED, { fleetId, deviceId }, 'fleet-service');
    return saved;
  }

  async removeDevice(fleetId: string, deviceId: string): Promise<FleetEntity> {
    const fleet = await this.findOne(fleetId);
    fleet.devices = fleet.devices.filter((d) => d.id !== deviceId);
    const saved = await this.fleetRepo.save(fleet);
    await this.eventBus.publish(ARIP_EVENTS.FLEET.DEVICE_REMOVED, { fleetId, deviceId }, 'fleet-service');
    return saved;
  }
}
