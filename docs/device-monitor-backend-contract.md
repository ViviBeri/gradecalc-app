# Device Monitor — Cloudflare backend contract

Status: prototype only. No Cloudflare Worker, D1 database, or R2 bucket is deployed. The browser dashboard and Android app do not yet call these endpoints.

## Runtime and cost boundary

- Target: Cloudflare Workers Free + D1 Free + R2 Standard free allowances.
- No Firebase Cloud Functions deployment: Cloud Functions require Firebase Blaze billing and violate the zero-budget constraint.
- Worker API must fail closed when D1, R2, authentication, or CORS configuration is unavailable.
- Free-tier quotas are enforced. Exceeding them can pause requests until reset; never upgrade or enable billing automatically.
- Keep the GradeCalc calculator fully usable offline and when the companion backend is unavailable.

## Identity model

There is one private dashboard owner per Worker deployment.

- A deployment-only SETUP_SECRET protects the one-time dashboard bootstrap.
- The browser generates a random 256-bit owner token. The Worker stores only its SHA-256 hash in D1.
- Each device receives a random 256-bit device token after redeeming a one-time invitation. The Worker stores only its SHA-256 hash.
- Owner and device tokens are bearer credentials. Store them locally; never place them in URLs, analytics, logs, or referrers.
- No email, phone number, OTP, or conventional user account is required.
- Loss of the owner token currently has no recovery flow. Do not claim account recovery until a secure rotation/recovery mechanism exists.

## Enrollment flow

1. The owner dashboard creates a random 256-bit invitation code with a five-minute expiry and an explicit scope list.
2. Only the code hash is stored in D1. The raw code is returned once to the dashboard.
3. The new phone redeems the code in the POST body. The Worker consumes the invitation transactionally and creates a pending device record.
4. The phone stores its device token and shows the device name and requested scopes.
5. The user explicitly approves enrollment on the phone.
6. The dashboard displays the pending device and its requested scopes. The dashboard owner must separately approve that exact device.
7. The device becomes active only after both approvals are recorded. Neither installation nor Android permission grants alone authorize a device.
8. Only active devices can publish telemetry or media.

Invitation codes are single-use and high entropy. A code alone cannot activate a device. The dashboard must not auto-approve a pending device.

## API operations

| Method and path | Identity | Behaviour |
|---|---|---|
| GET /health | Public | Health check only |
| POST /v1/setup | SETUP_SECRET | One-time owner bootstrap |
| POST /v1/invites | Owner token | Create five-minute invitation with explicit scopes |
| POST /v1/enroll | Invitation code | Redeem once; create pending device; return device token once |
| POST /v1/devices/approve | Device token | Record explicit on-device approval |
| POST /v1/devices/{id}/approve | Owner token | Record dashboard owner approval for the exact pending device |
| GET /v1/device/status | Device token | Return pending, active, paused, or revoked state |
| POST /v1/telemetry | Active device token | Publish allowlisted telemetry with server timestamp and 90-second expiry |
| GET /v1/devices | Owner token | List devices, approval state, last seen, and fresh telemetry |
| DELETE /v1/devices/{id} | Owner token | Revoke one device and clear its latest telemetry |
| POST /v1/device/stop | Active device token | Pause sharing and clear telemetry |
| POST /v1/device/resume | Paused device token | Resume only after an on-device action |
| POST /v1/media | Active device token + media scope | Upload one explicitly selected media file |
| GET /v1/media | Owner token | List retained media |
| GET /v1/media/{id} | Owner token | Download one retained media object |
| DELETE /v1/media/{id} | Owner token | Delete the selected media object |

## Allowed scopes and data

Allowed scopes are individual values: `battery`, `device`, `permissionStatus`, `appStatus`, and `media`. No wildcard scope.

- Battery: finite level from 0 to 1 and charging boolean.
- Device: coarse platform and app version only; no hardware IDs or fingerprint.
- Permission status: camera and microphone state only; no media streams.
- App status: active sharing heartbeat only.
- Media: separate uploads to private R2 storage after an owner-initiated capture or gallery selection and a separate Share action. Media is never part of telemetry JSON.

Location and network data are excluded from every endpoint and schema. Reject unknown telemetry keys, invalid values, unapproved scopes, oversized media, and inactive devices.

## Media retention

- R2 bucket must remain private; never enable public bucket access.
- Accept only JPEG, PNG, WebP, WebM audio, MP4 audio, and OGG audio.
- Maximum upload: 20 MiB for images and 10 MiB for audio.
- Media uploads require the media scope and an active device token.
- Capture and recording must start from a visible on-device action. Upload requires a second explicit Share action.
- Media objects remain stored until the dashboard owner explicitly deletes them.
- Telemetry expiry and device revoke do not delete retained media.
- Store object metadata in D1 and bytes in R2. Never store media bytes in D1 telemetry rows.
- Download and delete require the dashboard owner token. No public object URLs.

## Authorization and abuse controls

- Hash owner, device, and invite secrets with SHA-256 before storing them.
- Compare secrets without early-exit string comparison.
- Never trust owner IDs or device IDs supplied as authorization.
- Invitations expire after five minutes and are single-use.
- Limit owner invite creation to ten per hour.
- D1 enforces a singleton dashboard owner per Worker deployment.
- Both device-side and dashboard-side approval are required before activation.
- Viewer/dashboard operations are owner-scoped; devices cannot list other devices or read other devices' media.
- Revocation immediately blocks subsequent telemetry and media uploads.
- Device tokens cannot approve another device or access owner endpoints.
- CORS must use an exact allowlist of the GitHub Pages origin and required Capacitor origin. Never use wildcard origins.
- Do not log bearer tokens, raw invitation codes, or media contents.

## Lifecycle and cleanup

- Telemetry freshness is 90 seconds; stale telemetry is not returned as live.
- A 15-minute scheduled cleanup removes expired telemetry and stale pending invitations/devices.
- Media is excluded from scheduled cleanup and remains until explicit owner deletion.
- Device stop pauses sharing and clears telemetry. Resume requires an on-device action.
- Force-stop prevents Android background execution until the app is launched again. Do not promise operation through force-stop, OEM battery restrictions, or revoked permissions.

## Required validation before deployment

- D1 integration tests for setup race, invitation replay, dual approval, cross-device isolation, revocation, paused devices, telemetry expiry, and owner-only media access.
- R2 tests for private access, content-type/size limits, failed upload cleanup, download authorization, and deletion.
- CORS tests for allowed and rejected origins.
- Android tests for token persistence, explicit approval, media Share action, OS privacy indicators, app restart, Doze, and force-stop.
- Confirm Worker, D1, and R2 free-tier usage limits. Never enable paid billing.
- Keep Firestore deny-by-default. The Firebase Functions code is retained only as a local prototype and is not the deployment backend.
