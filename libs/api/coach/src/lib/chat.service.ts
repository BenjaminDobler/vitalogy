import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { Content, Part } from '@google/genai';
import { AnthropicService, GeminiService, KeyService } from 'ai';
import { PrismaService } from 'db';
import type { AIProvider } from 'data-models';
import { CoachToolsService } from './coach-tools.js';

const MAX_ITERATIONS = 6;
const SYSTEM_PROMPT = `You are a personal cycling coach for an athlete using the Vitalogy training app. You help them understand their training, set and reach goals, and recommend workouts.

You have access to their full training history and personal context through tools. Use them aggressively — never speculate when you can look something up.

CRITICAL RULES:
1. At the start of a new conversation (no prior assistant turns), call recall_memories first so you have context from previous chats.
2. When the athlete shares something durable (a goal, preference, recurring constraint, or notable event), call save_memory. Don't save trivia, transient mood, or things you already know.
3. For ride-specific questions, call get_activity_detail. For "how is my training going" questions, call get_training_load. For PR / lifetime-best questions, call get_achievements.
4. Cite specific numbers from tool responses (distance, NP, TSS, HR zones). Be honest when data is missing.
5. Keep responses focused. Markdown is fine — short paragraphs, lists when comparing options. No long preambles or hedging.
6. When recommending a workout, be specific: zone, duration, structure (e.g. "2×20 min at 0.95 IF with 5 min recovery"), and a one-line reason tied to the athlete's current state.

STRUCTURED WORKOUTS:
The athlete can execute structured workouts live on their mobile recorder, with real-time "are you on target?" feedback. When you recommend a workout and the athlete agrees — OR when they explicitly ask you to "plan", "queue", or "create" a workout — call create_workout with a full interval list. Always:
- Start with a warm-up (5–15 min FREE or HR_ZONE 1–2) and end with a cool-down.
- Use HR_ZONE targets (1–5) for HR-only athletes, POWER_FTP_PCT for power-equipped riders. Pick based on what's in the athlete's recent activity data.
- Give each interval a clear label ("Warm-up", "Tempo rep 2", "Recovery") and an optional one-line cue.
- Before creating, briefly call list_pending_workouts so you don't double-queue.
- After saving, tell the athlete the title + total time and that it's now on their mobile.`;

export interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
}

export interface ChatMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  createdAt: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatThreadDto {
  id: string;
  title: string | null;
  provider: AIProvider | null;
  messages: ChatMessageDto[];
}

