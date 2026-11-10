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
- [ ] Configure Firebase client SDK without exposing privileged credentials.
- [ ] Use persistent local owner/device tokens with secure storage.
- [ ] Register device metadata under the installation's anonymous UID.
- [ ] Keep Firestore rules deny-by-default until the full emulator suite passes.
- [ ] Verify Spark plan compatibility before selecting any deployable backend component.

### Phase 3 — Secure multi-device enrollment
- [x] Backend transaction core for one-time, high-entropy invitations.
- [x] Server-side hash-only secret storage.
- [x] Short expiry, one-time redemption, rate limits, and owner approval transaction.
- [x] Scoped grant and revocation transaction foundations.
- [ ] Device-side invitation UI.
- [ ] Viewer redemption UI.
- [ ] Owner approval UI on the physical sharing phone.
- [ ] Persistent dashboard session and device list.
- [ ] Per-device revoke and Stop controls.

### Phase 4 — Live telemetry
- [x] Strict allowlist for battery, device, permission status, and app heartbeat.
- [x] Location/network payloads rejected by backend validation.
- [ ] Client publisher and viewer reader.
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

Anonymous authentication is a stable installation identity, not proof of ownership. The sharing phone must visibly approve the viewer and requested scopes. Pairing secrets must never be placed in URLs, logs, analytics, browser history, or referrers. Store only hashes server-side. Use App Check and authenticated callable operations where available. All viewer reads are scoped to one owner, one device, one session, and approved fields. Viewer writes are denied.

## Rollout constraints

The current backend uses second-generation Firebase callable functions. Confirm the selected Firebase plan supports the required runtime before deployment; do not silently upgrade or enable billing. No production deployment, credential creation, or billing changes are part of ordinary code implementation. Keep local GradeCalc functionality usable if remote features are unavailable.
