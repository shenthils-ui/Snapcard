// Snapcard shared store: ALL business logic as plain functions over a db handle.
// The handle must provide the better-sqlite3 surface used here:
//   prepare(sql).get/all/run(...positionalParams), exec(sql), transaction(fn)
// The server passes a real better-sqlite3 Database; the standalone build passes
// the sql.js shim from shared/sqljs-shim.js. There is exactly ONE implementation
// of every query in the app, and it lives in this file.

import { SCHEMA_VERSION, MIGRATIONS, CODE_FORMATS, BALANCE_KINDS } from './schema.js';

const now = () => new Date().toISOString();
const uuid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

// ---------------------------------------------------------------------------
// meta

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(db, key, value) {
  if (value === null || value === undefined) {
    db.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
  } else {
    db.prepare(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }
  return true;
}

export function getAllMeta(db) {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM app_meta').all()) out[row.key] = row.value;
  return out;
}

// ---------------------------------------------------------------------------
// migrations / boot

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)');
  let version = Number(getMeta(db, 'schema_version') || 0);
  for (const m of MIGRATIONS) {
    if (m.to > version) {
      db.transaction(() => {
        db.exec(m.sql);
        setMeta(db, 'schema_version', String(m.to));
      })();
      version = m.to;
    }
  }
  if (!getMeta(db, 'device_id')) setMeta(db, 'device_id', uuid());
  return version;
}

// ---------------------------------------------------------------------------
// cards

const CARD_COLUMNS = [
  'store_name',
  'label',
  'code_value',
  'code_format',
  'note',
  'color',
  'front_image',
  'back_image',
  'balance_value',
  'balance_kind',
  'expiry_date',
  'is_favorite',
];

function normalizeCardInput(input) {
  const card = {};
  for (const col of CARD_COLUMNS) if (col in input) card[col] = input[col];
  if (!card.store_name || !String(card.store_name).trim()) throw new Error('store_name is required');
  if (!card.code_value || !String(card.code_value).trim()) throw new Error('code_value is required');
  if (!CODE_FORMATS.includes(card.code_format)) throw new Error(`invalid code_format: ${card.code_format}`);
  if (card.balance_kind != null && !BALANCE_KINDS.includes(card.balance_kind))
    throw new Error(`invalid balance_kind: ${card.balance_kind}`);
  card.is_favorite = card.is_favorite ? 1 : 0;
  return card;
}

function attachTags(db, cards) {
  if (!cards.length) return cards;
  const rows = db
    .prepare(
      `SELECT ct.card_id, t.id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name`
    )
    .all();
  const byCard = new Map();
  for (const r of rows) {
    if (!byCard.has(r.card_id)) byCard.set(r.card_id, []);
    byCard.get(r.card_id).push({ id: r.id, name: r.name });
  }
  for (const c of cards) c.tags = byCard.get(c.id) || [];
  return cards;
}

// Every sort keeps favourites pinned on top; the grid renders them as their own row.
const SORTS = {
  recent: 'c.is_favorite DESC, COALESCE(c.last_used_at, c.updated_at) DESC',
  name: "c.is_favorite DESC, (CASE WHEN c.label != '' THEN c.label ELSE c.store_name END) COLLATE NOCASE ASC",
  store: 'c.is_favorite DESC, c.store_name COLLATE NOCASE ASC',
};

export function listCards(db, opts = {}) {
  const { query = '', sort = 'recent' } = opts;
  const order = SORTS[sort] || SORTS.recent;
  let cards;
  if (query.trim()) {
    const q = `%${query.trim().toLowerCase()}%`;
    cards = db
      .prepare(
        `SELECT DISTINCT c.* FROM cards c
         LEFT JOIN card_tags ct ON ct.card_id = c.id
         LEFT JOIN tags t ON t.id = ct.tag_id
         WHERE lower(c.store_name) LIKE ? OR lower(c.label) LIKE ? OR lower(c.note) LIKE ? OR lower(t.name) LIKE ?
         ORDER BY ${order}`
      )
      .all(q, q, q, q);
  } else {
    cards = db.prepare(`SELECT c.* FROM cards c ORDER BY ${order}`).all();
  }
  return attachTags(db, cards);
}

export function getCard(db, id) {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!card) return null;
  attachTags(db, [card]);
  return card;
}

export function createCard(db, input) {
  const card = normalizeCardInput(input);
  const id = uuid();
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO cards (id, store_name, label, code_value, code_format, note, color,
        front_image, back_image, balance_value, balance_kind, expiry_date, is_favorite,
        last_used_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      card.store_name,
      card.label ?? '',
      card.code_value,
      card.code_format,
      card.note ?? '',
      card.color ?? '#0ea5e9',
      card.front_image ?? null,
      card.back_image ?? null,
      card.balance_value ?? '',
      card.balance_kind ?? 'none',
      card.expiry_date ?? null,
      card.is_favorite,
      ts,
      ts,
      ts
    );
    if (input.tags) setCardTagsInner(db, id, input.tags);
  })();
  return getCard(db, id);
}

