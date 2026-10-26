# GPA & WAM Calculator

A browser-based WAM and GPA tracker for Western Sydney University students. It's a web version of the GPA & WAM Calc workbook: subject ledger, assessment tracker, HD tracker, risk and opportunity scanner, what-if planner, reverse goal solver, Monte Carlo projection, degree map with prerequisite and offering checks, insights, academic summary and history.

## Features

- **Import from MySR.** Print *My Results → Subject Results* to PDF and drop it in. Codes, marks, grades and credit points are read in the browser. If the PDF has no text layer (for example from Microsoft Print to PDF), it falls back to on-device OCR. You review every row before it's saved, and the import checks your GPA and credit points against the MySR program summary.
- **Saved on your device.** Everything stays in the browser's local storage. Nothing is uploaded.
- **Export.** JSON backup and restore, Excel (.xlsx), CSV, and a printable academic summary.
- **Blank by default.** New visitors start empty. They can load a clearly fictional sample student to explore.

## Run locally

It's a static site with no build step. Serve the folder with any static server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block ES modules and web workers on `file://`.

## Publish with GitHub Pages

In the repository, go to **Settings → Pages**, set the source to *Deploy from a branch*, then choose the branch and the `/ (root)` folder.

## Third-party code

PDF.js and Tesseract.js are bundled in `vendor/` (see `vendor/README.md`). Inter and Fraunces fonts are bundled in `assets/fonts/` under the SIL Open Font License.

Independent student tool. Not affiliated with or endorsed by Western Sydney University.