export interface SendMessageResponse {
  assistantText: string;
  toolCalls: ToolCallTrace[];
  inputTokens: number;
  outputTokens: number;
  iterations: number;
  provider: AIProvider | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly gemini: GeminiService,
    private readonly keys: KeyService,
    private readonly tools: CoachToolsService,
  ) {}

  /**
   * Latest thread for the user, with all messages. Lazily creates an
   * empty thread on first call.
   */
  async getThread(userId: string): Promise<ChatThreadDto> {
    await this.ensureUser(userId);
    const thread = await this.getOrCreateThread(userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: thread.id,
      title: thread.title,
      provider: (thread.provider as AIProvider | null) ?? null,
      messages: rows.map(toMessageDto),
    };
  }

  /**
   * Wipe the active thread and start a fresh one. Used by the UI when
   * the rider wants to switch providers — easier than reformatting
   * tool_use blocks across SDK shapes.
   */
  async resetThread(userId: string): Promise<ChatThreadDto> {
    await this.ensureUser(userId);
    await this.prisma.chatThread.deleteMany({ where: { userId } });
    const thread = await this.prisma.chatThread.create({ data: { userId } });
    return {
      id: thread.id,
      title: thread.title,
      provider: null,
      messages: [],
    };
  }

  /**
   * Run one conversational turn. Resolves provider from the thread (locked
   * at first message) or, for a fresh thread, picks whichever key the
   * user has — preferring Anthropic. Dispatches to the matching
   * tool-use loop and persists every intermediate assistant / tool
   * message so the reasoning trace survives across reloads.
   */
  async sendMessage(userId: string, content: string): Promise<SendMessageResponse> {
    await this.ensureUser(userId);
    const thread = await this.getOrCreateThread(userId);

    await this.prisma.chatMessage.create({
      data: { threadId: thread.id, role: 'USER', content },
    });

    // Resolve provider for this turn.
    const lockedProvider = thread.provider as AIProvider | null;
    let provider: AIProvider | null = lockedProvider;
    if (provider) {
      const usable = await this.hasUsableKey(userId, provider);
      if (!usable) {
        return this.surfaceError(
          thread.id,
          `This conversation was started with ${pretty(provider)}, but you don't have a ${pretty(provider)} key anymore. Add one in Profile → AI keys, or tap "New conversation" to start over with a different provider.`,
          null,
        );
      }
    } else {
      provider = await this.pickProvider(userId);
      if (!provider) {
        return this.surfaceError(
          thread.id,
          "I don't have any AI API key yet. Add an Anthropic or Gemini key in Profile → AI keys to start chatting.",
          null,
        );
      }
      // Lock the thread to this provider for subsequent messages.
      await this.prisma.chatThread.update({
        where: { id: thread.id },
        data: { provider },
      });
    }

    if (provider === 'ANTHROPIC') {
      return this.runAnthropic(userId, thread.id);
    }
    return this.runGemini(userId, thread.id);
  }

  // -- Anthropic loop -----------------------------------------------------

  private async runAnthropic(
    userId: string,
    threadId: string,
  ): Promise<SendMessageResponse> {
    const apiKey = await this.keys.getDecrypted(userId, 'ANTHROPIC');
    const client = this.anthropic.client(apiKey ?? undefined);
    const model = this.anthropic.defaultModel;
    const history = await this.buildAnthropicHistory(threadId);
    const toolDefs = this.tools.definitions().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })) as Anthropic.Tool[];

    const trace: ToolCallTrace[] = [];
    let totalIn = 0;
    let totalOut = 0;
    let finalText = '';
    let iter = 0;

    while (iter < MAX_ITERATIONS) {
      iter++;
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolDefs,
        messages: history,
      });
      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      await this.prisma.chatMessage.create({
        data: {
          threadId,
          role: 'ASSISTANT',
          content: text,
          metadata: {
            provider: 'ANTHROPIC',
            stopReason: response.stop_reason,
            blocks: response.content as unknown as object[],
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            model,
            iteration: iter,
          } as object,
        },
      });

      history.push({
        role: 'assistant',
        content: response.content as Anthropic.MessageParam['content'],
      });

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        finalText = text;
        break;
      }

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const output = await this.tools.dispatch(t.name, t.input, userId);
        trace.push({ name: t.name, input: t.input, output });

        await this.prisma.chatMessage.create({
          data: {
            threadId,
            role: 'TOOL',
            content: summarizeToolResult(t.name, output),
            metadata: {
              provider: 'ANTHROPIC',
              toolUseId: t.id,
              toolName: t.name,
              toolInput: t.input as object,
              toolOutput: output as object,
              iteration: iter,
            } as object,
          },
        });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: t.id,
          content: JSON.stringify(output),
        });
      }

      history.push({ role: 'user', content: toolResultBlocks });
    }

    return this.finalize(threadId, finalText, trace, totalIn, totalOut, iter, 'ANTHROPIC');
  }

  // -- Gemini loop --------------------------------------------------------

  private async runGemini(
    userId: string,
    threadId: string,
  ): Promise<SendMessageResponse> {
    const apiKey = await this.keys.getDecrypted(userId, 'GEMINI');
    const client = this.gemini.client(apiKey ?? undefined);
    const model = this.gemini.defaultModel;
    const history = await this.buildGeminiHistory(threadId);

    const tools = [
      {
        functionDeclarations: this.tools.definitions().map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema as unknown as Record<string, unknown>,
        })),
      },
    ];

    const trace: ToolCallTrace[] = [];
    let totalIn = 0;
    let totalOut = 0;
    let finalText = '';
    let iter = 0;

    while (iter < MAX_ITERATIONS) {
      iter++;
      const result = await client.models.generateContent({
        model,
        contents: history,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          // Gemini's tools shape uses functionDeclarations; the SDK
          // surfaces the same property name on the config object.
          tools: tools as unknown as Parameters<
            typeof client.models.generateContent
          >[0]['config'] extends { tools?: infer T } ? T : never,
        },
      });

      totalIn += result.usageMetadata?.promptTokenCount ?? 0;
      totalOut += result.usageMetadata?.candidatesTokenCount ?? 0;

      const parts = (result.candidates?.[0]?.content?.parts ?? []) as Part[];
      const text = parts
        .filter((p): p is { text: string } => typeof p.text === 'string')
        .map((p) => p.text)
        .join('\n')
        .trim();
      const fnCalls = parts.filter(
        (p): p is { functionCall: { name: string; args?: Record<string, unknown> } } =>
          p.functionCall != null,
      );

      await this.prisma.chatMessage.create({
        data: {
          threadId,
          role: 'ASSISTANT',
          content: text,
          metadata: {
            provider: 'GEMINI',
            parts: parts as unknown as object[],
            inputTokens: result.usageMetadata?.promptTokenCount,
            outputTokens: result.usageMetadata?.candidatesTokenCount,
            model,
            iteration: iter,
          } as object,
        },
      });

      history.push({ role: 'model', parts });

      if (fnCalls.length === 0) {
        finalText = text;
        break;
      }

      const responseParts: Part[] = [];
      for (const p of fnCalls) {
        const call = p.functionCall;
        const output = await this.tools.dispatch(call.name, call.args ?? {}, userId);
        trace.push({ name: call.name, input: call.args ?? {}, output });

        await this.prisma.chatMessage.create({
          data: {
            threadId,
            role: 'TOOL',
            content: summarizeToolResult(call.name, output),
            metadata: {
              provider: 'GEMINI',
              toolName: call.name,
              toolInput: (call.args ?? {}) as object,
              toolOutput: output as object,
              iteration: iter,
            } as object,
          },
        });

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: { result: output ?? null } as Record<string, unknown>,
          },
        });
      }

      history.push({ role: 'user', parts: responseParts });
    }

    return this.finalize(threadId, finalText, trace, totalIn, totalOut, iter, 'GEMINI');
  }

  // -- helpers ------------------------------------------------------------

  private async finalize(
    threadId: string,
    finalText: string,
    trace: ToolCallTrace[],
    totalIn: number,
    totalOut: number,
    iter: number,
    provider: AIProvider,
  ): Promise<SendMessageResponse> {
    let resolvedText = finalText;
    if (iter >= MAX_ITERATIONS && !resolvedText) {
      this.logger.warn(`Coach hit ${MAX_ITERATIONS}-iteration cap on thread ${threadId}`);
      resolvedText = '(Reached the tool-call iteration cap. Try rephrasing your question.)';
      await this.prisma.chatMessage.create({
        data: {
          threadId,
          role: 'ASSISTANT',
          content: resolvedText,
          metadata: { warning: 'max_iterations', provider } as object,
        },
      });
    }
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });
    return {
      assistantText: resolvedText,
      toolCalls: trace,
      inputTokens: totalIn,
      outputTokens: totalOut,
      iterations: iter,
      provider,
    };
  }

  /**
   * Persist a no-key / wrong-provider warning as an assistant message so
   * the rationale is visible the next time the user opens the chat.
   */
  private async surfaceError(
    threadId: string,
    message: string,
    provider: AIProvider | null,
  ): Promise<SendMessageResponse> {
    await this.prisma.chatMessage.create({
      data: {
        threadId,
        role: 'ASSISTANT',
        content: message,
        metadata: { warning: 'no_api_key', provider } as object,
      },
    });
    return {
      assistantText: message,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      iterations: 0,
      provider,
    };
  }

  private async hasUsableKey(userId: string, provider: AIProvider): Promise<boolean> {
    const userKey = await this.keys.getDecrypted(userId, provider);
    if (userKey) return true;
    const envName = provider === 'ANTHROPIC' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
    return Boolean(process.env[envName]);
  }

  /** Prefer Anthropic, fall back to Gemini, otherwise null. */
  private async pickProvider(userId: string): Promise<AIProvider | null> {
    if (await this.hasUsableKey(userId, 'ANTHROPIC')) return 'ANTHROPIC';
    if (await this.hasUsableKey(userId, 'GEMINI')) return 'GEMINI';
    return null;
  }

  /**
   * Rebuild Anthropic's MessageParam[] from our persisted ChatMessage rows.
   * For ASSISTANT messages we use the stored block array (which includes
   * any tool_use blocks) so tool_use ids round-trip cleanly. Consecutive
   * TOOL rows from the same iteration collapse into a single user-side
   * tool_result message.
   */
  private async buildAnthropicHistory(threadId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    const out: Anthropic.MessageParam[] = [];
    let pendingTools: Anthropic.ToolResultBlockParam[] = [];

    const flushTools = (): void => {
      if (pendingTools.length > 0) {
        out.push({ role: 'user', content: pendingTools });
        pendingTools = [];
      }
    };

    for (const m of rows) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (m.role === 'USER') {
        flushTools();
        out.push({ role: 'user', content: m.content });
      } else if (m.role === 'ASSISTANT') {
        flushTools();
        const blocks = meta['blocks'] as Anthropic.ContentBlock[] | undefined;
        if (blocks && Array.isArray(blocks) && blocks.length > 0) {
          out.push({ role: 'assistant', content: blocks });
        } else if (m.content) {
          out.push({ role: 'assistant', content: m.content });
        }
      } else if (m.role === 'TOOL') {
        pendingTools.push({
          type: 'tool_result',
          tool_use_id: String(meta['toolUseId'] ?? ''),
          content: JSON.stringify(meta['toolOutput'] ?? null),
        });
      }
    }
    flushTools();
    return out;
  }

  /**
   * Rebuild Gemini's Content[] from persisted rows. Mirror of the
   * Anthropic builder, but with role: 'user' | 'model' and parts using
   * { text } / { functionCall } / { functionResponse }. Consecutive
   * TOOL rows collapse into a single user-side functionResponse content.
   */
  private async buildGeminiHistory(threadId: string): Promise<Content[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    const out: Content[] = [];
    let pendingFnResponses: Part[] = [];

    const flush = (): void => {
      if (pendingFnResponses.length > 0) {
        out.push({ role: 'user', parts: pendingFnResponses });
        pendingFnResponses = [];
      }
    };

    for (const m of rows) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      if (m.role === 'USER') {
        flush();
        out.push({ role: 'user', parts: [{ text: m.content }] });
      } else if (m.role === 'ASSISTANT') {
        flush();
        const parts = meta['parts'] as Part[] | undefined;
        if (parts && Array.isArray(parts) && parts.length > 0) {
          out.push({ role: 'model', parts });
        } else if (m.content) {
          out.push({ role: 'model', parts: [{ text: m.content }] });
        }
      } else if (m.role === 'TOOL') {
        pendingFnResponses.push({
          functionResponse: {
            name: String(meta['toolName'] ?? ''),
            response: { result: meta['toolOutput'] ?? null } as Record<string, unknown>,
          },
        });
      }
    }
    flush();
    return out;
  }

  private async getOrCreateThread(userId: string) {
    const existing = await this.prisma.chatThread.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    return this.prisma.chatThread.create({ data: { userId } });
  }

  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@local.vitalogy` },
      update: {},
    });
  }
}

function pretty(p: AIProvider): string {
  return p === 'ANTHROPIC' ? 'Anthropic' : 'Gemini';
}

function toMessageDto(row: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  metadata: unknown;
}): ChatMessageDto {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    role: row.role as ChatMessageDto['role'],
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    toolName: typeof meta['toolName'] === 'string' ? meta['toolName'] : undefined,
    toolInput: meta['toolInput'],
    toolOutput: meta['toolOutput'],
    inputTokens: typeof meta['inputTokens'] === 'number' ? meta['inputTokens'] : undefined,
    outputTokens:
      typeof meta['outputTokens'] === 'number' ? meta['outputTokens'] : undefined,
  };
}

/**
 * One-line human summary of a tool result, used as the `content` of the
 * persisted TOOL row so the chat history is readable without inspecting
 * `metadata.toolOutput` JSON.
 */
function summarizeToolResult(name: string, output: unknown): string {
  if (output && typeof output === 'object' && 'error' in output) {
    return `${name} failed: ${(output as { error: string }).error}`;
  }
  switch (name) {
    case 'recall_memories': {
      const arr = output as { id: string }[];
      return `Recalled ${arr.length} ${arr.length === 1 ? 'memory' : 'memories'}.`;
    }
    case 'save_memory':
      return 'Saved a new memory.';
    case 'update_memory':
      return 'Updated a memory.';
    case 'delete_memory':
      return 'Deleted a memory.';
    case 'list_recent_activities': {
      const arr = output as { id: string }[];
      return `Listed ${arr.length} recent activities.`;
    }
    case 'get_activity_detail': {
      const a = output as { name?: string; distanceKm?: number };
      return a.name
        ? `Loaded "${a.name}" (${a.distanceKm} km).`
        : 'Loaded activity detail.';
    }
    case 'get_training_load':
      return 'Loaded training-load summary.';
    case 'get_achievements':
      return 'Loaded lifetime PRs.';
    case 'get_user_profile':
      return 'Loaded profile.';
    case 'list_pending_workouts': {
      const arr = output as { id: string }[];
      return `${arr.length} pending workout${arr.length === 1 ? '' : 's'}.`;
    }
    case 'create_workout': {
      const w = output as { title?: string; totalMin?: number };
      return w.title
        ? `Saved "${w.title}" (${w.totalMin} min) to your mobile.`
        : 'Saved a new workout.';
    }
    case 'delete_workout':
      return 'Deleted a planned workout.';
    default:
      return `Ran tool ${name}.`;
  }
}
