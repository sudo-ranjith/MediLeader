-- ═══════════════════════════════════════════════════════════════════════════
-- MediLeader — Production Schema v2
-- Tamil Nadu Pharmacy ERP
-- ═══════════════════════════════════════════════════════════════════════════

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;

-- ─── Migration tracker ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     TEXT    NOT NULL UNIQUE,
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─── Users & permissions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL DEFAULT '',
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin','manager','cashier')),
  phone         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─── Medicines master ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  generic_name  TEXT,
  hsn_code      TEXT    NOT NULL DEFAULT '',
  gst_rate      REAL    NOT NULL DEFAULT 12 CHECK(gst_rate IN (0,5,12,18)),
  unit          TEXT    NOT NULL DEFAULT 'strip',
  mrp           REAL    NOT NULL DEFAULT 0,
  cost          REAL    NOT NULL DEFAULT 0,
  barcode       TEXT,
  manufacturer  TEXT,
  schedule      TEXT    NOT NULL DEFAULT 'OTC' CHECK(schedule IN ('OTC','H','H1','X','G')),
  category      TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sync_id       TEXT    UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_medicines_name     ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_hsn      ON medicines(hsn_code);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode  ON medicines(barcode);
CREATE INDEX IF NOT EXISTS idx_medicines_active   ON medicines(is_active);

