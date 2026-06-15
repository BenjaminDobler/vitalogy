import { Module } from '@nestjs/common';
import { DbModule } from 'db';
import { AnthropicService } from './anthropic.service.js';
import { GeminiService } from './gemini.service.js';
import { AnalysisService } from './analysis.service.js';
import { AiController } from './ai.controller.js';
import { KeyController } from './key.controller.js';
import { KeyService } from './key.service.js';

@Module({
  imports: [DbModule],
  controllers: [AiController, KeyController],
  providers: [AnthropicService, GeminiService, AnalysisService, KeyService],
  exports: [AnthropicService, GeminiService, AnalysisService, KeyService],
})
export class AiModule {}
