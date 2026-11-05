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
