# GradeCalc Device Monitor — implementation status

## Product scope

- Multi-device dashboard with a dedicated Devices tab.
- No location collection, location history, maps, network details, IP addresses, SSIDs, or carrier identifiers.
- Battery percentage and charging state where Android/browser APIs expose them.
- Coarse device platform and app version; no hardware fingerprinting.
- Camera and microphone permission status only in the dashboard.
- Camera capture, short audio recording, and gallery sharing are separate owner-initiated actions. They require visible on-device controls, Android permission prompts, and OS privacy indicators. Uploading requires a separate explicit Share action and the media scope.
- No covert capture, hidden service, permission bypass, or remote activation of camera/microphone.
- No account registration, phone number, email verification, or OTP. The Cloudflare Worker uses random owner/device bearer tokens; only token hashes are stored server-side.
- Device enrollment uses a short-lived one-time secret, explicit on-device approval, and separate dashboard-owner approval. Installation and permission grants alone never authorize a new device.
- Existing calculator calculations and local academic data remain isolated from the companion module.

## Current implementation boundary

`monitor/index.html` contains private dashboard initialization, one-time invitation creation, dual approval, multi-device listing, pause/revoke controls, and retained-media download/deletion. It displays only the current browser's platform, battery (when supported), and camera/microphone permission states locally; it never opens local sensors.

`js/device.js` adds a Devices tab with local device naming, battery preview, one-time invitation redemption, on-device approval, sharing pause/resume, and battery/device/permission telemetry while the app is open. Native Android background service support is not implemented.

`js/media.js` contains visible, user-initiated camera, microphone, and gallery selection controls with separate Share actions. The API client uploads only after the owner taps Share and the device has the media scope. Media streams stop when the page is hidden or the feature is closed.

## Backend status

The Firebase callable backend under functions/ is retained as a local security-test prototype only. Firebase Cloud Functions require the Blaze billing plan, so that path is not compatible with the zero-budget requirement. The replacement deployment target is the Cloudflare Worker and D1 implementation under worker/. It is a prototype only: no Worker is deployed, no D1 database or R2 bucket is configured, and end-to-end requests have not been verified. The browser dashboard and Android app now contain API clients. Firestore remains deny-by-default.

The Worker uses random owner and device bearer tokens rather than account registration, phone numbers, or OTPs. Only token hashes are stored. A one-time invite, explicit approval on the sharing phone, and server-side authorization remain mandatory.

Do not claim live pairing, remote telemetry, or persistent background monitoring until the client, server, rules, and emulator suite work together.

## Required implementation sequence

1. Configure the Cloudflare Worker and D1 database on the Free plan; do not enable a paid plan.
2. Set the deployment-only setup secret and exact allowed browser origins. Never commit either secret.
3. Complete browser owner-token initialization and device-token persistence; current prototype uses IndexedDB, not Android Keystore.
4. Verify invitation creation, redemption, dual approval, and dashboard controls against a deployed test Worker. Never put invitation secrets in URLs, logs, analytics, or referrers.
5. Verify multi-device listing, freshness labels, pause/revoke, and retained-media download/deletion against D1/R2.
6. Complete Android Keystore-backed device-token storage and test the telemetry publisher.
7. Add native Android lifecycle integration only where Android permits it. Camera/microphone remain owner-initiated and visible.
8. Run Node tests and D1/Worker integration tests locally.
9. Deploy only after CORS, token lifecycle, revocation, quota exhaustion, and physical Android tests pass. Keep the Firebase prototype undeployed.

## Security and lifecycle

- Never trust client-supplied owner/viewer UIDs.
- Never store raw invitation secrets; store only a hash.
- Pairing secrets expire after five minutes and are single-use.
- Invitation codes use 256-bit entropy, expire after five minutes, and are single-use. Return the same error for invalid, expired, or reused codes.
- Both the physical phone and dashboard owner must approve the pending device; neither approval alone activates it.
- Dashboard reads require the owner bearer token and are limited to devices registered under that owner. A device token cannot access the dashboard or another device.
- Revocation and Stop must immediately block subsequent reads/writes.
- Telemetry timestamps and expiry are server-controlled.
- D1 scheduled cleanup removes expired telemetry and stale pending enrollments; media is retained until explicit owner deletion.
- Keep media out of telemetry documents. Upload only after a visible capture/gallery action and separate Share action. The private R2 API retains media until explicit dashboard-owner deletion.
- Android force-stop prevents background execution until the user launches the app again. Do not promise operation through force-stop, OEM battery restrictions, or denied permissions.

## Acceptance checklist

- [x] Calculator remains separate from the companion module.
- [x] Location and network data removed from the Devices tab and browser dashboard.
- [x] Backend scope allowlist excludes location and network.
- [x] Local device label and battery preview.
- [x] Dashboard shows device and permission status without activating camera/microphone.
- [x] Camera/microphone controls are owner-initiated and stop on page hide.
- [x] Firestore remains deny-by-default.
- [x] Worker API validation, one-time invite, dual-approval, and revocation foundations exist.
- [ ] Cloudflare Worker URL, setup secret, D1, and R2 deployment configuration.
- [x] Owner/device token persistence and enrollment UI (IndexedDB; hardware-backed Android storage still pending).
- [x] On-device and dashboard-owner approval UI.
- [x] Multi-device dashboard backed by owner-token API calls.
- [x] Client telemetry publisher and scoped Worker API; end-to-end service verification remains pending.
- [ ] Native Android lifecycle/foreground-service implementation.
- [x] Client media upload, retained media gallery, download, and explicit deletion.
- [ ] Final CI run green on the latest feature-branch commit.
