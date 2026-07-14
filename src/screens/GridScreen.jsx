import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { call, onDataChanged } from '../data/client.js';
import { useI18n } from '../i18n/index.jsx';

// Valid sort keys, mirrored in shared/store.js. Used to validate the persisted
// preference before applying it.
const SORT_OPTIONS = { recent: 1, name: 1, store: 1 };

function CardTile({ card, onOpen }) {
  const title = card.label || card.store_name;
  return (
    <button
      onClick={onOpen}
      data-testid="card-tile"
      className="flex h-28 flex-col justify-between rounded-2xl p-3 text-left text-white shadow transition-transform active:scale-95"
      style={{ backgroundColor: card.color || '#0ea5e9' }}
    >
      <div className="flex items-start justify-between">
        <span className="line-clamp-2 font-semibold drop-shadow-sm">{title}</span>
        {Boolean(card.is_favorite) && <span aria-hidden>⭐</span>}
      </div>
      <span className="truncate text-xs text-white/80">{card.label ? card.store_name : card.code_value}</span>
    </button>
  );
}

export default function GridScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [cards, setCards] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');

  // Restore the last-used sort so the grid opens the way the user left it.
  useEffect(() => {
    let alive = true;
    call('getMeta', 'grid_sort').then((saved) => {
      if (alive && saved && saved in SORT_OPTIONS) setSort(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const changeSort = (value) => {
    setSort(value);
    call('setMeta', 'grid_sort', value).catch(() => {});
  };

  useEffect(() => {
    let alive = true;
    const load = () => call('listCards', { query, sort }).then((c) => alive && setCards(c));
    load();
    const off = onDataChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, [query, sort]);

  const open = (card) => {
    call('touchCard', card.id);
    navigate(`/card/${card.id}`);
  };

  const favorites = (cards || []).filter((c) => c.is_favorite);
  const rest = (cards || []).filter((c) => !c.is_favorite);

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('app_name')}</h1>
        <Link to="/settings" aria-label={t('settings')} data-testid="nav-settings" className="rounded-full p-2 text-2xl">
          ⚙️
        </Link>
      </header>

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_placeholder')}
          data-testid="grid-search"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <select
          value={sort}
          onChange={(e) => changeSort(e.target.value)}
          data-testid="grid-sort"
          aria-label="sort"
          className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="recent">{t('sort_recent')}</option>
          <option value="name">{t('sort_name')}</option>
          <option value="store">{t('sort_store')}</option>
        </select>
      </div>

      {cards === null ? (
        <p className="text-slate-500">{t('loading')}</p>
      ) : cards.length === 0 ? (
        <p className="mt-12 text-center text-slate-500" data-testid="grid-empty">
          {query ? t('no_results') : t('no_cards')}
        </p>
      ) : (
        <>
          {favorites.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">{t('favorites')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="favorites-row">
                {favorites.map((c) => (
                  <CardTile key={c.id} card={c} onOpen={() => open(c)} />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {favorites.length > 0 && (
                <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">{t('all_cards')}</h2>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rest.map((c) => (
                  <CardTile key={c.id} card={c} onOpen={() => open(c)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Link
        to="/add"
        data-testid="add-card"
        aria-label={t('add_card')}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-3xl text-white shadow-lg"
      >
        +
      </Link>
    </div>
  );
}
