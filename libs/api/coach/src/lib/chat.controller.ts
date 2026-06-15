import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserId } from 'auth';
import { ChatService } from './chat.service.js';

interface SendMessageBody {
  content: string;
}

@Controller('coach')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Returns the user's chat thread + all messages (oldest first). */
  @Get('thread')
  thread(@UserId() userId: string) {
    return this.chat.getThread(userId);
  }

  /**
   * Send a user message, run the tool-use loop, return the final assistant
   * text plus the tool-call trace from this turn (the full updated thread
   * is fetched separately via GET /thread).
   */
  @Post('message')
  send(@UserId() userId: string, @Body() body: SendMessageBody) {
    return this.chat.sendMessage(userId, body.content);
  }
}
