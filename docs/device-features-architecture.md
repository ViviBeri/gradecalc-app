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
