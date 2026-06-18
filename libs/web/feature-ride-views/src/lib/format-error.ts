/**
 * Pull a readable message out of whatever HttpClient throws.
 *
 * Bare `String(err)` on an HttpErrorResponse renders as
 * "[object Object]" — useless to the user. We dig into the standard
 * NestJS error envelope (`{ message, error, statusCode }`) and fall
 * back through reasonable alternatives. Shared by both the editor and
 * RideViewsService so error formatting stays consistent.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // HttpErrorResponse: { status, error: { message, error, statusCode } | string, message }
    const inner = e['error'];
    if (inner && typeof inner === 'object') {
      const msg = (inner as Record<string, unknown>)['message'];
      if (typeof msg === 'string' && msg.length > 0) return msg;
      if (Array.isArray(msg) && msg.length > 0) return msg.join(', ');
    }
    if (typeof inner === 'string' && inner.length > 0) return inner;
    if (typeof e['message'] === 'string' && (e['message'] as string).length > 0) {
      return e['message'] as string;
    }
    if (typeof e['statusText'] === 'string') {
      return `${e['status'] ?? ''} ${e['statusText']}`.trim();
    }
  }
  return String(err);
}
