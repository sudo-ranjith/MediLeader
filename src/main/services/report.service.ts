import type { DB } from '../db/index.js';

// ─── Daily Sales ──────────────────────────────────────────────────────────────

export function getDailySales(db: DB, fromDate: string, toDate: string) {
  return db.prepare(`
    SELECT
      invoice_date                         AS date,
      COUNT(*)                             AS invoice_count,
      SUM(total_amount)                    AS total_revenue,
      SUM(taxable_amount)                  AS total_taxable,
      SUM(cgst_amount)                     AS total_cgst,
      SUM(sgst_amount)                     AS total_sgst,
      SUM(igst_amount)                     AS total_igst,
      SUM(total_gst)                       AS total_gst,
      SUM(CASE WHEN payment_method='cash'   THEN total_amount ELSE 0 END) AS cash_total,
      SUM(CASE WHEN payment_method='card'   THEN total_amount ELSE 0 END) AS card_total,
      SUM(CASE WHEN payment_method='upi'    THEN total_amount ELSE 0 END) AS upi_total,
      SUM(CASE WHEN payment_method='credit' THEN total_amount ELSE 0 END) AS credit_total
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ?
      AND status IN ('paid','partial')
    GROUP BY invoice_date
    ORDER BY invoice_date DESC
  `).all(fromDate, toDate);
}

// ─── Medicine Sales ───────────────────────────────────────────────────────────

export function getMedicineSales(db: DB, fromDate: string, toDate: string) {
  return db.prepare(`
    SELECT
      m.id                                     AS medicine_id,
      m.name                                   AS medicine_name,
      m.hsn_code,
      m.cost,
      SUM(ii.quantity)                         AS total_qty,
      SUM(ii.total_amount)                     AS total_revenue,
      SUM(ii.taxable_amount)                   AS total_taxable,
      SUM(ii.cgst_amount + ii.sgst_amount + ii.igst_amount) AS total_gst,
      AVG(ii.unit_price)                       AS avg_selling_price,
      SUM(ii.quantity * m.cost)                AS total_cost,
      SUM(ii.taxable_amount - ii.quantity * m.cost) AS gross_profit,
      CASE WHEN SUM(ii.taxable_amount) > 0
           THEN ROUND((SUM(ii.taxable_amount - ii.quantity * m.cost) / SUM(ii.taxable_amount)) * 100, 2)
           ELSE 0 END                          AS profit_margin_pct
    FROM invoice_items ii
    JOIN invoices  i ON i.id = ii.invoice_id
    JOIN medicines m ON m.id = ii.medicine_id
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status IN ('paid','partial')
    GROUP BY ii.medicine_id
    ORDER BY total_revenue DESC
  `).all(fromDate, toDate);
}

// ─── Expiry Tracking ──────────────────────────────────────────────────────────

export function getExpiryReport(db: DB) {
  const today = todayISO();
  return db.prepare(`
    SELECT
      b.id                    AS batch_id,
      b.medicine_id,
      m.name                  AS medicine_name,
      m.unit,
      b.batch_number,
      b.expiry_date,
      b.quantity,
      b.purchase_price,
      CAST(julianday(b.expiry_date) - julianday(?) AS INTEGER) AS days_to_expiry,
      (b.quantity * b.purchase_price)                           AS stock_value,
      CASE
        WHEN julianday(b.expiry_date) < julianday(?)         THEN 'expired'
        WHEN julianday(b.expiry_date) - julianday(?) < 30    THEN 'critical'
        WHEN julianday(b.expiry_date) - julianday(?) < 90    THEN 'warning'
        ELSE 'ok'
      END AS status
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity > 0
    ORDER BY b.expiry_date ASC
  `).all(today, today, today, today);
}

// ─── Slow-moving Stock ────────────────────────────────────────────────────────

