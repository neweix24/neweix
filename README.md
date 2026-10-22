# Neweix — starter project

Bangla-first Next.js storefront scaffold for the Neweix Bangladesh ecommerce project. It includes product browsing, product detail pages, a browser-only demo cart, a checkout form marked as demo-only, email OTP sign-in UI, Admin/Supreme placeholder pages, and a Supabase SQL schema with RLS defaults.

## Important status
This is **not yet production-ready**. Checkout does not create database orders, payment providers are not connected, courier APIs are not connected, and Admin/Supreme pages intentionally do not perform privileged actions. Do not accept real payments or customer orders until server-side checkout, role checks, webhook verification, rate limits, and tests are implemented.

## Local setup
1. Install Node.js 20+ on a computer or use a supported online development environment.
2. Run `npm install`, then `npm run dev`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable/anon key.
4. In Supabase SQL Editor, review `supabase/migrations/202610230001_neweix_schema.sql` and apply it only after confirming it matches your project.
5. Configure email authentication and redirect URLs in Supabase Auth.

## Deployment
Import this repository into a Next.js-compatible host such as Vercel, configure the environment variables, deploy, then connect `neweix.com` in the host dashboard and update DNS as instructed by that provider.

## Security
- Never put Supabase `service_role`/secret keys in client code or any `NEXT_PUBLIC_` variable.
- The initial Supreme role must be assigned only through a reviewed trusted administrative process; never trust client metadata for permissions.
- Add MFA, server-side authorization, audit logging, order-creation API, inventory locking, payment signature verification, courier credentials, backups and monitoring before launch.
- The migration deliberately has no public write policies for staff roles, orders or catalogue management.

## Current pages
- `/` storefront
- `/products/[id]` product detail
- `/cart` demo cart (localStorage)
- `/checkout` demo form only
- `/login` email OTP UI
- `/account/orders` tracking placeholder
- `/admin` admin placeholder
- `/supreme` restricted placeholder
