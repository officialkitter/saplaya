# Payment gateway: Stripe, Snippe, PesaPal and PayPal

The gateway keeps pricing and order fulfillment on the server. Stripe uses a Saplaya-branded Payment Element page, while Snippe and PesaPal use their hosted checkout pages. Deployment and read-only smoke tests must not initiate a live transaction. A successful build or valid key format does not prove that a merchant account is activated.

## Multi-provider configuration

Set `PAYMENT_PROVIDERS` to the desired priority order, for example `stripe,pesapal`. Set `PAYMENT_ENVIRONMENT=live` only for an approved live rollout; `test` requires test Stripe keys and sandbox PesaPal credentials. Snippe is live-only and must never be enabled for test runs. An incomplete explicit configuration stops API startup rather than silently selecting another provider.

| Variable | Purpose |
| --- | --- |
| `PAYMENT_PROVIDERS` | Comma-separated enabled providers: `stripe`, `snippe`, `pesapal`. Omit to preserve the existing PesaPal-only deployment. |
| `PAYMENT_ENVIRONMENT` | Required in explicit mode: `test` or `live`. |
| `STRIPE_SECRET_KEY` | Server-only API key with permission to create/read PaymentIntents. Must match the environment. |
| `STRIPE_PUBLISHABLE_KEY` | Matching account/environment publishable key used by Stripe.js. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the exact deployed Stripe endpoint. |
| `STRIPE_CURRENCIES` | Required explicit list of merchant-approved currencies. Special-case rounding currencies are rejected at startup. |
| `STRIPE_PAYMENT_PAGE_URL` | Full web page URL, normally `https://www.saplaya.org/checkout/pay`; HTTPS is required in live mode. No query string or fragment. |
| `SNIPPE_API_KEY` | Server-only live Snippe API key. |
| `SNIPPE_WEBHOOK_SECRET` | Account webhook signing key. |
| `SNIPPE_CURRENCIES` | Only `TZS` is supported; defaults to `TZS`. |
| `SNIPPE_PROFILE_ID` | Optional checkout profile ID. |
| `PESAPAL_CURRENCIES` | Merchant-approved PesaPal currencies in explicit mode; defaults to `TZS`. |

Keep the shared callback variables below. Remove `PAYMENT_SUPPORTED_CURRENCIES` when enabling explicit mode; use per-provider lists instead. Display currencies available across the website are not necessarily currencies a merchant can charge. Never infer enabled payment methods or currencies merely from the account's country.

### Stripe Elements and webhooks

1. In Stripe, resolve any paused-capability or outstanding verification tasks. The account holder must complete identity, bank, tax and other legally required information.
2. Confirm payment methods and currencies for this merchant in Stripe's dashboard. Configure only those currencies and ensure the publishable and secret keys belong to that same account and mode.
3. Register `https://saplaya-backend.up.railway.app/api/v1/payments/stripe-webhook` for `payment_intent.succeeded`, `payment_intent.processing`, `payment_intent.payment_failed`, and `payment_intent.canceled`. Store its signing secret securely as `STRIPE_WEBHOOK_SECRET`.
4. Configure branding in Stripe and register the checkout domain for wallets when required. Wallet availability also depends on HTTPS, the device/browser and merchant capabilities.
5. Build the web app with the correct `NEXT_PUBLIC_API_URL`. The `/checkout/pay?tx_ref=...` page requests a non-cacheable Elements session from the API; no secret API key is shipped to the browser. Payment details are collected inside Stripe's frames.
6. Mobile clients continue opening `payment_url` in the authentication browser, so the existing initialization and callback contract is unchanged. The API always re-queries the provider before creating an order; a browser redirect or signed webhook alone is not proof of payment.

No Stripe Product, Invoice, recurring billing or Tax feature is required for this one-time PaymentIntent flow. Enable those only when the business actually needs them.

### Snippe mobile-money rollout

Snippe supports hosted mobile-money checkout for M-Pesa, Airtel Money, Mixx by Yas and Halotel. This integration explicitly fixes `allowed_methods` to `mobile_money` and disables customer-entered amounts. Only whole TZS charges of at least 500 are accepted. Merchant branding comes from the chosen Snippe payment profile.

