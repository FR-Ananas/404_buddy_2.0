const Database = require("better-sqlite3");
const path = require("path");

// DATA_DIR allows pointing to a persistent volume on platforms like Render.
// Falls back to the project root for local development.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "../..");
const DB_PATH = path.join(DATA_DIR, "data.db");

const db = new Database(DB_PATH);

// Enable WAL for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password  TEXT    NOT NULL,
    avatar    TEXT,
    created_at TEXT   NOT NULL DEFAULT (datetime('now'))
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
const seedRooms = db.prepare(
  "INSERT OR IGNORE INTO rooms (name, description) VALUES (?, ?)"
);
seedRooms.run("general", "Le salon principal");
seedRooms.run("random", "Tout et n'importe quoi");
seedRooms.run("images", "Partage de photos");

// --- User queries ---
const userQueries = {
  create: db.prepare(
    "INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)"
  ),
  findByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  findById: db.prepare("SELECT id, username, avatar, created_at FROM users WHERE id = ?"),
};

// --- Room queries ---
const roomQueries = {
  all: db.prepare("SELECT * FROM rooms ORDER BY id ASC"),
  findByName: db.prepare("SELECT * FROM rooms WHERE name = ?"),
};

// --- Message queries ---
const messageQueries = {
  insert: db.prepare(
    "INSERT INTO messages (room_id, user_id, content, type) VALUES (?, ?, ?, ?)"
  ),
  lastN: db.prepare(`
    SELECT m.id, m.content, m.type, m.created_at,
           u.id AS user_id, u.username, u.avatar
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.room_id = ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `),
};

module.exports = { db, userQueries, roomQueries, messageQueries };
