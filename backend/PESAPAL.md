# PesaPal checkout (API 3.0)

The backend integration uses PesaPal API 3.0 and defaults to its sandbox. No payment is submitted until an authenticated customer calls the checkout endpoint; deployment and smoke tests must not use real-payment credentials or initiate a live transaction.

## Server configuration

Set these as backend process/deployment secrets. Do not put credentials in the web/mobile builds, source control, or client requests.

| Variable | Purpose |
| --- | --- |
| `PESAPAL_ENV` | `sandbox` or `live`; omit it or use `sandbox` for testing. Production must be an explicit, reviewed switch to `live`. |
| `PESAPAL_CONSUMER_KEY` | PesaPal API consumer key. |
| `PESAPAL_CONSUMER_SECRET` | PesaPal API consumer secret. |
| `PUBLIC_API_URL` | Public HTTPS backend origin used to register the IPN URL. |
| `WEB_CHECKOUT_CALLBACK_URL` | Optional trusted website return URL; required for `client_platform: "web"`. |
| `PAYMENT_APP_CALLBACK_URL` | Mobile deep-link return URL (defaults to `saplaya://payment-callback`). |
| `PAYMENT_SUPPORTED_CURRENCIES` | Comma-separated ISO 4217 currencies the merchant account is explicitly enabled to charge, for example `TZS,USD,EUR`. Defaults to `TZS`; never add a code unless the PesaPal merchant account supports it. |

Apply the existing payment/database setup in order: `supabase/mobile_account_payments.sql`, `supabase/pesapal_payments.sql`, then the timestamped migrations through `20261115090000_order_claims_commissions_notifications.sql`, and finally `20261116100000_multicurrency_checkout_recipient.sql`. Confirm they have been applied to the target database before enabling checkout. Register the IPN once through the authenticated `POST /admin/payments/pesapal/register-ipn` route; the stored notification ID is server-only.

## Checkout contract for web/mobile clients

All checkout API calls use the existing bearer-authenticated API client. Prices and fees in a request are never trusted: the server reloads inventory, chooses prices and suppliers, recomputes delivery, and persists the resulting TZS amount.

1. `GET /checkout/options` returns `{ cash_on_delivery, cash_currency: "TZS", online_payment, supported_payment_currencies: ["TZS", ...] }`. The list is server-configured and limited to currencies enabled on the merchant account; it is not a list of every ISO currency. Cash orders always remain in TZS.
2. `POST /checkout/quote` accepts `mode`, `delivery_window`, `items: [{ product_id, qty }]`, `lat`, `lng`, and optional `currency` (ISO 4217 code, default `TZS`). Use its returned `items`, subtotal, delivery fees, TZS `amount`, `payment_amount`, `payment_currency`, and `exchange_rate` for display. The rate is payment-currency units per 1 TZS. A requested currency not in the merchant allowlist is rejected; it is never silently changed to TZS. Quote values are not authorization to charge.
3. `POST /payments/initialize` accepts:

   ```json
   {
     "client_platform": "web",
     "mode": "retail",
     "delivery_window": "morning",
     "delivery_fee_accepted": true,
     "quoted_delivery_fee": 0,
     "currency": "USD",
     "quoted_payment_amount": 12.34,
     "items": [{ "product_id": "UUID", "qty": 1 }],
     "lat": -6.16,
     "lng": 35.75,
     "customer": { "name": "Customer", "email": "customer@example.test", "phone": "+255700000000" },
     "recipient": { "name": "Recipient", "phone": "+12025550123" },
     "delivery_address": "12 Example Road, Dar es Salaam"
   }
   ```

   `currency` must be one of `supported_payment_currencies`. Send the same `quoted_payment_amount` returned by the quote (required for foreign currencies); the server recomputes conversion and returns `409` if the quote amount changed. The customer is still the authenticated buyer; `recipient` is optional per-order delivery contact data. The online payment phone must be in international E.164 format. On success (`201`), retain `tx_ref` and `order_tracking_id`, then open `payment_url` in the system browser. The response includes the charged `payment_amount` and `payment_currency`; `amount`/`base_amount` represent the underlying TZS order total. Never mark an order paid based on the redirect or query parameters alone.
4. On return, call authenticated `POST /payments/confirm` with `{ "tx_ref": "...", "order_tracking_id": "..." }`. Treat the order as placed only when the server responds with `{ "order_id": "..." }`. A `202` means still pending; retry confirmation later. `402` means PesaPal reported an unsuccessful payment; other non-2xx errors should be shown as recoverable/support errors, not success.
5. The public PesaPal callback and IPN are not payment proof. The backend queries PesaPal's transaction-status API and checks the tracking ID, merchant reference, exact charged amount at the currency's minor-unit precision, and currency before the database creates an order. The database completion RPC serializes concurrent IPN/callback/customer confirmations, preserves the base TZS accounting total, and returns the same order on repeat confirmation. The checkout stores the exchange-rate and rounded charged-amount snapshot. Cash-on-delivery orders report TZS only.

The exchange rate is sourced from the existing cached TZS rate feed (up to 24 hours old); both the quote and payment initialization use the server's cached rate, and the amount snapshot submitted to PesaPal is checked against its transaction-status response. PesaPal's API accepts an ISO currency code and numeric amount in `SubmitOrderRequest`, but this does not mean every currency is enabled for a particular merchant account. Enable only currencies explicitly confirmed for the Saplaya merchant account.

The current initialization route creates a new transaction reference for each request. Frontends should prevent duplicate taps and not automatically retry an ambiguous initialization response. Full request-level idempotency requires coordinated backend-route changes plus an idempotency-key contract; it is not provided by the completion RPC alone.

## Provider references

- [PesaPal API 3.0 reference](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference) — sandbox base URL: `https://cybqa.pesapal.com/pesapalv3`; live base URL: `https://pay.pesapal.com/v3`.
- [GetTransactionStatus](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus).
- [SubmitOrderRequest](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest) — documents the ISO currency code and numeric payment amount fields.
- [PesaPal sample API 3 integration](https://github.com/Pesapal-Ltd/sample_api3).
