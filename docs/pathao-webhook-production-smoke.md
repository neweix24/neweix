# Pathao webhook production smoke check

The production smoke suite sends a non-mutating `POST /api/webhooks/pathao` request with `{ event: "webhook_integration" }`.

It verifies:

- HTTP 202 response.
- `accepted: true` in the JSON body.
- The required `X-Pathao-Merchant-Webhook-Integration-Secret` protocol response header.

This only checks the Pathao handshake endpoint contract. It does not prove the merchant signature secret is configured, authenticate a real shipment notification, call the Pathao API, update an order, or create a consignment. Those require a controlled merchant-side test after credentials and webhook settings are configured.
