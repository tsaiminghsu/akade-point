import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';

@ApiTags('Devices')
@Controller('devices')
export class DeviceController {
  constructor(private readonly service: DeviceService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new device' })
  create(@Body() dto: CreateDeviceDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all devices' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update device' })
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove device' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/command')
  @ApiOperation({ summary: 'Send command to device via MQTT' })
  sendCommand(@Param('id') id: string, @Body() command: Record<string, unknown>) {
    return this.service.sendCommand(id, command);
  }
}
