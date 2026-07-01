const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'platform.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  const schema = require('fs').readFileSync(
    path.join(__dirname, '..', 'database', 'schema.sql'),
    'utf8'
  );
  db.exec(schema);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE menu_items ADD COLUMN image_url TEXT DEFAULT \'\''); } catch (e) {}
  try { db.exec('ALTER TABLE orders ADD COLUMN table_number INTEGER DEFAULT NULL'); } catch (e) {}
  try { db.exec('ALTER TABLE owners ADD COLUMN role TEXT NOT NULL DEFAULT \'owner\''); } catch (e) {}
  try { db.exec('ALTER TABLE owners ADD COLUMN email TEXT DEFAULT \'\''); } catch (e) {}
  try { db.exec('ALTER TABLE owners ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE menu_items ADD COLUMN is_veg INTEGER DEFAULT 1'); } catch (e) {}
  try { db.exec("ALTER TABLE owners ADD COLUMN email_hash TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE restaurants ADD COLUMN name_image_url TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE owners ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"); } catch (e) {}

  // Seed default settings
  try {
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_code', ?)").run(process.env.ADMIN_CODE || '13082008');
  } catch (e) {}

  // Migrate old category names to new ones from Bash India
  db.exec("UPDATE menu_items SET category = 'Appetizers' WHERE category = 'Starters'");
  db.exec("UPDATE menu_items SET category = 'Indian Cuisine' WHERE category IN ('Main Course', 'Rice', 'Bread')");
  db.exec("UPDATE menu_items SET category = 'Non-Alcoholic Drinks' WHERE category IN ('Beverages', 'Desert Drinks')");
  db.exec("UPDATE menu_items SET category = 'Pizzas and Pastas' WHERE category = 'Pizza'");
  db.exec("UPDATE menu_items SET category = 'Soups and Salads' WHERE category = 'Salads'");
  db.exec("UPDATE menu_items SET category = 'Appetizers' WHERE category IN ('Burgers', 'General')");

  // Backfill email_hash for existing owners
  const crypto = require('crypto');
  const existing = db.prepare("SELECT id, email FROM owners WHERE email != '' AND email_hash = ''").all();
  for (const row of existing) {
    const hash = crypto.createHash('sha256').update((row.email || '').toLowerCase().trim()).digest('hex');
    db.prepare('UPDATE owners SET email_hash = ? WHERE id = ?').run(hash, row.id);
  }
}

module.exports = { db, init };
