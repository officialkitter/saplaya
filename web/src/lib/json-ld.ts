export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
