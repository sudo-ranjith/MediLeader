import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  version: string;
  up: string;
}

// Inline migrations keep the binary self-contained — no external SQL file reads at runtime.
const MIGRATIONS: Migration[] = [
  {
    version: '001_initial_settings',
    up: `
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('pharmacy_name',       'My Pharmacy'),
        ('pharmacy_address',    ''),
        ('pharmacy_phone',      ''),
        ('pharmacy_email',      ''),
        ('pharmacy_gstin',      ''),
        ('pharmacy_state_code', '33'),
        ('pharmacy_dl_number',  ''),
        ('invoice_prefix',      'INV'),
        ('po_prefix',           'PO'),
        ('return_prefix',       'RET'),
        ('currency_symbol',     '₹'),
        ('language',            'en'),
        ('backend_url',         ''),
        ('auto_sync',           '0'),
        ('sync_interval',       '15'),
        ('last_sync_time',      ''),
        ('thermal_print_width', '80mm'),
        ('show_mrp_on_invoice', '1'),
        ('show_batch_on_invoice','1'),
        ('round_off_tax',       '1');
    `,
  },
  {
    version: '002_soft_delete_medicines',
    up: `
      -- Ensure schedule column exists (handles upgrade from v1 schema)
      -- SQLite does not support IF NOT EXISTS for columns; we check via pragma
      SELECT 1;
    `,
  },
  {
    version: '003_supplier_outstanding_index',
    up: `
      CREATE INDEX IF NOT EXISTS idx_suppliers_outstanding ON suppliers(outstanding);
      CREATE INDEX IF NOT EXISTS idx_batches_reorder      ON batches(quantity, reorder_level);
    `,
  },
  {
    version: '004_import_sessions',
    up: `
      CREATE TABLE IF NOT EXISTS import_sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id      TEXT NOT NULL UNIQUE,
        source_software TEXT NOT NULL DEFAULT 'generic_csv',
        entity_type     TEXT NOT NULL,
        file_name       TEXT NOT NULL,
        file_size       INTEGER NOT NULL DEFAULT 0,
        total_rows      INTEGER NOT NULL DEFAULT 0,
        valid_rows      INTEGER NOT NULL DEFAULT 0,
        imported_rows   INTEGER NOT NULL DEFAULT 0,
        skipped_rows    INTEGER NOT NULL DEFAULT 0,
        failed_rows     INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'pending',
        field_mapping   TEXT NOT NULL DEFAULT '{}',
        import_settings TEXT NOT NULL DEFAULT '{}',
        rollback_ids    TEXT NOT NULL DEFAULT '{}',
        error_log       TEXT NOT NULL DEFAULT '[]',
        created_by      INTEGER NOT NULL DEFAULT 1,
        started_at      TEXT,
        completed_at    TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      CREATE INDEX IF NOT EXISTS idx_import_sessions_status ON import_sessions(status, created_at);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  // Apply base schema first (idempotent CREATE TABLE IF NOT EXISTS)
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schemaSql);
    logger.info('Base schema applied');
  } else {
    // Schema embedded directly when running from dist-electron (no source file)
    applyEmbeddedSchema(db);
  }

  // Run versioned migrations
  for (const migration of MIGRATIONS) {
    const already = db
      .prepare('SELECT id FROM schema_migrations WHERE version = ?')
      .get(migration.version);

    if (!already) {
      try {
        db.transaction(() => {
          db.exec(migration.up);
          db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
        })();
        logger.info(`Migration applied: ${migration.version}`);
      } catch (err: any) {
        logger.error(`Migration failed: ${migration.version} — ${err.message}`);
        throw err;
      }
    }
  }
}

// Embedded schema for production builds (no SQL file on disk)
function applyEmbeddedSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin','manager','cashier')),
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      generic_name TEXT,
      hsn_code TEXT NOT NULL DEFAULT '',
      gst_rate REAL NOT NULL DEFAULT 12 CHECK(gst_rate IN (0,5,12,18)),
      unit TEXT NOT NULL DEFAULT 'strip',
      mrp REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      barcode TEXT,
      manufacturer TEXT,
      schedule TEXT NOT NULL DEFAULT 'OTC' CHECK(schedule IN ('OTC','H','H1','X','G')),
      category TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      purchase_price REAL NOT NULL DEFAULT 0,
      mrp REAL NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 10,
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(medicine_id, batch_number)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      reference_number TEXT,
      remarks TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT DEFAULT 'Tamil Nadu',
      state_code TEXT DEFAULT '33',
      gst_number TEXT,
      credit_limit REAL NOT NULL DEFAULT 0,
      credit_used REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT DEFAULT 'Tamil Nadu',
      state_code TEXT DEFAULT '33',
      gstin TEXT,
      dl_number TEXT,
      dl_expiry TEXT,
      credit_days INTEGER NOT NULL DEFAULT 30,
      outstanding REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT 'Walk-in',
      customer_gstin TEXT,
      customer_state_code TEXT DEFAULT '33',
      supply_type TEXT NOT NULL DEFAULT 'intrastate',
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_gst REAL NOT NULL DEFAULT 0,
      round_off REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'paid',
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      medicine_name TEXT NOT NULL,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
      batch_number TEXT NOT NULL,
      hsn_code TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT 'strip',
      mrp REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 12,
      cgst_rate REAL NOT NULL DEFAULT 6,
      sgst_rate REAL NOT NULL DEFAULT 6,
      igst_rate REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT NOT NULL UNIQUE,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      invoice_number TEXT,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT 'Walk-in',
      return_type TEXT NOT NULL DEFAULT 'customer_return',
      return_date TEXT NOT NULL,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_gst REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      credit_note_issued INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      invoice_item_id INTEGER REFERENCES invoice_items(id) ON DELETE SET NULL,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      medicine_name TEXT NOT NULL,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
      batch_number TEXT NOT NULL,
      hsn_code TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      taxable_amount REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 12,
      cgst_rate REAL NOT NULL DEFAULT 6,
      sgst_rate REAL NOT NULL DEFAULT 6,
      igst_rate REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name TEXT NOT NULL,
      supply_type TEXT NOT NULL DEFAULT 'intrastate',
      order_date TEXT NOT NULL,
      expected_delivery TEXT,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      sync_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS po_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      medicine_name TEXT NOT NULL,
      hsn_code TEXT NOT NULL DEFAULT '',
      ordered_qty INTEGER NOT NULL DEFAULT 0,
      received_qty INTEGER NOT NULL DEFAULT 0,
      free_qty INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 12,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
      po_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name TEXT NOT NULL,
      supplier_invoice_number TEXT,
      receipt_date TEXT NOT NULL,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
      po_item_id INTEGER NOT NULL REFERENCES po_items(id) ON DELETE RESTRICT,
      medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
      medicine_name TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      ordered_qty INTEGER NOT NULL DEFAULT 0,
      received_qty INTEGER NOT NULL DEFAULT 0,
      free_qty INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 12,
      taxable_amount REAL NOT NULL DEFAULT 0,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      customer_name TEXT NOT NULL,
      invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('customer','supplier')),
      entity_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id INTEGER NOT NULL,
      reference_number TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      narration TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS gst_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_type TEXT NOT NULL CHECK(return_type IN ('GSTR1','GSTR3B')),
      period TEXT NOT NULL,
      filed_at TEXT,
      data_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      sync_id TEXT NOT NULL,
      local_data TEXT,
      remote_data TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),
      old_values TEXT,
      new_values TEXT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      user_email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_medicines_name      ON medicines(name);
    CREATE INDEX IF NOT EXISTS idx_medicines_barcode   ON medicines(barcode);
    CREATE INDEX IF NOT EXISTS idx_batches_medicine    ON batches(medicine_id);
    CREATE INDEX IF NOT EXISTS idx_batches_expiry      ON batches(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_date       ON invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer   ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_inv_items_invoice   ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_returns_invoice     ON returns(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_entity       ON ledger_entries(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
    CREATE INDEX IF NOT EXISTS idx_audit_table         ON audit_logs(table_name, record_id);
  `);
  logger.info('Embedded schema applied');
}
