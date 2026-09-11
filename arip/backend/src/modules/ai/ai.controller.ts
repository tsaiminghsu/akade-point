import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List registered AI providers' })
  listProviders() {
    return this.service.listProviders();
  }
}
