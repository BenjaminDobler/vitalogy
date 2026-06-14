import { Body, Controller, Post } from '@nestjs/common';
import { UserId } from 'auth';
import type { AnalysisRequest } from 'data-models';
import { AnalysisService } from './analysis.service.js';

@Controller('analysis')
export class AiController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('run')
  run(@UserId() userId: string, @Body() req: AnalysisRequest) {
    return this.analysis.run(userId, req);
  }

  @Post('export')
  exportPrompt(@UserId() userId: string, @Body() req: AnalysisRequest) {
    return this.analysis.exportPrompt(userId, req);
  }
}
