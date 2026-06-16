import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

/**
 * Thin wrapper over Angular HttpClient that:
 *  - prepends the configured API base URL when set, otherwise sends to the
 *    same origin (useful with a dev-server proxy, as the simulator uses)
 *  - sends the configured X-User-Id header so the backend middleware
 *    can scope queries to this install
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

  /**
   * True only when an explicit base URL is set. Mobile uses this to decide
   * whether to queue uploads locally instead of attempting them.
   */
  isConfigured(): boolean {
    return this.config.apiBaseUrl().length > 0;
  }

  async get<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { headers: this.headers() }));
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.url(path), body, { headers: this.headers() }),
    );
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.patch<T>(this.url(path), body, { headers: this.headers() }),
    );
  }

  private url(path: string): string {
    const base = this.config.apiBaseUrl();
    const prefixed = path.startsWith('/') ? path : `/${path}`;
    // Empty base → relative URL (uses dev-server proxy or same-origin in prod).
    return base ? `${base}${prefixed}` : prefixed;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-User-Id': this.config.userId(),
    };
  }
}
