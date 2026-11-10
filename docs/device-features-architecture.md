# GradeCalc Device Companion — architecture and delivery plan

## Non-negotiable requirements

- Preserve all existing GradeCalc calculator behavior and local academic data.
- Work only on `feature/gradecalc-connect-foundation` until the complete change is reviewed.
- Zero monthly budget. Never enable billing or a paid tier automatically.
- Multi-device dashboard with a dedicated Devices tab and Add device flow.
- No location collection or history.
- No network details, IP addresses, SSIDs, BSSIDs, carrier identifiers, or network fingerprinting.
- Battery percentage, charging state, coarse device platform, app version, permission state, and app heartbeat only.
- Camera, microphone, and gallery media are separate owner-initiated actions with visible controls, OS prompts, and privacy indicators.
- No hidden monitoring, stealth capture, permission bypass, or remote activation of camera/microphone.
- No conventional account registration, phone number, email verification, or OTP. Use random owner/device bearer tokens with server-side hashes; do not require user accounts or OTP.
- A device must not join merely because it is installed or has permissions. Enrollment requires a short-lived one-time secret and explicit approval on the phone and separate dashboard-owner approval.

## Current app

GradeCalc is an offline-first static PWA packaged for Android with Capacitor. The companion code is modular and must not change SGPA, CGPA, converter, projection, or academic storage logic.

## Delivery phases

### Phase 1 — Local device foundation
- [x] Add a dedicated Devices tab.
- [x] Add local device naming.
- [x] Show battery state when supported.
- [x] Remove location and network collection.
- [x] Keep camera/microphone permission state separate from capture.
- [x] Provide explicit camera/audio controls in the media module.
- [ ] Verify on physical Android devices.

### Phase 2 — Private dashboard and identity
- [ ] Configure the Cloudflare Worker URL, setup secret, D1 database, and private R2 bucket.
- [ ] Use persistent local owner/device tokens with secure storage.
- [ ] Register device metadata using random owner/device bearer tokens; persist tokens securely.
- [x] Keep Firestore rules deny-by-default; the Worker is the selected remote backend.
- [ ] Verify Worker, D1, and R2 free-tier quotas before deployment.

### Phase 3 — Secure multi-device enrollment
- [x] Worker API foundation for one-time, high-entropy invitations.
- [x] Server-side hash-only secret storage.
- [x] Short expiry, one-time redemption, invite creation limits, and two-sided approval.
- [x] Scoped device access, revocation, pause/resume, and media API foundations.
- [ ] Device-side invitation UI.
- [ ] Device enrollment UI and one-time code redemption.
- [ ] On-device approval and separate dashboard-owner approval UI.
- [ ] Persistent dashboard session and device list.
- [ ] Per-device revoke and Stop controls.

### Phase 4 — Live telemetry
- [x] Strict allowlist for battery, device, permission status, and app heartbeat.
- [x] Location/network payloads rejected by backend validation.
- [ ] Device telemetry publisher and owner dashboard reader.
- [ ] Server-side timestamps and freshness labels in the dashboard.
- [ ] Reconnect handling and bounded retries.
- [ ] Verify behavior after app restart, network loss, Android Doze, and force-stop.

### Phase 5 — Native Android and media
- [ ] Implement native Android lifecycle support for allowed background telemetry.
- [ ] Use foreground service notification where required.
- [ ] Respect force-stop, OS permission revocation, battery optimization, and OEM restrictions.
- [ ] Keep camera and microphone owner-initiated and visibly active.
- [ ] Integrate private R2 media upload/download/delete with a separate media scope and explicit on-device Share action.
- [ ] Do not place images or audio in telemetry documents.

## Security model

Owner and device bearer tokens identify the private dashboard and enrolled installations; only token hashes are stored server-side. A one-time invite is not sufficient by itself: both the phone and dashboard owner must approve the pending device. Pairing secrets must never be placed in URLs, logs, analytics, browser history, or referrers. Device reads and writes are limited to that device token; dashboard operations require the owner token. Media uploads require the media scope and a separate visible Share action. Firestore remains deny-by-default.

## Rollout constraints

The deployment target is Cloudflare Workers, D1, and R2 on their published Free tiers. Firebase Cloud Functions are retained only as a local prototype because deployment requires Blaze billing. Never enable a paid plan. No production deployment, credential creation, or billing changes are part of ordinary code implementation. Keep local GradeCalc functionality usable if remote features are unavailable.
