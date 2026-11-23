export type DailyDeliveryWindow = 'morning' | 'evening';

const TIME_ZONE = 'Africa/Dar_es_Salaam';

export function tanzaniaHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return Number.isFinite(hour) ? hour : 0;
}

export function availableDailyDeliveryWindows(now = new Date(), includeTomorrow = true): DailyDeliveryWindow[] {
  const hour = tanzaniaHour(now);
  const windows: DailyDeliveryWindow[] = [];
  if (hour < 10) windows.push('morning');
  if (hour < 18) windows.push('evening');
  if (includeTomorrow && hour >= 10) windows.push('morning');
  return windows;
}

export function dailyDeliveryDay(window: DailyDeliveryWindow, now = new Date()) {
  const hour = tanzaniaHour(now);
  if (window === 'morning') return hour < 10 ? 'Today' : 'Tomorrow';
  return hour < 18 ? 'Today' : 'Tomorrow';
}
