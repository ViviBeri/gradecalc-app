# GradeCalc Device Features — Architecture and Delivery Plan

## Product requirements

- All capabilities must appear as first-party GradeCalc functionality.
- Do not expose third-party product names, logos, provider names, or integration labels in the user interface.
- Preserve the existing SGPA, CGPA, converter, projection, offline-first PWA, and Android packaging behavior.
- Free-tier operation is a hard constraint. Do not introduce paid APIs, paid hosting, subscriptions, or usage-based services.
- Location sharing must be explicitly enabled by the device owner, clearly indicated while active, and easy to pause or stop.
- Camera and microphone access, if ever implemented, must be initiated by the device owner with clear permission and visible active-use indicators. No covert capture or monitoring.
- Do not collect location in the background by default. Background location is a later, separately consented Android capability.

## Existing application baseline

- Repository: `ViviBeri/gradecalc-app`
- Default branch: `main`
- Application: static HTML/CSS/JavaScript offline-first PWA with Capacitor Android packaging.
- Existing calculator logic and local academic data must remain independent of the new device features.
- Work is isolated on `feature/gradecalc-connect-foundation`; do not merge directly into `main`.

## Proposed user-facing experience

Use only GradeCalc-native language and visual styles. Candidate navigation labels are:
- Devices
- Share location
- Recent locations
- Safety zones
- Permissions

No vendor or integration branding should appear in screens, menus, notifications, or onboarding.

## Delivery phases

### Phase 0 — Architecture and safety (this document)
- Record constraints and isolate work on a feature branch.
- No production tracking is activated by this phase.

### Phase 1 — Local device foundation
- Add a modular device-features area without changing calculator calculations.
- Add a device list and explicit location-sharing controls.
- Add a foreground-only location preview using the browser Geolocation API.
- Show permission state, sharing state, timestamp, and accuracy.
- Provide a prominent stop control.
- Store no location history until the user explicitly opts into that feature.
- No remote synchronization in this phase.

### Phase 2 — Consent-based device synchronization
- Evaluate Firebase Spark only after verifying current no-cost quotas and required capabilities.
- Use per-user authenticated records and strict owner-scoped database rules.
- Never expose service credentials or admin keys in client code.
- Define retention, deletion, device revocation, and abuse protections before storing location history.
- Treat free-tier quota exhaustion as a graceful pause, never as a reason to silently upgrade or bill.

### Phase 3 — Maps and history
- Use OpenStreetMap-compatible map rendering.
- Respect the selected tile provider's usage policy; do not bulk-download or prefetch tiles.
- Add user-controlled history retention and deletion.
- Avoid continuous high-frequency updates unless explicitly enabled and technically supported.

### Phase 4 — Android capabilities
- Use Capacitor/native Android integration for features that require native permissions or services.
- Background location is optional, separately explained, and separately consented.
- Display a persistent Android foreground-service notification whenever a background location service is active.
- Provide an in-app stop action and revoke permissions cleanly.
- Do not promise reliable background operation from the PWA alone.

### Phase 5 — Optional camera/audio
- Not part of the initial release.
- Only consider owner-initiated sessions with explicit permission, visible indicators, and no stealth behavior.
- Never activate camera or microphone remotely without an on-device approval action.

## Phase 2 security and pairing design gate

Remote synchronization is intentionally not implemented until every item below has an agreed, tested design.

### Pairing flow
1. The owner signs in on the device that will share data.
2. The owner explicitly chooses **Add a device** and generates a one-time pairing code.
3. The code is random, short-lived (target: 5 minutes), single-use, and stored only as a server-side hash. It must not contain user IDs, credentials, or location.
4. The receiving device must be signed in to its own account and enter the code. Pairing requires confirmation on the sharing device; possession of a code alone must not silently authorize tracking.
5. Both devices show the paired device name, last-seen time, permissions, and a clear **Unpair / revoke** action.
6. Revoke takes effect server-side immediately; the revoked device must not be able to refresh credentials or submit new location updates.

### Authorization and data boundaries
- Every read and write is authorized against the authenticated owner and an explicit device-pair relationship. Client-supplied owner IDs are never trusted.
- Database rules must deny access by default and be tested for cross-account reads, cross-account writes, expired codes, reused codes, revoked devices, and unauthenticated requests.
- Privileged service keys, admin credentials, and signing secrets must never be shipped in the PWA, Android bundle, repository, or public Actions logs.
- Use provider-issued user authentication and short-lived scoped access where supported. Never implement a shared static secret embedded in the app.
- Pairing codes are rate-limited by account, IP/device signal where available, and server-side attempt counters. Do not reveal whether a guessed code belongs to a particular account.

