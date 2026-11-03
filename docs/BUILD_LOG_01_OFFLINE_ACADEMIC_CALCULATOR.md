# Build Log 01 — Building an Offline-Capable Academic Calculator

**Project:** GradeCalc  
**Focus:** Transparent grade calculations, browser-local data, PWA delivery, and regression tests  
**Release:** v1.0.0

## The problem

Students need a quick way to calculate semester performance, explore grade conversions, and review academic trends from a phone. GradeCalc is a static, installable Progressive Web App designed to run without an application account or backend.

## Calculation model

The calculation logic is kept in a shared JavaScript module so the browser application and Node-based tests can exercise the same functions.

- **Marks to grade:** Maps marks to the SGC grade scale, including decimal boundaries and absent/invalid entries.
- **SGPA:** Uses a credit-weighted calculation: sum of credit multiplied by grade points, divided by total valid credits.
- **CGPA:** The current implementation takes the arithmetic average of entered valid semester SGPAs. It is not credit-weighted.
- **Conversions:** Provides selectable Anna University, VTU, JNTUH/KTU/NIT, and Mumbai University formula options, with reverse conversion helpers.

The CGPA distinction is important: students should confirm their institution's official cumulative calculation method before using a result for formal submissions.

## Browser-first architecture

The application is a static HTML, CSS, and JavaScript project. Calculations run in the browser, and subject/semester entries plus preferences are stored in browser local storage. No account or application backend is required.

The PWA manifest and service worker support installation and an offline application shell. The service worker uses a network-first strategy for page navigation, with cached content and an offline fallback when the network request fails. Same-origin assets and selected Google Fonts resources can be cached.

Offline support has boundaries: clearing browser/site data can remove locally stored entries, and some browser features or external resources may still require connectivity. Users should export data when they need a separate copy.

## Testing and delivery

The repository documents JavaScript checks using Node.js 20 or newer, including the calculation test script and Node test suites. Python companion tools have their own unittest suite for report generation and bulk data processing.

GitHub Actions runs the JavaScript and Python tests, while a separate workflow deploys the static application to GitHub Pages. The README also identifies a backup Netlify deployment.

These automated checks help protect calculation behavior and the supporting tools. They do not establish that every university uses the same grade scale or conversion formula.

## Practical engineering trade-offs

- A static PWA avoids the operational cost and privacy footprint of an application backend.
- Local storage keeps student entries on the browser device, but it also means the user is responsible for backups and browser-data retention.
- Shared calculation helpers reduce drift between UI behavior and automated tests.
- Explicitly documenting the unweighted CGPA method prevents the interface from implying a credit-weighted result that it does not calculate.
- Institution-specific percentage conversions remain selectable rather than being presented as universal rules.

## Next verification priorities

1. Keep grade-boundary and formula regression tests aligned with the documented grade scale.
2. Test installation and offline reload on current Android browsers and desktop browsers.
3. Validate the service-worker cache after a deployment update and confirm that old cached assets are replaced.
4. Keep the CGPA method clearly disclosed, and only add a credit-weighted mode if its required semester-credit inputs and institutional rules are defined.

---

*This build log describes the current repository implementation and its documented behavior. It does not claim that GradeCalc's grade scale or conversion formulas are official for every institution.*