import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import type { WorkflowDefinition, WorkflowExecutionContext } from '@arip/sdk';

@ApiTags('Workflows')
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List registered workflow providers' })
  listProviders() {
    return this.service.listProviders();
  }

  @Get()
  @ApiOperation({ summary: 'List all workflows' })
  @ApiQuery({ name: 'provider', required: false })
  listWorkflows(@Query('provider') provider?: string) {
    return this.service.listWorkflows(provider);
  }

  @Post()
  @ApiOperation({ summary: 'Create a workflow' })
  @ApiQuery({ name: 'provider', required: false })
  createWorkflow(
    @Body() body: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>,
    @Query('provider') provider?: string,
  ) {
    return this.service.createWorkflow(body, provider);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiQuery({ name: 'provider', required: false })
  getWorkflow(@Param('id') id: string, @Query('provider') provider?: string) {
    return this.service.getWorkflow(id, provider);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workflow' })
  @ApiQuery({ name: 'provider', required: false })
  deleteWorkflow(@Param('id') id: string, @Query('provider') provider?: string) {
    return this.service.deleteWorkflow(id, provider);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Execute a workflow' })
  @ApiQuery({ name: 'provider', required: false })
  executeWorkflow(
    @Param('id') id: string,
    @Body() body: Partial<WorkflowExecutionContext>,
    @Query('provider') provider?: string,
  ) {
    return this.service.executeWorkflow(
      { workflowId: id, triggeredBy: 'manual', ...body },
      provider,
    );
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get workflow execution history' })
  @ApiQuery({ name: 'provider', required: false })
  getHistory(@Param('id') id: string, @Query('provider') provider?: string) {
    return this.service.getHistory(id, provider);
  }
}
