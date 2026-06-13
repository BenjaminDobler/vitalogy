import { Body, Controller, Post } from '@nestjs/common';
import type { AnalysisRequest } from 'data-models';
import { AnalysisService } from './analysis.service.js';

// TODO: real auth. For now a hardcoded user id is used for the single-user dev mode.
const DEV_USER_ID = 'dev-user';

@Controller('analysis')
export class AiController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('run')
  run(@Body() req: AnalysisRequest) {
    return this.analysis.run(DEV_USER_ID, req);
  }

  @Post('export')
  exportPrompt(@Body() req: AnalysisRequest) {
    return this.analysis.exportPrompt(DEV_USER_ID, req);
  }
}
