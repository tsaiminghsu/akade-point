import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity } from './device.entity';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity])],
  providers: [DeviceService],
  controllers: [DeviceController],
  exports: [DeviceService],
})
export class DeviceModule {}
