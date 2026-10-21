# Neweix Shop — Cloudflare Pages starter

## What's included
- `index.html` — Bengali-first storefront
- `styles.css` — responsive mobile-friendly styling
- `script.js` — sample products, category filter, search, sort, local cart and demo checkout

## Deploy to Cloudflare Pages (Direct Upload)
1. Keep a backup of your existing site first.
2. Extract this ZIP on your phone or computer.
3. In Cloudflare Dashboard, open **Workers & Pages → your `neweix` Pages project**.
4. Open the deployment/upload workflow (the project currently shows `Add files via upload`).
5. Upload the **contents** of the extracted folder so `index.html` is at the root. Do not upload the ZIP file itself unless the UI explicitly supports ZIP upload.
6. Deploy, then test `https://neweix.com` and `https://neweix.pages.dev`.

## Important before real customers use it
- The product names, prices and emojis are sample/demo data. Replace them in `script.js`.
- The cart is saved only in the visitor's browser.
- Checkout creates a demo reference in the browser only. It does **not** send an order to you or store it securely.
- bKash, Nagad and payment gateway are not integrated. Do not accept/claim successful payment until a real provider integration and server-side verification are implemented.
- For production, add a server-side order API plus durable storage (e.g. Cloudflare D1), admin authentication, server-side price validation, rate limiting, privacy/delivery/refund policies, and a real payment provider.
- Product images currently use emoji placeholders, so the site works without image files. Replace with your own licensed product images when ready.
- Google Fonts needs internet; the page falls back to system fonts if unavailable.
