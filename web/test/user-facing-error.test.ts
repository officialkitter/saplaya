import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { safeHttpErrorMessage, UserFacingError, userFacingMessage } from '../src/lib/user-facing-error';

test('only explicitly trusted user-facing errors are displayed', () => {
  const fallback = 'We could not complete your request. Please try again.';
  assert.equal(userFacingMessage(new Error('relation private.customer_data does not exist'), fallback), fallback);
  assert.equal(userFacingMessage(new Error('<script>window.location = "/admin"</script>'), fallback), fallback);
  assert.equal(userFacingMessage(new UserFacingError('Check the email address and try again.'), fallback), 'Check the email address and try again.');
});

test('server error status messages stay generic and actionable', () => {
  assert.equal(safeHttpErrorMessage(401), 'Please sign in again to continue.');
  assert.equal(safeHttpErrorMessage(403), 'You do not have permission to complete this action.');
  assert.equal(safeHttpErrorMessage(500), 'We could not complete your request. Please try again.');
});
