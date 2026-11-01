# GradeCalc — SGPA & CGPA Calculator

A mobile-friendly, installable Progressive Web App for students to calculate semester grades, track cumulative performance, explore grade conversions, and review academic trends.

<p align="center">
  <img src="https://raw.githubusercontent.com/ViviBeri/gradecalc-app/main/readme-hero.svg?v=2" alt="GradeCalc project banner" width="100%" />
</p>

<p align="center">
  <a href="https://viviberi.github.io/gradecalc-app/"><img src="https://img.shields.io/badge/Launch-Live_App-16a34a?style=for-the-badge&logo=githubpages&logoColor=white" alt="Launch GradeCalc" /></a>
  <a href="https://github.com/ViviBeri/gradecalc-app/actions"><img src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions" /></a>
  <a href="https://github.com/ViviBeri/gradecalc-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT license" /></a>
</p>

<p align="center">
  <strong>Built for the SGC student community · Puducherry</strong>
</p>

## Open the app

- **Live app:** [viviberi.github.io/gradecalc-app](https://viviberi.github.io/gradecalc-app/)
- **Backup deployment:** [gradecalc-sgc.netlify.app](https://gradecalc-sgc.netlify.app/)

## Features

| Tool | What it does |
|---|---|
| **SGPA calculator** | Calculates credit-weighted SGPA from subject marks and credits, with grade results and a subject-wise breakdown. |
| **CGPA calculator** | Calculates the arithmetic average of entered semester SGPAs and visualizes semester progress. |
| **What-If projector** | Estimates the average grade points needed across additional credits to reach a target SGPA. |
| **Grade converter** | Converts SGPA/CGPA to percentage and percentage to CGPA using a selectable university formula. |
| **Academic analytics** | Shows semester SGPA trends, average and best-semester metrics, subject grade distribution and subject comparisons; supports CSV export. |
| **Installable PWA** | Supports installation on compatible browsers, saved theme preference and an offline application shell. |

### Important calculation notes

- The SGPA calculation is credit-weighted: **SGPA = Σ(credit × grade point) ÷ Σ credits**.
- The current CGPA mode uses an **unweighted arithmetic average** of the entered semester SGPAs. It does not calculate a credit-weighted cumulative GPA. Confirm your institution's official method before using the result for formal submissions.
- The What-If tool is an estimate based on the current subject/credit entries and the additional credits entered.
- Conversion formulas vary by institution. Select the formula required by your university.

## SGC grade scale

The calculator uses the following marks-to-grade mapping. Lower bounds are inclusive.

| Marks | Grade | Grade points |
|---:|:---:|---:|
| 80–100 | O | 10 |
| 71–less than 80 | A+ | 9 |
| 66–less than 71 | A | 8 |
| 61–less than 66 | B+ | 7 |
| 56–less than 61 | B | 6 |
| 50–less than 56 | C | 5 |
| 40–less than 50 | P | 4 |
| 0–less than 40 | F | 0 |
| Blank / absent | Ab | 0 |

Decimal marks use the same thresholds. For example, 70.5 maps to A (8 points), while 79.5 maps to A+ (9 points).

## Calculation and conversion formulas

**SGPA**

`SGPA = Σ(credit × grade point) ÷ Σ credits`

**CGPA in the current app**

`CGPA = Σ(entered semester SGPA) ÷ number of entered semesters`

**Percentage conversion options**

| Formula option | Conversion |
|---|---|
| Standard / Anna University | GPA × 9.5 |
| VTU | GPA × 10 − 7.5 |
| JNTUH / KTU / NIT | GPA × 10 |
| Mumbai University | GPA × 7.1 + 11 |

These are institution-specific conversion methods, not universal standards. Check the current regulations published by your institution.

## Privacy and data storage

- Calculations run in the browser; the app does not require an account or application backend.
- Subject and semester entries and preferences are stored in the browser's local storage on the device.
- Clearing browser/site data can remove locally saved entries. Use the app's available export options when you need a separate copy of analytics data.
- Google Fonts may be requested from Google's servers when the app is online.
- Avoid entering sensitive personal information.

## Install on Android

1. Open the [live app](https://viviberi.github.io/gradecalc-app/) in Chrome.
2. Open the browser menu and choose **Install app** or **Add to Home screen**, when offered.
3. Launch GradeCalc once while online so the service worker can cache the application shell.
4. Reopen the installed app to use the cached shell when offline. Some browser features and external resources may still require connectivity.

## Development

GradeCalc is a static, no-build web app. The main application runs with HTML, CSS and JavaScript; Python is an optional companion for reports and bulk data tools.

### Run locally

Clone the repository and open `index.html` in a browser for basic UI inspection. For service-worker and offline testing, serve the project through localhost or HTTPS; opening the file directly does not test PWA behavior.

### JavaScript tests

Requires Node.js 20 or newer.

```sh
node tests.js
node --test tests/*.test.cjs
```

### Python tests

```sh
python -m pip install -r python/requirements.txt
python -m unittest discover -s python -p "test_*.py" -v
```

### Generate a sample PDF report

```sh
cd python
python report_generator.py example_semester.json sample-semester-report.pdf
```

The input JSON uses `student_name`, `semester` and a `subjects` array containing subject `name`, `marks` and `credits`. Optional fields include `institution`, `register_number`, `programme` and `academic_year`. The generated PDF is a student-created calculation report, not an official transcript.

### CSV and Excel bulk processing

The input CSV/XLSX file uses one subject per row with required columns `student_name`, `semester`, `subject`, `marks` and `credits`. `register_number` is optional.

```sh
python python/data_import_export.py python/example_records.csv calculated-results.xlsx
```

Use a `.csv` output extension for CSV export. Excel support uses openpyxl; CSV support uses the Python standard library.

## Project structure

```text
index.html                         Main application UI and interactions
calc.js                            Shared grade, SGPA/CGPA and conversion logic
analytics.js                       Academic analytics and CSV export
manifest.json                      PWA metadata
sw.js                              Service worker and offline caching
offline.html                       Offline fallback page
icons/                             App icons (72–512 px)
tests.js                           JavaScript calculation tests
tests/                              Node test suites and regression checks
python/                             Python calculations, PDF reports and bulk tools
.github/workflows/                  Automated tests and GitHub Pages deployment
CONTRIBUTING.md                     Contribution guidelines
LICENSE                             MIT license
```

## Continuous integration and deployment

GitHub Actions runs the JavaScript calculation/regression checks and Python test suite. A separate workflow deploys the static app to GitHub Pages when changes are pushed to `main).

- [View workflow runs](https://github.com/ViviBeri/gradecalc-app/actions)
- [Report a bug](https://github.com/ViviBeri/gradecalc-app/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/ViviBeri/gradecalc-app/issues/new?template=feature_request.yml)

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Include tests for calculation changes, check mobile usability, and clearly state what you verified.

## Attribution and license

**Original creator:** M.G.K. Ganga Mariyaal

The repository's [MIT License](LICENSE) contains the copyright notice **Copyright © 2026 Bernard Vivian**. The creator attribution in the application and this README is kept distinct from that license notice.

---

<p align="center">
  <strong>GradeCalc · SGPA & CGPA Calculator · SGC Puducherry</strong>
</p>
