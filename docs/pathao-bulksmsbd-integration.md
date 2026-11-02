# Pathao Courier and BulkSMSBD Integration

This document records the server-side integration boundaries and the live setup still required for NEWEIX on Cloudflare Workers.

## Pathao Courier

### Existing server-side capabilities

- Authenticate with the Pathao Merchant API using Client ID, Client Secret, merchant username and password.
- Verify credentials and fetch merchant stores and cities from the Admin order workspace.
- Create a consignment after the existing server-side order, payment, role and MFA checks pass.
- Store the Pathao consignment ID on the NEWEIX order.
- Fetch the latest consignment state from Pathao and synchronize recognized delivery states.
- Receive Pathao webhook notifications at `POST /api/webhooks/pathao`. The webhook handler authenticates the configured signature header, uses the callback only as a signal, fetches the current shipment status from Pathao, and only then updates the matching NEWEIX order. Unknown consignments and unrecognized statuses are ignored safely.

### Cloudflare secrets

Configure these as Worker secrets; never add values to Git:

- `PATHAO_CLIENT_ID`
- `PATHAO_CLIENT_SECRET`
- `PATHAO_USERNAME`
- `PATHAO_PASSWORD`
- `PATHAO_BASE_URL` (optional; defaults to `https://api-hermes.pathao.com`)
- `PATHAO_WEBHOOK_SECRET` (the merchant-configured inbound signature secret; required to activate webhook callbacks)

For the webhook secret, generate a long random value locally, then set it in Cloudflare:

```sh
openssl rand -hex 32
npx wrangler secret put PATHAO_WEBHOOK_SECRET
```

Paste the generated value into the Wrangler prompt, then configure the exact same value in Pathao Merchant Panel → Developer API → Webhook Integration.

### Pathao webhook configuration

1. Deploy the version containing `/api/webhooks/pathao` to the Cloudflare Worker.
2. Open the Pathao Merchant Panel and navigate to Developer API → Webhook Integration.
3. Set the callback URL to `https://neweix.com/api/webhooks/pathao`.
4. Set the webhook secret to the same value stored as `PATHAO_WEBHOOK_SECRET`.
5. Enable the shipment events Pathao makes available and save the configuration.
6. Verify the integration handshake, then create and track a controlled test consignment.

The endpoint checks the `X-PATHAO-SIGNATURE` header against the configured merchant secret and returns Pathao's required `X-Pathao-Merchant-Webhook-Integration-Secret` protocol header. It does not trust a status, delivery fee or COD amount in the incoming payload. Instead, it fetches the shipment from Pathao before applying a recognized status. This is important because a webhook callback should not be treated as authoritative order data.

### Operational limits

- A real Pathao merchant account, approved API credentials and an active Merchant Store ID are required.
- The current order booking UI asks an Admin/Supreme operator for the Store ID and a complete recipient address.
- City/Zone/Area ID mapping and live price-plan verification are not yet fully automated from NEWEIX's Bangladesh address selector.
- No real parcel has been booked by this repository change. Verify a controlled test order in the Pathao Merchant Panel before enabling routine use.
- If a booking request times out, check the Pathao Merchant Panel before retrying; the request may have succeeded upstream even when NEWEIX did not receive the response.

## BulkSMSBD

### Existing server-side capabilities

- Customer phone OTP delivery uses `POST https://bulksmsbd.net/api/smsapi`.
- Order-created, payment-confirmed and order-status notifications are queued in a private RLS-protected outbox.
- Cloudflare Worker processes the SMS outbox every five minutes, claims jobs through service-role-only RPCs, and retries transient failures with backoff up to the configured attempt limit.
- The Worker accepts provider response code 202 as successful submission. This means the provider accepted the message for processing; it is not proof that the handset received it.

### Cloudflare secrets

- `BULKSMSBD_API_KEY`
- `BULKSMSBD_SENDER_ID`

Keep both values server-side. Never expose them through `NEXT_PUBLIC_*`, browser JavaScript, logs or a public repository.

### Live verification checklist

1. Confirm the BulkSMSBD account is active and has sufficient balance.
2. Confirm the Sender ID is approved for the message type you intend to send.
3. Check whether Source IP validation is enabled. If it is, ask BulkSMSBD how to allow requests from your Cloudflare Worker deployment; do not assume a Worker has a fixed egress IP.
4. Send one controlled OTP to a phone you own and verify the code can be confirmed.
5. Place a controlled test order and confirm the order-created SMS is submitted.
6. Change the test order payment/status and confirm the corresponding notification is submitted.
7. Check provider delivery reports separately. A successful API submission is not the same as a delivered SMS.

Bangla SMS uses Unicode encoding and can consume multiple SMS parts. Review the provider's part count and balance before sending long messages or launching any campaign. Promotional SMS must have an appropriate customer consent and opt-out process; the current queue is for transactional messages only.

## Cloudflare cron schedule

- `*/5 * * * *`: process customer transactional SMS notifications.
- `*/15 * * * *`: process search embedding and scheduled social publishing queues.
- `17 2 * * *` (02:17 UTC daily): verify the complete EixPay SHA-256 integrity chain and store a private verification result. This is database-local tamper evidence, not an external signature.

The jobs are separated so the SMS queue is not unnecessarily invoked twice at timestamps where both cron expressions match.

## Provider references

- Pathao: https://help.pathao.com/integrate-pathao-panel-with-website/
- Pathao Courier and webhook overview: https://pathao.com/blog/pathao-commerce-instant-delivery/
- BulkSMSBD API: https://www.bulksmsbd.com/bulksms-api-bangladesh.php
- BulkSMSBD FAQ (SMS encoding, source IP checks and delivery status): https://www.bulksmsbd.com/faq.php
