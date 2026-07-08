import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { call } from '../data/client.js';
import { useI18n } from '../i18n/index.jsx';
import Barcode from '../components/Barcode.jsx';

export default function ShowScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [card, setCard] = useState(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    call('getCard', id).then(setCard);
  }, [id]);

  // Screen Wake Lock: keep the screen on while a code is displayed at the till.
  // (Max brightness boost is native-app-only; Wake Lock is the closest a PWA gets.)
  useEffect(() => {
    let lock = null;
    let released = false;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen');
        }
      } catch {
        /* not supported or denied — non-fatal */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && !released) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);

  if (card === undefined) return <p className="p-6 text-slate-500">{t('loading')}</p>;
  if (card === null)
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-300">{t('card_not_found')}</p>
        <Link to="/" className="text-sky-600 underline">
          {t('back')}
        </Link>
      </div>
    );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(card.code_value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = card.code_value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function remove() {
    if (!window.confirm(t('confirm_delete'))) return;
    await call('deleteCard', card.id);
    navigate('/');
  }

  const balanceText =
    card.balance_kind === 'currency'
      ? new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }).format(Number(card.balance_value) || 0)
      : card.balance_kind === 'points'
        ? `${card.balance_value} ${t('points')}`
        : null;

  return (
    <div className="mx-auto max-w-xl p-4" data-testid="show-screen">
      <header className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label={t('back')} className="rounded-full p-2 text-xl">
          ←
        </button>
        <div
          className="flex-1 rounded-xl px-4 py-2 text-white"
          style={{ backgroundColor: card.color || '#0ea5e9' }}
        >
          <h1 className="text-lg font-bold" data-testid="show-store">
            {card.store_name}
          </h1>
          {card.label && <p className="text-sm text-white/85">{card.label}</p>}
        </div>
      </header>

      <div className="rounded-2xl bg-white p-4 shadow dark:bg-slate-100">
        <Barcode format={card.code_format} value={card.code_value} />
        <p className="mt-2 break-all text-center font-mono text-sm text-slate-600" data-testid="show-code-value">
          {card.code_value}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link
          to={`/card/${card.id}/edit`}
          data-testid="show-edit"
          className="rounded-xl bg-slate-200 px-3 py-2 text-center font-medium text-slate-800 dark:bg-slate-700 dark:text-white"
        >
          {t('edit')}
        </Link>
        <button
          onClick={copyCode}
          data-testid="show-copy"
          className="rounded-xl bg-slate-200 px-3 py-2 font-medium text-slate-800 dark:bg-slate-700 dark:text-white"
        >
          {copied ? t('copied') : t('copy_code')}
        </button>
        <button onClick={remove} data-testid="show-delete" className="rounded-xl bg-rose-100 px-3 py-2 font-medium text-rose-700">
          {t('delete')}
        </button>
      </div>

      <dl className="mt-6 space-y-3 text-slate-700 dark:text-slate-200">
        {balanceText && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('balance')}</dt>
            <dd className="text-lg font-semibold">{balanceText}</dd>
          </div>
        )}
        {card.expiry_date && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('expires')}</dt>
            <dd>{new Date(card.expiry_date).toLocaleDateString(lang)}</dd>
          </div>
        )}
        {card.note && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{t('note')}</dt>
            <dd className="whitespace-pre-wrap" data-testid="show-note">
              {card.note}
            </dd>
          </div>
        )}
        {card.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {card.tags.map((tag) => (
              <span key={tag.id} className="rounded-full bg-slate-200 px-3 py-1 text-xs dark:bg-slate-700">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </dl>

      {(card.front_image || card.back_image) && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {card.front_image && (
            <figure>
              <img src={card.front_image} alt={t('front_photo')} className="w-full rounded-xl" />
              <figcaption className="mt-1 text-center text-xs text-slate-500">{t('front_photo')}</figcaption>
            </figure>
          )}
          {card.back_image && (
            <figure>
              <img src={card.back_image} alt={t('back_photo')} className="w-full rounded-xl" />
              <figcaption className="mt-1 text-center text-xs text-slate-500">{t('back_photo')}</figcaption>
            </figure>
          )}
        </div>
      )}
    </div>
  );
}
