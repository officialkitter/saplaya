'use client';

import { useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { useGlobalMarket } from '@/lib/global-market';
import { userFacingMessage } from '@/lib/user-facing-error';

type SearchPlace = { id: string; label: string; lat: number; lng: number; partial_match: boolean };

export function DeliveryAddressSearch() {
  const market = useGlobalMarket();
  const [query, setQuery] = useState(market.placeName ?? '');
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const search = async () => {
    const request = ++generation.current;
    setError('');
    setPlaces([]);
    if (query.trim().length < 3) {
      setError('Enter an address with at least three characters.');
      return;
    }
    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
      if (!base) throw new Error('Address search is not configured.');
      const response = await fetch(`${base}/location/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not search delivery addresses.');
      if (request !== generation.current) return;
      setPlaces(result.places);
      if (!result.places.length) setError('No matching address found. Include the city and country, or use GPS.');
    } catch (cause) {
      if (request === generation.current) setError(userFacingMessage(cause, 'Could not search delivery addresses.'));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };

  const choose = (place: SearchPlace) => {
    if (place.partial_match) {
      setError('This address is not exact. Add a street or landmark and search again.');
      return;
    }
    market.setDeliveryLocation(place);
    setQuery(place.label);
    setPlaces([]);
    setError('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-bold" htmlFor="delivery-search">Delivery address</label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-leaf">
        <Search size={18} className="shrink-0 text-ink-mute" />
        <input
          id="delivery-search"
          value={query}
          onChange={(event) => {
            generation.current += 1;
            setQuery(event.target.value);
            setPlaces([]);
            setLoading(false);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
          placeholder="Search address"
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm outline-none"
        />
        {loading && <span className="text-xs font-bold text-ink-mute">Searching…</span>}
      </div>
      {query.trim().length >= 3 && !loading && places.length === 0 && (
        <button type="button" onClick={() => void search()} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-leaf-deep">
          Search
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {places.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {places.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => choose(place)} className="flex w-full items-center gap-3 px-3 py-3 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-leaf-soft text-leaf-deep">
                  <MapPin size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{place.label}</span>
                  {place.partial_match && <span className="mt-1 block text-xs text-ink-mute">Destination needs a more exact address</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {market.location && (
        <p role="status" className="text-xs text-ink-mute">
          Delivering to: {market.placeName || `${market.location.lat.toFixed(5)}, ${market.location.lng.toFixed(5)}`}
        </p>
      )}
      <p className="text-[11px] text-ink-mute">Address suggestions from Google Maps</p>
    </div>
  );
}
