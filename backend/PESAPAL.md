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

Apply the existing payment/database setup in order: `supabase/mobile_account_payments.sql`, `supabase/pesapal_payments.sql`, then the timestamped payment-related migrations, including `20261104190000_volume_location_delivery.sql` and `20261106150000_tier_pricing_and_order_modes.sql`. Confirm they have been applied to the target database before enabling checkout. Register the IPN once through the authenticated `POST /admin/payments/pesapal/register-ipn` route; the stored notification ID is server-only.

## Checkout contract for web/mobile clients

All checkout API calls use the existing bearer-authenticated API client. Prices and fees in a request are never trusted: the server reloads inventory, chooses prices and suppliers, recomputes delivery, and persists the resulting TZS amount.

1. `GET /checkout/options` returns `{ cash_on_delivery, online_payment }`. Start online checkout only when `online_payment` is true.
2. `POST /checkout/quote` accepts `mode`, `delivery_window`, `items: [{ product_id, qty }]`, `lat`, and `lng`. Use its returned `items`, subtotal, delivery fees, and total for display; quote values are not authorization to charge.
3. `POST /payments/initialize` accepts:

   ```json
   {
     "client_platform": "web",
     "mode": "retail",
     "delivery_window": "morning",
     "delivery_fee_accepted": true,
     "quoted_delivery_fee": 0,
     "items": [{ "product_id": "UUID", "qty": 1 }],
     "lat": -6.16,
     "lng": 35.75,
     "customer": { "name": "Customer", "email": "customer@example.test", "phone": "+255700000000" }
   }
   ```

   On success (`201`), retain `tx_ref` and `order_tracking_id`, then open `payment_url` in the system browser. Never mark an order paid based on the redirect or query parameters alone.
4. On return, call authenticated `POST /payments/confirm` with `{ "tx_ref": "...", "order_tracking_id": "..." }`. Treat the order as placed only when the server responds with `{ "order_id": "..." }`. A `202` means still pending; retry confirmation later. `402` means PesaPal reported an unsuccessful payment; other non-2xx errors should be shown as recoverable/support errors, not success.
5. The public PesaPal callback and IPN are not payment proof. The backend queries PesaPal's transaction-status API and checks the tracking ID, merchant reference, TZS amount, and currency before the database creates an order. The database completion RPC serializes concurrent IPN/callback/customer confirmations and returns the same order on repeat confirmation.

The current initialization route creates a new transaction reference for each request. Frontends should prevent duplicate taps and not automatically retry an ambiguous initialization response. Full request-level idempotency requires coordinated backend-route changes plus an idempotency-key contract; it is not provided by the completion RPC alone.

## Provider references

- [PesaPal API 3.0 reference](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference) — sandbox base URL: `https://cybqa.pesapal.com/pesapalv3`; live base URL: `https://pay.pesapal.com/v3`.
- [GetTransactionStatus](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus).
- [PesaPal sample API 3 integration](https://github.com/Pesapal-Ltd/sample_api3).
