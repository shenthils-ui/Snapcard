import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { isStandalone } from '../data/client.js';

const DISMISS_KEY = 'snapcard.installHintDismissed';

// True only for iOS Safari running in a normal browser tab (not already
// installed to the home screen). iOS is the one platform where installing is
// non-obvious and there is no beforeinstallprompt event to lean on.
function shouldOfferIosInstall() {
  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as desktop Safari but is still touch + Apple.
  const isIpadOsDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return (isIos || isIpadOsDesktop) && !installed;
}

function computeInitialShow() {
  // Only the standalone PWA build is installable; the laptop/server build is not.
  if (!isStandalone) return false;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    /* storage may be blocked; treat as not dismissed */
  }
  return !dismissed && shouldOfferIosInstall();
}

export default function InstallHint() {
  const { t } = useI18n();
  // Depends only on browser APIs available at mount, so compute it once lazily.
  const [show, setShow] = useState(computeInitialShow);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* best-effort */
    }
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 flex items-start gap-3 bg-sky-600 px-4 py-3 text-sm text-white shadow-md"
      role="status"
      data-testid="install-hint"
    >
      <span className="text-lg leading-none" aria-hidden>
        📲
      </span>
      <p className="flex-1">{t('install_hint')}</p>
      <button
        onClick={dismiss}
        aria-label={t('install_hint_dismiss')}
        data-testid="install-hint-dismiss"
        className="rounded-lg bg-white/20 px-2 py-1 leading-none"
      >
        ✕
      </button>
    </div>
  );
}
