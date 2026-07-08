import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { call } from '../data/client.js';
import { useI18n } from '../i18n/index.jsx';
import { CODE_FORMATS } from '../../shared/schema.js';
import Scanner, { decodeImageFile } from '../components/Scanner.jsx';
import Barcode from '../components/Barcode.jsx';
import { fileToCompressedDataUrl } from '../lib/images.js';

const COLORS = ['#0ea5e9', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#475569'];

const EMPTY = {
  store_name: '',
  label: '',
  code_value: '',
  code_format: 'EAN_13',
  note: '',
  color: COLORS[0],
  front_image: null,
  back_image: null,
  balance_value: '',
  balance_kind: 'none',
  expiry_date: '',
  is_favorite: 0,
};

export default function EditScreen() {
  const { id } = useParams(); // undefined on /add
  const navigate = useNavigate();
  const { t } = useI18n();
  const [form, setForm] = useState(id ? null : EMPTY);
  const [tagsText, setTagsText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const imageDecodeRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    call('getCard', id).then((card) => {
      if (!card) return setForm(null);
      setForm({ ...EMPTY, ...card, expiry_date: card.expiry_date || '' });
      setTagsText((card.tags || []).map((tg) => tg.name).join(', '));
    });
  }, [id]);

  if (!form) return <p className="p-6 text-slate-500">{t('loading')}</p>;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function onScanResult({ value, format }) {
    setScanning(false);
    set('code_value', value);
    if (CODE_FORMATS.includes(format)) set('code_format', format);
  }

  async function onPickDecodeImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { value, format } = await decodeImageFile(file);
      onScanResult({ value, format });
      setError(null);
    } catch {
      setError(t('image_no_code'));
    }
  }

  async function onPickPhoto(side, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      set(side, await fileToCompressedDataUrl(file));
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function save(e) {
    e.preventDefault();
    setError(null);
    const payload = {
      ...form,
      expiry_date: form.expiry_date || null,
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (id) {
        await call('updateCard', id, payload);
        navigate(`/card/${id}`);
      } else {
        const created = await call('createCard', payload);
        navigate(`/card/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  const inputCls =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  const labelCls = 'mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300';

  return (
    <div className="mx-auto max-w-xl p-4 pb-16" data-testid="edit-screen">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => navigate(-1)} aria-label={t('back')} className="rounded-full p-2 text-xl">
          ←
        </button>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{id ? t('edit_card') : t('new_card')}</h1>
      </header>

      {scanning && <Scanner onResult={onScanResult} onClose={() => setScanning(false)} />}

      <form onSubmit={save} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScanning(true)}
            data-testid="open-scanner"
            className="flex-1 rounded-xl bg-sky-500 px-4 py-3 font-medium text-white"
          >
            📷 {t('scan')}
          </button>
          <button
            type="button"
            onClick={() => imageDecodeRef.current?.click()}
            data-testid="decode-image"
            className="flex-1 rounded-xl bg-slate-200 px-4 py-3 font-medium text-slate-800 dark:bg-slate-700 dark:text-white"
          >
            🖼️ {t('scan_from_image')}
          </button>
          <input
            ref={imageDecodeRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="decode-image-input"
            onChange={onPickDecodeImage}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="f-store">{t('store_name')} *</label>
          <input id="f-store" required value={form.store_name} onChange={(e) => set('store_name', e.target.value)} className={inputCls} data-testid="f-store" />
        </div>

        <div>
          <label className={labelCls} htmlFor="f-label">{t('label')}</label>
          <input id="f-label" value={form.label} onChange={(e) => set('label', e.target.value)} className={inputCls} data-testid="f-label" />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls} htmlFor="f-code">{t('code_value')} *</label>
            <input id="f-code" required value={form.code_value} onChange={(e) => set('code_value', e.target.value)} className={`${inputCls} font-mono`} data-testid="f-code" />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-format">{t('code_format')}</label>
            <select id="f-format" value={form.code_format} onChange={(e) => set('code_format', e.target.value)} className={inputCls} data-testid="f-format">
              {CODE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.code_value && (
          <div className="rounded-xl bg-white p-3 dark:bg-slate-100">
            <Barcode format={form.code_format} value={form.code_value} />
          </div>
        )}

        <div>
          <span className={labelCls}>{t('color')}</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                aria-label={`colour ${c}`}
                className={`h-9 w-9 rounded-full border-4 ${form.color === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="f-note">{t('note')}</label>
          <textarea id="f-note" value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} className={inputCls} data-testid="f-note" />
        </div>

        <div>
          <label className={labelCls} htmlFor="f-tags">{t('tags')}</label>
          <input id="f-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputCls} data-testid="f-tags" />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls} htmlFor="f-balance">{t('balance_value')}</label>
            <input id="f-balance" value={form.balance_value} onChange={(e) => set('balance_value', e.target.value)} className={inputCls} data-testid="f-balance" />
          </div>
          <div>
            <label className={labelCls} htmlFor="f-balance-kind">{t('balance_kind')}</label>
            <select id="f-balance-kind" value={form.balance_kind} onChange={(e) => set('balance_kind', e.target.value)} className={inputCls}>
              <option value="none">{t('balance_none')}</option>
              <option value="points">{t('balance_points')}</option>
              <option value="currency">{t('balance_currency')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="f-expiry">{t('expiry_date')}</label>
          <input id="f-expiry" type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className={inputCls} />
        </div>

        <label className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={Boolean(form.is_favorite)}
            onChange={(e) => set('is_favorite', e.target.checked ? 1 : 0)}
            data-testid="f-favorite"
          />
          ⭐ {t('favorite')}
        </label>

        <div className="grid grid-cols-2 gap-3">
          {['front_image', 'back_image'].map((side) => (
            <div key={side}>
              {form[side] ? (
                <div className="relative">
                  <img src={form[side]} alt="" className="w-full rounded-xl" />
                  <button
                    type="button"
                    onClick={() => set(side, null)}
                    className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white"
                  >
                    {t('remove_photo')}
                  </button>
                </div>
              ) : (
                <label className="flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-600">
                  {t(side === 'front_image' ? 'add_front_photo' : 'add_back_photo')}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(side, e)} />
                </label>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-100 p-3 text-sm text-rose-700" data-testid="edit-error">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="submit" className="flex-1 rounded-xl bg-sky-500 px-4 py-3 font-medium text-white" data-testid="save-card">
            {t('save')}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-slate-200 px-4 py-3 text-slate-800 dark:bg-slate-700 dark:text-white"
          >
            {t('cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
