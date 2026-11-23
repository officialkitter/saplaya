'use client';

import { useMemo, useState } from 'react';
import { COUNTRY_CODES } from '@/lib/country-codes';

export function CountryCodePicker({
  value,
  onChange,
}: { value: string; onChange: (dial: string) => void }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return COUNTRY_CODES.filter((country) =>
      !term || country.name.toLowerCase().includes(term)
      || country.code.toLowerCase().includes(term)
      || country.dial.includes(term),
    );
  }, [query]);
  const selected = COUNTRY_CODES.find((country) => country.dial === value) ?? COUNTRY_CODES[0];

  return (
    <div className="relative">
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-line bg-white px-3 font-bold">
          <span>{selected.code}</span>
          <span className="text-ink-mute">{selected.dial}</span>
        </summary>
        <div className="absolute z-30 mt-2 max-h-64 w-72 max-w-[calc(100vw-4rem)] overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-lift">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search country or code"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
          <ul className="mt-2 max-h-48 overflow-y-auto">
            {matches.map((country) => (
              <li key={`${country.code}-${country.dial}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(country.dial);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-leaf-soft"
                >
                  <span className="font-bold">{country.name}</span>
                  <span className="text-ink-mute">{country.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
