# Codex instructions for NEWEIX

## Project baseline
- NEWEIX is a Next.js 15 / React 19 application using Supabase and Cloudflare Workers via OpenNext.
- Production is hosted on Cloudflare Workers at https://neweix.com. Do not move hosting to Vercel.
- Preserve the existing dependency versions and deployment workflow. Do not run destructive dependency upgrades or production database migrations without explicit approval.
- Never commit secrets, credentials, tokens, private keys, or populated environment files.

## PentAGI security testing
- PentAGI is a separate, self-hosted security-testing service. It is NOT part of the Next.js app and must never be deployed as a Cloudflare Worker or bundled into the storefront.
- Follow `docs/security/pentagi/README.md` for installation and authorized testing.
- Only test NEWEIX systems the owner explicitly authorizes. Default to a dedicated staging environment; do not scan production, customer data, third-party providers, Pathao, payment gateways, or Supabase infrastructure unless the owner separately authorizes that exact scope.
- Keep PentAGI on a separate Linux/Docker host or isolated worker node. Do not mount the NEWEIX repository, Cloudflare credentials, Supabase service-role key, production .env files, or customer data into PentAGI.
- Do not expose the PentAGI UI publicly. Keep it localhost/private-network only, change the default admin password immediately, and restrict Docker callback ports at the network firewall.
- Never launch autonomous scans, exploit modules, brute-force tests, destructive tests, or production-impacting checks without explicit scope and approval for that run.
- Treat PentAGI findings as unverified until manually validated. Make fixes in a separate branch, add regression tests, and report evidence and residual risk.
- Do not merge or deploy security fixes automatically. Open a PR and summarize tests and operational impact first.
