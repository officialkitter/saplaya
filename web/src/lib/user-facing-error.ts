const userFacingErrorBrand = Symbol('SaplayaUserFacingError');

export class UserFacingError extends Error {
  readonly [userFacingErrorBrand] = true;
}

export function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError && error[userFacingErrorBrand]
    ? error.message
    : fallback;
}

export function safeHttpErrorMessage(status: number): string {
  if (status === 401) return 'Please sign in again to continue.';
  if (status === 403) return 'You do not have permission to complete this action.';
  if (status === 404) return 'This item could not be found.';
  if (status === 409) return 'This information changed. Refresh and try again.';
  if (status === 400 || status === 422) return 'Please check the information and try again.';
  if (status === 429) return 'Please wait a moment before trying again.';
  return 'We could not complete your request. Please try again.';
}

export function logSafeError(context: string, error: unknown): void {
  console.error(context, { name: error instanceof Error ? error.name : 'UnknownError' });
}