export function getSlowMovingReport(db: DB, slowDays = 90) {
  const cutoff = addDays(todayISO(), -slowDays);
  return db.prepare(`
    SELECT
      b.id                       AS batch_id,
      b.medicine_id,
      m.name                     AS medicine_name,
      m.unit,
      b.batch_number,
      b.expiry_date,
      b.quantity,
      b.purchase_price,
      (b.quantity * b.purchase_price) AS stock_value,
      MAX(sm.created_at)         AS last_sale_date,
      CAST(
        julianday('now') - julianday(COALESCE(MAX(sm.created_at), b.created_at))
      AS INTEGER)                AS days_since_last_sale
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    LEFT JOIN stock_movements sm
      ON sm.batch_id = b.id AND sm.movement_type = 'sale'
    WHERE b.quantity > 0
    GROUP BY b.id
    HAVING last_sale_date IS NULL OR last_sale_date < ?
    ORDER BY days_since_last_sale DESC
  `).all(cutoff);
}

// ─── Dead Stock ───────────────────────────────────────────────────────────────

export function getDeadStockReport(db: DB) {
  return db.prepare(`
    SELECT
      b.id               AS batch_id,
      b.medicine_id,
      m.name             AS medicine_name,
      b.batch_number,
      b.expiry_date,
      b.quantity,
      (b.quantity * b.purchase_price) AS locked_value
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity > 0
      AND b.id NOT IN (
        SELECT DISTINCT batch_id FROM stock_movements WHERE movement_type = 'sale'
      )
    ORDER BY locked_value DESC
  `).all();
}

// ─── Inventory Valuation ──────────────────────────────────────────────────────

export function getInventoryValuation(db: DB) {
  return db.prepare(`
    SELECT
      m.id,
      m.name,
      m.unit,
      m.cost,
      m.mrp,
      COALESCE(SUM(b.quantity), 0) AS total_qty,
      COALESCE(SUM(b.quantity * b.purchase_price), 0) AS stock_value_cost,
      COALESCE(SUM(b.quantity * b.mrp), 0)            AS stock_value_mrp
    FROM medicines m
    LEFT JOIN batches b ON b.medicine_id = m.id AND b.quantity > 0
    WHERE m.is_active = 1
    GROUP BY m.id
    ORDER BY stock_value_cost DESC
  `).all();
}

// ─── Credit Report ────────────────────────────────────────────────────────────

export function getCreditReport(db: DB) {
  return db.prepare(`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.credit_limit,
      c.credit_used,
      (c.credit_limit - c.credit_used)         AS available_credit,
      CASE WHEN c.credit_limit > 0
           THEN ROUND(c.credit_used * 100.0 / c.credit_limit, 1)
           ELSE 0 END                           AS utilization_pct,
      COALESCE(
        (SELECT SUM(total_amount - paid_amount)
         FROM invoices
         WHERE customer_id = c.id
           AND payment_method = 'credit'
           AND status IN ('paid','partial')),
        0
      )                                         AS invoice_outstanding
    FROM customers c
    WHERE c.is_active = 1 AND c.credit_used > 0
    ORDER BY c.credit_used DESC
  `).all();
}

// ─── Supplier Outstanding ─────────────────────────────────────────────────────

export function getSupplierOutstandingReport(db: DB) {
  return db.prepare(`
    SELECT
      s.id,
      s.name,
      s.phone,
      s.outstanding,
      s.credit_days,
      COALESCE(
        (SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id),
        0
      ) AS total_paid,
      COALESCE(
        (SELECT MAX(receipt_date) FROM purchase_receipts WHERE supplier_id = s.id),
        NULL
      ) AS last_purchase_date
    FROM suppliers s
    WHERE s.is_active = 1
      AND s.outstanding > 0
    ORDER BY s.outstanding DESC
  `).all();
}

// ─── Purchase Summary ─────────────────────────────────────────────────────────

export function getPurchaseSummary(db: DB, fromDate: string, toDate: string) {
  return db.prepare(`
    SELECT
      pr.receipt_date                          AS date,
      COUNT(*)                                 AS receipt_count,
      SUM(pr.total_amount)                     AS total_purchase,
      SUM(pr.taxable_amount)                   AS total_taxable,
      SUM(pr.cgst_amount + pr.sgst_amount + pr.igst_amount) AS total_gst
    FROM purchase_receipts pr
    WHERE pr.receipt_date BETWEEN ? AND ?
    GROUP BY pr.receipt_date
    ORDER BY pr.receipt_date DESC
  `).all(fromDate, toDate);
}

// ─── GST Summary for period ───────────────────────────────────────────────────

