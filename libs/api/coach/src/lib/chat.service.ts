import { Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicService, KeyService } from 'ai';
import { PrismaService } from 'db';
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
6. When recommending a workout, be specific: zone, duration, structure (e.g. "2×20 min at 0.95 IF with 5 min recovery"), and a one-line reason tied to the athlete's current state.`;

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
  messages: ChatMessageDto[];
}

export interface SendMessageResponse {
  assistantText: string;
  toolCalls: ToolCallTrace[];
  inputTokens: number;
  outputTokens: number;
  iterations: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly keys: KeyService,
    private readonly tools: CoachToolsService,
  ) {}

  /**
   * Latest (and currently only) thread for the user, with all messages.
   * Lazily creates an empty thread on first call.
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
      messages: rows.map(toMessageDto),
    };
  }

  /**
   * Run one conversational turn. Persists the user message, then loops
   * with Anthropic — dispatching any tool_use it asks for and feeding
   * results back — until the model emits a final text response. All
   * intermediate assistant + tool messages are persisted so the thread
   * preserves the reasoning trace.
   */
  async sendMessage(userId: string, content: string): Promise<SendMessageResponse> {
    await this.ensureUser(userId);
    const thread = await this.getOrCreateThread(userId);

    await this.prisma.chatMessage.create({
      data: { threadId: thread.id, role: 'USER', content },
    });

    // BYOK first; env-managed key as fallback for server admins / pro tier.
    const apiKey = await this.keys.getDecrypted(userId, 'ANTHROPIC');
    let client: Anthropic;
    try {
      client = this.anthropic.client(apiKey ?? undefined);
    } catch {
      // No user key AND no env key — surface a clear message in-band so
      // the chat history is self-explanatory next time the user opens it.
      const msg =
        "I don't have an Anthropic API key yet. Add one in Profile → AI keys to start chatting (or paste one for the server admin).";
      await this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: 'ASSISTANT',
          content: msg,
          metadata: { warning: 'no_api_key' } as object,
        },
      });
      return {
        assistantText: msg,
        toolCalls: [],
        inputTokens: 0,
        outputTokens: 0,
        iterations: 0,
      };
    }
    const history = await this.buildAnthropicHistory(thread.id);
    const model = this.anthropic.defaultModel;
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
          threadId: thread.id,
          role: 'ASSISTANT',
          content: text,
          metadata: {
            stopReason: response.stop_reason,
            blocks: response.content as unknown as object[],
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            model,
            iteration: iter,
          } as object,
        },
      });

      // Append the assistant turn to history for the next iteration. We
      // pass the raw blocks back to preserve tool_use ids.
      history.push({
        role: 'assistant',
        content: response.content as Anthropic.MessageParam['content'],
      });

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        finalText = text;
        break;
      }

      // Dispatch every tool the model asked for, persist each as a TOOL
      // message, and build the user-side tool_result message in one pass.
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const output = await this.tools.dispatch(t.name, t.input, userId);
        trace.push({ name: t.name, input: t.input, output });

        await this.prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            role: 'TOOL',
            content: summarizeToolResult(t.name, output),
            metadata: {
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

    if (iter >= MAX_ITERATIONS && !finalText) {
      this.logger.warn(`Coach hit ${MAX_ITERATIONS}-iteration cap for user ${userId}`);
      finalText = '(Reached the tool-call iteration cap. Try rephrasing your question.)';
      await this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: 'ASSISTANT',
          content: finalText,
          metadata: { warning: 'max_iterations' } as object,
        },
      });
    }

    await this.prisma.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return {
      assistantText: finalText,
      toolCalls: trace,
      inputTokens: totalIn,
      outputTokens: totalOut,
      iterations: iter,
    };
  }

  // ---------------------------------------------------------------------

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
    default:
      return `Ran tool ${name}.`;
  }
}
