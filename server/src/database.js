const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'db');
const dbPath = path.join(dbDir, 'spendventures.db');

fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_name TEXT NOT NULL UNIQUE,
      field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'debt')),
      category_id INTEGER NOT NULL,
      payee TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      item_type TEXT NOT NULL DEFAULT 'Other',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS transaction_custom_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      custom_field_id INTEGER NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      UNIQUE (transaction_id, custom_field_id),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creditor TEXT NOT NULL,
      total_amount REAL NOT NULL,
      remaining_balance REAL NOT NULL,
      due_date TEXT,
      interest_rate REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      amount_paid REAL NOT NULL,
      paid_on TEXT NOT NULL,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_custom INTEGER NOT NULL DEFAULT 0,
      category_id INTEGER
    );
  `);

  try {
    db.exec('DROP TABLE IF EXISTS transaction_items');
  } catch (e) {
    console.warn('drop transaction_items:', e.message);
  }

  try {
    db.exec(`ALTER TABLE transactions ADD COLUMN item_type TEXT NOT NULL DEFAULT 'Other';`);
  } catch {
    // column exists
  }

  try {
    db.exec(`ALTER TABLE item_types ADD COLUMN category_id INTEGER;`);
  } catch {
    // column exists or table doesn't exist yet
  }

  seedDefaults();
}

const DEFAULT_CATEGORIES = [
  'Restaurants',
  'Rent',
  'Utilities',
  'Transport',
  'Entertainment',
  'Selfcare',
  'Groceries',
  'Power',
  'Wi-Fi',
  'Other',
];

const DEFAULT_ITEM_TYPES = ['Walmart', 'Apna Bazar', 'Costco', 'Other'];

function seedDefaults() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO categories (name, is_custom) VALUES (?, 0)',
  );
  for (const name of DEFAULT_CATEGORIES) {
    insert.run(name);
  }

  const insertType = db.prepare(
    'INSERT OR IGNORE INTO item_types (name, is_custom) VALUES (?, 0)',
  );
  for (const name of DEFAULT_ITEM_TYPES) {
    insertType.run(name);
  }
}

module.exports = { db, init };
