const Tesseract = require('tesseract.js');
const path = require('path');

const imgPath = path.resolve('C:/Users/kevin/.gemini/antigravity/brain/df96fef0-6d29-49df-b8b0-bbf3c04c5c61/artifacts/cloze_suite_es_2026-06-10_21-41-28.png');

Tesseract.recognize(
  imgPath,
  'eng+spa',
  { logger: m => console.log(m) }
).then(({ data: { text } }) => {
  console.log('======= OCR RESULT =======');
  console.log(text);
  console.log('==========================');
});
