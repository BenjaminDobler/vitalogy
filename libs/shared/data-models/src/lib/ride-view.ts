/**
 * Shared types describing the user's mobile ride-screen layout.
 *
 * On mobile, the ride screen is a horizontal swipe carousel. Each page
 * is a `RideView` — either one of the three built-in defaults (Combined /
 * Workout / Sensors) or a custom layout the user designed in the web
 * grid editor. The user can toggle any view on/off and re-order them;
 * mobile renders the active views in `sortOrder`.
 */

export type RideViewKind =
  | 'DEFAULT_COMBINED'
  | 'DEFAULT_WORKOUT'
  | 'DEFAULT_SENSORS'
  | 'CUSTOM';

/**
 * Catalog of widgets a custom view can place on its grid. Mirrors the
 * mobile WidgetRendererComponent — adding one here without wiring the
 * renderer means it will render blank on the phone.
 */
export type WidgetType =
  // Sensor metrics
  | 'hr'
  | 'cadence'
  | 'speed'
  | 'power'
  | 'distance'
  | 'avg-hr'
  | 'avg-speed'
  // Specialty visualizations
  | 'speed-gauge'
  | 'speed-ring'
  | 'map'
  // Time / lap counters
  | 'lap-time'
  | 'total-time'
  // Environment + coaching
  | 'weather'
  | 'workout-coach';

/**
 * One widget on a custom view's grid. Coordinates are in grid cells;
 * top-left is (0,0). `w` and `h` are in cells. The host view's
 * `rows × cols` define the bounds.
 */
export interface WidgetPlacement {
  id: string;
  widget: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RideView {
  id: string;
  kind: RideViewKind;
  name: string;
  sortOrder: number;
  isActive: boolean;
  rows: number;
  cols: number;
  /** Null for DEFAULT_* views — mobile renders those from hard-coded presets. */
  gridConfig: WidgetPlacement[] | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /api/ride-views (create custom). */
export interface CreateRideViewPayload {
  name: string;
  rows: number;
  cols: number;
  gridConfig: WidgetPlacement[];
}

/**
 * Payload for PUT /api/ride-views/:id. All fields optional — the API
 * applies a subset depending on whether the view is a default (only
 * `isActive` allowed) or a CUSTOM (any field).
 */
export interface UpdateRideViewPayload {
  name?: string;
  isActive?: boolean;
  rows?: number;
  cols?: number;
  gridConfig?: WidgetPlacement[];
}

/** Payload for POST /api/ride-views/reorder. */
export interface ReorderRideViewsPayload {
  /** Array of view ids in the order they should appear. */
  order: string[];
}
