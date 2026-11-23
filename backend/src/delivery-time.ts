export type DailyDeliveryWindow = 'morning' | 'evening';

export function tanzaniaHour(now = new Date(), timeZone = 'Africa/Dar_es_Salaam'): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour : 0;
}

export function isDailyDeliveryWindowAvailable(
  window: DailyDeliveryWindow,
  now = new Date(),
): boolean {
  const hour = tanzaniaHour(now);
  if (window === 'morning') return true;
  return hour < 18;
}
