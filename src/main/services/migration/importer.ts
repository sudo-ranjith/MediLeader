// ── Entity Importers ──────────────────────────────────────────────────────────
import type { DB } from '../../db/index.js';
import type { EntityType } from './adapters.js';
import type { RowValidation } from './validator.js';

export type DuplicateHandling = 'skip' | 'overwrite' | 'merge';

export interface ImportSettings {
  duplicateHandling: DuplicateHandling;
  skipErrors: boolean;
  skipExpired: boolean;
  skipZeroQty: boolean;
}

export interface ImportRowResult {
  rowNumber: number;
  status: 'imported' | 'skipped' | 'failed' | 'overwritten';
  entityId?: number;
  reason?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  overwritten: number;
  results: ImportRowResult[];
  rollbackIds: number[];
}

// ── Medicine importer ─────────────────────────────────────────────────────────

function importMedicines(db: DB, validations: RowValidation[], settings: ImportSettings, userId: number): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, overwritten: 0, results: [], rollbackIds: [] };

  const insertMed = db.prepare(`
    INSERT INTO medicines (name, generic_name, manufacturer, category, hsn_code, gst_rate,
      unit, mrp, cost, barcode, schedule, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateMed = db.prepare(`
    UPDATE medicines SET generic_name=?, manufacturer=?, category=?, hsn_code=?,
      gst_rate=?, unit=?, mrp=?, cost=?, barcode=?, schedule=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `);
  const findMed = db.prepare(`SELECT id FROM medicines WHERE name = ? COLLATE NOCASE LIMIT 1`);
  const findBarcode = db.prepare(`SELECT id, name FROM medicines WHERE barcode = ? AND barcode != '' LIMIT 1`);

  const doImport = db.transaction(() => {
    for (const v of validations) {
      if (v.status === 'error' && !settings.skipErrors) {
        result.results.push({ rowNumber: v.rowNumber, status: 'failed', reason: v.errors.map(e => e.message).join('; ') });
        result.failed++;
        continue;
      }
      const r = v.normalized;
      // Barcode conflict detection
      if (r.barcode) {
        const conflict = findBarcode.get(r.barcode) as any;
        if (conflict && conflict.name.toLowerCase() !== (r.name ?? '').toLowerCase()) {
          v.errors.push({ field: 'barcode', message: `Barcode conflicts with "${conflict.name}"`, severity: 'warning' });
        }
      }
      const existing = findMed.get(r.name) as any;
      if (existing) {
        if (settings.duplicateHandling === 'skip') {
          result.results.push({ rowNumber: v.rowNumber, status: 'skipped', entityId: existing.id, reason: 'Duplicate name' });
          result.skipped++;
          continue;
        }
        if (settings.duplicateHandling === 'overwrite' || settings.duplicateHandling === 'merge') {
          updateMed.run(r.generic_name || null, r.manufacturer || null, r.category || null,
            r.hsn_code || '', parseFloat(r.gst_rate) || 12, r.unit || 'strip',
            parseFloat(r.mrp) || 0, parseFloat(r.cost) || 0, r.barcode || null,
            r.schedule || 'OTC', existing.id);
          result.results.push({ rowNumber: v.rowNumber, status: 'overwritten', entityId: existing.id });
          result.overwritten++;
          continue;
        }
      }
      const ins = insertMed.run(r.name, r.generic_name || null, r.manufacturer || null,
        r.category || null, r.hsn_code || '', parseFloat(r.gst_rate) || 12,
        r.unit || 'strip', parseFloat(r.mrp) || 0, parseFloat(r.cost) || 0,
        r.barcode || null, r.schedule || 'OTC');
      const newId = Number(ins.lastInsertRowid);
      result.rollbackIds.push(newId);
      result.results.push({ rowNumber: v.rowNumber, status: 'imported', entityId: newId });
      result.imported++;
    }
  });

  doImport();
  return result;
}

// ── Batch/Stock importer ──────────────────────────────────────────────────────

function importBatches(db: DB, validations: RowValidation[], settings: ImportSettings, userId: number): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, overwritten: 0, results: [], rollbackIds: [] };

  const findMed   = db.prepare(`SELECT id FROM medicines WHERE name = ? COLLATE NOCASE LIMIT 1`);
  const findBatch = db.prepare(`SELECT id, quantity FROM batches WHERE medicine_id=? AND batch_number=? LIMIT 1`);
  const insertBatch = db.prepare(`
    INSERT INTO batches (medicine_id, batch_number, expiry_date, purchase_price, mrp, quantity, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateBatch = db.prepare(`
    UPDATE batches SET quantity=quantity+?, purchase_price=?, mrp=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `);
  const insertMovement = db.prepare(`
    INSERT INTO stock_movements (batch_id, medicine_id, movement_type, quantity, balance_after,
      reference_type, reference_number, remarks, created_by)
    VALUES (?, ?, 'import', ?, ?, 'import', 'MIGRATION', 'Bulk import', ?)
  `);

  const doImport = db.transaction(() => {
    for (const v of validations) {
      if (v.status === 'error' && !settings.skipErrors) {
        result.results.push({ rowNumber: v.rowNumber, status: 'failed', reason: v.errors.map(e => e.message).join('; ') });
        result.failed++;
        continue;
      }
      const r = v.normalized;

      if (settings.skipExpired) {
        if (r.expiry_date && new Date(r.expiry_date) < new Date()) {
          result.results.push({ rowNumber: v.rowNumber, status: 'skipped', reason: 'Expired stock skipped' });
          result.skipped++;
          continue;
        }
      }
      const qty = parseInt(r.quantity) || 0;
      if (settings.skipZeroQty && qty === 0) {
        result.results.push({ rowNumber: v.rowNumber, status: 'skipped', reason: 'Zero quantity skipped' });
        result.skipped++;
        continue;
      }

      const med = findMed.get(r.medicine_name) as any;
      if (!med) {
        result.results.push({ rowNumber: v.rowNumber, status: 'failed', reason: `Medicine "${r.medicine_name}" not found — import medicines first` });
        result.failed++;
        continue;
      }

      const existing = findBatch.get(med.id, r.batch_number) as any;
      if (existing) {
        if (settings.duplicateHandling === 'skip') {
          result.results.push({ rowNumber: v.rowNumber, status: 'skipped', entityId: existing.id, reason: 'Duplicate batch' });
          result.skipped++;
          continue;
        }
        // Merge: add quantities
        updateBatch.run(qty, parseFloat(r.purchase_price) || 0, parseFloat(r.mrp) || 0, existing.id);
        const newQty = existing.quantity + qty;
        insertMovement.run(existing.id, med.id, qty, newQty, userId);
        result.results.push({ rowNumber: v.rowNumber, status: 'overwritten', entityId: existing.id });
        result.overwritten++;
        continue;
      }

      const ins = insertBatch.run(med.id, r.batch_number, r.expiry_date,
        parseFloat(r.purchase_price) || 0, parseFloat(r.mrp) || 0, qty,
        parseInt(r.reorder_level) || 10);
      const newId = Number(ins.lastInsertRowid);
      insertMovement.run(newId, med.id, qty, qty, userId);
      result.rollbackIds.push(newId);
      result.results.push({ rowNumber: v.rowNumber, status: 'imported', entityId: newId });
      result.imported++;
    }
  });

  doImport();
  return result;
}

// ── Customer importer ─────────────────────────────────────────────────────────

function importCustomers(db: DB, validations: RowValidation[], settings: ImportSettings, _userId: number): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, overwritten: 0, results: [], rollbackIds: [] };

  const findByPhone = db.prepare(`SELECT id FROM customers WHERE phone=? AND phone != '' LIMIT 1`);
  const findByName  = db.prepare(`SELECT id FROM customers WHERE name=? COLLATE NOCASE LIMIT 1`);
  const insertCust  = db.prepare(`
    INSERT INTO customers (name, phone, email, address, gst_number, credit_limit, credit_used, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateCust  = db.prepare(`
    UPDATE customers SET name=?, email=?, address=?, gst_number=?, credit_limit=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `);

  const doImport = db.transaction(() => {
    for (const v of validations) {
      if (v.status === 'error' && !settings.skipErrors) {
        result.results.push({ rowNumber: v.rowNumber, status: 'failed', reason: v.errors.map(e => e.message).join('; ') });
        result.failed++;
        continue;
      }
      const r = v.normalized;
      const existing = (r.phone ? findByPhone.get(r.phone) : null) ?? findByName.get(r.name) as any;
      if (existing) {
        if (settings.duplicateHandling === 'skip') {
          result.results.push({ rowNumber: v.rowNumber, status: 'skipped', entityId: existing.id, reason: 'Duplicate customer' });
          result.skipped++;
          continue;
        }
        updateCust.run(r.name, r.email || null, r.address || null,
          r.gstin || null, parseFloat(r.credit_limit) || 0, existing.id);
        result.results.push({ rowNumber: v.rowNumber, status: 'overwritten', entityId: existing.id });
        result.overwritten++;
        continue;
      }
      const ins = insertCust.run(r.name, r.phone || null, r.email || null, r.address || null,
        r.gstin || null, parseFloat(r.credit_limit) || 0,
        parseFloat(r.outstanding) || 0);
      const newId = Number(ins.lastInsertRowid);
      result.rollbackIds.push(newId);
      result.results.push({ rowNumber: v.rowNumber, status: 'imported', entityId: newId });
      result.imported++;
    }
  });

  doImport();
  return result;
}

// ── Supplier importer ─────────────────────────────────────────────────────────

function importSuppliers(db: DB, validations: RowValidation[], settings: ImportSettings, _userId: number): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, overwritten: 0, results: [], rollbackIds: [] };

  const findByName  = db.prepare(`SELECT id FROM suppliers WHERE name=? COLLATE NOCASE LIMIT 1`);
  const findByGSTIN = db.prepare(`SELECT id FROM suppliers WHERE gstin=? AND gstin != '' LIMIT 1`);
  const insertSupp  = db.prepare(`
    INSERT INTO suppliers (name, phone, email, address, gstin, dl_number, outstanding, credit_days, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const updateSupp  = db.prepare(`
    UPDATE suppliers SET phone=?, email=?, address=?, gstin=?, dl_number=?, outstanding=?,
      updated_at=datetime('now','localtime') WHERE id=?
  `);

  const doImport = db.transaction(() => {
    for (const v of validations) {
      if (v.status === 'error' && !settings.skipErrors) {
        result.results.push({ rowNumber: v.rowNumber, status: 'failed', reason: v.errors.map(e => e.message).join('; ') });
        result.failed++;
        continue;
      }
      const r = v.normalized;
      const existing = (r.gstin ? findByGSTIN.get(r.gstin) : null) ?? findByName.get(r.name) as any;
      if (existing) {
        if (settings.duplicateHandling === 'skip') {
          result.results.push({ rowNumber: v.rowNumber, status: 'skipped', entityId: existing.id, reason: 'Duplicate supplier' });
          result.skipped++;
          continue;
        }
        updateSupp.run(r.phone || null, r.email || null, r.address || null,
          r.gstin || null, r.dl_number || null, parseFloat(r.outstanding) || 0, existing.id);
        result.results.push({ rowNumber: v.rowNumber, status: 'overwritten', entityId: existing.id });
        result.overwritten++;
        continue;
      }
      const ins = insertSupp.run(r.name, r.phone || null, r.email || null, r.address || null,
        r.gstin || null, r.dl_number || null, parseFloat(r.outstanding) || 0,
        parseInt(r.credit_days) || 30);
      const newId = Number(ins.lastInsertRowid);
      result.rollbackIds.push(newId);
      result.results.push({ rowNumber: v.rowNumber, status: 'imported', entityId: newId });
      result.imported++;
    }
  });

  doImport();
  return result;
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export function importEntities(
  db: DB,
  validations: RowValidation[],
  entityType: EntityType,
  settings: ImportSettings,
  userId: number,
): ImportResult {
  switch (entityType) {
    case 'medicines': return importMedicines(db, validations, settings, userId);
    case 'batches':   return importBatches(db, validations, settings, userId);
    case 'customers': return importCustomers(db, validations, settings, userId);
    case 'suppliers': return importSuppliers(db, validations, settings, userId);
  }
}

// ── Rollback ──────────────────────────────────────────────────────────────────

export function rollbackImport(db: DB, entityType: EntityType, ids: number[]): void {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const tableMap: Record<EntityType, string> = {
    medicines: 'medicines',
    batches:   'batches',
    customers: 'customers',
    suppliers: 'suppliers',
  };
  db.prepare(`DELETE FROM ${tableMap[entityType]} WHERE id IN (${placeholders})`).run(...ids);
}
