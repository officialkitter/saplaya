'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type MarketLocation = { lat: number; lng: number; accuracy: number };
type ExchangeRates = { base: 'TZS'; rates: Record<string, number>; updated_at: string };
type MarketContextValue = {
  location: MarketLocation | null;
  locationError: string;
  requestLocation: () => void;
  clearLocation: () => void;
  countryName: string | null;
  marketAccent: string;
  currency: string;
  setCurrency: (currency: string) => void;
  currencies: string[];
  formatPrice: (amountTzs: number) => string;
  exchangeUpdatedAt: string | null;
  ratesLoading: boolean;
  ratesUnavailable: boolean;
};

const CURRENCIES = [
  'TZS', 'USD', 'EUR', 'GBP', 'KES', 'UGX', 'RWF', 'NGN', 'ZAR', 'CAD', 'AUD',
  'INR', 'AED', 'JPY', 'CNY', 'NZD', 'GHS', 'SAR', 'HKD', 'SGD', 'BRL', 'MXN',
  'EGP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'PKR', 'IDR', 'PHP', 'MYR',
  'THB', 'VND',
];
const REGION_CURRENCY: Record<string, string> = {
  TZ: 'TZS', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', GB: 'GBP',
  KE: 'KES', UG: 'UGX', RW: 'RWF', NG: 'NGN', ZA: 'ZAR', GH: 'GHS',
  IN: 'INR', AE: 'AED', SA: 'SAR', JP: 'JPY', CN: 'CNY', HK: 'HKD',
  SG: 'SGD', BR: 'BRL', MX: 'MXN', EG: 'EGP', CH: 'CHF', SE: 'SEK',
  NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY', PK: 'PKR', ID: 'IDR',
  PH: 'PHP', MY: 'MYR', TH: 'THB', VN: 'VND',
};
const DEFAULT_CURRENCY = 'USD';
const LOCATION_KEY = 'saplaya.market.location';
const CURRENCY_KEY = 'saplaya.market.currency';
const REGION_ACCENTS: Record<string, string> = {
  TZ: '#2E7D32',
  KE: '#1565C0',
  UG: '#C62828',
  RW: '#00838F',
  US: '#1565C0',
  GB: '#3949AB',
  IN: '#EF6C00',
};
const MARKET_ACCENTS = ['#2E7D32', '#1565C0', '#6A1B9A', '#00695C', '#AD1457', '#4E342E', '#283593', '#00838F'];

const MarketContext = createContext<MarketContextValue | null>(null);

function localeRegion(locale: string): string | null {
  return locale.split('-').slice(1).find((part) => /^[A-Z]{2}$/.test(part.toUpperCase()))?.toUpperCase() ?? null;
}

function localeCurrency(locale: string) {
  const region = localeRegion(locale);
  return (region && REGION_CURRENCY[region]) || DEFAULT_CURRENCY;
}

function localeAccent(locale: string): string {
  const region = localeRegion(locale);
  if (!region) return '#00695C';
  if (REGION_ACCENTS[region]) return REGION_ACCENTS[region];
  const hash = [...region].reduce((value, character) => value + character.charCodeAt(0), 0);
  return MARKET_ACCENTS[hash % MARKET_ACCENTS.length];
}

function isExchangeRates(value: unknown): value is ExchangeRates {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.base !== 'TZS' || typeof candidate.updated_at !== 'string'
    || typeof candidate.rates !== 'object' || candidate.rates === null) return false;
  const rates = candidate.rates as Record<string, unknown>;
  return rates.TZS === 1
    && Object.entries(rates).every(([code, rate]) =>
      /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
    );
}

async function loadExchangeRates(): Promise<ExchangeRates> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('The storefront API is not configured.');
  const response = await fetch(`${apiUrl}/exchange-rates`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!isExchangeRates(result)) throw new Error('The exchange-rate response was invalid.');
  return result;
}

