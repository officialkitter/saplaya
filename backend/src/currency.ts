export type CurrencyQuote = {
  currency: string;
  payment_amount: number;
  exchange_rate: number;
  fraction_digits: number;
};

export function isE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function supportedPaymentCurrencies(
  configured = process.env.PAYMENT_SUPPORTED_CURRENCIES,
): string[] {
  const currencies = configured?.trim()
    ? configured.split(',').map((currency) => currency.trim().toUpperCase()).filter(Boolean)
    : ['TZS'];
  const unique = [...new Set(currencies)];
  for (const currency of unique) {
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Invalid payment currency code: ${currency}`);
    }
    if (!Intl.supportedValuesOf('currency').includes(currency)) {
      throw new Error(`Unsupported ISO 4217 currency code: ${currency}`);
    }
    currencyFractionDigits(currency);
  }
  return unique;
}

export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    throw new Error(`Invalid ISO 4217 currency code: ${currency}`);
  }
}

export function quoteCurrencyAmount(
  baseAmount: number,
  currency: string,
  rates: Record<string, number>,
  supportedCurrencies = supportedPaymentCurrencies(),
): CurrencyQuote | null {
  const normalizedCurrency = currency.toUpperCase();
  if (!supportedCurrencies.includes(normalizedCurrency)) return null;
  const exchangeRate = normalizedCurrency === 'TZS' ? 1 : rates[normalizedCurrency];
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error(`An exchange rate for ${normalizedCurrency} is unavailable.`);
  }
  const fractionDigits = currencyFractionDigits(normalizedCurrency);
  const scale = 10 ** fractionDigits;
  const minorUnits = Math.round(baseAmount * exchangeRate * scale);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
    throw new Error(`The ${normalizedCurrency} payment amount is outside the supported range.`);
  }
  return {
    currency: normalizedCurrency,
    payment_amount: minorUnits / scale,
    exchange_rate: exchangeRate,
    fraction_digits: fractionDigits,
  };
}

export function amountInMinorUnits(amount: number | string, currency: string): number | null {
  const parsedAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return null;
  const scale = 10 ** currencyFractionDigits(currency);
  const minorUnits = Math.round(parsedAmount * scale);
  if (!Number.isSafeInteger(minorUnits) || Math.abs(parsedAmount * scale - minorUnits) > 1e-7) {
    return null;
  }
  return minorUnits;
}

export function paymentAmountsMatch(
  actual: number | string | undefined,
  expected: number | string,
  currency: string,
): boolean {
  if (actual === undefined) return false;
  const actualMinorUnits = amountInMinorUnits(actual, currency);
  const expectedMinorUnits = amountInMinorUnits(expected, currency);
  return actualMinorUnits !== null && actualMinorUnits === expectedMinorUnits;
}
