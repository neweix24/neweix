# NEWEIX YouTube OAuth setup

The YouTube connection uses Google's server-side OAuth 2.0 flow and YouTube Data API v3. It requests:
- `youtube.upload` to upload videos on the channel owner's behalf.
- `youtube.readonly` to identify the channel after consent.

## 1. Google Cloud configuration

1. Open Google Cloud Console and select/create the NEWEIX project.
2. Enable **YouTube Data API v3**.
3. Configure the OAuth consent screen. Add the required app name, support email, developer contact and privacy-policy/homepage URLs.
4. Create an OAuth client ID of type **Web application**.
5. Add this exact Authorized redirect URI:

   `https://neweix.com/api/admin/social-media/youtube/callback`

6. If the consent screen is in Testing, add the Google account that owns the YouTube channel as a test user. Testing-mode refresh tokens can expire after seven days for non-basic scopes; move the OAuth app through Google's verification/publishing requirements for durable production use.
7. Keep the OAuth client secret private. Never put it in source code or a `NEXT_PUBLIC_*` variable.

## 2. Configure Cloudflare Worker secrets

Generate a 32-byte AES key locally (do not send it in chat or commit it):

```bash
openssl rand -base64 32
```

From the repository root, set each secret for the production Worker:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put YOUTUBE_TOKEN_ENCRYPTION_KEY
```

Paste the corresponding values when prompted. Use the base64 output from the command for `YOUTUBE_TOKEN_ENCRYPTION_KEY`. Do not put these values in `wrangler.jsonc`.

## 3. Apply the Supabase migration

Apply `supabase/migrations/20261031180000_social_publishing_foundation.sql` to the NEWEIX Supabase project before connecting a channel. The migration creates the social account/post/delivery tables and the service-role-only scheduled-post claim function.

## 4. Connect the channel

After the migration and secrets are configured and the Worker is deployed:
1. Sign in to NEWEIX as a Supreme or Admin account.
2. Open **Admin → সোশ্যাল মিডিয়া অটোমেশন**.
3. Select **Google দিয়ে YouTube সংযুক্ত করুন**.
4. Sign in with the Google account that owns the YouTube channel and grant the requested permissions.
5. Return to NEWEIX and verify that the channel appears as connected.

## Important publishing notes

- The OAuth connection and encrypted token storage are implemented first. Video upload, resumable transfer, scheduling worker, and publication status reconciliation are separate implementation steps and are not yet enabled by this connection flow.
- YouTube Data API uploads use `videos.insert`; quota, upload restrictions, channel permissions and Google's OAuth verification/testing status still apply.
- Do not share OAuth client secrets, encryption keys, access tokens or refresh tokens.
