import type { DB } from '../db/index.js';
import type { BatchWithMedicine, StockMovement, StockMovementType } from '../types/index.js';

// ─── FEFO: First Expiry, First Out ───────────────────────────────────────────
// Returns batches ordered by expiry_date ASC (earliest expiry picked first).
// Only batches with qty > 0 and not already expired today.

export function getFEFOBatches(
  db: DB,
  medicineId: number,
  requiredQty: number,
): Array<{ batch_id: number; batch_number: string; expiry_date: string; quantity: number; available: number }> {
  const today = todayISO();

  const batches = db.prepare(`
    SELECT b.id as batch_id, b.batch_number, b.expiry_date, b.quantity
    FROM batches b
    WHERE b.medicine_id = ?
      AND b.quantity > 0
      AND b.expiry_date > ?
    ORDER BY b.expiry_date ASC, b.id ASC
  `).all(medicineId, today) as any[];

  const result: Array<{ batch_id: number; batch_number: string; expiry_date: string; quantity: number; available: number }> = [];
  let remaining = requiredQty;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    result.push({
      batch_id:     batch.batch_id,
      batch_number: batch.batch_number,
      expiry_date:  batch.expiry_date,
      quantity:     take,
      available:    batch.quantity,
    });
    remaining -= take;
  }

  return result;
}

