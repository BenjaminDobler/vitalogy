import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CreateRideViewPayload,
  ReorderRideViewsPayload,
  RideView,
  UpdateRideViewPayload,
} from 'data-models';
import { formatError } from './format-error';

/**
 * Web-side ride-views client. Owns the full CRUD surface (mobile is
 * read-only): list / create custom / update / delete / reorder.
 *
 * The `views` signal is the canonical list — components subscribe to
 * it so toggling isActive on one row re-renders the others immediately.
 * Every mutation re-fetches the list from the server so sortOrder
 * stays consistent without us hand-rolling local re-ordering math.
 */
@Injectable({ providedIn: 'root' })
export class RideViewsService {
  private readonly http = inject(HttpClient);

  readonly views = signal<RideView[]>([]);
  readonly loading = signal(false);
  readonly lastError = signal<string | null>(null);

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.lastError.set(null);
    try {
      const list = await firstValueFrom(
        this.http.get<RideView[]>('/api/ride-views'),
      );
      this.views.set(list);
    } catch (err) {
      this.lastError.set(formatError(err));
    } finally {
      this.loading.set(false);
    }
  }

  async create(payload: CreateRideViewPayload): Promise<RideView> {
    const created = await firstValueFrom(
      this.http.post<RideView>('/api/ride-views', payload),
    );
    await this.refresh();
    return created;
  }

  async update(id: string, patch: UpdateRideViewPayload): Promise<RideView> {
    const updated = await firstValueFrom(
      this.http.put<RideView>(`/api/ride-views/${id}`, patch),
    );
    // Patch the single row in place so toggling isActive feels instant —
    // no list-wide refresh needed for the common case.
    this.views.update((list) => list.map((v) => (v.id === id ? updated : v)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/ride-views/${id}`));
    this.views.update((list) => list.filter((v) => v.id !== id));
  }

  /**
   * Send a new order to the server. We optimistically update the local
   * signal first so the drag-drop reorder feels instant, then reconcile
   * with the server's authoritative response.
   */
  async reorder(orderedIds: string[]): Promise<void> {
    const indexById = new Map(orderedIds.map((id, i) => [id, i]));
    this.views.update((list) =>
      list
        .map((v) => ({
          ...v,
          sortOrder: indexById.get(v.id) ?? v.sortOrder,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
    const payload: ReorderRideViewsPayload = { order: orderedIds };
    const fresh = await firstValueFrom(
      this.http.post<RideView[]>('/api/ride-views/reorder', payload),
    );
    this.views.set(fresh);
  }
}
