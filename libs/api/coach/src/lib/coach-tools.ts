import { Injectable } from '@nestjs/common';
import { ActivitiesService } from 'activities';
import {
  autoFtp,
  hrZones,
  intensityFactor,
  meanHr,
  normalizedPower,
  powerCurve,
  POWER_CURVE_DURATIONS,
  totalKilojoules,
  trimp,
  tss,
} from 'training-metrics';
import type { ActivityStream } from 'data-models';
import { MemoryService } from './memory.service.js';
import { ProfileService } from './profile.service.js';

/**
 * Anthropic-shaped tool definition. We don't import the SDK types here
 * because the chat service is the only place that touches them, and
 * keeping these as plain objects lets us serialize / unit-test cleanly.
 */
export interface CoachTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Registry + dispatcher for the coach's tools. Each tool name maps to:
 *   1. A JSON schema (sent to the LLM so it knows what arguments to provide).
 *   2. A handler that runs server-side with the (userId, input) and returns
 *      a JSON-serialisable result.
 *
 * Handlers are written to return COMPACT data — the LLM pays per-token for
 * everything it sees, and verbose responses encourage it to ramble.
 */
@Injectable()
export class CoachToolsService {
  constructor(
    private readonly profileService: ProfileService,
    private readonly memoryService: MemoryService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  /** Anthropic-shaped tool definitions, in the order they should be advertised. */
  definitions(): CoachTool[] {
    return [
      {
        name: 'get_user_profile',
        description:
          "Get the athlete's profile (age, weight, height, sport, FTP, max HR, rest HR, goals). " +
          'Call this at the start of any conversation that needs personalization.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'recall_memories',
        description:
          'Recall long-term facts saved about the athlete (goals, preferences, facts, events). ' +
          'ALWAYS call this at the start of a conversation so you have context from prior chats.',
        input_schema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['GOAL', 'PREFERENCE', 'FACT', 'EVENT'],
              description: 'Optional filter. Omit to get all memories.',
            },
          },
        },
      },
      {
        name: 'save_memory',
        description:
          'Save a new long-term fact about the athlete. Use when they share something useful for ' +
          'future conversations: a goal ("drop 4kg by July"), preference ("dislikes early sessions"), ' +
          "fact ('races on weekends'), or event ('crashed Mar 12, broke collarbone'). " +
          "Don't save trivial chit-chat. Don't save things you already know — check recall_memories first.",
        input_schema: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['GOAL', 'PREFERENCE', 'FACT', 'EVENT'] },
            content: {
              type: 'string',
              description: 'One sentence, written in third person ("user wants to..." or "user prefers...").',
            },
          },
          required: ['category', 'content'],
        },
      },
      {
        name: 'update_memory',
        description: 'Update the content of a previously-saved memory. Use when the athlete revises a goal or fact.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['id', 'content'],
        },
      },
      {
        name: 'delete_memory',
        description: 'Delete a memory that\'s no longer accurate (goal completed, preference changed).',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
      {
        name: 'list_recent_activities',
        description:
          'List the athlete\'s recent rides as summaries (id, name, date, distance, duration, ' +
          'avg/max HR, avg watts). Default 10. Use to answer "what did I do this week?" type questions, ' +
          'then call get_activity_detail for specific rides that warrant deeper analysis.',
        input_schema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        },
      },
      {
        name: 'get_activity_detail',
        description:
          'Get a single activity with full derived metrics: NP, IF, TSS, kJ, HR-zone breakdown, ' +
          'power curve, laps, weather. Use when the athlete asks about a specific ride.',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Activity id from list_recent_activities.' } },
          required: ['id'],
        },
      },
      {
        name: 'get_training_load',
        description:
          "Get the athlete's current fitness (CTL), fatigue (ATL), form (TSB), and daily load over " +
          'the last 90 days. Use for "how is my training going?" or to gate recommendations.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'get_achievements',
        description:
          'Get the athlete\'s lifetime PRs (longest ride, most elevation, fastest avg speed, top speed, etc).',
        input_schema: { type: 'object', properties: {} },
      },
    ];
  }

  /**
   * Run a tool by name. Caller passes the LLM-decoded `input` and the
   * userId. Returns a JSON-serialisable value the LLM will see.
   *
   * Errors are caught and returned as a normal value so a single broken
   * tool call doesn't kill the whole conversation turn.
   */
  async dispatch(name: string, input: unknown, userId: string): Promise<unknown> {
    try {
      switch (name) {
        case 'get_user_profile':
          return await this.getUserProfile(userId);
        case 'recall_memories':
          return await this.recallMemories(userId, input as { category?: string });
        case 'save_memory':
          return await this.saveMemory(userId, input as { content: string; category: string });
        case 'update_memory':
          return await this.updateMemory(userId, input as { id: string; content: string });
        case 'delete_memory':
          return await this.deleteMemory(userId, input as { id: string });
        case 'list_recent_activities':
          return await this.listRecentActivities(userId, input as { limit?: number });
        case 'get_activity_detail':
          return await this.getActivityDetail(userId, input as { id: string });
        case 'get_training_load':
          return await this.getTrainingLoad(userId);
        case 'get_achievements':
          return await this.activitiesService.achievements(userId);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---- handlers -----------------------------------------------------------

  private async getUserProfile(userId: string) {
    const p = await this.profileService.get(userId);
    const age = p.birthdate
      ? Math.floor(
          (Date.now() - new Date(p.birthdate).getTime()) /
            (365.25 * 24 * 3600 * 1000),
        )
      : null;
    return { ...p, age };
  }

  private async recallMemories(userId: string, input: { category?: string }) {
    const cat = input?.category as
      | 'GOAL' | 'PREFERENCE' | 'FACT' | 'EVENT' | undefined;
    const all = await this.memoryService.list(userId, cat ? { category: cat } : {});
    return all.map((m) => ({
      id: m.id,
      category: m.category,
      content: m.content,
      savedAt: m.createdAt,
    }));
  }

  private async saveMemory(userId: string, input: { content: string; category: string }) {
    const m = await this.memoryService.create(userId, {
      category: input.category as 'GOAL' | 'PREFERENCE' | 'FACT' | 'EVENT',
      content: input.content,
    });
    return { id: m.id, savedAt: m.createdAt };
  }

  private async updateMemory(userId: string, input: { id: string; content: string }) {
    const m = await this.memoryService.update(userId, input.id, { content: input.content });
    return { id: m.id, updatedAt: m.updatedAt };
  }

  private async deleteMemory(userId: string, input: { id: string }) {
    await this.memoryService.delete(userId, input.id);
    return { deleted: input.id };
  }

  private async listRecentActivities(userId: string, input: { limit?: number }) {
    const limit = Math.max(1, Math.min(50, input?.limit ?? 10));
    const rows = await this.activitiesService.list(userId, { limit });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      start: a.startTime,
      sport: a.sportType,
      distanceKm: +(a.distanceM / 1000).toFixed(2),
      durationMin: Math.round(a.durationSec / 60),
      elevationM: a.elevationGainM,
      avgSpeedKmh: a.avgSpeedMps != null ? +(a.avgSpeedMps * 3.6).toFixed(1) : null,
      avgHr: a.avgHeartrate,
      maxHr: a.maxHeartrate,
      avgWatts: a.avgWatts,
      kJ: a.kilojoules,
    }));
  }

  private async getActivityDetail(userId: string, input: { id: string }) {
    const a = await this.activitiesService.get(userId, input.id);

    // Pull profile so we can compute IF/TSS/zones with the right athlete params.
    const profile = await this.profileService.get(userId);
    const ftp = profile.ftpW ?? 200;
    const maxHrParam = profile.maxHrBpm ?? 190;
    const restHr = profile.restHrBpm ?? 60;

    const streams = new Map(a.streams.map((s: ActivityStream) => [s.type, s.data]));
    const watts = (streams.get('watts') as number[] | undefined) ?? [];
    const hr = (streams.get('heartrate') as number[] | undefined) ?? [];

    const np = watts.length > 0 ? normalizedPower(watts) : null;
    const ifv = intensityFactor(np, ftp);
    const tssV = tss(a.durationSec, np, ftp);
    const kJ = watts.length > 0 ? totalKilojoules(watts) : a.kilojoules;
    const curve = watts.length > 0 ? powerCurve(watts, [...POWER_CURVE_DURATIONS]) : [];
    const autoFtpEst = watts.length > 0 ? autoFtp(watts) : null;
    const zones = hr.length > 0 ? hrZones(hr, maxHrParam) : null;
    const trimpScore = trimp(a.durationSec, meanHr(hr), maxHrParam, restHr);

    return {
      id: a.id,
      name: a.name,
      start: a.startTime,
      sport: a.sportType,
      durationMovingMin: Math.round(a.durationSec / 60),
      elapsedMin: Math.round(a.elapsedSec / 60),
      distanceKm: +(a.distanceM / 1000).toFixed(2),
      elevationM: a.elevationGainM,
      avgSpeedKmh: a.avgSpeedMps != null ? +(a.avgSpeedMps * 3.6).toFixed(1) : null,
      maxSpeedKmh: a.maxSpeedMps != null ? +(a.maxSpeedMps * 3.6).toFixed(1) : null,
      hasPower: watts.length > 0,
      hasHr: hr.length > 0,
      power: watts.length > 0
        ? {
            avgWatts: a.avgWatts,
            np: np != null ? Math.round(np) : null,
            if: ifv != null ? +ifv.toFixed(2) : null,
            tss: tssV != null ? Math.round(tssV) : null,
            kJ: kJ != null ? Math.round(kJ) : null,
            autoFtpEst: autoFtpEst != null ? Math.round(autoFtpEst) : null,
            powerCurve: curve.map((p) => ({ sec: p.durationSec, w: Math.round(p.watts) })),
          }
        : null,
      hr: hr.length > 0
        ? {
            avg: a.avgHeartrate != null ? Math.round(a.avgHeartrate) : null,
            max: a.maxHeartrate,
            trimp: trimpScore != null ? Math.round(trimpScore) : null,
            zones: zones
              ? {
                  z1Sec: Math.round(zones.z1Sec),
                  z2Sec: Math.round(zones.z2Sec),
                  z3Sec: Math.round(zones.z3Sec),
                  z4Sec: Math.round(zones.z4Sec),
                  z5Sec: Math.round(zones.z5Sec),
                  belowZ1Sec: Math.round(zones.belowZ1Sec),
                }
              : null,
          }
        : null,
      laps: a.laps.map((l) => ({
        i: l.lapIndex,
        sec: l.durationSec,
        km: +(l.distanceM / 1000).toFixed(2),
        kmh: l.avgSpeedMps != null ? +(l.avgSpeedMps * 3.6).toFixed(1) : null,
        w: l.avgWatts != null ? Math.round(l.avgWatts) : null,
        hr: l.avgHeartrate != null ? Math.round(l.avgHeartrate) : null,
      })),
      weather: a.tempC != null || a.windSpeedKmh != null
        ? {
            tempC: a.tempC,
            feelsC: a.apparentTempC,
            humidityPct: a.humidityPct,
            windKmh: a.windSpeedKmh,
            windFromDeg: a.windDirectionDeg,
            gustKmh: a.windGustKmh,
            precipMm: a.precipMm,
          }
        : null,
      profileUsed: { ftp, maxHr: maxHrParam, restHr },
    };
  }

  private async getTrainingLoad(userId: string) {
    const profile = await this.profileService.get(userId);
    const load = await this.activitiesService.trainingLoad(userId, {
      days: 90,
      ftp: profile.ftpW ?? 200,
      maxHr: profile.maxHrBpm ?? 190,
      restHr: profile.restHrBpm ?? 60,
    });
    // Compact response — full daily series can balloon tokens. Send current
    // values + last 14 days only.
    return {
      current: load.current,
      inputs: load.inputs,
      recent: load.daily.slice(-14),
    };
  }
}
