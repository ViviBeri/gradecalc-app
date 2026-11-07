# Device Monitor — trusted backend contract

Status: design only. No functions are deployed, no credentials are configured, and Firestore remote access remains denied.

## Runtime boundary

Use Firebase Authentication for both owner and viewer identities. Use second-generation Firebase callable HTTPS functions for privileged pairing operations, with App Check enforcement where supported. Functions use the Admin SDK; clients never write pairing invitations or grants directly. The local monitor remains functional without an account and never uploads unless the owner explicitly starts a separate remote-sharing session.

Do not require a paid service for the local monitor. Before selecting a remote deployment plan, verify current Firebase plan limits and whether the required Functions runtime is available on the project's plan. Do not silently enable billing.

## Callable operations

All calls require a verified Firebase Auth ID token. Reject anonymous accounts. Validate App Check tokens when enforcement is enabled. Derive owner/viewer UIDs only from verified auth context; never accept a UID supplied by the client as authority.

| Operation | Caller | Required behaviour |
|---|---|---|
| `createPairingInvite` | Owner | Verify ownership of active device; create random high-entropy secret; persist only a server-side hash; expire quickly; return raw code once for manual transfer. |
| `redeemPairingInvite` | Viewer | Accept code in request body (never URL/query); rate-limit attempts; constant-time hash comparison; reject expired, consumed, revoked, or self-pairing codes; create a pending request only. |
| `confirmPairingRequest` | Owner | Require a fresh owner-authenticated confirmation on the originating device; display viewer identity and requested scopes; create a narrowly scoped grant only after explicit approval. |
| `revokeDeviceGrant` | Owner | Verify exact device ownership and grant relationship; mark grant revoked and invalidate its session. |
| `stopDeviceSharing` | Owner | End the active session, revoke session-bound grants as product policy requires, and delete or expire the latest telemetry. |
| `publishDeviceTelemetry` | Owner device | Verify active sharing session and device ownership; validate strict allowlist and bounds; attach server timestamp and expiry; reject stale session IDs and arbitrary fields. |

No operation may return pairing secrets after creation. Never log raw codes, precise location payloads, auth tokens, or media. Pairing codes must not be placed in URLs, analytics, crash reports, browser history, or referrers.

## Data contract

- Pairing invite: invite ID, secret hash, owner UID, device ID, createdAt, expiresAt, consumedAt, revokedAt, attempt counters / rate-limit metadata.
- Pending request: request ID, invite ID, viewer UID, viewer display label (untrusted presentation only), requested scopes, createdAt, expiresAt, status.
- Grant: owner UID, viewer UID, device ID, explicit scopes, createdAt, expiresAt, revokedAt, active session ID.
- Telemetry: owner UID, device ID, session ID, updatedAt, expiresAt, and allowlisted values only.

Allowed scopes are individual values: `location`, `battery`, `network`, `device`, `permissionStatus`, `appStatus`. The owner must approve each requested scope. No wildcard scope.

Telemetry validation:
- Location: finite latitude [-90, 90], longitude [-180, 180], and finite non-negative accuracy; only when the owner enabled location sharing. The location object contains no client-supplied timestamp; the telemetry envelope carries the server-side `updatedAt` and `expiresAt` values.
- Battery: finite level [0, 1], boolean charging.
- Network: boolean online and a coarse enumerated effective type; no IP, SSID, BSSID, carrier, or network identifiers.
- Device: coarse platform enum and app version string with strict length; no hardware identifiers or fingerprint.
- Permission status: camera/microphone enum only; never media streams, images, or audio.
- App status: active sharing session heartbeat only.

## Authorization rules

- Owner writes are accepted only for their own device and current active session.
- Viewer reads require a matching active grant for the exact owner UID, viewer UID, device ID, active session, and requested scope.
- Viewer writes are always denied.
- Revocation and Stop must block subsequent reads/writes immediately, not merely hide the dashboard UI.
- Clients cannot create, redeem, confirm, or modify grants through direct Firestore writes.
- Server-side `updatedAt` and `expiresAt` values are authoritative. Client-supplied timestamps are not part of the accepted telemetry schema.
- Use strict field allowlists and reject unknown keys.
- Retain only the latest snapshot unless product requirements explicitly justify a short history window.

## Abuse controls and lifecycle

- Short invite expiry (initial proposal: 5 minutes); single-use redemption.
- Cryptographically secure random invite material with sufficient entropy; store a keyed or salted cryptographic hash, never plaintext.
- Per-account and per-invite attempt throttles; generic redemption errors to reduce invite enumeration.
- Prevent owner self-pairing and duplicate active grants.
- Require fresh owner confirmation; pending requests expire automatically.
- Use server-side expiry checks on every read/write path. Firestore TTL is cleanup, not authorization.
- Set a short telemetry freshness window and remove expired snapshots. Never treat an old snapshot as live.
- Revocation, account deletion, device revocation, session stop, and invite expiry all invalidate associated access.
- Avoid scheduled cleanup dependencies where TTL can handle deletion; TTL must never be the only security control.

## Required emulator test matrix

1. Unauthenticated and anonymous callers cannot invoke privileged operations.
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
12. Old session IDs, expired telemetry, unknown fields, oversized values, and invalid coordinates are rejected.
13. Raw invite secrets and sensitive telemetry never appear in logs or URLs.

## Rollout gates

- Keep `firestore.rules` deny-by-default until the full emulator matrix passes.
- Add backend code and emulator tests before changing any production rule.
- Verify the Firebase project's plan and required service availability before deployment; obtain explicit owner approval before enabling billing or deploying.
- No production deployment, live pairing, or remote telemetry until the owner reviews the final permission flow and approves the rollout.