1. Sign in to Snippe, complete merchant verification and confirm the account can collect payments. Set the account API version to `2026-01-25` to match the documented session/webhook contract.
2. Store the API key as `SNIPPE_API_KEY` and the existing account signing key from Settings > Webhook Secret as `SNIPPE_WEBHOOK_SECRET` in backend secrets. Use collection read/create permissions only; this checkout does not require payout permissions. Do not send keys in chat.
3. Configure `PAYMENT_PROVIDERS=snippe,pesapal` to retain the current PesaPal option, `PAYMENT_ENVIRONMENT=live`, `SNIPPE_CURRENCIES=TZS` and the merchant-approved `PESAPAL_CURRENCIES`. Keep `PESAPAL_ENV=live` and remove the legacy `PAYMENT_SUPPORTED_CURRENCIES` variable. Omit Stripe until its account is approved and its settings are complete.
4. The session request supplies `https://saplaya-backend.up.railway.app/api/v1/payments/snippe-webhook` as its webhook URL. Keep the account signing key consistent with that endpoint. The handler verifies raw-body HMAC and timestamp, then retrieves the stored session to verify amount, currency, reference and completion before fulfillment.
5. Apply the shared gateway migration before deploying this backend even if Stripe is disabled. Switching providers does not remove that database prerequisite. There is no Snippe sandbox: automated adapter tests use fixtures, and read-only checks must not create sessions, trigger USSD prompts or make charges.

