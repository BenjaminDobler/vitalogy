import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health(): { status: 'ok'; uptimeSec: number; ts: string } {
    return {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    };
  }
}
