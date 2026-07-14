import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { initData, call, isStandalone, onDataChanged, ServerUnreachableError } from './data/client.js';
import { I18nProvider, detectLanguage, useI18n } from './i18n/index.jsx';
import { isLockEnabled } from './lib/lock.js';
import { consumeRedirectToken, initAutoBackup } from './drive/drive.js';
import GridScreen from './screens/GridScreen.jsx';
import ShowScreen from './screens/ShowScreen.jsx';
import EditScreen from './screens/EditScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import LockScreen from './components/LockScreen.jsx';

const BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

function ErrorScreen({ title, hint, button, onAction }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center dark:bg-slate-900">
      <div className="text-5xl">😕</div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white" data-testid="error-title">
        {title}
      </h1>
      <p className="max-w-sm text-slate-600 dark:text-slate-300">{hint}</p>
      <button onClick={onAction} className="rounded-xl bg-sky-500 px-6 py-3 font-medium text-white" data-testid="error-action">
        {button}
      </button>
    </div>
  );
}

function BootGate({ children }) {
  const { t } = useI18n();
  const [state, setState] = useState('loading'); // loading | ready | locked | server-down | failed
  const [, setTick] = useState(0);

  // The worker awaits before touching state, so the mount effect never calls
  // setState synchronously (which would trigger a cascading render).
  const runBoot = useCallback(async () => {
    try {
      await initData();
      setState((await isLockEnabled()) ? 'locked' : 'ready');
    } catch (err) {
      setState(err instanceof ServerUnreachableError ? 'server-down' : 'failed');
    }
  }, []);

  // Retry from an error screen: show the spinner again, then re-run boot.
  const retry = useCallback(() => {
    setState('loading');
    runBoot();
  }, [runBoot]);

  useEffect(() => {
    // runBoot only calls setState after awaiting async work (the data-load-on-
    // mount pattern the React docs sanction); the rule can't see the await
    // boundary and flags the transitive setState, so suppress it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runBoot();
  }, [runBoot]);

  if (state === 'loading')
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900">
        <p className="text-slate-500">{t('loading')}</p>
      </div>
    );
  if (state === 'server-down')
    return (
      <ErrorScreen
        title={t('server_unreachable_title')}
        hint={t('server_unreachable_hint')}
        button={t('retry')}
        onAction={retry}
      />
    );
  if (state === 'failed')
    return (
      <ErrorScreen
        title={t('boot_error_title')}
        hint={t('boot_error_hint')}
        button={t('reload')}
        onAction={() => window.location.reload()}
      />
    );
  if (state === 'locked') return <LockScreen onUnlock={() => setState('ready')} />;
  return children(() => setTick((n) => n + 1));
}

function ThemedApp() {
  const [theme, setThemeState] = useState('system');
  const [langLoaded, setLangLoaded] = useState(false);
  const { setLang } = useI18n();

  // Load persisted preferences once the data layer is up (BootGate renders us after init).
  useEffect(() => {
    (async () => {
      try {
        const [storedTheme, storedLang] = await Promise.all([call('getMeta', 'theme'), call('getMeta', 'language')]);
        if (storedTheme) setThemeState(storedTheme);
        if (storedLang) setLang(storedLang);
      } finally {
        setLangLoaded(true);
      }
    })();
    initAutoBackup(onDataChanged);
  }, [setLang]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = (value) => {
    setThemeState(value);
    call('setMeta', 'theme', value).catch(() => {});
  };

  let storagePersisted = null;
  if (isStandalone) {
    // The value is set during initLocalEngine; read it lazily to avoid a static import.
    storagePersisted = window.__snapcardStoragePersisted ?? null;
  }

  if (!langLoaded) return null;

  return (
    <Routes>
      <Route path="/" element={<GridScreen />} />
      <Route path="/add" element={<EditScreen />} />
      <Route path="/card/:id" element={<ShowScreen />} />
      <Route path="/card/:id/edit" element={<EditScreen />} />
      <Route
        path="/settings"
        element={<SettingsScreen theme={theme} setTheme={setTheme} storagePersisted={storagePersisted} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Pick up a Drive OAuth redirect return (iOS installed-app flow) before routing.
  const [restorePath] = useState(() => consumeRedirectToken());

  return (
    <I18nProvider initialLang={detectLanguage()}>
      <BrowserRouter basename={BASENAME}>
        {restorePath && <Navigate to={restorePath.replace(BASENAME, '') || '/settings'} replace />}
        <BootGate>{() => <ThemedApp />}</BootGate>
      </BrowserRouter>
    </I18nProvider>
  );
}
