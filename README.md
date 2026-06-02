# GradeCalc – SGPA & CGPA Calculator

> Built for **SGC Students, Pondicherry**

A fast, offline-capable Progressive Web App (PWA) to calculate SGPA, CGPA and convert grades — designed specifically for the SGC Pondicherry 10-point grading system.

---

## 📱 Live App

🔗 **[https://sgc-gradecalc.netlify.app](https://sgc-gradecalc.netlify.app)**

---

## ✨ Features

### 🎓 SGPA Calculator
- Enter subject name, marks (0–100) and credits
- Grade fills **automatically** based on marks entered
- Leave marks blank → shows **Ab (Absent)** automatically
- Calculates SGPA instantly
- Shows subject-wise breakdown table
- ⚠️ Arrear warning for F grades
- 🚫 Absent warning for blank marks

### 📊 CGPA Calculator
- Enter semester-wise SGPA
- Calculates cumulative CGPA
- Visual progress bars for each semester
- Add/remove semesters dynamically

### 🔄 Grade Converter
- SGPA → Percentage
- CGPA → Percentage
- Percentage → CGPA
- University formula reference (Anna University, VTU, JNTUH, KTU, Mumbai)

### ⚙️ Grade Scale Reference
- View your university's complete grade scale
- Tap "Grade Scale" button in header

---

## 🏫 SGC Pondicherry Grade Scale

| Marks (%) | Grade | Description    | Points |
|-----------|-------|----------------|--------|
| 80 – 100  | O     | Outstanding    | 10     |
| 71 – 79   | A+    | Excellent      | 9      |
| 66 – 70   | A     | Very Good      | 8      |
| 61 – 65   | B+    | Good           | 7      |
| 56 – 60   | B     | Above Average  | 6      |
| 50 – 55   | C     | Average        | 5      |
| 40 – 49   | P     | Pass           | 4      |
| Below 40  | F     | Fail           | 0      |
| Absent    | Ab    | Absent         | 0      |

---

## 📐 Formula Used

```
SGPA = Σ (Credit × Grade Point) ÷ Σ Credits
CGPA = Σ SGPA ÷ Number of Semesters
Percentage = SGPA × 9.5
```

---

## 🛠️ Tech Stack

| Technology      | Purpose                          |
|-----------------|----------------------------------|
| HTML5           | App structure & layout           |
| CSS3            | Design, dark theme, animations   |
| JavaScript (ES6)| Grade logic & calculations       |
| PWA Manifest    | Makes it installable on Android  |
| Service Worker  | Offline support                  |
| GitHub          | Code hosting & version control   |
| Netlify         | Free web hosting & auto-deploy   |
| PWABuilder      | Android APK/AAB generation       |
| Google Play     | App store publishing             |

---

## 📁 Project Structure

```
gradecalc-app/
├── index.html        ← Complete app (HTML + CSS + JS in one file)
├── manifest.json     ← PWA configuration for Android
├── sw.js             ← Service Worker (offline support)
├── icon-72.png       ← App icon 72×72
├── icon-96.png       ← App icon 96×96
├── icon-128.png      ← App icon 128×128
├── icon-144.png      ← App icon 144×144
├── icon-152.png      ← App icon 152×152
├── icon-192.png      ← App icon 192×192 (home screen)
├── icon-384.png      ← App icon 384×384
├── icon-512.png      ← App icon 512×512 (Play Store)
└── README.md         ← This file
```

---

## 🚀 How to Deploy (for contributors)

### 1. Clone the repo
```bash
git clone https://github.com/ViviBeri/gradecalc-app.git
cd gradecalc-app
```

### 2. Open locally
Just open `index.html` in any browser — no build tools needed!

### 3. Deploy to Netlify
- Push changes to `main` branch
- Netlify auto-deploys within 30 seconds ✅

---

## 📲 How to Install on Android

1. Open the live link in **Chrome** on your Android phone
2. Tap the **"Add to Home Screen"** prompt
3. App installs like a native app — works offline! ✅

Or download from **Google Play Store** (search: GradeCalc SGC)

---

## 🔄 Auto-Update System

```
You edit code → Push to GitHub → Netlify redeploys → 
App updates for ALL users automatically (no reinstall needed)
```

---

## 📋 Roadmap (Future Updates)

- [ ] Multiple university grade scale support
- [ ] Save/load semester history
- [ ] Share result as image
- [ ] Tamil language support
- [ ] Dark/Light theme toggle
- [ ] Backlog/Arrear tracker

---

## 👨‍💻 Developer

**Designed by SGC Student, Pondicherry**

---

## 📄 License

This project is open source and free to use for educational purposes.

---

*GradeCalc · SGPA & CGPA Calculator · SGC Pondicherry*
