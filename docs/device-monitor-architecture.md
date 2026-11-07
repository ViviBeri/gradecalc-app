# GradeCalc Device Monitor — secure remote design

## Current implementation boundary

`monitor/index.html` is a same-device, browser-only preview. It requests local device information only after the user presses **Start local monitoring**. It does not transmit telemetry, persist readings, open camera or microphone streams, or create a remote session.

The current Firestore rules intentionally deny all location and pairing documents. Do not loosen those rules until authentication, pairing, revocation, validation, and emulator tests are implemented together.

## Backend implementation contract

See [the trusted backend contract](device-monitor-backend-contract.md) for callable operations, data validation, authorization boundaries, abuse controls, emulator cases, and rollout gates. It is a design document only; no backend is deployed.

## User-approved product scope

The device owner selected:
- All supported details: location, battery, network, device/platform, camera permission status, microphone permission status, and app activity.
- Manual sharing: the device owner must explicitly enable sharing on the device.
- A separate browser dashboard for the authorized viewer.

This scope does not authorize hidden capture or background collection. Camera and microphone are permission-status indicators only in the monitor; capture/recording remains a separate, visible, user-initiated action in GradeCalc.

## Proposed data flow

1. The device owner signs in with Firebase Authentication.
2. The device owner explicitly starts a sharing session and sees a persistent active state and Stop control.
3. The owner creates a one-time pairing invitation. The invitation is high entropy, short-lived, single-use, stored as a cryptographic hash, and bound to the owner's UID and device ID.
4. The viewer signs in separately and redeems the invitation once. The owner confirms the viewer identity on the device before access is granted.
5. The server records a narrow owner-to-viewer grant. The viewer can read only the selected device's current permitted telemetry.
6. Stopping sharing or revoking a viewer invalidates the grant immediately. Expired telemetry is deleted by a scheduled retention process.

A URL by itself is never an authorization credential. Do not put raw pairing secrets in query strings, analytics, logs, or referrers.

## Proposed Firestore model (not active)

- `users/{ownerUid}/devices/{deviceId}`: owner-only device label, platform, created time, revoked state.
- `pairingInvites/{inviteId}`: server-created hashed secret, owner UID, device ID, expiry, single-use state. Client writes are denied.
- `deviceGrants/{grantId}`: owner UID, viewer UID, device ID, scopes, created time, revoked state. Server creates after explicit owner confirmation.
- `deviceTelemetry/{ownerUid}_{deviceId}`: latest allowlisted snapshot, sharing-session ID, updated time, expiry time. No arbitrary fields or media payloads.

Only the authenticated owner may start or stop their device's sharing session. A viewer may read a device snapshot only when an active grant matches their UID, device, and requested scope. Viewer writes are denied.

## Telemetry allowlist and minimization

- Location: latitude, longitude, and accuracy only while the owner enables location sharing. The server controls telemetry update and expiry timestamps. No IP-based location fallback.
- Battery: level and charging state when supported.
- Network: online/offline and coarse effective connection type only. Never SSID, BSSID, IP address, or carrier identifiers.
- Device: coarse platform and app version. Avoid persistent hardware fingerprints.
- Camera/microphone: permission state only; never images, audio, or live streams.
- App: explicit sharing-session heartbeat and last update time, not covert background tracking.

Do not transmit a location reading when system Location Services are off or permission is denied. Show unavailable/stale status instead.

## Security and lifecycle requirements before enabling remote access

- Firebase Authentication required for owner and viewer.
- Pairing invitations generated and redeemed by trusted server code; one use, short expiry, rate limits, and brute-force protection.
- Owner confirmation on the originating device before a viewer grant is activated.
- Strict Firestore schema validation, field allowlists, UID checks, scope checks, and server timestamps.
- Revocation and session stop must prevent subsequent reads/writes immediately.
- Telemetry expiry/TTL and data deletion behavior tested.
- No anonymous/public read access, shared static tokens, or client-authoritative owner IDs.
- Emulator tests for unauthenticated, wrong-owner, wrong-viewer, expired invitation, replay, revoked grant, invalid fields, and valid scoped read.
- Do not deploy Firebase rules or create production credentials as part of this feature branch without explicit approval.

## Acceptance checklist

- [x] Local dashboard requires an explicit Start action.
- [x] Stop clears local readings and stops geolocation watch.
- [x] Page background/exit stops local monitoring.
- [x] Camera and microphone are permission status only.
- [x] No telemetry network transport exists in the local dashboard.
- [x] Existing Firestore rules deny pairing and telemetry paths.
- [ ] Authenticated owner sign-in and session management.
- [x] Emulator coverage confirms pairing invitations, device grants, and telemetry remain denied to owners, viewers, and anonymous clients until trusted server flows exist.
- [ ] One-time pairing invitation and owner confirmation.
- [ ] Scoped viewer dashboard with immediate revocation.
- [x] Backend enforces session and telemetry expiry; emulator coverage for callable authorization and full remote read lifecycle remains pending.
- [ ] Physical Android permission and lifecycle verification.
