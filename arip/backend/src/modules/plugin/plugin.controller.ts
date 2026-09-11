import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PluginRegistryService } from './plugin-registry.service';

@ApiTags('Plugins')
@Controller('plugins')
export class PluginController {
  constructor(private readonly service: PluginRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List loaded plugins' })
  listPlugins() {
    return this.service.listManifests();
  }
}