export function getTotalAvailableQty(db: DB, medicineId: number): number {
  const today = todayISO();
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM batches
    WHERE medicine_id = ?
      AND quantity > 0
      AND expiry_date > ?
  `).get(medicineId, today) as any;
  return row?.total ?? 0;
}

// ─── Stock movement recording ─────────────────────────────────────────────────

export function recordMovement(
  db: DB,
  opts: {
    batch_id: number;
    medicine_id: number;
    movement_type: StockMovementType;
    quantity: number; // positive=in, negative=out
    reference_type?: string;
    reference_id?: number;
    reference_number?: string;
    remarks?: string;
    created_by: number;
  },
): void {
  // Update batch quantity
  const newQty = db.prepare(`
    SELECT quantity FROM batches WHERE id = ?
  `).get(opts.batch_id) as any;

  if (!newQty) throw new Error(`Batch ${opts.batch_id} not found`);

  const balanceAfter = newQty.quantity + opts.quantity;
  if (balanceAfter < 0) {
    throw new Error(
      `Insufficient stock in batch ${opts.batch_id}. Available: ${newQty.quantity}, Requested: ${Math.abs(opts.quantity)}`
    );
  }

  db.prepare(`UPDATE batches SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(balanceAfter, opts.batch_id);

  db.prepare(`
    INSERT INTO stock_movements
      (batch_id, medicine_id, movement_type, quantity, balance_after,
       reference_type, reference_id, reference_number, remarks, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    opts.batch_id, opts.medicine_id, opts.movement_type, opts.quantity, balanceAfter,
    opts.reference_type ?? null, opts.reference_id ?? null, opts.reference_number ?? null,
    opts.remarks ?? null, opts.created_by,
  );
}

// ─── Batch queries ────────────────────────────────────────────────────────────

export function getBatchesForMedicine(db: DB, medicineId: number): any[] {
  return db.prepare(`
    SELECT b.*, m.name as medicine_name, m.hsn_code, m.gst_rate, m.unit
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id
    WHERE b.medicine_id = ?
    ORDER BY b.expiry_date ASC
  `).all(medicineId) as any[];
}

export function getAllBatchesWithMedicine(db: DB): BatchWithMedicine[] {
  return db.prepare(`
    SELECT b.*, m.name as medicine_name, m.hsn_code, m.gst_rate, m.unit
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id
      AND m.is_active = 1
    ORDER BY m.name, b.expiry_date ASC
  `).all() as BatchWithMedicine[];
}

export function getLowStockBatches(db: DB): any[] {
  return db.prepare(`
    SELECT b.*, m.name as medicine_name, m.unit
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity <= b.reorder_level
      AND b.quantity > 0
    ORDER BY (b.quantity * 1.0 / b.reorder_level) ASC
  `).all();
}

export function getExpiringBatches(db: DB, withinDays = 90): any[] {
  const today    = todayISO();
  const cutoff   = addDays(today, withinDays);
  return db.prepare(`
    SELECT
      b.*, m.name as medicine_name, m.unit,
      (b.quantity * b.purchase_price) as stock_value,
      julianday(b.expiry_date) - julianday('now') as days_to_expiry
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity > 0
      AND b.expiry_date <= ?
      AND b.expiry_date >= ?
    ORDER BY b.expiry_date ASC
  `).all(cutoff, today);
}

export function getExpiredBatches(db: DB): any[] {
  const today = todayISO();
  return db.prepare(`
    SELECT b.*, m.name as medicine_name, m.unit,
      (b.quantity * b.purchase_price) as stock_value
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    WHERE b.quantity > 0 AND b.expiry_date <= ?
    ORDER BY b.expiry_date ASC
  `).all(today);
}

export function getSlowMovingBatches(db: DB, slowDays = 90): any[] {
  const cutoff = addDays(todayISO(), -slowDays);
  return db.prepare(`
    SELECT
      b.*,
      m.name as medicine_name, m.unit,
      (b.quantity * b.purchase_price) as stock_value,
      MAX(sm.created_at) as last_sale_date,
      CAST(julianday('now') - julianday(COALESCE(MAX(sm.created_at), b.created_at)) AS INTEGER)
        as days_since_last_sale
    FROM batches b
    JOIN medicines m ON m.id = b.medicine_id AND m.is_active = 1
    LEFT JOIN stock_movements sm ON sm.batch_id = b.id
      AND sm.movement_type = 'sale'
    WHERE b.quantity > 0
    GROUP BY b.id
    HAVING last_sale_date IS NULL OR last_sale_date < ?
    ORDER BY days_since_last_sale DESC
  `).all(cutoff);
}

// ─── Stock adjustment ─────────────────────────────────────────────────────────

export function adjustStock(
  db: DB,
  batchId: number,
  newQty: number,
  reason: string,
  userId: number,
): void {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as any;
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const diff = newQty - batch.quantity;
  if (diff === 0) return;

  db.prepare(`UPDATE batches SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(newQty, batchId);

  db.prepare(`
    INSERT INTO stock_movements
      (batch_id, medicine_id, movement_type, quantity, balance_after, remarks, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run(batchId, batch.medicine_id, 'adjustment', diff, newQty, reason, userId);
}

// ─── Stock movement history ────────────────────────────────────────────────────

export function getMovementHistory(
  db: DB,
  opts: { batchId?: number; medicineId?: number; fromDate?: string; toDate?: string; limit?: number },
): StockMovement[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.batchId)    { conditions.push('batch_id = ?');    params.push(opts.batchId);    }
  if (opts.medicineId) { conditions.push('medicine_id = ?'); params.push(opts.medicineId); }
  if (opts.fromDate)   { conditions.push('created_at >= ?'); params.push(opts.fromDate);   }
  if (opts.toDate)     { conditions.push('created_at <= ?'); params.push(opts.toDate + ' 23:59:59'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 500;

  return db.prepare(`
    SELECT * FROM stock_movements ${where} ORDER BY created_at DESC LIMIT ?
  `).all(...params, limit) as StockMovement[];
}

// ─── Searchable medicine stock (for POS) ─────────────────────────────────────

export function searchMedicinesWithStock(db: DB, query: string): any[] {
  const today = todayISO();
  const q = `%${query}%`;
  return db.prepare(`
    SELECT
      m.id, m.name, m.generic_name, m.hsn_code, m.gst_rate, m.unit, m.mrp,
      m.barcode, m.schedule,
      COALESCE(SUM(CASE WHEN b.expiry_date > ? AND b.quantity > 0 THEN b.quantity ELSE 0 END), 0) AS total_qty
    FROM medicines m
    LEFT JOIN batches b ON b.medicine_id = m.id
    WHERE m.is_active = 1
      AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.barcode = ? OR m.hsn_code LIKE ?)
    GROUP BY m.id
    HAVING total_qty > 0
    ORDER BY m.name
    LIMIT 50
  `).all(today, q, q, query, q);
}

// ─── Create/add batch ─────────────────────────────────────────────────────────

export function createBatch(
  db: DB,
  opts: {
    medicine_id: number;
    batch_number: string;
    expiry_date: string;
    purchase_price: number;
    mrp: number;
    quantity: number;
    reorder_level: number;
    created_by: number;
  },
): number {
  const existing = db.prepare(`
    SELECT id, quantity FROM batches WHERE medicine_id = ? AND batch_number = ?
  `).get(opts.medicine_id, opts.batch_number) as any;

  if (existing) {
    // Update existing batch quantity
    const newQty = existing.quantity + opts.quantity;
    db.prepare(`
      UPDATE batches SET quantity = ?, purchase_price = ?, mrp = ?,
        reorder_level = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(newQty, opts.purchase_price, opts.mrp, opts.reorder_level, existing.id);

    db.prepare(`
      INSERT INTO stock_movements
        (batch_id, medicine_id, movement_type, quantity, balance_after, reference_type, remarks, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(existing.id, opts.medicine_id, 'purchase', opts.quantity, newQty, 'manual', 'Manual stock entry', opts.created_by);

    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_price, mrp, quantity, reorder_level)
    VALUES (?,?,?,?,?,?,?)
  `).run(opts.medicine_id, opts.batch_number, opts.expiry_date, opts.purchase_price, opts.mrp, opts.quantity, opts.reorder_level);

  const batchId = Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO stock_movements
      (batch_id, medicine_id, movement_type, quantity, balance_after, reference_type, remarks, created_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(batchId, opts.medicine_id, 'opening_stock', opts.quantity, opts.quantity, 'manual', 'Initial stock entry', opts.created_by);

  return batchId;
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
