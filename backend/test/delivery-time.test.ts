import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isDailyDeliveryWindowAvailable, tanzaniaHour } from '../src/delivery-time.js';

test('Tanzania delivery windows close at their delivery start and end times', () => {
  const morningOpening = new Date('2026-11-23T04:00:00.000Z');
  assert.equal(tanzaniaHour(morningOpening), 7);
  assert.equal(isDailyDeliveryWindowAvailable('morning', morningOpening), true);

  const eveningBeforeOpening = new Date('2026-11-23T12:00:00.000Z');
  assert.equal(tanzaniaHour(eveningBeforeOpening), 15);
  assert.equal(isDailyDeliveryWindowAvailable('evening', eveningBeforeOpening), true);

  const eveningClosed = new Date('2026-11-23T15:00:00.000Z');
  assert.equal(tanzaniaHour(eveningClosed), 18);
  assert.equal(isDailyDeliveryWindowAvailable('evening', eveningClosed), false);
});
