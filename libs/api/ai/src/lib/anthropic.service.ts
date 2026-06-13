import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class AnthropicService {
  readonly defaultModel = 'claude-opus-4-7';

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns a client built from the given key, or from env if `apiKey` is omitted.
   * Throws if neither is available.
   */
  client(apiKey?: string): Anthropic {
    const key = apiKey ?? this.config.get<string>('ANTHROPIC_API_KEY');
    if (!key) {
      throw new Error(
        'No Anthropic API key. Set ANTHROPIC_API_KEY in env, or pass a user key.',
      );
    }
    return new Anthropic({ apiKey: key });
  }

  async complete(opts: {
    prompt: string;
    apiKey?: string;
    model?: string;
    maxTokens?: number;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
    const client = this.client(opts.apiKey);
    const model = opts.model ?? this.defaultModel;
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2048,
      messages: [{ role: 'user', content: opts.prompt }],
    });
    const text = res.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    return {
      text,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      model,
    };
  }
}