export function GlobalMarketProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<MarketLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [currency, setCurrencyState] = useState('TZS');
  const [rates, setRates] = useState<Record<string, number>>({ TZS: 1 });
  const [exchangeUpdatedAt, setExchangeUpdatedAt] = useState<string | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesUnavailable, setRatesUnavailable] = useState(false);
  const [locale, setLocale] = useState('en-US');
  const [countryName, setCountryName] = useState<string | null>(null);
  const locationRequestId = useRef(0);

  const setCurrency = useCallback((nextCurrency: string) => {
    if (!CURRENCIES.includes(nextCurrency) || typeof rates[nextCurrency] !== 'number') return;
    setCurrencyState(nextCurrency);
    try {
      window.localStorage.setItem(CURRENCY_KEY, nextCurrency);
    } catch (error) {
      console.error('Could not save display currency preference:', error);
    }
  }, [rates]);

  const requestLocation = useCallback(() => {
    const requestId = ++locationRequestId.current;
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.');
      return;
    }
    setLocationError('');
    setLocation(null);
    try {
      window.sessionStorage.removeItem(LOCATION_KEY);
      window.localStorage.removeItem(LOCATION_KEY);
    } catch (error) {
      console.error('Could not clear the previous location:', error);
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locationRequestId.current) return;
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(next);
        try {
          window.sessionStorage.setItem(LOCATION_KEY, JSON.stringify(next));
        } catch (error) {
          console.error('Could not save the market location:', error);
        }
      },
      (error) => {
        if (requestId !== locationRequestId.current) return;
        const message = error.code === error.PERMISSION_DENIED
          ? 'Allow location access in your browser to prioritize nearby farms.'
          : error.code === error.TIMEOUT
            ? 'Could not get a precise location in time. Try again or browse without location.'
            : 'Could not determine your location. Try again or browse without location.';
        setLocationError(message);
        setLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, []);

  const clearLocation = useCallback(() => {
    locationRequestId.current += 1;
    setLocation(null);
    setLocationError('');
    try {
      window.sessionStorage.removeItem(LOCATION_KEY);
      window.localStorage.removeItem(LOCATION_KEY);
    } catch (error) {
      console.error('Could not clear the saved market location:', error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const detectedLocale = navigator.language || 'en-US';
    setLocale(detectedLocale);
    const region = localeRegion(detectedLocale);
    setCountryName(region ? new Intl.DisplayNames([detectedLocale], { type: 'region' }).of(region) ?? null : null);
    let savedCurrency: string | null = null;
    try {
      savedCurrency = window.localStorage.getItem(CURRENCY_KEY);
      window.sessionStorage.removeItem(LOCATION_KEY);
      window.localStorage.removeItem(LOCATION_KEY);
    } catch (error) {
      console.error('Could not restore market preferences:', error);
    }
    const initialCurrency = savedCurrency && CURRENCIES.includes(savedCurrency)
      ? savedCurrency
      : localeCurrency(detectedLocale);
    setCurrencyState(initialCurrency);

    void loadExchangeRates().then((result) => {
      if (!active) return;
      setRates(result.rates);
      setExchangeUpdatedAt(result.updated_at);
      setRatesUnavailable(false);
      setRatesLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Could not load market display exchange rates:', error);
      setCurrencyState('TZS');
      setRatesUnavailable(true);
      setRatesLoading(false);
    });

    return () => {
      active = false;
    };
  }, [requestLocation]);

  const formatPrice = useCallback((amountTzs: number) => {
    const rate = rates[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(amountTzs);
    }
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountTzs * rate);
  }, [currency, locale, rates]);

  const value = useMemo<MarketContextValue>(() => ({
    location,
    locationError,
    requestLocation,
    clearLocation,
    countryName,
    marketAccent: localeAccent(locale),
    currency,
    setCurrency,
    currencies: CURRENCIES.filter((code) => typeof rates[code] === 'number'),
    formatPrice,
    exchangeUpdatedAt,
    ratesLoading,
    ratesUnavailable,
  }), [location, locationError, requestLocation, clearLocation, countryName, locale, currency, setCurrency, rates, formatPrice, exchangeUpdatedAt, ratesLoading, ratesUnavailable]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useGlobalMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useGlobalMarket must be used within GlobalMarketProvider.');
  return context;
}