### Location lifecycle
- Remote location updates are off by default and require a separate, explicit opt-in on the sharing device.
- Show a persistent in-app active state and last successful sync time. Background Android collection, if ever added, requires a foreground service notification and a separate permission explanation.
- Send the minimum required fields: coordinates, accuracy, capture timestamp, and paired-device identifier. Do not collect contacts, call logs, messages, microphone, or camera data.
- Define a short default retention period (initial proposal: 24 hours), owner-controlled deletion, and deletion on unpair. Do not enable history until deletion behavior is verified end-to-end.
- Stale locations must be visibly marked with their age; never present old coordinates as live.
- Network failure, quota exhaustion, expired authentication, and provider outage must stop or queue safely without silently increasing cost or changing consent state.

### Provider selection gate
Before choosing a backend, compare current free-tier quotas and terms for authentication, realtime delivery, database storage, bandwidth, region/data residency, abuse controls, and account limits. Verify whether a payment method is required and what happens at quota exhaustion. Prefer a design that can be disabled without affecting calculator functionality. No provider is selected by this document.

### Phase 2A: private device registry (metadata only)

The first authenticated data model is limited to a user's own device records at `users/{uid}/devices/{deviceId}`. The rules permit only that authenticated UID to read, create, update, or delete those records. A record contains only a short device label, a platform label, creation timestamp, and revoked flag. Creation timestamps and platform labels are immutable; updates may change only the label and revoked flag.

This registry is not proof of a paired relationship and does not authorize another account to read anything. It contains no coordinates, location history, pairing codes, access tokens, or remote-control capability. All other Firestore paths remain denied. The emulator suite must prove owner access, cross-account denial, field allowlisting, and immutable-field enforcement before this schema is considered ready.

**Important limitation:** Spark does not provide Cloud Functions for a trusted server-side pairing broker. A client-only pairing flow must not be treated as secure merely because it uses a Firestore transaction. Do not enable code issuance, redemption, or location writes until the protocol can enforce one-time redemption, confirmation, expiry, abuse resistance, and revocation without trusting an untrusted client.

### Required tests before enabling remote sync
- Unauthenticated access is denied.
- Account A cannot read or write Account B's devices or locations.
- Invalid, expired, and previously redeemed pairing codes are rejected.
- A pairing code cannot be redeemed without the sharing device's confirmation.
- Revoked devices lose access immediately.
- Location is not sent before opt-in or after stop/unpair.
- Retention expiry and owner-requested deletion remove location records.
- Quota exhaustion and offline mode do not create paid usage or break the calculator.
- Logs and error messages never include raw pairing codes, access tokens, or precise coordinates.


## Backend evaluation and provisional selection (November 2026)

### Options reviewed

| Requirement | Firebase Spark | Supabase Free |
|---|---|---|
| Published no-cost allowance | Firestore: 1 GiB, 50K reads/day, 20K writes/day, 20K deletes/day, 10 GiB/month egress. Realtime Database also has a free allowance. | 500 MB database, 50K monthly active users, 5 GB uncached + 5 GB cached egress, 2 million realtime messages/month, 200 peak realtime connections. |
| Payment / billing posture | Spark is a no-cost plan and does not require a payment method. Do not upgrade to Blaze for this project. | Free plan is $0. Free projects may be paused after one week of inactivity. |
| Pairing/security implementation | Firebase Authentication + Firestore transactions + strict Firestore Security Rules. No privileged service key in the client. | Auth + PostgreSQL Row Level Security + database functions + Realtime. Strong relational controls, but project pausing is a reliability concern. |
| Important limitations | Firestore quotas are daily/monthly limits; Realtime Database has its own limits. Cloud Functions are not part of the Spark free allowance. Avoid phone/SMS auth because SMS is billable. | Free database is 500 MB and project pausing after inactivity can interrupt device synchronization. |

Official references checked on 5 November 2026:
- Firebase plans and quotas: https://firebase.google.com/pricing
- Firebase Authentication limits: https://firebase.google.com/docs/auth/limits
- Supabase pricing: https://supabase.com/pricing
- Supabase billing and free-project behavior: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase Realtime limits: https://supabase.com/docs/guides/realtime/limits

### Provisional selection: Firebase Spark

