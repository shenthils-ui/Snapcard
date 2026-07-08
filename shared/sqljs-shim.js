// A thin better-sqlite3-compatible shim around a sql.js Database, so the
// standalone (in-browser) build runs the EXACT same shared/store.js code as
// the server build. Only the surface used by shared/store.js is implemented:
//   prepare(sql) -> { get, all, run }   (positional ? parameters)
//   exec(sql), transaction(fn), pragma(str), close()
// plus onWrite: a hook the persistence layer uses to schedule IndexedDB saves.

export function wrapSqlJsDb(sqlJsDb) {
  let inTransaction = false;

  const shim = {
    raw: sqlJsDb,
    onWrite: null,

    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqlJsDb.prepare(sql);
          try {
            stmt.bind(params.length ? params : undefined);
            if (!stmt.step()) return undefined;
            return stmt.getAsObject();
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = sqlJsDb.prepare(sql);
          const rows = [];
          try {
            stmt.bind(params.length ? params : undefined);
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params) {
          const stmt = sqlJsDb.prepare(sql);
          try {
            stmt.bind(params.length ? params : undefined);
            stmt.step();
          } finally {
            stmt.free();
          }
          const changes = sqlJsDb.getRowsModified();
          notifyWrite(sql);
          return { changes };
        },
      };
    },

    exec(sql) {
      sqlJsDb.exec(sql);
      notifyWrite(sql);
      return shim;
    },

    transaction(fn) {
      return (...args) => {
        // better-sqlite3 style: calling the returned function runs fn atomically.
        if (inTransaction) return fn(...args); // nested: join the outer transaction
        sqlJsDb.exec('BEGIN');
        inTransaction = true;
        try {
          const result = fn(...args);
          sqlJsDb.exec('COMMIT');
          inTransaction = false;
          notifyWrite('COMMIT');
          return result;
        } catch (err) {
          inTransaction = false;
          try {
            sqlJsDb.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw err;
        }
      };
    },

    pragma(str) {
      const res = sqlJsDb.exec(`PRAGMA ${str}`);
      if (!res.length) return [];
      const { columns, values } = res[0];
      return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
    },

    export() {
      return sqlJsDb.export();
    },

    close() {
      sqlJsDb.close();
    },
  };

  const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|COMMIT)/i;
  function notifyWrite(sql) {
    if (inTransaction) return; // persist once, on commit
    if (shim.onWrite && WRITE_RE.test(sql)) shim.onWrite();
  }

  return shim;
}
