import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { STRINGS, LANGUAGES } from './strings.js';
import { call } from '../data/client.js';

const I18nContext = createContext(null);

export function detectLanguage() {
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return STRINGS[nav] ? nav : 'en';
}

export function I18nProvider({ initialLang, children }) {
  const [lang, setLangState] = useState(initialLang || 'en');

  const t = useCallback(
    (key, vars) => {
      let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [lang]
  );

  const setLang = useCallback(async (next) => {
    setLangState(next);
    try {
      await call('setMeta', 'language', next);
    } catch {
      /* persisting the preference is best-effort */
    }
  }, []);

  const value = useMemo(() => ({ t, lang, setLang, languages: LANGUAGES }), [t, lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
