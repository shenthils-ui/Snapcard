// Live camera scanner (zxing), shown as an overlay on the add/edit screen —
// NOT a separate route, so opening it never changes the URL. (On iOS, URL
// changes inside an installed web app can re-trigger the camera permission
// prompt.) The camera stream is requested once per scanner session and reused.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { CODE_FORMATS } from '../../shared/schema.js';

export default function Scanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null); // 'denied' | 'failed'
  const { t } = useI18n();

  useEffect(() => {
    let controls = null;
    let cancelled = false;

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          CODE_FORMATS.map((f) => BarcodeFormat[f])
        );
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            controls?.stop();
            onResult({
              value: result.getText(),
              format: BarcodeFormat[result.getBarcodeFormat()],
            });
          }
        });
      } catch (err) {
        if (cancelled) return;
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
        setError(denied ? 'denied' : 'failed');
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="scanner-overlay">
      <div className="flex items-center justify-between p-4 text-white">
        <h2 className="text-lg font-semibold">{t('scanner_title')}</h2>
        <button onClick={onClose} className="rounded-lg bg-white/20 px-4 py-2" data-testid="scanner-close">
          {t('scanner_close')}
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
          <p>{t(error === 'denied' ? 'camera_denied' : 'camera_error')}</p>
          <button onClick={onClose} className="rounded-lg bg-sky-500 px-4 py-2 font-medium">
            {t('manual_entry')}
          </button>
        </div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <p className="absolute bottom-6 w-full text-center text-sm text-white/80">{t('scanner_hint')}</p>
          <div className="pointer-events-none absolute inset-0 m-auto h-48 w-72 max-w-[80%] rounded-xl border-2 border-white/70" />
        </div>
      )}
    </div>
  );
}

// Decode a still image the user picked (less reliable than a live scan; see README).
export async function decodeImageFile(file) {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(
    DecodeHintType.POSSIBLE_FORMATS,
    CODE_FORMATS.map((f) => BarcodeFormat[f])
  );
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints);
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return { value: result.getText(), format: BarcodeFormat[result.getBarcodeFormat()] };
  } finally {
    URL.revokeObjectURL(url);
  }
}
