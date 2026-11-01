# NEWEIX Production Smoke Tests

The production smoke test is a lightweight HTTP-level check. It runs automatically after a successful Cloudflare Worker deployment to `main`, can be started manually from GitHub Actions, and runs once daily.

## What it checks

- Public storefront routes return HTTP 200 and a non-empty page.\n- Customer-protected pages such as Wishlist redirect unauthenticated visitors to Customer Login.
- The public product API returns JSON successfully.
- Admin, Supreme and integration pages redirect unauthenticated visitors to the login flow.
- Admin product, order, Pathao and BulkSMSBD APIs reject unauthenticated requests with HTTP 401 or 403.

Covered public pages include Home, Products, Cart, Checkout, Search, Order Tracking, Compare, Login and Customer Login. Wishlist is checked separately as a customer-protected page.

## Run manually

From the repository root:

```sh
npm run smoke:production
```

By default, the script targets `https://neweix.com`. To test another environment:

```sh
NEWEIX_SITE_URL=https://your-preview.example npm run smoke:production
```

## Important limitations

- These are HTTP smoke tests, not full browser-based end-to-end tests.
- They do not submit a real order, charge a payment method, send an SMS, or create a Pathao consignment.
- They do not verify customer login with credentials or Supreme MFA.
- A passing API authentication test confirms unauthenticated access is blocked; it does not prove that every authorized role has the correct permissions.
- Provider delivery and webhook configuration still require controlled tests using the merchant accounts.

A failed smoke test should be investigated before assuming a production deployment is healthy.
