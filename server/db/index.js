const initSqlJs = require("sql.js");

// In-memory SQLite via WebAssembly — ephemeral, resets on restart.
let db;

/**
 * Wraps a SQL string into a better-sqlite3-compatible interface
 * (.get / .all / .run) so the rest of the codebase stays unchanged.
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
      color      TEXT,
      is_admin   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL DEFAULT '',
      protected   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id    INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      content    TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'text',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed protected default rooms (cannot be deleted)
  db.run("INSERT OR IGNORE INTO rooms (name, description, protected) VALUES (?, ?, 1)",
    ["general", "Le salon principal"]);
  db.run("INSERT OR IGNORE INTO rooms (name, description, protected) VALUES (?, ?, 1)",
    ["random", "Tout et n'importe quoi"]);
  db.run("INSERT OR IGNORE INTO rooms (name, description, protected) VALUES (?, ?, 1)",
    ["images", "Partage de photos"]);
}

async function initAdmin() {
  const bcrypt = require("bcryptjs");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.warn("⚠️  ADMIN_PASSWORD non défini — compte admin '404' non créé.");
    return;
  }

  const existing = userQueries.findByUsername.get("404");
  if (existing) return; // already seeded

  const hash = await bcrypt.hash(adminPassword, 10);
  db.run("INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)", ["404", hash]);
  console.log("✅ Compte admin '404' créé.");
}

// ── Queries ────────────────────────────────────────────────────────────────

const userQueries = {
  create:          stmt("INSERT INTO users (username, password, avatar, color) VALUES (?, ?, ?, ?)"),
  findByUsername:  stmt("SELECT * FROM users WHERE username = ?"),
  findById:        stmt("SELECT id, username, avatar, color, is_admin, created_at FROM users WHERE id = ?"),
};

const roomQueries = {
  all:        stmt("SELECT * FROM rooms ORDER BY id ASC"),
  findByName: stmt("SELECT * FROM rooms WHERE name = ?"),
  create:     stmt("INSERT INTO rooms (name, description) VALUES (?, ?)"),
  delete:     stmt("DELETE FROM rooms WHERE name = ? AND protected = 0"),
};

const messageQueries = {
  insert: stmt("INSERT INTO messages (room_id, user_id, content, type) VALUES (?, ?, ?, ?)"),
  lastN:  stmt(`
    SELECT m.id, m.content, m.type, m.created_at,
           u.id AS user_id, u.username, u.avatar, u.color, u.is_admin
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `),
  deleteByRoom: stmt("DELETE FROM messages WHERE room_id = ?"),
};

module.exports = { initDb, initAdmin, userQueries, roomQueries, messageQueries };
