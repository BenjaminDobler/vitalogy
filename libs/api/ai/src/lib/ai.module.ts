import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service.js';
import { GeminiService } from './gemini.service.js';
import { AnalysisService } from './analysis.service.js';
import { AiController } from './ai.controller.js';

@Module({
  controllers: [AiController],
  providers: [AnthropicService, GeminiService, AnalysisService],
  exports: [AnthropicService, GeminiService, AnalysisService],
})
export class AiModule {}
