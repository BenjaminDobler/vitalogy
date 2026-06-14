import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

/**
 * Thin wrapper over Angular HttpClient that:
 *  - prepends the configured API base URL
 *  - sends the configured X-User-Id header so the backend middleware
 *    can scope queries to this install
 *  - throws a clear error if no base URL is set (caller should queue
 *    the request locally and retry later)
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ConfigService);

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

  private url(path: string): string {
    const base = this.config.apiBaseUrl();
    if (!base) {
      throw new Error(
        'No API base URL configured. Open Settings and set one (e.g. http://192.168.1.42:3000).',
      );
    }
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-User-Id': this.config.userId(),
    };
  }
}
