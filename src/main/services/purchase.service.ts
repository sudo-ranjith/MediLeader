import type { DB } from '../db/index.js';
import type {
  PurchaseOrderWithItems, PurchaseReceiptWithItems, SupplyType,
} from '../types/index.js';
import { calculateGST } from './gst.service.js';
import { recordMovement, createBatch } from './stock.service.js';
import { addLedgerEntry } from './ledger.service.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Create Purchase Order ────────────────────────────────────────────────────

export function createPurchaseOrder(
  db: DB,
  input: {
    supplier_id: number;
    supply_type: SupplyType;
    order_date: string;
    expected_delivery?: string;
    items: Array<{
      medicine_id: number;
      ordered_qty: number;
      free_qty: number;
      unit_price: number;
    }>;
    notes?: string;
    created_by: number;
  },
): PurchaseOrderWithItems {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(input.supplier_id) as any;
  if (!supplier) throw new Error(`Supplier ${input.supplier_id} not found`);

  const poItems = [];
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalAmount = 0;

  for (const lineInput of input.items) {
    const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(lineInput.medicine_id) as any;
    if (!med) throw new Error(`Medicine ${lineInput.medicine_id} not found`);

    const gst = calculateGST(lineInput.unit_price, lineInput.ordered_qty, 0, med.gst_rate, input.supply_type);

    const poItem = {
      medicine_id:    lineInput.medicine_id,
      medicine_name:  med.name,
      hsn_code:       med.hsn_code,
      ordered_qty:    lineInput.ordered_qty,
      received_qty:   0,
      free_qty:       lineInput.free_qty,
      unit_price:     lineInput.unit_price,
      gst_rate:       med.gst_rate,
      taxable_amount: gst.taxable_amount,
      cgst_amount:    gst.cgst_amount,
      sgst_amount:    gst.sgst_amount,
      igst_amount:    gst.igst_amount,
      total_amount:   gst.total_amount,
    };

    poItems.push(poItem);
    totalTaxable = round2(totalTaxable + gst.taxable_amount);
    totalCgst    = round2(totalCgst    + gst.cgst_amount);
    totalSgst    = round2(totalSgst    + gst.sgst_amount);
    totalIgst    = round2(totalIgst    + gst.igst_amount);
    totalAmount  = round2(totalAmount  + gst.total_amount);
  }

  const poNumber = generatePONumber(db);

  return db.transaction(() => {
    const po = db.prepare(`
      INSERT INTO purchase_orders
        (po_number, supplier_id, supplier_name, supply_type, order_date,
         expected_delivery, taxable_amount, cgst_amount, sgst_amount, igst_amount,
         total_amount, status, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      poNumber, input.supplier_id, supplier.name, input.supply_type,
      input.order_date, input.expected_delivery ?? null,
      totalTaxable, totalCgst, totalSgst, totalIgst, totalAmount,
      'draft', input.notes ?? null, input.created_by,
    );

    const poId = Number(po.lastInsertRowid);

    for (const item of poItems) {
      db.prepare(`
        INSERT INTO po_items
          (po_id, medicine_id, medicine_name, hsn_code, ordered_qty, received_qty,
           free_qty, unit_price, gst_rate, taxable_amount, cgst_amount, sgst_amount,
           igst_amount, total_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        poId, item.medicine_id, item.medicine_name, item.hsn_code,
        item.ordered_qty, item.received_qty, item.free_qty, item.unit_price,
        item.gst_rate, item.taxable_amount, item.cgst_amount, item.sgst_amount,
        item.igst_amount, item.total_amount,
      );
    }

    return getPOById(db, poId);
  })();
}

// ─── Receive GRN (partial receipt allowed) ───────────────────────────────────

