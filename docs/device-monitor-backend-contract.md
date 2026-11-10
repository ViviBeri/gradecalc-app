# Device Monitor — trusted backend contract

Status: design only. No functions are deployed, no credentials are configured, and Firestore remote access remains denied.

## Runtime boundary

Use Firebase Authentication for owner and viewer identities. Use Firebase anonymous authentication so the dashboard and enrolled phones do not need user accounts, email addresses, phone numbers, or OTPs. Persist the browser's anonymous session across reloads where supported. Use second-generation Firebase callable HTTPS functions for privileged pairing operations, with App Check enforcement where supported. Functions use the Admin SDK; clients never write pairing invitations or grants directly. The local monitor remains functional without an account and never uploads unless the owner explicitly starts a separate remote-sharing session.

Do not require a paid service for the local monitor. Before selecting a remote deployment plan, verify current Firebase plan limits and whether the required Functions runtime is available on the project's plan. Do not silently enable billing.

## Callable operations

All calls require a verified Firebase Auth ID token, including Firebase anonymous sessions. Anonymous authentication supplies a stable per-installation identity, not proof of ownership; pairing secrets, explicit owner approval, App Check, and server-side authorization remain mandatory. Reject requests without a verified auth context. Validate App Check tokens on every callable. Derive owner/viewer UIDs only from verified auth context; never accept a UID supplied by the client as authority.

| Operation | Caller | Required behaviour |
|---|---|---|
| `createPairingInvite` | Owner | Verify ownership of active device; create random high-entropy secret; persist only a server-side hash; expire quickly; return raw code once for manual transfer. |
| `redeemPairingInvite` | Viewer | Accept code in request body (never URL/query); rate-limit attempts; constant-time hash comparison; reject expired, consumed, revoked, or self-pairing codes; create a pending request only. |
| `confirmPairingRequest` | Owner | Require a fresh owner-authenticated confirmation on the originating device; display viewer identity and requested scopes; create a narrowly scoped grant only after explicit approval. |
| `revokeDeviceGrant` | Owner | Verify exact device ownership and grant relationship; revoke only the selected viewer grant without stopping other viewers. |
| `stopDeviceSharing` | Owner | End the active session, revoke every grant bound to that session, release active-grant relationship locks, and delete the latest telemetry. |
| `startDeviceSharing` | Owner | Verify ownership of an active device; create a short-lived session with explicitly selected scopes. |
| `bindGrantToSession` | Owner | Bind an approved, active grant to the owner's active session only when device and scope constraints match. |
| `publishDeviceTelemetry` | Owner device | Verify active sharing session and device ownership; validate strict allowlist and bounds; attach server timestamp and expiry; reject stale session IDs and arbitrary fields. |
| `readDeviceTelemetry` | Viewer | Require an active, unexpired grant bound to the exact owner, viewer, device, session, and requested scope; return only that scope and only fresh telemetry. |

No operation may return pairing secrets after creation. Anonymous Auth is not an authorization shortcut: possession of a valid one-time invite and explicit owner approval are still required. Never log raw codes, precise location payloads, auth tokens, or media. Pairing codes must not be placed in URLs, analytics, crash reports, browser history, or referrers.

## Data contract

- Pairing invite: invite ID, secret hash, owner UID, device ID, createdAt, expiresAt, consumedAt, revokedAt, and a server-maintained `failedAttempts` counter.
- Viewer redemption throttle: a hashed viewer UID plus fixed 15-minute window start and attempt count in `pairingRedemptionLimits`; never store raw invite secrets or viewer identifiers in document IDs.
- Pending request: request ID, invite ID, viewer UID, viewer display label (untrusted presentation only), requested scopes, createdAt, expiresAt (24 hours after redemption), status.
- Grant: owner UID, viewer UID, device ID, explicit scopes, createdAt, expiresAt (30 days after approval), revokedAt, active session ID. Enforce one active grant per owner/viewer/device using a transactionally maintained relationship lock.
- Active session lock: deterministic owner/device key, current session ID, and expiry. Create it transactionally with session creation; reject a second unexpired active session; release it only when the matching session stops. Expired or stopped sessions may have their stale lock replaced.
- Telemetry: owner UID, device ID, session ID, updatedAt, expiresAt, and allowlisted values only.

Allowed scopes are individual values: `battery`, `device`, `permissionStatus`, and `appStatus`. Location and network scopes are deliberately excluded. The owner must approve each requested scope. No wildcard scope.

