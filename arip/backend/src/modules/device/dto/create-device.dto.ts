import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import type { DeviceType } from '@arip/sdk';

const DEVICE_TYPES: DeviceType[] = [
  'esp32', 'arduino', 'raspberry-pi', 'jetson', 'pixhawk',
  'drone', 'robot', 'agv', 'camera', 'sensor', 'gateway', 'plc', 'generic',
];

export class CreateDeviceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: DEVICE_TYPES })
  @IsIn(DEVICE_TYPES)
  type!: DeviceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firmwareVersion?: string;
}