export function receivePurchaseOrder(
  db: DB,
  input: {
    po_id: number;
    supplier_invoice_number?: string;
    receipt_date: string;
    items: Array<{
      po_item_id: number;
      batch_number: string;
      expiry_date: string;
      received_qty: number;
      free_qty: number;
      unit_price: number;
      reorder_level: number;
    }>;
    notes?: string;
    created_by: number;
  },
): PurchaseReceiptWithItems {
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(input.po_id) as any;
  if (!po) throw new Error(`PO ${input.po_id} not found`);
  if (po.status === 'cancelled') throw new Error('Cannot receive a cancelled PO');

  const grnItems = [];
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalAmount = 0;

  for (const lineInput of input.items) {
    const poItem = db.prepare('SELECT * FROM po_items WHERE id = ?').get(lineInput.po_item_id) as any;
    if (!poItem) throw new Error(`PO item ${lineInput.po_item_id} not found`);

    const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(poItem.medicine_id) as any;
    const gst = calculateGST(
      lineInput.unit_price, lineInput.received_qty, 0, poItem.gst_rate, po.supply_type,
    );

    grnItems.push({
      po_item_id:     lineInput.po_item_id,
      medicine_id:    poItem.medicine_id,
      medicine_name:  med?.name ?? poItem.medicine_name,
      batch_number:   lineInput.batch_number,
      expiry_date:    lineInput.expiry_date,
      ordered_qty:    poItem.ordered_qty,
      received_qty:   lineInput.received_qty,
      free_qty:       lineInput.free_qty,
      unit_price:     lineInput.unit_price,
      gst_rate:       poItem.gst_rate,
      taxable_amount: gst.taxable_amount,
      cgst_amount:    gst.cgst_amount,
      sgst_amount:    gst.sgst_amount,
      igst_amount:    gst.igst_amount,
      total_amount:   gst.total_amount,
      reorder_level:  lineInput.reorder_level,
    });

    totalTaxable = round2(totalTaxable + gst.taxable_amount);
    totalCgst    = round2(totalCgst    + gst.cgst_amount);
    totalSgst    = round2(totalSgst    + gst.sgst_amount);
    totalIgst    = round2(totalIgst    + gst.igst_amount);
    totalAmount  = round2(totalAmount  + gst.total_amount);
  }

  const receiptNumber = generateReceiptNumber(db);

  return db.transaction(() => {
    const rcpt = db.prepare(`
      INSERT INTO purchase_receipts
        (receipt_number, po_id, po_number, supplier_id, supplier_name,
         supplier_invoice_number, receipt_date,
         taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount,
         notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      receiptNumber, input.po_id, po.po_number, po.supplier_id, po.supplier_name,
      input.supplier_invoice_number ?? null, input.receipt_date,
      totalTaxable, totalCgst, totalSgst, totalIgst, totalAmount,
      input.notes ?? null, input.created_by,
    );

    const receiptId = Number(rcpt.lastInsertRowid);

    for (const item of grnItems) {
      db.prepare(`
        INSERT INTO receipt_items
          (receipt_id, po_item_id, medicine_id, medicine_name, batch_number, expiry_date,
           ordered_qty, received_qty, free_qty, unit_price, gst_rate,
           taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, reorder_level)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        receiptId, item.po_item_id, item.medicine_id, item.medicine_name,
        item.batch_number, item.expiry_date,
        item.ordered_qty, item.received_qty, item.free_qty, item.unit_price, item.gst_rate,
        item.taxable_amount, item.cgst_amount, item.sgst_amount, item.igst_amount,
        item.total_amount, item.reorder_level,
      );

      // Update PO item received_qty
      db.prepare(`
        UPDATE po_items SET received_qty = received_qty + ? WHERE id = ?
      `).run(item.received_qty + item.free_qty, item.po_item_id);

      // Create/update batch and record stock movement
      const totalQtyReceived = item.received_qty + item.free_qty;
      const batchId = createBatch(db, {
        medicine_id:    item.medicine_id,
        batch_number:   item.batch_number,
        expiry_date:    item.expiry_date,
        purchase_price: item.unit_price,
        mrp:            item.unit_price, // will be updated from medicine
        quantity:       totalQtyReceived,
        reorder_level:  item.reorder_level,
        created_by:     input.created_by,
      });

      // Override the movement type/reference for GRN context
      db.prepare(`
        UPDATE stock_movements
        SET movement_type = 'purchase', reference_type = 'purchase_receipt',
            reference_id = ?, reference_number = ?
        WHERE batch_id = ? AND created_by = ?
        ORDER BY id DESC LIMIT 1
      `).run(receiptId, receiptNumber, batchId, input.created_by);
    }

    // Check if all PO items are fully received → update PO status
    const poItems = db.prepare('SELECT ordered_qty, received_qty FROM po_items WHERE po_id = ?')
      .all(input.po_id) as any[];
    const allReceived = poItems.every(i => i.received_qty >= i.ordered_qty);
    const anyReceived = poItems.some(i => i.received_qty > 0);

    const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : po.status;
    db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(newStatus, input.po_id);

    // Add supplier outstanding (accounts payable)
    db.prepare(`
      UPDATE suppliers SET outstanding = outstanding + ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).run(totalAmount, po.supplier_id);

    // Ledger entry
    addLedgerEntry(db, {
      entity_type:      'supplier',
      entity_id:        po.supplier_id,
      entry_date:       input.receipt_date,
      reference_type:   'purchase_receipt',
      reference_id:     receiptId,
      reference_number: receiptNumber,
      debit:            totalAmount,
      credit:           0,
      narration:        `GRN ${receiptNumber} for PO ${po.po_number}`,
    });

    return getReceiptById(db, receiptId);
  })();
}

// ─── Supplier payment ─────────────────────────────────────────────────────────

export function recordSupplierPayment(
  db: DB,
  input: {
    supplier_id: number;
    payment_date: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    created_by: number;
  },
): number {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(input.supplier_id) as any;
  if (!supplier) throw new Error(`Supplier ${input.supplier_id} not found`);
  if (input.amount > supplier.outstanding) {
    throw new Error(
      `Payment (₹${input.amount}) exceeds outstanding (₹${supplier.outstanding}) for ${supplier.name}`
    );
  }

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO supplier_payments
        (supplier_id, supplier_name, payment_date, amount, method, reference, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      input.supplier_id, supplier.name, input.payment_date,
      input.amount, input.method, input.reference ?? null, input.notes ?? null, input.created_by,
    );

    const paymentId = Number(result.lastInsertRowid);

    db.prepare(`
      UPDATE suppliers
      SET outstanding = MAX(0, outstanding - ?), updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(input.amount, input.supplier_id);

    addLedgerEntry(db, {
      entity_type:      'supplier',
      entity_id:        input.supplier_id,
      entry_date:       input.payment_date,
      reference_type:   'payment',
      reference_id:     paymentId,
      reference_number: `PAY-${paymentId}`,
      debit:            0,
      credit:           input.amount,
      narration:        `Payment to ${supplier.name} via ${input.method}`,
    });

    return paymentId;
  })();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getPOById(db: DB, poId: number): PurchaseOrderWithItems {
  const po    = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId) as any;
  if (!po) throw new Error(`PO ${poId} not found`);
  const items = db.prepare('SELECT * FROM po_items WHERE po_id = ?').all(poId) as any[];
  return { ...po, items };
}

