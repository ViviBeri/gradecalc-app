# GradeCalc — SGPA & CGPA Calculator

> Built for SGC students in Puducherry.

GradeCalc is a static Progressive Web App (PWA) for calculating SGPA, CGPA, converting grade percentages, and projecting a possible SGPA from current subject marks. The app is designed for the SGC 10-point grade scale.

<p align="center">
  <img src="https://raw.githubusercontent.com/ViviBeri/gradecalc-app/main/readme-hero.svg?v=2" alt="GradeCalc animated 3D project banner" width="100%" />
</p>

<p align="center">
  <a href="https://gradecalc-sgc.netlify.app/"><img src="https://img.shields.io/badge/Live_App-Open-16a34a?style=for-the-badge&logo=netlify&logoColor=white" alt="Open live app" /></a>
  <a href="https://github.com/ViviBeri/gradecalc-app/actions/workflows/tests.yml"><img src="https://img.shields.io/github/actions/workflow/status/ViviBeri/gradecalc-app/tests.yml?branch=main&label=Tests&style=for-the-badge&logo=githubactions&logoColor=white" alt="Calculation test workflow status" /></a>
  <a href="https://github.com/ViviBeri/gradecalc-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT license" /></a>
</p>

## Live app

[https://gradecalc-sgc.netlify.app/](https://gradecalc-sgc.netlify.app/)

## Features

- **SGPA calculator:** enter subjects, marks and credits; grades update automatically; blank marks are shown as Absent; weighted subject breakdown and arrear/absence warnings are displayed.
- **CGPA calculator:** average the entered semester SGPAs and show progress bars. **The current SGC mode uses an unweighted arithmetic average of semester SGPAs**, not a credit-weighted cumulative calculation. Check your institution's official rule if it differs.
- **What-If SGPA projector:** estimate the average grade points needed across additional credits to reach a target SGPA.
- **Grade converter:** SGPA/CGPA to percentage and percentage to CGPA using the Standard/Anna University formula.
- **University formula reference:** Anna/standard GPA × 9.5; VTU GPA × 10 − 7.5; JNTUH/KTU/NIT GPA × 10; Mumbai University GPA × 7.1 + 11. These formulas are institution-specific; choose the formula prescribed by your university. The live converter lets you select one of these formulas and defaults to Standard/Anna.
- **PWA support:** installable on supported browsers, theme preference, and cached offline shell.

## SGC grade scale

Marks use inclusive lower bounds. Decimal marks follow the same thresholds: for example, 70.5 is A (8 points), and 79.5 is A+ (9 points).

| Marks | Grade | Points |
|---|---:|---:|
| 80 ≤ m ≤ 100 | O | 10 |
| 71 ≤ m < 80 | A+ | 9 |
| 66 ≤ m < 71 | A | 8 |
| 61 ≤ m < 66 | B+ | 7 |
| 56 ≤ m < 61 | B | 6 |
| 50 ≤ m < 56 | C | 5 |
| 40 ≤ m < 50 | P | 4 |
| 0 ≤ m < 40 | F | 0 |
| Blank | Ab | 0 |

## Formulas

- SGPA = Σ(credit × grade point) ÷ Σ credits
- CGPA = Σ semester SGPA ÷ number of entered semesters (unweighted average in this app)
- Standard/Anna percentage: GPA × 9.5
- VTU percentage: GPA × 10 − 7.5
- JNTUH/KTU/NIT percentage: GPA × 10
- Mumbai University percentage: GPA × 7.1 + 11

## Privacy

Calculation and preferences are handled in the browser; subject and semester values are stored in the browser's local storage. The app does not need an account or a backend for its calculations. The page loads Google Fonts from Google's servers when online, so a browser request is sent to that third-party font service. Avoid entering sensitive personal information.

## Development

This is a no-build static app. Open index.html in a browser for basic UI inspection. To run calculation tests, install Node.js and run:

```sh
node tests.js
```

The GitHub Actions workflow runs the same test command on pushes and pull requests. Test service-worker behavior in a browser served over localhost or HTTPS; opening the HTML file directly does not exercise service workers.

## Project structure

```
index.html       Main UI
calc.js          Single shared grade, SGPA/CGPA, and conversion logic
manifest.json    PWA metadata and icons
sw.js            Service worker and offline caching
offline.html     Offline navigation fallback
icons/           Canonical lowercase directory containing all app icons (72–512 px)
tests.js         Node-based calculation tests
.github/workflows/tests.yml  Calculation test workflow
LICENSE          MIT license (Copyright © 2026 Bernard Vivian)
```

## Install on Android

1. Open the live app in Chrome.
2. Use the browser's Add to Home screen or install option when available.
3. Open the installed app once online before relying on offline caching.

## Attribution and license

Made by **Bernard Vivian**. Copyright © 2026 Bernard Vivian. Licensed under the [MIT License](LICENSE).

---

*GradeCalc · SGPA & CGPA Calculator · SGC Puducherry*
