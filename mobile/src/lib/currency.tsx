import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './supabase';

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
const CURRENCY_KEY = 'saplaya.display-currency';

type CurrencyContextValue = {
  currency: string;
  currencies: string[];
  setCurrency: (currency: string) => void;
  formatPrice: (amountTzs: number) => string;
  ratesLoading: boolean;
  ratesUnavailable: boolean;
  ratesUpdatedAt: string | null;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function localeCurrency(locale: string) {
  const localeParts = locale.split('-');
  const region = localeParts[localeParts.length - 1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || 'USD';
}

function isExchangeRates(value: unknown): value is { base: 'TZS'; rates: Record<string, number>; updated_at: string } {
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

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState('TZS');
  const [rates, setRates] = useState<Record<string, number>>({ TZS: 1 });
  const [ratesUnavailable, setRatesUnavailable] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [locale, setLocale] = useState('en-TZ');

  const setCurrency = useCallback((nextCurrency: string) => {
    if (!CURRENCIES.includes(nextCurrency) || typeof rates[nextCurrency] !== 'number') return;
    setCurrencyState(nextCurrency);
    void AsyncStorage.setItem(CURRENCY_KEY, nextCurrency).catch((error: unknown) => {
      console.error('Could not save display currency preference:', error);
    });
  }, [rates]);

  useEffect(() => {
    let active = true;
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
    setLocale(detectedLocale);
    const initialCurrency = localeCurrency(detectedLocale);

    void AsyncStorage.getItem(CURRENCY_KEY).then((saved) => {
      if (active) setCurrencyState(saved && CURRENCIES.includes(saved) ? saved : initialCurrency);
    }).catch((error: unknown) => {
      console.error('Could not restore display currency preference:', error);
      if (active) setCurrencyState(initialCurrency);
    });

    void fetch(`${API_URL}/exchange-rates`).then(async (response) => {
      if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}.`);
      const result: unknown = await response.json();
      if (!isExchangeRates(result)) throw new Error('The exchange-rate response was invalid.');
      if (active) {
        setRates(result.rates);
        setRatesUpdatedAt(result.updated_at);
        setRatesLoading(false);
      }
    }).catch((error: unknown) => {
      console.error('Could not load display exchange rates:', error);
      if (active) {
        setCurrencyState('TZS');
        setRatesUnavailable(true);
        setRatesLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const formatPrice = useCallback((amountTzs: number) => {
    const rate = rates[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(amountTzs);
    }
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountTzs * rate);
  }, [currency, locale, rates]);

  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    currencies: CURRENCIES.filter((code) => typeof rates[code] === 'number'),
    setCurrency,
    formatPrice,
    ratesLoading,
    ratesUnavailable,
    ratesUpdatedAt,
  }), [currency, rates, setCurrency, formatPrice, ratesLoading, ratesUnavailable, ratesUpdatedAt]);

  return React.createElement(CurrencyContext.Provider, { value }, children);
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider.');
  return context;
}
