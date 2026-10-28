# Neweix — Bangla-first e-commerce (Next.js + Supabase + Cloudflare)

## What works
- Storefront (`/`), product page (`/products/[slug]`), cart (localStorage), checkout (`/checkout`)
- Order creation through `POST /api/orders` → database function `create_order_with_payment`
  (prices and stock are checked in the database; COD and bKash/Nagad/Rocket with transaction ID)
- Guest order tracking (`/track-order`, rate-limited)
- Customer login, account page, theme page
- Staff/Admin/Supreme areas with role checks; Supreme requires MFA; audit log
- Admin product API and staff product-submission approval flow

## Not built yet
Courier API booking, SMS OTP, online card payment, analytics/promo codes/landing-page editor.
The `delivery_*` columns already exist for the courier step.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. In Supabase → SQL Editor run, in order: `001`, `002`, `003`, `004` from `supabase/migrations/`.
4. Create your first Supreme user in Supabase Auth, then in SQL Editor:
   `insert into public.staff_profiles (user_id, display_name, role, is_active) values ('<USER-UUID>', 'Owner', 'supreme', true);`
5. `npm run dev`

## Deploy (Cloudflare)
`npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`, then `npm run deploy`.
Never put the service-role key in code, `wrangler.jsonc` or any `NEXT_PUBLIC_` variable.
