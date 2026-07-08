// Rendering codes on screen with bwip-js: one client-side library covering
// every supported 1D and 2D format, fully offline.
import bwipjs from 'bwip-js';

// code_format (zxing-style names, stored in the DB) -> bwip-js bcid
const BWIP_BCID = {
  EAN_13: 'ean13',
  EAN_8: 'ean8',
  UPC_A: 'upca',
  UPC_E: 'upce',
  CODE_128: 'code128',
  CODE_39: 'code39',
  ITF: 'interleaved2of5',
  CODABAR: 'rationalizedCodabar',
  QR_CODE: 'qrcode',
  DATA_MATRIX: 'datamatrix',
  PDF_417: 'pdf417',
  AZTEC: 'azteccode',
};

export const TWO_D_FORMATS = new Set(['QR_CODE', 'DATA_MATRIX', 'AZTEC']);

function renderValue(format, value) {
  let v = String(value);
  if (format === 'CODABAR') {
    // Codabar needs start/stop characters (A-D). Add them for rendering if absent.
    if (!/^[A-Da-d].*[A-Da-d]$/.test(v) || v.length < 3) v = `A${v}A`;
  }
  if (format === 'ITF' && v.length % 2 === 1) v = `0${v}`; // ITF requires an even digit count
  return v;
}

// Draws the code onto the given canvas. Throws if the value is invalid for the format.
export function drawCode(canvas, format, value) {
  const bcid = BWIP_BCID[format];
  if (!bcid) throw new Error(`unsupported format: ${format}`);
  const twoD = TWO_D_FORMATS.has(format);
  const opts = {
    bcid,
    text: renderValue(format, value),
    scale: 3,
    includetext: !twoD && format !== 'PDF_417',
    textxalign: 'center',
    paddingwidth: 8,
    paddingheight: 8,
    backgroundcolor: 'FFFFFF',
  };
  if (!twoD && format !== 'PDF_417') opts.height = 14; // mm-ish bar height for 1D codes
  bwipjs.toCanvas(canvas, opts);
}