-- ─── Batches (one row per medicine+batch) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id    INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  batch_number   TEXT    NOT NULL,
  expiry_date    TEXT    NOT NULL, -- YYYY-MM-DD
  purchase_price REAL    NOT NULL DEFAULT 0,
  mrp            REAL    NOT NULL DEFAULT 0,
  quantity       INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  reorder_level  INTEGER NOT NULL DEFAULT 10,
  sync_id        TEXT    UNIQUE,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(medicine_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_batches_medicine  ON batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry    ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_qty       ON batches(quantity);

-- ─── Stock movements ledger ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id         INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  medicine_id      INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  movement_type    TEXT    NOT NULL CHECK(movement_type IN (
                     'purchase','sale','return_in','return_out',
                     'adjustment','expired_write_off','opening_stock')),
  quantity         INTEGER NOT NULL, -- positive=in, negative=out
  balance_after    INTEGER NOT NULL, -- snapshot of batch qty after movement
  reference_type   TEXT,             -- 'invoice'|'purchase_receipt'|'return'|'adjustment'
  reference_id     INTEGER,
  reference_number TEXT,
  remarks          TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_movements_batch     ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_movements_medicine  ON stock_movements(medicine_id);
CREATE INDEX IF NOT EXISTS idx_movements_type      ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_ref       ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_movements_date      ON stock_movements(created_at);

-- ─── Customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT    DEFAULT 'Tamil Nadu',
  state_code    TEXT    DEFAULT '33',
  gst_number    TEXT,
  credit_limit  REAL    NOT NULL DEFAULT 0,
  credit_used   REAL    NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sync_id       TEXT    UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_gst    ON customers(gst_number);

-- ─── Suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT    DEFAULT 'Tamil Nadu',
  state_code    TEXT    DEFAULT '33',
  gstin         TEXT,
  dl_number     TEXT,
  dl_expiry     TEXT,
  credit_days   INTEGER NOT NULL DEFAULT 30,
  outstanding   REAL    NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sync_id       TEXT    UNIQUE,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name   ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_gstin  ON suppliers(gstin);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number      TEXT    NOT NULL UNIQUE,
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT    NOT NULL DEFAULT 'Walk-in',
  customer_gstin      TEXT,
  customer_state_code TEXT    DEFAULT '33',
  supply_type         TEXT    NOT NULL DEFAULT 'intrastate' CHECK(supply_type IN ('intrastate','interstate')),
  invoice_date        TEXT    NOT NULL,
  due_date            TEXT,
  subtotal            REAL    NOT NULL DEFAULT 0,
  discount_amount     REAL    NOT NULL DEFAULT 0,
  taxable_amount      REAL    NOT NULL DEFAULT 0,
  cgst_amount         REAL    NOT NULL DEFAULT 0,
  sgst_amount         REAL    NOT NULL DEFAULT 0,
  igst_amount         REAL    NOT NULL DEFAULT 0,
  total_gst           REAL    NOT NULL DEFAULT 0,
  round_off           REAL    NOT NULL DEFAULT 0,
  total_amount        REAL    NOT NULL DEFAULT 0,
  paid_amount         REAL    NOT NULL DEFAULT 0,
  payment_method      TEXT    NOT NULL DEFAULT 'cash',
  status              TEXT    NOT NULL DEFAULT 'paid' CHECK(status IN ('draft','paid','partial','cancelled')),
  notes               TEXT,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  sync_id             TEXT    UNIQUE,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_date      ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer  ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number    ON invoices(invoice_number);

-- ─── Invoice items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_name   TEXT    NOT NULL,
  batch_id        INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  batch_number    TEXT    NOT NULL,
  hsn_code        TEXT    NOT NULL DEFAULT '',
  quantity        INTEGER NOT NULL,
  unit            TEXT    NOT NULL DEFAULT 'strip',
  mrp             REAL    NOT NULL DEFAULT 0,
  unit_price      REAL    NOT NULL,
  discount_pct    REAL    NOT NULL DEFAULT 0,
  taxable_amount  REAL    NOT NULL DEFAULT 0,
  gst_rate        REAL    NOT NULL DEFAULT 12,
  cgst_rate       REAL    NOT NULL DEFAULT 6,
  sgst_rate       REAL    NOT NULL DEFAULT 6,
  igst_rate       REAL    NOT NULL DEFAULT 0,
  cgst_amount     REAL    NOT NULL DEFAULT 0,
  sgst_amount     REAL    NOT NULL DEFAULT 0,
  igst_amount     REAL    NOT NULL DEFAULT 0,
  total_amount    REAL    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inv_items_invoice   ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_medicine  ON invoice_items(medicine_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_batch     ON invoice_items(batch_id);

-- ─── Returns / Credit Notes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number       TEXT    NOT NULL UNIQUE,
  invoice_id          INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number      TEXT,
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT    NOT NULL DEFAULT 'Walk-in',
  return_type         TEXT    NOT NULL DEFAULT 'customer_return' CHECK(return_type IN (
                        'customer_return','expired','damaged','other')),
  return_date         TEXT    NOT NULL,
  taxable_amount      REAL    NOT NULL DEFAULT 0,
  cgst_amount         REAL    NOT NULL DEFAULT 0,
  sgst_amount         REAL    NOT NULL DEFAULT 0,
  igst_amount         REAL    NOT NULL DEFAULT 0,
  total_gst           REAL    NOT NULL DEFAULT 0,
  total_amount        REAL    NOT NULL DEFAULT 0,
  credit_note_issued  INTEGER NOT NULL DEFAULT 0 CHECK(credit_note_issued IN (0,1)),
  notes               TEXT,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_returns_date      ON returns(return_date);
CREATE INDEX IF NOT EXISTS idx_returns_invoice   ON returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer  ON returns(customer_id);

-- ─── Return items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id       INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  invoice_item_id INTEGER REFERENCES invoice_items(id) ON DELETE SET NULL,
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_name   TEXT    NOT NULL,
  batch_id        INTEGER NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  batch_number    TEXT    NOT NULL,
  hsn_code        TEXT    NOT NULL DEFAULT '',
  quantity        INTEGER NOT NULL,
  unit_price      REAL    NOT NULL,
  discount_pct    REAL    NOT NULL DEFAULT 0,
  taxable_amount  REAL    NOT NULL DEFAULT 0,
  gst_rate        REAL    NOT NULL DEFAULT 12,
  cgst_rate       REAL    NOT NULL DEFAULT 6,
  sgst_rate       REAL    NOT NULL DEFAULT 6,
  igst_rate       REAL    NOT NULL DEFAULT 0,
  cgst_amount     REAL    NOT NULL DEFAULT 0,
  sgst_amount     REAL    NOT NULL DEFAULT 0,
  igst_amount     REAL    NOT NULL DEFAULT 0,
  total_amount    REAL    NOT NULL DEFAULT 0,
  reason          TEXT
);
CREATE INDEX IF NOT EXISTS idx_ret_items_return    ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_ret_items_medicine  ON return_items(medicine_id);

-- ─── Purchase Orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number         TEXT    NOT NULL UNIQUE,
  supplier_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name     TEXT    NOT NULL,
  supply_type       TEXT    NOT NULL DEFAULT 'intrastate' CHECK(supply_type IN ('intrastate','interstate')),
  order_date        TEXT    NOT NULL,
  expected_delivery TEXT,
  taxable_amount    REAL    NOT NULL DEFAULT 0,
  cgst_amount       REAL    NOT NULL DEFAULT 0,
  sgst_amount       REAL    NOT NULL DEFAULT 0,
  igst_amount       REAL    NOT NULL DEFAULT 0,
  total_amount      REAL    NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','partial','received','cancelled')),
  notes             TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  sync_id           TEXT    UNIQUE,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_date     ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_po_status   ON purchase_orders(status);

-- ─── PO items ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id           INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_name   TEXT    NOT NULL,
  hsn_code        TEXT    NOT NULL DEFAULT '',
  ordered_qty     INTEGER NOT NULL DEFAULT 0,
  received_qty    INTEGER NOT NULL DEFAULT 0,
  free_qty        INTEGER NOT NULL DEFAULT 0,
  unit_price      REAL    NOT NULL DEFAULT 0,
  gst_rate        REAL    NOT NULL DEFAULT 12,
  taxable_amount  REAL    NOT NULL DEFAULT 0,
  cgst_amount     REAL    NOT NULL DEFAULT 0,
  sgst_amount     REAL    NOT NULL DEFAULT 0,
  igst_amount     REAL    NOT NULL DEFAULT 0,
  total_amount    REAL    NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po        ON po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_medicine  ON po_items(medicine_id);

-- ─── Purchase Receipts (GRN) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number          TEXT    NOT NULL UNIQUE,
  po_id                   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  po_number               TEXT    NOT NULL,
  supplier_id             INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name           TEXT    NOT NULL,
  supplier_invoice_number TEXT,
  receipt_date            TEXT    NOT NULL,
  taxable_amount          REAL    NOT NULL DEFAULT 0,
  cgst_amount             REAL    NOT NULL DEFAULT 0,
  sgst_amount             REAL    NOT NULL DEFAULT 0,
  igst_amount             REAL    NOT NULL DEFAULT 0,
  total_amount            REAL    NOT NULL DEFAULT 0,
  notes                   TEXT,
  created_by              INTEGER NOT NULL REFERENCES users(id),
  created_at              TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_receipts_po       ON purchase_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_receipts_supplier ON purchase_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date     ON purchase_receipts(receipt_date);

-- ─── GRN items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id      INTEGER NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  po_item_id      INTEGER NOT NULL REFERENCES po_items(id) ON DELETE RESTRICT,
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_name   TEXT    NOT NULL,
  batch_number    TEXT    NOT NULL,
  expiry_date     TEXT    NOT NULL,
  ordered_qty     INTEGER NOT NULL DEFAULT 0,
  received_qty    INTEGER NOT NULL DEFAULT 0,
  free_qty        INTEGER NOT NULL DEFAULT 0,
  unit_price      REAL    NOT NULL DEFAULT 0,
  gst_rate        REAL    NOT NULL DEFAULT 12,
  taxable_amount  REAL    NOT NULL DEFAULT 0,
  cgst_amount     REAL    NOT NULL DEFAULT 0,
  sgst_amount     REAL    NOT NULL DEFAULT 0,
  igst_amount     REAL    NOT NULL DEFAULT 0,
  total_amount    REAL    NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 10
);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt  ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_medicine ON receipt_items(medicine_id);

