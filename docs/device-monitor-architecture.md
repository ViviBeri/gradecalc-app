# GradeCalc Device Monitor — implementation status

## Product scope

- Multi-device dashboard with a dedicated Devices tab.
- No location collection, location history, maps, network details, IP addresses, SSIDs, or carrier identifiers.
- Battery percentage and charging state where Android/browser APIs expose them.
- Coarse device platform and app version; no hardware fingerprinting.
- Camera and microphone permission status only in the dashboard.
- Camera capture, short audio recording, and gallery sharing are separate owner-initiated actions. They require visible on-device controls, Android permission prompts, and OS privacy indicators.
- No covert capture, hidden service, permission bypass, or remote activation of camera/microphone.
- No account registration, phone number, email verification, or OTP. Firebase anonymous authentication is the proposed per-installation identity.
- Device enrollment uses a short-lived one-time secret plus explicit owner approval. Installation and permission grants alone never authorize a new device.
- Existing calculator calculations and local academic data remain isolated from the companion module.

## Current implementation boundary

`monitor/index.html` is a local browser preview. It displays only the current browser's platform, battery (when supported), and camera/microphone permission states. It does not connect to another device, upload telemetry, persist readings, or activate sensors.

`js/device.js` adds a local Devices tab with a local device label and battery preview. The Add device action remains disabled until authenticated enrollment and owner confirmation are implemented.

`js/media.js` contains visible, user-initiated camera and microphone preview/recording controls. Those controls are not remote and do not upload media. Media streams stop when the page is hidden or the feature is closed.

## Backend status

The Firebase callable backend under functions/ is retained as a local security-test prototype only. Firebase Cloud Functions require the Blaze billing plan, so that path is not compatible with the zero-budget requirement. The replacement deployment target is the Cloudflare Worker and D1 implementation under worker/. It is also a prototype only: no Worker is deployed, no D1 database is configured, and the browser/Android clients do not yet call it. Firestore remains deny-by-default.

The Worker uses random owner and device bearer tokens rather than account registration, phone numbers, or OTPs. Only token hashes are stored. A one-time invite, explicit approval on the sharing phone, and server-side authorization remain mandatory.

Do not claim live pairing, remote telemetry, or persistent background monitoring until the client, server, rules, and emulator suite work together.

## Required implementation sequence

1. Configure the Cloudflare Worker and D1 database on the Free plan; do not enable a paid plan.
2. Set the deployment-only setup secret and exact allowed browser origins. Never commit either secret.
3. Build owner-token initialization and persistent local token storage in the browser dashboard.
4. Build invitation creation, redemption, and explicit on-device approval screens. Never put invitation secrets in URLs, logs, analytics, or referrers.
5. Build the multi-device dashboard, freshness labels, per-device revoke, and Stop sharing controls.
6. Add device-token persistence and the allowlisted telemetry publisher to the Android app.
7. Add native Android lifecycle integration only where Android permits it. Camera/microphone remain owner-initiated and visible.
8. Run Node tests and D1/Worker integration tests locally.
9. Deploy only after CORS, token lifecycle, revocation, quota exhaustion, and physical Android tests pass. Keep the Firebase prototype undeployed.

## Security and lifecycle

- Never trust client-supplied owner/viewer UIDs.
- Never store raw invitation secrets; store only a hash.
- Pairing secrets expire after five minutes and are single-use.
- Limit redemption attempts and return indistinguishable errors for invalid/expired/reused secrets.
- Owner approval must occur on the physical device being shared; an authenticated dashboard session alone is not proof of physical approval.
- Viewer reads require an active, unexpired grant for the exact device and scope.
- Revocation and Stop must immediately block subsequent reads/writes.
- Telemetry timestamps and expiry are server-controlled.
- Firestore TTL is cleanup only, never authorization.
- Keep media out of telemetry documents. Use a separate, explicitly consented upload design with retention and deletion controls before enabling gallery/media sharing.
- Android force-stop prevents background execution until the user launches the app again. Do not promise operation through force-stop, OEM battery restrictions, or denied permissions.

## Acceptance checklist

- [x] Calculator remains separate from the companion module.
- [x] Location and network data removed from the Devices tab and browser dashboard.
- [x] Backend scope allowlist excludes location and network.
- [x] Local device label and battery preview.
- [x] Dashboard preview shows device and permission status without activating camera/microphone.
- [x] Camera/microphone controls are owner-initiated and stop on page hide.
- [x] Firestore remains deny-by-default.
- [x] Pairing transaction core and authorization tests exist.
- [ ] Firebase client configuration and anonymous-auth persistence.
- [ ] Device registry integration and enrollment UI.
- [ ] On-device owner confirmation UI.
- [ ] Multi-device dashboard backed by authenticated data.
- [ ] Live telemetry publishing and scoped reads.
- [ ] Native Android lifecycle/foreground-service implementation.
- [ ] Remote media upload, retention, and deletion.
- [ ] CI green on the feature branch.
