import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  CreateRideViewPayload,
  RideView,
  RideViewKind,
  ReorderRideViewsPayload,
  UpdateRideViewPayload,
  WidgetPlacement,
} from 'data-models';

/**
 * Seed templates for the three built-in defaults. Order here = initial
 * sortOrder (Combined first, then Workout, then Sensors — matches the
 * mobile hard-coded carousel order users already know).
 *
 * Defaults carry a null `gridConfig` — the mobile client renders them
 * from hard-coded presets. We just need the row to exist so the user
 * can toggle `isActive` / reorder it like any other view.
 */
const DEFAULT_TEMPLATES: ReadonlyArray<{
  kind: RideViewKind;
  name: string;
  rows: number;
  cols: number;
}> = [
  { kind: 'DEFAULT_COMBINED', name: 'Combined', rows: 4, cols: 4 },
  { kind: 'DEFAULT_WORKOUT', name: 'Workout coach', rows: 4, cols: 4 },
  { kind: 'DEFAULT_SENSORS', name: 'Sensors', rows: 4, cols: 4 },
];

@Injectable()
export class RideViewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List every view belonging to the user, in sortOrder. On the first
   * call for a new user, lazily inserts the three DEFAULT_* rows so the
   * mobile carousel matches what users had before the feature shipped.
   */
  async listForUser(userId: string): Promise<RideView[]> {
    await this.seedDefaultsIfMissing(userId);
    const rows = await this.prisma.rideView.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toApi);
  }

  async create(
    userId: string,
    payload: CreateRideViewPayload,
  ): Promise<RideView> {
    assertValidGrid(payload.rows, payload.cols, payload.gridConfig);
    // Place the new view at the end of the user's list.
    const max = await this.prisma.rideView.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const nextOrder = (max._max.sortOrder ?? -1) + 1;
    const row = await this.prisma.rideView.create({
      data: {
        userId,
        kind: 'CUSTOM',
        name: payload.name.trim() || 'Untitled view',
        rows: payload.rows,
        cols: payload.cols,
        gridConfig: payload.gridConfig as unknown as object,
        sortOrder: nextOrder,
      },
    });
    return toApi(row);
  }

  async update(
    userId: string,
    id: string,
    payload: UpdateRideViewPayload,
  ): Promise<RideView> {
    const existing = await this.findOwned(userId, id);
    const isDefault = existing.kind !== 'CUSTOM';

    // Defaults only allow toggling isActive — name, grid, and dimensions
    // are part of the built-in presets and shouldn't drift per-user.
    if (isDefault) {
      const forbidden = Object.keys(payload).filter(
        (k) => k !== 'isActive',
      );
      if (forbidden.length > 0) {
        throw new BadRequestException(
          `Default views accept only 'isActive' (got: ${forbidden.join(', ')}).`,
        );
      }
    } else if (payload.gridConfig || payload.rows != null || payload.cols != null) {
      // For customs that touch the grid: re-validate against the (possibly
      // new) dimensions so we never persist a placement that overflows.
      const nextRows = payload.rows ?? existing.rows;
      const nextCols = payload.cols ?? existing.cols;
      const nextGrid =
        payload.gridConfig ??
        ((existing.gridConfig as unknown as WidgetPlacement[] | null) ?? []);
      assertValidGrid(nextRows, nextCols, nextGrid);
    }

    const row = await this.prisma.rideView.update({
      where: { id },
      data: {
        ...(payload.name != null ? { name: payload.name.trim() } : {}),
        ...(payload.isActive != null ? { isActive: payload.isActive } : {}),
        ...(payload.rows != null ? { rows: payload.rows } : {}),
        ...(payload.cols != null ? { cols: payload.cols } : {}),
        ...(payload.gridConfig != null
          ? { gridConfig: payload.gridConfig as unknown as object }
          : {}),
      },
    });
    return toApi(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.findOwned(userId, id);
    if (existing.kind !== 'CUSTOM') {
      throw new BadRequestException('Default views cannot be deleted.');
    }
    await this.prisma.rideView.delete({ where: { id } });
  }

  /**
   * Bulk-update sortOrder by rewriting every listed id to its position
   * in the array. Ids that aren't owned by the user are silently dropped
   * (don't leak existence). Order is applied in one transaction so the
   * mobile carousel never sees an in-between state.
   */
  async reorder(
    userId: string,
    payload: ReorderRideViewsPayload,
  ): Promise<RideView[]> {
    const owned = await this.prisma.rideView.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((r) => r.id));
    const targetIds = payload.order.filter((id) => ownedIds.has(id));

    await this.prisma.$transaction(
      targetIds.map((id, i) =>
        this.prisma.rideView.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );
    return this.listForUser(userId);
  }

  // === helpers ===

  private async seedDefaultsIfMissing(userId: string): Promise<void> {
    const existing = await this.prisma.rideView.findMany({
      where: { userId, kind: { in: DEFAULT_TEMPLATES.map((t) => t.kind) } },
      select: { kind: true },
    });
    const have = new Set(existing.map((r) => r.kind));
    const missing = DEFAULT_TEMPLATES.filter((t) => !have.has(t.kind));
    if (missing.length === 0) return;

    // Append defaults to the end of the user's existing list so an
    // already-customized carousel doesn't get re-ordered.
    const max = await this.prisma.rideView.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    let nextOrder = (max._max.sortOrder ?? -1) + 1;
    for (const t of missing) {
      await this.prisma.rideView.create({
        data: {
          userId,
          kind: t.kind,
          name: t.name,
          rows: t.rows,
          cols: t.cols,
          gridConfig: undefined,
          sortOrder: nextOrder++,
        },
      });
    }
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.rideView.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Ride view not found.');
    return row;
  }
}

function toApi(row: {
  id: string;
  kind: RideViewKind;
  name: string;
  sortOrder: number;
  isActive: boolean;
  rows: number;
  cols: number;
  gridConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
}): RideView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    rows: row.rows,
    cols: row.cols,
    gridConfig:
      row.gridConfig == null
        ? null
        : (row.gridConfig as WidgetPlacement[]),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Bounds + sanity checks so a malformed grid config never makes it to
 * Postgres (and from there to a phone that's about to render it on a
 * handlebar at 25 km/h).
 *
 * Catches: out-of-bounds placements, zero/negative sizes, duplicate ids.
 * Does NOT enforce non-overlap — gridstack on the web side handles
 * collision resolution; storing the user's chosen state verbatim keeps
 * the editor and the render path in sync.
 */
function assertValidGrid(
  rows: number,
  cols: number,
  placements: WidgetPlacement[],
): void {
  if (!Number.isInteger(rows) || rows < 1 || rows > 12) {
    throw new BadRequestException('rows must be an integer between 1 and 12.');
  }
  if (!Number.isInteger(cols) || cols < 1 || cols > 12) {
    throw new BadRequestException('cols must be an integer between 1 and 12.');
  }
  const seenIds = new Set<string>();
  for (const p of placements) {
    if (typeof p.id !== 'string' || !p.id) {
      throw new BadRequestException('Each widget needs a non-empty id.');
    }
    if (seenIds.has(p.id)) {
      throw new BadRequestException(`Duplicate widget id: ${p.id}.`);
    }
    seenIds.add(p.id);
    if (p.w < 1 || p.h < 1) {
      throw new BadRequestException(`Widget ${p.id}: w and h must be >= 1.`);
    }
    if (p.x < 0 || p.y < 0 || p.x + p.w > cols || p.y + p.h > rows) {
      throw new BadRequestException(
        `Widget ${p.id} extends outside the ${rows}×${cols} grid.`,
      );
    }
  }
}
