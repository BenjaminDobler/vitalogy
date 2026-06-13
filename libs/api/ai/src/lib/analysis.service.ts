import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  ExportedPrompt,
  Activity,
} from 'data-models';
import { AnthropicService } from './anthropic.service.js';
import { GeminiService } from './gemini.service.js';
import { buildAnalysisPrompt } from './prompt-builder.js';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly gemini: GeminiService,
  ) {}

  async run(userId: string, req: AnalysisRequest): Promise<AnalysisResult> {
    const activities = await this.loadActivities(userId, req.activityIds);
    const prompt = buildAnalysisPrompt({
      activities: activities.map(toDto),
      question: req.question,
    });

    const apiKey = req.keyMode === 'USER' ? await this.userKey(userId, req.provider) : undefined;

    const completion =
      req.provider === 'ANTHROPIC'
        ? await this.anthropic.complete({ prompt, apiKey, model: req.model })
        : await this.gemini.complete({ prompt, apiKey, model: req.model });

    const stored = await this.prisma.analysis.create({
      data: {
        userId,
        activityId: activities.length === 1 ? activities[0].id : null,
        provider: req.provider,
        model: completion.model,
        prompt,
        response: completion.text,
        inputTokens: completion.inputTokens ?? null,
        outputTokens: completion.outputTokens ?? null,
      },
    });

    return {
      id: stored.id,
      provider: stored.provider as AIProvider,
      model: stored.model,
      prompt: stored.prompt,
      response: stored.response,
      inputTokens: stored.inputTokens,
      outputTokens: stored.outputTokens,
      costUsd: stored.costUsd ? Number(stored.costUsd) : null,
      createdAt: stored.createdAt.toISOString(),
    };
  }

  /** Build a prompt and return it instead of calling any provider. */
  async exportPrompt(userId: string, req: AnalysisRequest): Promise<ExportedPrompt> {
    const activities = await this.loadActivities(userId, req.activityIds);
    const prompt = buildAnalysisPrompt({
      activities: activities.map(toDto),
      question: req.question,
    });
    return {
      prompt,
      attachments: [
        {
          filename: 'activities.json',
          mimeType: 'application/json',
          content: JSON.stringify(activities.map(toDto), null, 2),
        },
      ],
    };
  }

  private async loadActivities(userId: string, ids: string[]) {
    if (ids.length === 0) {
      throw new NotFoundException('No activity IDs provided');
    }
    const activities = await this.prisma.activity.findMany({
      where: { userId, id: { in: ids } },
      orderBy: { startTime: 'desc' },
    });
    if (activities.length === 0) {
      throw new NotFoundException('No matching activities');
    }
    return activities;
  }

  private async userKey(userId: string, provider: AIProvider): Promise<string> {
    // TODO: decrypt with API_KEY_ENCRYPTION_SECRET.
    // For now this only works for SERVER mode; USER mode needs the encryption flow.
    const row = await this.prisma.apiKey.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) throw new NotFoundException(`No stored ${provider} key for user`);
    return row.encryptedKey; // TODO decrypt
  }
}

// Prisma row → wire-DTO. Trims fields we don't expose and stringifies dates.
function toDto(a: {
  id: string;
  userId: string;
  source: string;
  sourceId: string;
  name: string;
  sportType: string;
  startTime: Date;
  timezone: string | null;
  durationSec: number;
  elapsedSec: number;
  distanceM: number;
  elevationGainM: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgWatts: number | null;
  weightedAvgWatts: number | null;
  maxWatts: number | null;
  kilojoules: number | null;
  avgHeartrate: number | null;
  maxHeartrate: number | null;
  avgCadence: number | null;
  trainerActivity: boolean;
  commute: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Activity {
  return {
    ...a,
    source: a.source as Activity['source'],
    startTime: a.startTime.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
