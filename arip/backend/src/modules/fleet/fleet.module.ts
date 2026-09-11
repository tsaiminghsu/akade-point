import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FleetEntity } from './fleet.entity';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { DeviceEntity } from '../device/device.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FleetEntity, DeviceEntity])],
  providers: [FleetService],
  controllers: [FleetController],
  exports: [FleetService],
})
export class FleetModule {}
