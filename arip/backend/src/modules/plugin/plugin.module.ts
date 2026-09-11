import { Module } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginController } from './plugin.controller';

@Module({
  providers: [PluginRegistryService],
  controllers: [PluginController],
  exports: [PluginRegistryService],
})
export class PluginModule {}