export function getGSTSummary(db: DB, fromDate: string, toDate: string) {
  const outward = db.prepare(`
    SELECT
      gst_rate,
      supply_type,
      SUM(taxable_amount) AS taxable_amount,
      SUM(cgst_amount)    AS cgst_amount,
      SUM(sgst_amount)    AS sgst_amount,
      SUM(igst_amount)    AS igst_amount,
      SUM(total_gst)      AS total_gst,
      COUNT(*)            AS invoice_count
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ?
      AND status IN ('paid','partial')
    GROUP BY gst_rate, supply_type
    ORDER BY gst_rate
  `).all(fromDate, toDate);

  // Outward by rate from invoice_items
  const byRate = db.prepare(`
    SELECT
      ii.gst_rate,
      SUM(ii.taxable_amount) AS taxable_amount,
      SUM(ii.cgst_amount)    AS cgst_amount,
      SUM(ii.sgst_amount)    AS sgst_amount,
      SUM(ii.igst_amount)    AS igst_amount
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.invoice_date BETWEEN ? AND ? AND i.status IN ('paid','partial')
    GROUP BY ii.gst_rate
    ORDER BY ii.gst_rate
  `).all(fromDate, toDate);

  const totals = db.prepare(`
    SELECT
      SUM(taxable_amount) AS total_taxable,
      SUM(cgst_amount)    AS total_cgst,
      SUM(sgst_amount)    AS total_sgst,
      SUM(igst_amount)    AS total_igst,
      SUM(total_gst)      AS total_gst,
      SUM(total_amount)   AS total_revenue,
      COUNT(*)            AS total_invoices
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ?
      AND status IN ('paid','partial')
  `).get(fromDate, toDate);

  return { outward, byRate, totals };
}

// ─── Stock Movement Report ────────────────────────────────────────────────────

export function getStockMovementReport(db: DB, fromDate: string, toDate: string) {
  return db.prepare(`
    SELECT
      sm.*,
      m.name   AS medicine_name,
      b.batch_number,
      b.expiry_date
    FROM stock_movements sm
    JOIN batches  b ON b.id = sm.batch_id
    JOIN medicines m ON m.id = sm.medicine_id
    WHERE sm.created_at BETWEEN ? AND ? || ' 23:59:59'
    ORDER BY sm.created_at DESC
  `).all(fromDate, toDate);
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export function getDashboardStats(db: DB) {
  const today = todayISO();
  const sevenDaysAgo = addDays(today, -7);

  const todaySales = db.prepare(`
    SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
    FROM invoices WHERE invoice_date = ? AND status IN ('paid','partial')
  `).get(today) as any;

  const inventoryValue = db.prepare(`
    SELECT COALESCE(SUM(b.quantity * b.purchase_price), 0) AS value
    FROM batches b JOIN medicines m ON m.id = b.medicine_id WHERE m.is_active = 1
  `).get() as any;

  const expiring30 = db.prepare(`
    SELECT COUNT(*) AS count FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity > 0
      AND b.expiry_date BETWEEN ? AND ?
  `).get(today, addDays(today, 30)) as any;

  const pendingCredit = db.prepare(`
    SELECT COALESCE(SUM(credit_used),0) AS total FROM customers
  `).get() as any;

  const lowStock = db.prepare(`
    SELECT COUNT(*) AS count FROM batches WHERE quantity <= reorder_level AND quantity > 0
  `).get() as any;

  const recentInvoices = db.prepare(`
    SELECT * FROM invoices ORDER BY created_at DESC LIMIT 10
  `).all();

  const salesTrend = db.prepare(`
    SELECT invoice_date AS date, SUM(total_amount) AS revenue
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ? AND status IN ('paid','partial')
    GROUP BY invoice_date
    ORDER BY invoice_date ASC
  `).all(sevenDaysAgo, today);

  return {
    today_sales:      todaySales?.total    ?? 0,
    today_count:      todaySales?.count    ?? 0,
    inventory_value:  inventoryValue?.value ?? 0,
    expiring_30_days: expiring30?.count    ?? 0,
    pending_credit:   pendingCredit?.total ?? 0,
    low_stock_count:  lowStock?.count      ?? 0,
    recent_invoices:  recentInvoices,
    sales_trend:      salesTrend,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