-- ─── Supplier payments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT    NOT NULL,
  payment_date  TEXT    NOT NULL,
  amount        REAL    NOT NULL,
  method        TEXT    NOT NULL DEFAULT 'cash',
  reference     TEXT,
  notes         TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sup_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sup_payments_date     ON supplier_payments(payment_date);

-- ─── Customer payments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT    NOT NULL,
  invoice_id    INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  payment_date  TEXT    NOT NULL,
  amount        REAL    NOT NULL,
  method        TEXT    NOT NULL DEFAULT 'cash',
  reference     TEXT,
  notes         TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_cust_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_payments_date     ON customer_payments(payment_date);

-- ─── Ledger entries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type      TEXT    NOT NULL CHECK(entity_type IN ('customer','supplier')),
  entity_id        INTEGER NOT NULL,
  entry_date       TEXT    NOT NULL,
  reference_type   TEXT    NOT NULL,
  reference_id     INTEGER NOT NULL,
  reference_number TEXT    NOT NULL,
  debit            REAL    NOT NULL DEFAULT 0,
  credit           REAL    NOT NULL DEFAULT 0,
  balance          REAL    NOT NULL DEFAULT 0,
  narration        TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON ledger_entries(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date   ON ledger_entries(entry_date);

-- ─── GST return records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gst_returns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  return_type TEXT    NOT NULL CHECK(return_type IN ('GSTR1','GSTR3B')),
  period      TEXT    NOT NULL, -- MMYYYY
  filed_at    TEXT,
  data_json   TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','filed')),
  created_by  INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT NOT NULL PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─── Sync conflicts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT    NOT NULL,
  sync_id      TEXT    NOT NULL,
  local_data   TEXT,
  remote_data  TEXT,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT NOT NULL,
  record_id   INTEGER NOT NULL,
  action      TEXT NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE')),
  old_values  TEXT,
  new_values  TEXT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  user_email  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_table  ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_date   ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs(user_id);
