'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { useGlobalMarket } from '@/lib/global-market';
import { Input } from './Fields';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'step'> & {
  value: string | number;
  onValueChange: (baseAmount: string) => void;
};

export function CurrencyInput({ value, onValueChange, disabled, onBlur, ...props }: Props) {
  const { currency, exchangeRate } = useGlobalMarket();
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  const display = (amount: string | number) => amount === '' || !exchangeRate
    ? '' : (Number(amount) * exchangeRate).toFixed(digits);
  const [draft, setDraft] = useState(() => display(value));
  const lastInput = useRef<string | null>(null);

  useEffect(() => {
    if (lastInput.current !== `${currency}|${exchangeRate}|${Number(value)}`) {
      setDraft(value === '' || !exchangeRate ? '' : (Number(value) * exchangeRate).toFixed(digits));
      lastInput.current = null;
    }
  }, [value, currency, exchangeRate, digits]);

  return (
    <span className="relative block">
      <Input {...props} type="number" step="any" value={draft} disabled={disabled || !exchangeRate} className="pr-16" onChange={(event) => {
        const next = event.target.value;
        if (!exchangeRate) return;
        const base = next === '' ? '' : String(Math.round(Number(next) / exchangeRate));
        lastInput.current = `${currency}|${exchangeRate}|${Number(base)}`;
        setDraft(next);
        onValueChange(base);
      }} onBlur={(event) => {
        lastInput.current = null;
        setDraft(display(value));
        onBlur?.(event);
      }} />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-mute">{currency}</span>
    </span>
  );
}