export function getReceiptById(db: DB, receiptId: number): PurchaseReceiptWithItems {
  const receipt = db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').get(receiptId) as any;
  if (!receipt) throw new Error(`Receipt ${receiptId} not found`);
  const items   = db.prepare('SELECT * FROM receipt_items WHERE receipt_id = ?').all(receiptId) as any[];
  return { ...receipt, items };
}

export function getPOList(
  db: DB,
  opts: { supplierId?: number; status?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number },
): { rows: any[]; total: number } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.supplierId) { conditions.push('supplier_id = ?'); params.push(opts.supplierId); }
  if (opts.status)     { conditions.push('status = ?');      params.push(opts.status);     }
  if (opts.fromDate)   { conditions.push('order_date >= ?'); params.push(opts.fromDate);   }
  if (opts.toDate)     { conditions.push('order_date <= ?'); params.push(opts.toDate);     }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const total = (db.prepare(`SELECT COUNT(*) as c FROM purchase_orders ${where}`).get(...params) as any).c;
  const rows  = db.prepare(`
    SELECT * FROM purchase_orders ${where} ORDER BY order_date DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { rows, total };
}

export function getSupplierPayments(db: DB, supplierId: number): any[] {
  return db.prepare(`
    SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY payment_date DESC
  `).all(supplierId);
}

// ─── Number generators ────────────────────────────────────────────────────────

function generatePONumber(db: DB): string {
  const prefix = (db.prepare("SELECT value FROM settings WHERE key='po_prefix'").get() as any)?.value ?? 'PO';
  const last   = db.prepare(
    `SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`) as any;

  if (!last) return `${prefix}00001`;
  const num = parseInt(last.po_number.replace(prefix, '')) + 1;
  return `${prefix}${String(num).padStart(5, '0')}`;
}

function generateReceiptNumber(db: DB): string {
  const last = db.prepare(
    `SELECT receipt_number FROM purchase_receipts ORDER BY id DESC LIMIT 1`
  ).get() as any;
  if (!last) return 'GRN00001';
  const num = parseInt(last.receipt_number.replace('GRN', '')) + 1;
  return `GRN${String(num).padStart(5, '0')}`;
}
