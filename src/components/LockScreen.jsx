import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { verifyPin, biometricUnlock, hasBiometricEnrolled } from '../lib/lock.js';

export default function LockScreen({ onUnlock }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [bio, setBio] = useState(false);

  useEffect(() => {
    hasBiometricEnrolled().then(setBio).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (await verifyPin(pin)) onUnlock();
    else {
      setWrong(true);
      setPin('');
    }
  }

  async function tryBio() {
    try {
      if (await biometricUnlock()) onUnlock();
    } catch {
      /* user cancelled or authenticator failed; PIN remains available */
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 p-6 text-white">
      <div className="text-5xl">🔒</div>
      <h1 className="text-xl font-semibold">{t('locked_title')}</h1>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setWrong(false);
          }}
          placeholder={t('app_lock_pin')}
          className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-center text-2xl tracking-widest"
          data-testid="lock-pin"
        />
        {wrong && <p className="text-center text-sm text-rose-400">{t('app_lock_wrong_pin')}</p>}
        <button type="submit" className="rounded-lg bg-sky-500 px-4 py-3 font-medium" data-testid="lock-unlock">
          {t('unlock')}
        </button>
        {bio && (
          <button type="button" onClick={tryBio} className="rounded-lg bg-slate-700 px-4 py-3">
            {t('unlock_biometric')}
          </button>
        )}
      </form>
    </div>
  );
}
