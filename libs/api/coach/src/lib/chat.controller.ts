import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
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
   * Wipe the active thread and start fresh. Used when the rider wants to
   * switch providers — the locked-provider check on each turn rejects
   * cross-provider switches mid-thread.
   */
  @Delete('thread')
  reset(@UserId() userId: string) {
    return this.chat.resetThread(userId);
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
