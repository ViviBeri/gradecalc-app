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

The trusted pairing backend and callable operations are scaffolding only. Firebase Functions are not deployed, Firebase project configuration is not present, App Check is not configured in the client, and Firestore remains deny-by-default. The backend requires Firebase Authentication and App Check.

Anonymous Firebase Auth can provide a stable per-installation UID without a conventional account, but it does not prove device ownership. A one-time invite, explicit approval on the sharing phone, and server-side authorization are still mandatory.

Do not claim live pairing, remote telemetry, or persistent background monitoring until the client, server, rules, and emulator suite work together.

## Required implementation sequence

1. Add Firebase web configuration through a safe public config file or environment-specific build input; never commit Admin credentials.
2. Initialize Firebase Auth with local persistence and anonymous sign-in for the browser dashboard and each installed device.
3. Register device metadata under the authenticated anonymous UID.
4. Build invitation creation and redemption screens. Show the secret once and transfer it without URL query parameters, analytics, or logs.
5. Show pending viewer identity and exact requested scopes on the sharing phone. Require an explicit on-device confirmation before creating a grant.
6. Add the multi-device dashboard, freshness labels, per-device revoke, and Stop sharing controls.
7. Publish only allowlisted battery/device/permission/app-status telemetry over authenticated callables.
8. Add native Android integration for background battery/app heartbeat only where Android permits it. Camera/microphone remain owner-initiated and visible.
9. Run Node tests and Firestore emulator tests. Keep Firestore rules deny-by-default until all security tests pass.
10. Verify the Firebase plan and App Check availability. Never enable billing or deploy production services without explicit authorization.

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
