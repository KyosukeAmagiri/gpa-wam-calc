# Third-party libraries

These are loaded only when you import a results PDF, and run entirely in the browser.

| Folder | Library | Version | Licence |
|---|---|---|---|
| `pdfjs/` | [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 4.10.38 | Apache-2.0 |
| `tesseract/` | [Tesseract.js](https://github.com/naptha/tesseract.js) | 5.1.1 | Apache-2.0 |
| `tesseract/core/` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) (LSTM builds) | 5.1.1 | Apache-2.0 |
| `tesseract/lang/` | English trained data, `4.0.0_best_int` ([tessdata](https://github.com/naptha/tessdata)) | 4.0.0 | Apache-2.0 |

The PDF.js files were renamed from `.mjs` to `.js` so every static host serves them with a JavaScript MIME type.
