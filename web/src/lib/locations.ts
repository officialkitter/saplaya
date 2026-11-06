export type LocationOption = { code: string; name: string };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

async function fetchLocationOptions(path: string): Promise<LocationOption[]> {
  if (!API_URL) throw new Error('Location options are temporarily unavailable.');
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error('Could not load country and region options.');
  return response.json();
}

export function fetchLocationCountries() {
  return fetchLocationOptions('/locations/countries');
}

export function fetchLocationRegions(countryCode: string) {
  return fetchLocationOptions(`/locations/countries/${encodeURIComponent(countryCode)}/regions`);
}

export function fetchLocationDistricts(countryCode: string, regionCode: string) {
  return fetchLocationOptions(`/locations/countries/${encodeURIComponent(countryCode)}/regions/${encodeURIComponent(regionCode)}/districts`);
}
