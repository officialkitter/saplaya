'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type MarketLocation = { lat: number; lng: number; accuracy: number };
type ExchangeRates = { base: 'TZS'; rates: Record<string, number>; updated_at: string };
type MarketContextValue = {
  location: MarketLocation | null;
  locationError: string;
  requestLocation: () => void;
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

const MarketContext = createContext<MarketContextValue | null>(null);

function localeCurrency(locale: string) {
  const localeParts = locale.split('-');
  const region = localeParts[localeParts.length - 1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || DEFAULT_CURRENCY;
}

function isMarketLocation(value: unknown): value is MarketLocation {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.lat === 'number' && Number.isFinite(candidate.lat) && candidate.lat >= -90 && candidate.lat <= 90
    && typeof candidate.lng === 'number' && Number.isFinite(candidate.lng) && candidate.lng >= -180 && candidate.lng <= 180
    && typeof candidate.accuracy === 'number' && Number.isFinite(candidate.accuracy) && candidate.accuracy >= 0;
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
    if (!navigator.geolocation) {
      setLocationError('Location services are not available in this browser.');
      return;
    }
    setLocationError('');
    setLocation(null);
    try {
      window.localStorage.removeItem(LOCATION_KEY);
    } catch (error) {
      console.error('Could not clear the previous location:', error);
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(next);
        try {
          window.localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
        } catch (error) {
          console.error('Could not save the market location:', error);
        }
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Allow location access in your browser to prioritize nearby farms.'
          : error.code === error.TIMEOUT
            ? 'Could not get a precise location in time. Try again or browse without location.'
            : 'Could not determine your location. Try again or browse without location.';
        setLocationError(message);
        setLocation(null);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  }, []);

  useEffect(() => {
    let active = true;
    const detectedLocale = navigator.language || 'en-US';
    setLocale(detectedLocale);
    let savedCurrency: string | null = null;
    let savedLocation: string | null = null;
    try {
      savedCurrency = window.localStorage.getItem(CURRENCY_KEY);
      savedLocation = window.localStorage.getItem(LOCATION_KEY);
    } catch (error) {
      console.error('Could not restore market preferences:', error);
    }
    const initialCurrency = savedCurrency && CURRENCIES.includes(savedCurrency)
      ? savedCurrency
      : localeCurrency(detectedLocale);
    setCurrencyState(initialCurrency);

    if (savedLocation) {
      try {
        const parsed: unknown = JSON.parse(savedLocation);
        if (isMarketLocation(parsed)) setLocation(parsed);
      } catch (error) {
        console.error('Could not restore the saved market location:', error);
        window.localStorage.removeItem(LOCATION_KEY);
      }
    }

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
    currency,
    setCurrency,
    currencies: CURRENCIES.filter((code) => typeof rates[code] === 'number'),
    formatPrice,
    exchangeUpdatedAt,
    ratesLoading,
    ratesUnavailable,
  }), [location, locationError, requestLocation, currency, setCurrency, rates, formatPrice, exchangeUpdatedAt, ratesLoading, ratesUnavailable]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useGlobalMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error('useGlobalMarket must be used within GlobalMarketProvider.');
  return context;
}