export function updateCard(db, id, input) {
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
  if (!existing) throw new Error('card not found');
  const card = normalizeCardInput({ ...existing, ...input });
  db.transaction(() => {
    db.prepare(
      `UPDATE cards SET store_name=?, label=?, code_value=?, code_format=?, note=?, color=?,
        front_image=?, back_image=?, balance_value=?, balance_kind=?, expiry_date=?, is_favorite=?, updated_at=?
       WHERE id=?`
    ).run(
      card.store_name,
      card.label ?? '',
      card.code_value,
      card.code_format,
      card.note ?? '',
      card.color ?? '#0ea5e9',
      card.front_image ?? null,
      card.back_image ?? null,
      card.balance_value ?? '',
      card.balance_kind ?? 'none',
      card.expiry_date ?? null,
      card.is_favorite,
      now(),
      id
    );
    if (input.tags) setCardTagsInner(db, id, input.tags);
  })();
  return getCard(db, id);
}

export function deleteCard(db, id) {
  db.transaction(() => {
    db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(id);
    db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    pruneTags(db);
  })();
  return true;
}

export function touchCard(db, id) {
  db.prepare('UPDATE cards SET last_used_at = ? WHERE id = ?').run(now(), id);
  return true;
}

export function setFavorite(db, id, fav) {
  db.prepare('UPDATE cards SET is_favorite = ?, updated_at = ? WHERE id = ?').run(fav ? 1 : 0, now(), id);
  return true;
}

// ---------------------------------------------------------------------------
// tags

export function listTags(db) {
  return db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all();
}

function pruneTags(db) {
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM card_tags)').run();
}

function setCardTagsInner(db, cardId, names) {
  db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);
  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    let tag = db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
    if (!tag) {
      tag = { id: uuid(), name };
      db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(tag.id, tag.name);
    }
    db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)').run(cardId, tag.id);
  }
  pruneTags(db);
}

export function setCardTags(db, cardId, names) {
  db.transaction(() => setCardTagsInner(db, cardId, names))();
  return getCard(db, cardId);
}

// ---------------------------------------------------------------------------
// backup: export / import (identical JSON on both builds)

export const BACKUP_FORMAT = 'snapcard-backup';
export const BACKUP_VERSION = 1;

export function exportData(db) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: now(),
    device_id: getMeta(db, 'device_id'),
    updated_at: latestUpdatedAt(db),
    cards: db.prepare('SELECT * FROM cards ORDER BY created_at').all(),
    tags: db.prepare('SELECT * FROM tags ORDER BY name').all(),
    card_tags: db.prepare('SELECT * FROM card_tags').all(),
    meta: {
      theme: getMeta(db, 'theme'),
      language: getMeta(db, 'language'),
    },
  };
}

export function latestUpdatedAt(db) {
  const row = db.prepare('SELECT MAX(updated_at) AS m FROM cards').get();
  return (row && row.m) || null;
}

// Replace-all import inside a transaction. Never touches device_id or the PIN.
export function importData(db, data) {
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('not a Snapcard backup file');
  if (Number(data.version) > BACKUP_VERSION) throw new Error(`backup version ${data.version} is newer than this app`);
  db.transaction(() => {
    db.prepare('DELETE FROM card_tags').run();
    db.prepare('DELETE FROM tags').run();
    db.prepare('DELETE FROM cards').run();
    for (const c of data.cards || []) {
      db.prepare(
        `INSERT INTO cards (id, store_name, label, code_value, code_format, note, color,
          front_image, back_image, balance_value, balance_kind, expiry_date, is_favorite,
          last_used_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        c.id || uuid(),
        c.store_name,
        c.label ?? '',
        c.code_value,
        c.code_format,
        c.note ?? '',
        c.color ?? '#0ea5e9',
        c.front_image ?? null,
        c.back_image ?? null,
        c.balance_value ?? '',
        c.balance_kind ?? 'none',
        c.expiry_date ?? null,
        c.is_favorite ? 1 : 0,
        c.last_used_at ?? null,
        c.created_at || now(),
        c.updated_at || now()
      );
    }
    for (const t of data.tags || []) {
      db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').run(t.id || uuid(), t.name);
    }
    for (const ct of data.card_tags || []) {
      db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)').run(ct.card_id, ct.tag_id);
    }
    if (data.meta) {
      if (data.meta.theme) setMeta(db, 'theme', data.meta.theme);
      if (data.meta.language) setMeta(db, 'language', data.meta.language);
    }
  })();
  return { imported: (data.cards || []).length };
}

// ---------------------------------------------------------------------------
// seed data (placeholder values only)

export function seedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  if (count > 0) return false;
  createCard(db, {
    store_name: 'Sample Supermarket',
    label: 'Bonus card',
    code_value: '5901234123457',
    code_format: 'EAN_13',
    note: 'Sample card — edit or delete me.',
    color: '#16a34a',
    tags: ['groceries'],
  });
  createCard(db, {
    store_name: 'Sample Library',
    label: '',
    code_value: 'LIB-12345',
    code_format: 'CODE_39',
    note: 'Sample card — edit or delete me.',
    color: '#7c3aed',
    tags: ['books'],
  });
  createCard(db, {
    store_name: 'Sample Coffee Shop',
    label: 'Loyalty QR',
    code_value: 'SNAPCARD-SAMPLE-COFFEE-0001',
    code_format: 'QR_CODE',
    note: 'Sample card — edit or delete me.',
    color: '#d97706',
    is_favorite: 1,
    tags: ['coffee'],
  });
  return true;
}

// ---------------------------------------------------------------------------
// RPC surface: every method callable from the frontend, on both builds.

export const rpcMethods = {
  migrate,
  seedIfEmpty,
  listCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  touchCard,
  setFavorite,
  listTags,
  setCardTags,
  getMeta,
  setMeta,
  getAllMeta,
  exportData,
  importData,
  latestUpdatedAt,
};
