/**
 * An error whose message is written for the person using the app and is
 * safe to show as-is. Any other error is shown as the caller's fallback.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback;
}
