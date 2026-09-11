import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import { DeviceModule } from './modules/device/device.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { AiModule } from './modules/ai/ai.module';
import { VisionModule } from './modules/vision/vision.module';
import { EventBusModule } from './modules/event-bus/event-bus.module';
import { PluginModule } from './modules/plugin/plugin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.arip', '.env'],
      load: [appConfig, databaseConfig, redisConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database')!,
    }),
    EventBusModule,
    DeviceModule,
    FleetModule,
    WorkflowModule,
    AiModule,
    VisionModule,
    PluginModule,
  ],
})
export class AppModule {}