Firebase Spark is the better fit for the current zero-budget and low-maintenance constraint because it does not require a payment method and does not list automatic free-project pausing after one week of inactivity. Use only Firebase Authentication and Cloud Firestore for the first remote-sync prototype. Do not use phone/SMS authentication, Cloud Functions, paid extensions, Storage, or any service that requires enabling billing.

This is a provisional architecture choice, not an assertion that the service is unlimited, guaranteed, or permanently free. Before setup, verify the project console still offers Spark without adding a billing account. Do not enter payment details or enable Blaze. If a required capability becomes paid, stop and keep local-only functionality.

### Implementation constraints for Spark

- Use email/password authentication initially; require verified email before enabling pairing. Avoid email-link sign-in because the published Spark quota is only 5 sign-in emails/day. Do not use phone/SMS sign-in.
- Pairing must be implemented with Firestore transactions and restrictive Security Rules, with random high-entropy one-time codes, a short expiry, one-time redemption, and owner-device confirmation. Never store a reusable plain-text code.
- The app's public Firebase configuration is not a secret. Security depends on Authentication, Firestore Security Rules, and App Check where supported; never put Admin SDK credentials or service-account keys in the client.
- Deny all access by default. Test owner isolation, pair membership, expiry, one-time redemption, and revocation rules in the Firebase Emulator Suite before any production data is enabled.
- Keep location sync disabled until the rules and pairing protocol pass adversarial tests. A client-side UI check is not an authorization boundary.
- No paid billing plan is permitted. If Spark limits prevent safe operation, remain local-only rather than upgrading.


## Free-tier and reliability rules

- No paid APIs or mandatory billing accounts.
- Check provider pricing, quotas, and terms before integration.
- Keep the core calculator fully usable offline and when all device-feature services are unavailable.
- Feature failures must not block the calculator.
- No secrets, private keys, or privileged credentials in the public repository.
- Add automated tests for permission denial, unavailable location, timeout, stop-sharing, stale data, and service failure.

## Acceptance criteria for Phase 1

1. Existing calculator tests and workflows continue to pass.
2. Device features are isolated in their own module.
3. Location is requested only after an explicit user action.
4. The UI clearly explains that location is being accessed and shows the active state.
5. The user can stop location access immediately.
6. No location is transmitted to a server in Phase 1.
7. No location history is retained in Phase 1.
8. No third-party branding appears in the interface.
9. The feature works only in a secure context and handles unsupported browsers gracefully.
10. No paid service or API key is required.


## Camera and microphone access policy

Camera and microphone features remain optional and are not enabled by the current local-device implementation. If added later, they must follow these rules:

- The device owner may grant the Android permission in advance. A previously granted permission removes the need to ask for the same runtime permission repeatedly, but it is not blanket consent for every future capture session.
- Each photo capture or audio recording session must begin with a clear, on-device action such as **Take photo** or **Start recording**. Do not start capture merely because the app opened, a device paired, or a remote user requested it.
- Do not add repetitive GradeCalc pop-ups when permission is already granted. Keep the active feature state and the capture controls clear and unobtrusive.
- Android's system privacy indicators and permission controls must remain intact. GradeCalc must not attempt to hide, suppress, spoof, or bypass operating-system camera or microphone indicators, notifications, permission prompts, or privacy controls.
- No covert capture, remote activation, background recording, unattended photography, or capture after the user leaves the feature.
- Provide an obvious **Stop** or **Cancel** action. Stop media tracks and release the camera/microphone immediately when the session ends, the page becomes hidden, or the app is backgrounded.
- Do not upload, transmit, or retain captured media unless a separate, explicit user action authorizes that specific operation. Explain the destination and purpose before any upload.
- Request only the permission needed for the selected action. A photo-only workflow must not request microphone access; an audio-only workflow must not request camera access.
- If permission is denied, unavailable, or revoked, explain the limitation without repeatedly prompting or trying to work around the user's choice.

### Camera/audio acceptance criteria

1. No camera or microphone permission is requested on app launch.
2. A permission already granted is not needlessly requested again.
3. Every capture session is started by an explicit on-device action.
4. The interface provides clear active state and a working stop/cancel action.
5. All media tracks are stopped on session end and when the app becomes hidden/backgrounded.
6. Android privacy indicators and system permission controls are never hidden or bypassed.
7. No remote activation, covert capture, background recording, or automatic media upload is possible.
8. Camera and microphone permissions are requested independently and only for the feature that needs them.
