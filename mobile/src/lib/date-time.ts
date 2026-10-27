const TANZANIA_TIME_ZONE = 'Africa/Dar_es_Salaam';

export function formatTanzaniaDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TANZANIA_TIME_ZONE,
  }).format(new Date(value));
}

export function formatTanzaniaDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: TANZANIA_TIME_ZONE,
  }).format(new Date(value));
}
