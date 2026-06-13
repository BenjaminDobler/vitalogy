import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class GeminiService {
  readonly defaultModel = 'gemini-2.5-pro';

  constructor(private readonly config: ConfigService) {}

  client(apiKey?: string): GoogleGenAI {
    const key = apiKey ?? this.config.get<string>('GEMINI_API_KEY');
    if (!key) {
      throw new Error(
        'No Gemini API key. Set GEMINI_API_KEY in env, or pass a user key.',
      );
    }
    return new GoogleGenAI({ apiKey: key });
  }

  async complete(opts: {
    prompt: string;
    apiKey?: string;
    model?: string;
  }): Promise<{ text: string; inputTokens?: number; outputTokens?: number; model: string }> {
    const client = this.client(opts.apiKey);
    const model = opts.model ?? this.defaultModel;
    const res = await client.models.generateContent({
      model,
      contents: opts.prompt,
    });
    return {
      text: res.text ?? '',
      inputTokens: res.usageMetadata?.promptTokenCount,
      outputTokens: res.usageMetadata?.candidatesTokenCount,
      model,
    };
  }
}
