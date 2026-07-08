import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { call, isStandalone } from '../data/client.js';
import { useI18n } from '../i18n/index.jsx';
import { exportToFile, importFromFile } from '../lib/backup.js';
import * as lock from '../lib/lock.js';
import * as drive from '../drive/drive.js';

function Section({ title, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const btnCls = 'rounded-xl bg-slate-200 px-4 py-2 font-medium text-slate-800 dark:bg-slate-700 dark:text-white';
const primaryCls = 'rounded-xl bg-sky-500 px-4 py-2 font-medium text-white';
const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

export default function SettingsScreen({ theme, setTheme, storagePersisted }) {
  const { t, lang, setLang, languages } = useI18n();
  const navigate = useNavigate();
  const importRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [lockOn, setLockOn] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [driveState, setDriveState] = useState({
    signedIn: drive.isSignedIn(),
    auto: false,
    encrypt: false,
    lastBackup: null,
  });
  const [passDraft, setPassDraft] = useState(drive.getPassphrase());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLockOn(await lock.isLockEnabled());
      setBioOn(await lock.hasBiometricEnrolled());
      setDriveState((s) => ({ ...s, signedIn: drive.isSignedIn() }));
      const [auto, encrypt, lastBackup] = await Promise.all([
        call('getMeta', 'drive_auto_backup'),
        call('getMeta', 'drive_encrypt'),
        call('getMeta', 'last_backup_at'),
      ]);
      setDriveState((s) => ({ ...s, auto: auto === '1', encrypt: encrypt === '1', lastBackup }));
    })();
  }, []);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  };

  // --- local backup ---------------------------------------------------------

  async function doImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(t('import_warning'))) return;
    try {
      const res = await importFromFile(file);
      flash(t('import_done', { n: res.imported }));
    } catch {
      flash(t('import_bad_file'));
    }
  }

  // --- app lock -------------------------------------------------------------

  async function savePin() {
    if (!/^\d{4,}$/.test(pinDraft)) return;
    await lock.setPin(pinDraft);
    setPinDraft('');
    setLockOn(true);
  }

  async function removePin() {
    const current = window.prompt(t('app_lock_pin_current'));
    if (current === null) return;
    if (!(await lock.verifyPin(current))) return flash(t('app_lock_wrong_pin'));
    await lock.removeLock();
    setLockOn(false);
    setBioOn(false);
  }

  async function toggleBio(e) {
    try {
      if (e.target.checked) {
        await lock.enrollBiometric();
        setBioOn(true);
      } else {
        await lock.unenrollBiometric();
        setBioOn(false);
      }
    } catch {
      setBioOn(false);
    }
  }

  // --- drive ----------------------------------------------------------------

  async function driveSignIn() {
    try {
      await drive.signIn();
      setDriveState((s) => ({ ...s, signedIn: true }));
    } catch (err) {
      flash(t('drive_error', { msg: String(err.message || err) }));
    }
  }

  async function driveSignOut() {
    await drive.signOut();
    setPassDraft('');
    setDriveState((s) => ({ ...s, signedIn: false }));
  }

  async function setDriveMeta(key, value, patch) {
    await call('setMeta', key, value);
    setDriveState((s) => ({ ...s, ...patch }));
  }

  async function doBackup() {
    setBusy(true);
    try {
      // Warn when the Drive copy looks newer than this device's data.
      const remote = await drive.fetchBackup().catch(() => null);
      const localUpdated = await call('latestUpdatedAt');
      if (remote?.data?.updated_at && localUpdated && remote.data.updated_at > localUpdated) {
        if (!window.confirm(t('drive_confirm_backup_older'))) return;
      }
      await drive.backupNow();
      setDriveState((s) => ({ ...s, lastBackup: new Date().toISOString() }));
      flash(t('drive_backup_done'));
    } catch (err) {
      flash(driveErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    setBusy(true);
    try {
      const remote = await drive.fetchBackup();
      if (!remote) return flash(t('drive_no_backup_found'));
      const localUpdated = await call('latestUpdatedAt');
      const remoteUpdated = remote.data.updated_at || null;
      const warning =
        localUpdated && remoteUpdated && localUpdated > remoteUpdated
          ? t('drive_confirm_restore_newer_local')
          : t('drive_confirm_restore');
      if (!window.confirm(warning)) return;
      const res = await drive.restoreFromDrive(remote.data);
      flash(t('drive_restore_done', { n: res.imported }));
    } catch (err) {
      flash(driveErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  function driveErrorText(err) {
    const m = String(err.message || err);
    if (m === 'need-passphrase') return t('drive_need_passphrase');
    if (m === 'wrong-passphrase') return t('drive_wrong_passphrase');
    return t('drive_error', { msg: m });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-16" data-testid="settings-screen">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label={t('back')} className="rounded-full p-2 text-xl">
          ←
        </button>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('settings')}</h1>
      </header>

      {msg && (
        <p className="rounded-xl bg-sky-100 p-3 text-sm text-sky-900" data-testid="settings-msg">
          {msg}
        </p>
      )}

      <Section title={t('theme')}>
        <div className="flex gap-2">
          {['light', 'dark', 'system'].map((v) => (
            <button
              key={v}
              onClick={() => setTheme(v)}
              data-testid={`theme-${v}`}
              className={`${btnCls} ${theme === v ? 'ring-2 ring-sky-500' : ''}`}
            >
              {t(`theme_${v}`)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('language')}>
        <select value={lang} onChange={(e) => setLang(e.target.value)} className={inputCls} data-testid="language-select">
          {Object.entries(languages).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </Section>

      <Section title={t('app_lock')}>
        <p className="text-sm text-slate-500">{lockOn ? t('app_lock_enabled') : t('app_lock_disabled')}</p>
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinDraft}
            onChange={(e) => setPinDraft(e.target.value)}
            placeholder={t('app_lock_pin')}
            className={inputCls}
            data-testid="pin-input"
          />
          <button onClick={savePin} className={primaryCls} data-testid="pin-save">
            {lockOn ? t('app_lock_change') : t('app_lock_set')}
          </button>
        </div>
        {lockOn && (
          <>
            <button onClick={removePin} className={btnCls}>
              {t('app_lock_remove')}
            </button>
            {lock.biometricsAvailable() && (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={bioOn} onChange={toggleBio} />
                <span>
                  {t('app_lock_biometric')}
                  <span className="block text-xs text-slate-500">{t('app_lock_biometric_hint')}</span>
                </span>
              </label>
            )}
          </>
        )}
      </Section>

      <Section title={t('backup')}>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportToFile().catch(() => {})} className={primaryCls} data-testid="export-json">
            {t('export_json')}
          </button>
          <button onClick={() => importRef.current?.click()} className={btnCls} data-testid="import-json">
            {t('import_json')}
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={doImport} data-testid="import-json-input" />
        </div>
      </Section>

      {isStandalone && (
        <Section title={t('storage_title')}>
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="storage-status">
            {storagePersisted ? t('storage_persisted') : t('storage_not_persisted')}
          </p>
        </Section>
      )}

      <Section title={t('drive')}>
        <p className="text-sm text-slate-500">{t('drive_hint')}</p>
        {!drive.isDriveConfigured() ? (
          <p className="text-sm text-amber-600" data-testid="drive-unconfigured">
            {t('drive_not_configured')}
          </p>
        ) : !driveState.signedIn ? (
          <button onClick={driveSignIn} className={primaryCls} data-testid="drive-signin">
            {t('drive_signin')}
          </button>
        ) : (
          <>
            <p className="text-sm text-emerald-600" data-testid="drive-status">
              {t('drive_signed_in')}{' '}
              {driveState.lastBackup
                ? t('drive_last_backup', { t: new Date(driveState.lastBackup).toLocaleString(lang) })
                : t('drive_never_backed_up')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={doBackup} disabled={busy} className={primaryCls} data-testid="drive-backup">
                {t('drive_backup_now')}
              </button>
              <button onClick={doRestore} disabled={busy} className={btnCls} data-testid="drive-restore">
                {t('drive_restore')}
              </button>
              <button onClick={driveSignOut} className={btnCls} data-testid="drive-signout">
                {t('drive_signout')}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={driveState.auto}
                data-testid="drive-auto"
                onChange={(e) => setDriveMeta('drive_auto_backup', e.target.checked ? '1' : '0', { auto: e.target.checked })}
              />
              {t('drive_auto')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={driveState.encrypt}
                data-testid="drive-encrypt"
                onChange={(e) => setDriveMeta('drive_encrypt', e.target.checked ? '1' : '0', { encrypt: e.target.checked })}
              />
              {t('drive_encrypt')}
            </label>
            {driveState.encrypt && (
              <div>
                <input
                  type="password"
                  value={passDraft}
                  data-testid="drive-passphrase"
                  onChange={(e) => {
                    setPassDraft(e.target.value);
                    drive.setPassphrase(e.target.value);
                  }}
                  placeholder={t('drive_passphrase')}
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-500">{t('drive_passphrase_hint')}</p>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title={t('about')}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('about_text')}</p>
        <p className="text-xs text-slate-400">Snapcard · local-first · {isStandalone ? 'standalone build' : 'server build'}</p>
      </Section>
    </div>
  );
}
