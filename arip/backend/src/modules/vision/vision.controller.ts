import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VisionService } from './vision.service';

@ApiTags('Vision')
@Controller('vision')
export class VisionController {
  constructor(private readonly service: VisionService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List registered vision providers' })
  listProviders() {
    return this.service.listProviders();
  }
}
