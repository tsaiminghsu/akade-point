import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { ProviderManagerService } from './provider-manager.service';

@Module({
  providers: [ProviderManagerService, WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowService, ProviderManagerService],
})
export class WorkflowModule {}