Telemetry validation:
- Battery: finite level [0, 1], boolean charging.
- Device: coarse platform enum and app version string with strict length; no hardware identifiers or fingerprint.
- Permission status: camera/microphone enum only; never media streams, images, or audio.
- App status: active sharing session heartbeat only.

## Authorization rules

- Owner writes are accepted only for their own device and current active session.
- Viewer reads require a matching active grant for the exact owner UID, viewer UID, device ID, active session, and requested scope. The session's bounded `grantIds` list must also contain the grant being used for the read.
- Viewer writes are always denied.
- Revocation and Stop must block subsequent reads/writes immediately, not merely hide the dashboard UI.
- Clients cannot create, redeem, confirm, or modify grants through direct Firestore writes.
- Server-side `updatedAt` and `expiresAt` values are authoritative. Client-supplied timestamps are not part of the accepted telemetry schema.
- Use strict field allowlists and reject unknown keys.
- Retain only the latest snapshot unless product requirements explicitly justify a short history window.

## Abuse controls and lifecycle

- Short invite expiry (initial proposal: 5 minutes); single-use redemption.
- Generate 32 bytes of cryptographically secure random invite material and store only its SHA-256 hash; the high-entropy secret must never be stored in plaintext.
- Allow at most 5 failed attempts per invitation and 10 redemption attempts per authenticated viewer in each fixed 15-minute window. Enforce both counters in the same Firestore transaction as redemption to prevent concurrent bypass.
- Increment viewer attempt counts for every redemption request, including missing or invalid invitations. Increment invite failure counts for failed validation where the invite document exists.
- Return the same `PAIRING_UNAVAILABLE` error for invalid, expired, consumed, revoked, self-pairing, and throttled invitations. Never expose remaining attempts or counter values to clients.
- Keep rate-limit documents short-lived using Firestore TTL as cleanup only; authorization checks use the stored window start and count, not TTL.
- Prevent owner self-pairing and duplicate active grants. Pending requests have a 24-hour approval window; approved grants expire 30 days after approval, independently of the five-minute invitation lifetime.
- Require an explicit owner approval action; pending requests expire automatically. The current backend verifies the owner's authenticated UID but cannot prove that approval originated from the physical device being shared. The future owner UI must display the viewer identity and requested scopes on that device before invoking approval; do not claim device-bound confirmation until an attested device/session mechanism exists.
- Use server-side expiry checks on every read/write path. Firestore TTL is cleanup, not authorization.
- Set a short telemetry freshness window and remove expired snapshots. Never treat an old snapshot as live.
- Revoking one grant removes only that viewer's access. Stopping a session revokes all grants bound to it and clears their relationship locks. Revocation, account deletion, device revocation, session stop, and expiry invalidate associated access.
- Avoid scheduled cleanup dependencies where TTL can handle deletion; TTL must never be the only security control.

## Required emulator test matrix

1. Unauthenticated callers cannot invoke privileged operations; anonymous Firebase sessions can proceed only through the same App Check, invite, approval, ownership, and scope checks as every other caller.
2. Owner cannot create an invite for another user's device.
3. Viewer cannot redeem an expired, consumed, revoked, malformed, or guessed code.
4. Repeated failed attempts are throttled.
5. Redeeming an invite creates a pending request, not an active grant.
6. Owner confirmation is required and only the device owner can confirm.
7. Owner cannot approve an unexpected viewer or scopes not shown in the pending request.
8. Viewer can read only the exact granted device and approved fields.
9. Viewer cannot read another device, another owner's device, or unapproved scopes.
10. Viewer cannot write telemetry or modify a grant.
11. Revoked grants and stopped sessions immediately deny reads and writes.
12. Stopping a session revokes every grant bound to it; revoking one grant preserves other viewers.
13. A session cannot bind more than 20 viewer grants; overflow attempts leave existing bindings unchanged.
14. Old session IDs, expired telemetry, unknown fields, oversized values, and any location or network payload are rejected.
15. Raw invite secrets and sensitive telemetry never appear in logs or URLs.
16. Location and network scopes cannot be requested, approved, published, or read.
17. Concurrent owner approvals cannot create duplicate active grants for the same owner/viewer/device.
18. A device cannot create a second active sharing session; stopping the current session releases its lock.

## Rollout gates

- Keep `firestore.rules` deny-by-default until the full emulator matrix passes.
- Add backend code and emulator tests before changing any production rule.
- Verify the Firebase project's plan and required service availability before deployment; obtain explicit owner approval before enabling billing or deploying.
- No production deployment, live pairing, or remote telemetry until the owner reviews the final permission flow and approves the rollout.
