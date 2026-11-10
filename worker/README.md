# GradeCalc Device API

This worker is the zero-budget remote API prototype for the GradeCalc companion dashboard. It uses Cloudflare Workers and D1. It is not deployed and contains no production credentials.

## Published free-tier limits

Workers Free currently publishes 100,000 requests per day and 10 ms CPU per request. D1 Free publishes 5 million rows read/day, 100,000 rows written/day, 5 GB total account storage, and up to 500 MB per database. R2 Standard includes 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free egress each month. Exceeding daily D1 limits pauses queries until reset; it does not silently upgrade the account.

Official limits:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/\n- https://developers.cloudflare.com/r2/pricing/

These are service limits, not a guarantee of uninterrupted service. Keep the calculator usable if the Worker is unavailable.

## Setup

1. Create a Cloudflare account and stay on the Free plan.
2. Create a D1 database named gradecalc-device-api and a private R2 bucket named gradecalc-device-media.
3. Copy its database ID into wrangler.toml, replacing REPLACE_WITH_D1_DATABASE_ID.
4. Set the Worker secret SETUP_SECRET to a long random value. Do not commit it.
5. Set ALLOWED_ORIGINS to exact comma-separated browser origins. Include the GitHub Pages origin and Capacitor Android origin only if needed. Do not use a wildcard.
6. Apply the D1 migration, create the private R2 bucket, and deploy the Worker.
7. Initialize the dashboard once with the setup secret. The browser generates an owner token and sends only its SHA-256 hash to the Worker. Store the raw owner token locally; never put it in a URL or log.
8. Generate a five-minute invitation. The phone redeems it once, stores its device token locally, and explicitly approves enrollment on the phone before telemetry is accepted.

Run these commands from the worker/ directory. Example:

```sh
npx wrangler d1 create gradecalc-device-api
npx wrangler secret put SETUP_SECRET
npx wrangler d1 migrations apply gradecalc-device-api --remote
npx wrangler deploy
```

Set ALLOWED_ORIGINS as a plain Worker variable in wrangler.toml or the Cloudflare dashboard. It is not a secret.

## API

- GET /health
- POST /v1/setup — one-time owner bootstrap; requires X-Setup-Secret
- POST /v1/invites — owner bearer token; returns a single-use code valid for five minutes
- POST /v1/enroll — redeem code and create a pending device; returns a device token once
- POST /v1/devices/approve — device bearer token; explicit on-device approval
- POST /v1/telemetry — device bearer token; allowlisted telemetry only
- GET /v1/devices — owner bearer token; latest non-expired snapshots
- DELETE /v1/devices/{deviceId} — owner bearer token; revoke and clear telemetry
- POST /v1/device/stop — device bearer token; pause sharing and clear telemetry
- POST /v1/device/resume — device bearer token; resume only after an on-device action\n- POST /v1/media — active device token with media scope; upload one owner-selected photo/audio file\n- GET /v1/media — owner bearer token; list retained media\n- GET /v1/media/{mediaId} — owner bearer token; download a retained media file\n- DELETE /v1/media/{mediaId} — owner bearer token; permanently delete the selected media

## Security boundaries

- No location or network data is accepted.
- The API does not activate cameras or microphones. Media upload accepts only files selected after a separate on-device capture/share action and requires the media scope.
- Media is stored in a private R2 bucket. It remains until the dashboard owner explicitly deletes it; telemetry expiry does not delete media.
- Owner and device tokens are random bearer credentials; only SHA-256 hashes are stored in D1.
- Pairing codes are random, one-time, short-lived, and stored as hashes.
- Device enrollment remains pending until the phone owner taps the on-device approval control.
- Telemetry is restricted to battery, coarse platform/app version, permission status, and app heartbeat.
- No Firestore rules or Firebase Functions are used by this Worker.
- This Worker is not production-ready until D1 integration tests, CORS configuration, token persistence, owner dashboard UI, and physical Android lifecycle tests pass.

## Important limitations

The Worker is a backend foundation only. The dashboard and Android app do not yet call these endpoints. The Firebase Functions prototype under functions/ is retained for local security tests only; Firebase Cloud Functions deployment requires the Blaze billing plan and is not the zero-cost deployment path.
