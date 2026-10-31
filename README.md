# NEWEIX — E-commerce platform

NEWEIX is a Bangladesh-first e-commerce application built with Next.js 15, React 19, Supabase and Cloudflare Workers using OpenNext.

## Hosting and deployment

- Production hosting: **Cloudflare Workers** (neweix.com).
- Database and authentication: Supabase.
- Source repository: neweix24/neweix, branch main.
- GitHub Actions runs TypeScript, ESLint and build checks. Production deployment is triggered only after the CI workflow succeeds.
- Local Cloudflare preview: npm run preview.
- Manual production deployment: npm run deploy (normally use the protected GitHub workflow).

## Implemented application areas

- Storefront, product pages, cart, checkout and order tracking.
- Server-side order creation, product-price/stock validation, payment verification and audit records.
- COD and bKash/Nagad/Rocket payment workflows.
- Customer login, mandatory Bangladesh phone OTP verification, account and order history.
- Supreme/Admin/Staff access separation. Staff product access is read-only; Admin/Supreme can manage products.
- Product management and product-submission review.
- Admin order management, courier booking and tracking controls.
- Pathao consignment creation and tracking synchronization (requires valid Pathao credentials and Merchant Store ID).
- BulkSMSBD phone OTP plus queued order-created, payment-confirmed and order-status notifications.
- Atomic OTP request limits and retryable transactional SMS outbox.
- YouTube OAuth connection and scheduled public video publishing from a public HTTPS video URL.
- Facebook, Instagram and TikTok post drafts are supported; automated publishing for those providers is not enabled until their provider-specific API access and approval are available.
- Neweix+ and Eixon wallet/ledger foundations.

## Important operational boundaries

- A returned order is **not** restocked automatically. An Admin/Supreme must inspect the returned items and use the audited “পরীক্ষা শেষে স্টক ফেরত যোগ করুন” action. The database prevents duplicate restocking.
- COD orders with zero delivery fee do not need an MFS transaction ID. If a COD delivery fee is due, its MFS payment still requires verification.
- YouTube scheduled uploads require a connected channel, a public HTTPS video URL and a video file no larger than 50 MB. Scheduled uploads are public. The first channel connection requires an Admin/Supreme to authorize Google OAuth.
- Eixon is an internal reward unit, not a blockchain asset or real-money cryptocurrency. Wallet earning, redemption and transfer remain disabled pending legal review.
- The EixPay SHA-256 chain is database-level tamper evidence, not end-to-end encryption or protection against a privileged database owner rewriting the database.
- Successful CI/build does not prove that third-party credentials, live SMS delivery, Pathao booking or Google OAuth work end-to-end. Those integrations require live provider testing.

## Local development

1. Install Node.js 22 or later.
2. Install dependencies with npm ci (or the repository's Bun lockfile workflow if using Bun).
3. Copy .env.example to .env.local and add local development values.
4. Run npm run dev.
5. Before pushing, run npm run typecheck, npm run lint and npm run build.

## Cloudflare Worker secrets

Configure the following as Cloudflare secrets (never commit secret values):

- SUPABASE_SERVICE_ROLE_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- YOUTUBE_TOKEN_ENCRYPTION_KEY
- TURNSTILE_SECRET_KEY
- BULKSMSBD_API_KEY
- BULKSMSBD_SENDER_ID
- PATHAO_CLIENT_ID
- PATHAO_CLIENT_SECRET
- PATHAO_USERNAME
- PATHAO_PASSWORD

Public/non-secret settings such as NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEWEIX_SITE_URL and payment receiver numbers belong in Cloudflare vars or the local environment, not in the secret list.

## Database migrations

- New migrations are timestamped to match the connected project's migration registry.
- The historical repository and production migration history contain older version/name drift. **Do not run supabase db push blindly** until the legacy history has been reconciled.
- GitHub Actions applies the SQL migration files in order to a disposable PostgreSQL instance and runs regression smoke tests.
- Do not run production migrations manually from an old README or by applying only a subset of files.

## Current validation limits

The repository CI is the source of truth for typecheck, lint, build and disposable-PostgreSQL migration tests. Live integration testing still needs to be performed for:
- Customer login/MFA and phone OTP on a real device.
- BulkSMSBD delivery and retry reporting.
- Pathao booking and provider tracking with a real Merchant Store ID.
- Google OAuth, YouTube video upload and homepage channel feed.
- Full checkout/order lifecycle browser tests.

Do not mark any of these live flows complete solely because the code compiles or the Worker deploys.