References: [hosted sessions](https://docs.snippe.sh/docs/2026-01-25/sessions), [authentication](https://docs.snippe.sh/docs/2026-01-25/authentication), [webhook verification](https://docs.snippe.sh/docs/2026-01-25/webhooks).

### Rollout order

1. Inspect migration history and apply `20261117100000_payment_gateway_providers.sql` after `20261116100000_multicurrency_checkout_recipient.sql`. The new migration adds provider tracking and service-role-only, serialized completion. It preserves the previous PesaPal completion wrapper during a rolling deploy.
   Run `supabase/tests/payment_gateway.sql` as `postgres` afterward. It verifies all three provider bindings, persisted fulfillment, repeat completion, stock accounting, legacy compatibility and RPC access controls inside a rolled-back transaction. Three `PASS` rows are required; any exception is a failure. It never contacts a provider or charges money.
2. Deploy the website containing `/checkout/pay`, then set the backend variables together and deploy the backend. Do not restart in explicit mode with a partial set of secrets.
3. Check `GET /checkout/options` and the authenticated admin Settings payment panel. "Configured" means local configuration checks passed, not that remote account capabilities or money movement have been verified.
4. Verify a complete purchase in an isolated Stripe test environment, including authentication, failed payment, additional authentication, webhook delivery, callback, order persistence and repeat confirmation. Snippe cannot be used for this test environment.
5. A live purchase requires separate explicit authorization. Until it has been confirmed with provider records, webhook delivery and the persisted order, live end-to-end payment remains unverified. Keep the existing working deployment if migration or secure settings are unavailable.

## PesaPal server configuration

Set these as backend process/deployment secrets. Do not put credentials in the web/mobile builds, source control, or client requests.

| Variable | Purpose |
| --- | --- |
| `PESAPAL_ENV` | `sandbox` or `live`; omit it or use `sandbox` for testing. Production must be an explicit, reviewed switch to `live`. |
| `PESAPAL_CONSUMER_KEY` | PesaPal API consumer key. |
| `PESAPAL_CONSUMER_SECRET` | PesaPal API consumer secret. |
| `PUBLIC_API_URL` | Public HTTPS backend origin used to register the IPN URL. |
| `WEB_CHECKOUT_CALLBACK_URL` | Optional trusted website return URL; required for `client_platform: "web"`. |
| `PAYMENT_APP_CALLBACK_URL` | Mobile deep-link return URL (defaults to `saplaya://payment-callback`). |
| `PAYMENT_SUPPORTED_CURRENCIES` | Legacy PesaPal-only currency list. Defaults to `TZS`. In explicit gateway mode remove this variable and use `PESAPAL_CURRENCIES`. |

In live mode, `PUBLIC_API_URL` and any configured `WEB_CHECKOUT_CALLBACK_URL` must use HTTPS and a publicly reachable host. Localhost/loopback URLs are rejected so a live payment cannot be initialized with return or IPN endpoints that Pesapal cannot reach. Use sandbox credentials and URLs for local development.

Apply the existing payment/database setup in order: `supabase/mobile_account_payments.sql`, `supabase/pesapal_payments.sql`, then the checkout/pricing migrations through `20261107100000_management_commissions_regions.sql`, and finally `20261116100000_multicurrency_checkout_recipient.sql`. The separate agent-claims/notifications migration is not a prerequisite for this checkout migration. Inspect the target schema and migration history before applying SQL; do not blindly replay unrelated migrations. Register the IPN once through the authenticated `POST /admin/payments/pesapal/register-ipn` route; the stored notification ID is server-only.

After applying the checkout migration, run `supabase/tests/multicurrency_checkout_recipient.sql` as `postgres` in the SQL Editor. It creates isolated fixtures inside a transaction, checks recipient persistence, legacy compatibility, FX snapshots, and repeat fulfillment, then rolls everything back. It does not contact a payment provider or charge anyone. Successful output is three `PASS` rows; any exception means validation failed.

The checkout migration supports a rolling backend deployment: legacy TZS payment inserts receive a TZS amount/rate snapshot, and the previous 12-argument cash-order RPC remains as a wrapper that creates an order without recipient/address details. Foreign-currency inserts still require an explicit converted amount and exchange rate. No checkout maintenance window is required for this migration.

## Checkout contract for web/mobile clients

All checkout API calls use the existing bearer-authenticated API client. Prices and fees in a request are never trusted: the server reloads inventory, chooses prices and suppliers, recomputes delivery, and persists the resulting TZS amount.

1. `GET /checkout/options` returns `{ cash_on_delivery, cash_currency: "TZS", online_payment, payment_currencies: ["merchant-enabled ISO codes"], payment_providers: [...] }`. The provider list includes configured methods and currencies; initialization accepts an optional `payment_provider` ID. The currency list is server-configured and limited to ready providers; it is not a list of every ISO currency. A custom configuration can omit TZS from online currencies without affecting TZS cash checkout.
2. `POST /checkout/quote` accepts `mode`, `delivery_window`, `items: [{ product_id, qty }]`, `lat`, `lng`, and optional `currency` (ISO 4217 code, default `TZS`). Use its returned `items`, subtotal, delivery fees, TZS `amount`, `payment_amount`, `payment_currency`, and `exchange_rate` for display. The rate is payment-currency units per 1 TZS. TZS quote is always available for cash checkout; non-TZS quote currencies must be merchant-enabled, and unsupported online currencies are never silently changed to TZS. Quote values are not authorization to charge.
3. `POST /payments/initialize` accepts:

   The example assumes USD is explicitly enabled on the merchant account; use the amount returned by the immediately preceding quote rather than hardcoding it.

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

   `currency` must be one of `payment_currencies`. Send the same `quoted_payment_amount` returned by the quote (required for foreign currencies); the server recomputes conversion and returns `409` if the quote amount changed. The customer is still the authenticated buyer; `recipient` is optional per-order delivery contact data and is preferred for operational delivery display. The delivery address and recipient fields are persisted on the order; the buyer remains the authenticated customer. The online payment phone must be in international E.164 format. On success (`201`), retain `tx_ref` and `order_tracking_id`, then open `payment_url` in the system browser. The response includes charged `payment_amount` and `payment_currency` (`currency` is an equivalent alias for older clients); `amount`/`base_amount` represent the underlying TZS order total. Never mark an order paid based on the redirect or query parameters alone.
4. On return, call authenticated `POST /payments/confirm` with `{ "tx_ref": "...", "order_tracking_id": "..." }`. Treat the order as placed only when the server responds with `{ "order_id": "..." }`. A `202` means still pending; retry confirmation later. `402` means the provider reported an unsuccessful payment; other non-2xx errors should be shown as recoverable/support errors, not success.
5. The public PesaPal callback and IPN are not payment proof. The backend queries PesaPal's transaction-status API and checks the tracking ID, merchant reference, exact charged amount at the currency's minor-unit precision, and currency before the database creates an order. The database completion RPC serializes concurrent IPN/callback/customer confirmations, preserves the base TZS accounting total, and returns the same order on repeat confirmation. The checkout stores the exchange-rate and rounded charged-amount snapshot. Cash-on-delivery orders report TZS only.

The exchange rate is sourced from the existing cached TZS rate feed (up to 24 hours old); both the quote and payment initialization use the server's cached rate, and the amount snapshot submitted to PesaPal is checked against its transaction-status response. PesaPal's API accepts an ISO currency code and numeric amount in `SubmitOrderRequest`, but this does not mean every currency is enabled for a particular merchant account. Enable only currencies explicitly confirmed for the Saplaya merchant account.

The current initialization route creates a new transaction reference for each request. Frontends should prevent duplicate taps and not automatically retry an ambiguous initialization response. Full request-level idempotency requires coordinated backend-route changes plus an idempotency-key contract; it is not provided by the completion RPC alone.

## Provider references

- [PesaPal API 3.0 reference](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference) — sandbox base URL: `https://cybqa.pesapal.com/pesapalv3`; live base URL: `https://pay.pesapal.com/v3`.
- [GetTransactionStatus](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus).
- [SubmitOrderRequest](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest) — documents the ISO currency code and numeric payment amount fields.
- [PesaPal sample API 3 integration](https://github.com/Pesapal-Ltd/sample_api3).
