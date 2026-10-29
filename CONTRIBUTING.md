# Contributing to GradeCalc

Thanks for helping improve GradeCalc.

## Before opening a pull request
- Keep the static, no-build architecture unless a change requires otherwise.
- Run `node tests.js` with Node.js 20 or newer.
- For grade-scale changes, include tests for every threshold and decimal values around boundaries.
- For PWA or service-worker changes, test through localhost or HTTPS in a browser; opening the HTML file directly is not a service-worker test.
- Do not add personal/student data to test fixtures, screenshots, or issue reports.

## Pull request checklist
- [ ] Explain user-visible behavior and scope.
- [ ] Add or update calculation tests when math changes.
- [ ] Check mobile layout and keyboard/zoom accessibility.
- [ ] Verify icon/manifest/service-worker paths use lowercase `icons/`.
- [ ] State what was tested and what remains unverified.
