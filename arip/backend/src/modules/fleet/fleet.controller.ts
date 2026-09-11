import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FleetService } from './fleet.service';
import { CreateFleetDto } from './dto/create-fleet.dto';

@ApiTags('Fleet')
@Controller('fleet')
export class FleetController {
  constructor(private readonly service: FleetService) {}

  @Post()
  @ApiOperation({ summary: 'Create a fleet' })
  create(@Body() dto: CreateFleetDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all fleets' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fleet by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete fleet' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/devices/:deviceId')
  @ApiOperation({ summary: 'Assign device to fleet' })
  assignDevice(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    return this.service.assignDevice(id, deviceId);
  }

  @Delete(':id/devices/:deviceId')
  @ApiOperation({ summary: 'Remove device from fleet' })
  removeDevice(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    return this.service.removeDevice(id, deviceId);
  }
}
