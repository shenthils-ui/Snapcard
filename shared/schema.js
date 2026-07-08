// Snapcard shared SQL schema + migration path.
// Used verbatim by BOTH engines (better-sqlite3 on the server, sql.js in the browser).

export const SCHEMA_VERSION = 1;

// Each migration upgrades the database to `to`. New migrations are appended,
// never edited, so any older database can walk forward to the current version.
export const MIGRATIONS = [
  {
    to: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS cards (
        id            TEXT PRIMARY KEY,
        store_name    TEXT NOT NULL,
        label         TEXT DEFAULT '',
        code_value    TEXT NOT NULL,
        code_format   TEXT NOT NULL,
        note          TEXT DEFAULT '',
        color         TEXT DEFAULT '#0ea5e9',
        front_image   TEXT,
        back_image    TEXT,
        balance_value TEXT DEFAULT '',
        balance_kind  TEXT DEFAULT 'none',
        expiry_date   TEXT,
        is_favorite   INTEGER NOT NULL DEFAULT 0,
        last_used_at  TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tags (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS card_tags (
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (card_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cards_store ON cards(store_name);
      CREATE INDEX IF NOT EXISTS idx_card_tags_card ON card_tags(card_id);
      CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag_id);
    `,
  },
];

export const CODE_FORMATS = [
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
  'CODE_128',
  'CODE_39',
  'ITF',
  'CODABAR',
  'QR_CODE',
  'DATA_MATRIX',
  'PDF_417',
  'AZTEC',
];

export const BALANCE_KINDS = ['none', 'points', 'currency'];
