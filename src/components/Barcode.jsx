import { useEffect, useRef, useState } from 'react';
import { drawCode } from '../lib/barcode.js';
import { useI18n } from '../i18n/index.jsx';

export default function Barcode({ format, value, className }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      drawCode(canvasRef.current, format, value);
      setError(null);
    } catch {
      setError(t('render_error', { format }));
    }
  }, [format, value, t]);

  if (error) {
    return (
      <div className={`rounded-lg bg-amber-100 p-4 text-center text-sm text-amber-900 ${className || ''}`} data-testid="barcode-error">
        {error}
      </div>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      data-testid="barcode-canvas"
      className={`mx-auto max-w-full rounded-lg bg-white ${className || ''}`}
    />
  );
}
