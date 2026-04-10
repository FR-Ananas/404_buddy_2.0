const initSqlJs = require("sql.js");

// In-memory SQLite via WebAssembly (no native compilation needed).
// Data is ephemeral — resets on each restart. Fine for free-tier hosting.

let db;

/**
 * Wrap a SQL string into an object with the same .get() / .all() / .run()
 * interface as better-sqlite3, so the rest of the codebase doesn't change.
 */
function stmt(sql) {
  return {
    get(...args) {
      const s = db.prepare(sql);
      if (args.length) s.bind(args);
      const row = s.step() ? s.getAsObject() : null;
      s.free();
      return row;
    },
    all(...args) {
      const s = db.prepare(sql);
      if (args.length) s.bind(args);
      const rows = [];
      while (s.step()) rows.push(s.getAsObject());
      s.free();
      return rows;
    },
    run(...args) {
      db.run(sql, args.length ? args : undefined);
      const res = db.exec("SELECT last_insert_rowid()");
      return { lastInsertRowid: res[0]?.values[0][0] ?? null };
    },
  };
}

async function initDb() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password   TEXT    NOT NULL,
      avatar     TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id    INTEGER NOT NULL REFERENCES rooms(id),
      user_id    INTEGER NOT NULL REFERENCES users(id),
      content    TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'text',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default rooms
  db.run("INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)", ["general", "Le salon principal"]);
  db.run("INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)", ["random", "Tout et n'importe quoi"]);
  db.run("INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)", ["images", "Partage de photos"]);
}

// --- Prepared statement objects (same API as before) ---
const userQueries = {
  create: stmt("INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)"),
  findByUsername: stmt("SELECT * FROM users WHERE username = ?"),
  findById: stmt("SELECT id, username, avatar, created_at FROM users WHERE id = ?"),
};

const roomQueries = {
  all: stmt("SELECT * FROM rooms ORDER BY id ASC"),
  findByName: stmt("SELECT * FROM rooms WHERE name = ?"),
};

const messageQueries = {
  insert: stmt("INSERT INTO messages (room_id, user_id, content, type) VALUES (?, ?, ?, ?)"),
  lastN: stmt(`
    SELECT m.id, m.content, m.type, m.created_at,
           u.id AS user_id, u.username, u.avatar
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `),
};

module.exports = { initDb, userQueries, roomQueries, messageQueries };
