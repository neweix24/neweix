# Neweix Telegram Media Storage

## Approved configuration

- Bot username: `@neweix24_bot`
- Private storage channel ID: `-1005933278411`
- Provider: Telegram Bot API
- Website delivery: Neweix server-side proxy route
- YouTube playback: separate YouTube iframe embed; videos are not copied into Telegram.

## Cloudflare Worker secrets

Configure these secrets on the Neweix production Worker. Never commit their values:

- `TELEGRAM_BOT_TOKEN`: token issued by BotFather.
- `TELEGRAM_MEDIA_CHAT_ID`: `-1005933278411`.
- `NEWEIX_MEDIA_UPLOAD_SECRET`: a long random secret used by trusted server-side/admin tooling to authorize uploads.

The bot must remain an administrator of the private channel with permission to post messages.

## API

### Upload an image

`POST /api/media/telegram/upload`

Headers:

- `Authorization: Bearer <NEWEIX_MEDIA_UPLOAD_SECRET>`
- `Content-Type: multipart/form-data`

Multipart fields:

- `image`: JPEG, PNG, or WebP file, maximum 10 MiB.
- `caption`: optional text, maximum 1,024 characters.

The route sends the image to the configured Telegram channel and returns Telegram's `file_id`, `file_unique_id`, `message_id`, and a same-site `display_url`.

The caller must persist the returned identifiers and metadata in the service's database. This initial integration does not create a media database table and does not provide public upload or delete operations.

### Display an image

`GET /api/media/telegram/{file_id}`

The route calls Telegram's `getFile` server-side and streams the image through the Neweix domain. The Bot Token is never sent to the browser.

## Security and operational limits

- Never expose the Bot Token in client-side code, URLs shared with users, logs, or Git.
- Upload requires the separate upload secret; unauthenticated uploads are rejected.
- Only JPEG, PNG, and WebP uploads are accepted, up to 10 MiB.
- Telegram remains the storage provider. The website proxy does not make Telegram an independent CDN or guarantee permanent file retention.
- Keep a backup/export strategy for business-critical media.
- Telegram Bot API file downloads have provider limits; test real image sizes and cache behavior before broad rollout.
- Do not enable customer-facing Admin upload until Supreme-approved Admin authorization is integrated. The upload secret is an interim server-to-server gate, not a replacement for the Admin Grant system.
