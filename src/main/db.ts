import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

const schema = `
CREATE TABLE IF NOT EXISTS _schema_version (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'cashier', 'manager')) DEFAULT 'cashier',
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  hsn_code TEXT UNIQUE,
  gst_rate REAL CHECK(gst_rate IN (0, 5, 12, 18)),
  unit TEXT CHECK(unit IN ('strip', 'bottle', 'box', 'tablet', 'ml', 'injection', 'sachet')),
  price REAL NOT NULL,
  cost REAL NOT NULL,
  barcode TEXT,
  manufacturer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_hsn ON medicines(hsn_code);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE,
  UNIQUE(medicine_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_expiry ON stock(expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_medicine ON stock(medicine_id);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  gst_number TEXT,
  credit_limit REAL DEFAULT 0,
  credit_used REAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  date DATE DEFAULT CURRENT_DATE,
  subtotal REAL NOT NULL DEFAULT 0,
  gst_amount REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'upi', 'credit')) DEFAULT 'cash',
  status TEXT CHECK(status IN ('draft', 'paid')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  stock_id INTEGER REFERENCES stock(id),
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_rate REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  item_total REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL,
  method TEXT CHECK(method IN ('cash', 'card', 'upi', 'credit')) DEFAULT 'cash',
  date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  gst_number TEXT,
  dl_number TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  supplier_name TEXT,
  date DATE DEFAULT CURRENT_DATE,
  expected_delivery DATE,
  total_amount REAL DEFAULT 0,
  status TEXT CHECK(status IN ('draft', 'sent', 'received')) DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS po_items (
  id INTEGER PRIMARY KEY,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id),
  medicine_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  batch_number TEXT,
  expiry_date DATE,
  amount REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const defaultSettings = [
  ['pharmacy_name', 'Pharma Vault'],
  ['pharmacy_address', ''],
  ['pharmacy_phone', ''],
  ['pharmacy_email', ''],
  ['pharmacy_gstin', ''],
  ['backend_url', ''],
  ['auto_sync', 'false'],
  ['sync_interval', '15'],
  ['last_sync_time', ''],
  ['currency_symbol', '₹'],
  ['invoice_prefix', 'INV'],
  ['po_prefix', 'PO'],
];

export function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'pharma-vault.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(schema);

  // Insert default settings
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Track schema version
  const versionRow = db.prepare('SELECT MAX(version) as v FROM _schema_version').get() as any;
  if (!versionRow?.v) {
    db.prepare('INSERT INTO _schema_version (version) VALUES (1)').run();
  }

  return db;
}

export function getDb() {
  return db;
}

export { db };
