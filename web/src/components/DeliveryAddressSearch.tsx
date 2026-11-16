'use client';

import { useRef, useState } from 'react';
import { useGlobalMarket } from '@/lib/global-market';
import { userFacingMessage } from '@/lib/user-facing-error';

type SearchPlace = { id: string; label: string; lat: number; lng: number; partial_match: boolean };

export function DeliveryAddressSearch() {
  const market = useGlobalMarket();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<SearchPlace[]>([]);
  const [selected, setSelected] = useState<SearchPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const search = async () => {
    const request = ++generation.current;
    setError('');
    setPlaces([]);
    setSelected(null);
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

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <label className="block text-sm font-bold" htmlFor="delivery-search">Deliver to another address</label>
      <input id="delivery-search" value={query} onChange={(event) => {
        generation.current += 1;
        setQuery(event.target.value);
        setPlaces([]);
        setSelected(null);
        setLoading(false);
        setError('');
      }} onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); void search(); }
      }} placeholder="Enter a street address, city and country" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
      <button type="button" disabled={loading} onClick={() => void search()} className="w-full rounded-xl bg-leaf-soft px-3 py-2.5 text-sm font-bold text-leaf-deep disabled:opacity-50">
        {loading ? 'Searching…' : 'Find address'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {places.map((place) => (
          <li key={place.id}>
            <button type="button" aria-pressed={selected?.id === place.id} onClick={() => setSelected(place)} className={`w-full rounded-xl border p-3 text-left text-sm ${selected?.id === place.id ? 'border-leaf bg-leaf-soft' : 'border-line'}`}>
              {place.label}{place.partial_match && <span className="mt-1 block font-bold">Partial match — check the map carefully.</span>}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="space-y-2">
          <a target="_blank" rel="noopener noreferrer" className="block text-sm font-bold text-leaf-deep underline" href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}&query_place_id=${encodeURIComponent(selected.id)}`}>Check this destination on Google Maps</a>
          <p className="text-xs text-ink-mute">Confirm the destination before continuing. Delivery availability and fees will be recalculated for this location.</p>
          <button type="button" onClick={() => {
            market.setDeliveryLocation(selected);
            setPlaces([]);
            setSelected(null);
            setQuery('');
          }} className="w-full rounded-xl bg-leaf px-3 py-2.5 text-sm font-bold text-white">Confirm delivery destination</button>
        </div>
      )}
      {market.location && <p role="status" className="break-words text-sm font-semibold">Delivering to: {market.placeName || `${market.location.lat.toFixed(5)}, ${market.location.lng.toFixed(5)}`}</p>}
      <p className="text-[11px] text-ink-mute">Address results by Google Maps</p>
    </div>
  );
}
