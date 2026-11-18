'use client';

import { userFacingMessage } from '@/lib/user-facing-error';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Fields';
import { fetchAdmin } from '@/lib/supabase';
import { useToast } from '@/lib/store';

export type OperationScopeDraft = {
  countryCode: string;
  countryName: string;
  regionCode: string;
  regionName: string;
  districtCode: string | null;
  districtName: string | null;
};

type LocationOption = { code: string; name: string };

/** Country → region → district picker that builds a list of operation areas (global, country, region or district level). */
export function OperationScopeEditor({ scopes, onChange }: {
  scopes: OperationScopeDraft[];
  onChange: (scopes: OperationScopeDraft[]) => void;
}) {
  const push = useToast((state) => state.push);
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [regions, setRegions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [draft, setDraft] = useState({ countryCode: '', regionCode: '', regionName: '', districtCode: '', districtName: '' });

  const selectedCountry = countries.find((country) => country.code === draft.countryCode);
  const selectedRegion = regions.find((region) => region.code === draft.regionCode);

  useEffect(() => {
    let active = true;
    void fetchAdmin<LocationOption[]>('/locations/countries')
      .then((options) => { if (active) setCountries(options); })
      .catch((error: unknown) => push(userFacingMessage(error, 'Could not load countries.'), 'bad'));
    return () => { active = false; };
  }, [push]);

  useEffect(() => {
    let active = true;
    setRegions([]);
    setDistricts([]);
    if (!draft.countryCode) return () => { active = false; };
    void fetchAdmin<LocationOption[]>(`/locations/countries/${encodeURIComponent(draft.countryCode)}/regions`)
      .then((options) => { if (active) setRegions(options); })
      .catch((error: unknown) => push(userFacingMessage(error, 'Could not load regions.'), 'bad'));
    return () => { active = false; };
  }, [draft.countryCode, push]);

  useEffect(() => {
    let active = true;
    setDistricts([]);
    if (!draft.countryCode || !draft.regionCode) return () => { active = false; };
    void fetchAdmin<LocationOption[]>(`/locations/countries/${encodeURIComponent(draft.countryCode)}/regions/${encodeURIComponent(draft.regionCode)}/districts`)
      .then((options) => { if (active) setDistricts(options); })
      .catch((error: unknown) => push(userFacingMessage(error, 'Could not load districts.'), 'bad'));
    return () => { active = false; };
  }, [draft.countryCode, draft.regionCode, push]);

  function addScope() {
    if (!selectedCountry || !draft.regionCode) {
      push('Choose a country and region first.', 'bad');
      return;
    }
    const selectedCity = districts.find((city) => city.code === draft.districtCode);
    const scope: OperationScopeDraft = {
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      regionCode: draft.regionCode,
      regionName: selectedRegion?.name ?? draft.regionName.trim(),
      districtCode: draft.districtName.trim() ? (selectedCity?.code ?? draft.districtCode.trim()) : null,
      districtName: draft.districtName.trim() || null,
    };
    if (scopes.some((entry) => (
      entry.countryCode === scope.countryCode
      && entry.regionCode === scope.regionCode
      && entry.districtCode === scope.districtCode
    ))) {
      push('That operation area is already on the list.', 'info');
      return;
    }
    onChange([...scopes, scope]);
    setDraft((current) => ({ ...current, districtCode: '', districtName: '' }));
  }

  return (
    <div className="space-y-3 rounded-2xl bg-milk p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Country">
          <Select value={draft.countryCode} onChange={(event) => setDraft({ countryCode: event.target.value, regionCode: '', regionName: '', districtCode: '', districtName: '' })}>
            <option value="">Choose country</option>
            {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </Select>
        </Field>
        <Field label="Region / state">
          {regions.length ? (
            <Select value={draft.regionCode} onChange={(event) => {
              const region = regions.find((entry) => entry.code === event.target.value);
              setDraft((current) => ({ ...current, regionCode: event.target.value, regionName: region?.name ?? '', districtCode: '', districtName: '' }));
            }} disabled={!draft.countryCode}>
              <option value="">Choose region/state</option>
              {regions.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}
            </Select>
          ) : (
            <Input value={draft.regionName} placeholder="Enter region or state" disabled={!draft.countryCode} onChange={(event) => setDraft((current) => ({
              ...current,
              regionName: event.target.value,
              regionCode: event.target.value.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '-')
                || event.target.value.trim().toUpperCase(),
              districtCode: '',
              districtName: '',
            }))} />
          )}
        </Field>
        <Field label="District / city (optional)">
          {districts.length ? (
            <Select value={draft.districtCode} onChange={(event) => {
              const city = districts.find((entry) => entry.code === event.target.value);
              setDraft((current) => ({ ...current, districtCode: event.target.value, districtName: city?.name ?? '' }));
            }} disabled={!draft.regionCode}>
              <option value="">Entire region/state</option>
              {districts.map((district) => <option key={district.code} value={district.code}>{district.name}</option>)}
            </Select>
          ) : (
            <Input value={draft.districtName} placeholder="Enter district or city" disabled={!draft.regionCode} onChange={(event) => setDraft((current) => ({ ...current, districtCode: event.target.value, districtName: event.target.value }))} />
          )}
        </Field>
      </div>
      <Button variant="soft" icon={<Plus size={18} />} disabled={!selectedCountry || !draft.regionCode} onClick={addScope}>Add operation area</Button>
      <ul className="flex flex-wrap gap-2">
        {scopes.map((scope, index) => (
          <li key={`${scope.countryCode}-${scope.regionCode}-${scope.districtCode ?? 'all'}-${index}`} className="flex min-w-0 max-w-full items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-sm font-semibold">
            <span className="min-w-0 break-words">{scope.countryName} · {scope.regionName}{scope.districtName ? ` · ${scope.districtName}` : ' · all districts'}</span>
            <button type="button" aria-label="Remove operation area" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-milk" onClick={() => onChange(scopes.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
