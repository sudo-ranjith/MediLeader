import type { DB } from '../db/index.js';
import type { CreateReturnInput, ReturnWithItems, ReturnItem, SupplyType } from '../types/index.js';
import { calculateGST } from './gst.service.js';
import { recordMovement } from './stock.service.js';
import { addLedgerEntry } from './ledger.service.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function createReturn(db: DB, input: CreateReturnInput): ReturnWithItems {
  // Determine supply type from original invoice (if available)
  let supplyType: SupplyType = 'intrastate';
  let invoiceNumber: string | undefined;

  if (input.invoice_id) {
    const inv = db.prepare('SELECT supply_type, invoice_number FROM invoices WHERE id = ?')
      .get(input.invoice_id) as any;
    if (inv) {
      supplyType    = inv.supply_type;
      invoiceNumber = inv.invoice_number;
    }
  }

  // ── Build return items with GST calculation ───────────────────────────────
  const resolvedItems: ReturnItem[] = [];

  for (const lineInput of input.items) {
    const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(lineInput.medicine_id) as any;
    if (!medicine) throw new Error(`Medicine ${lineInput.medicine_id} not found`);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(lineInput.batch_id) as any;
    if (!batch) throw new Error(`Batch ${lineInput.batch_id} not found`);

    // For returns, validate against original sold quantity if invoice_item_id given
    if (lineInput.invoice_item_id) {
      const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?')
        .get(lineInput.invoice_item_id) as any;
      if (invItem && lineInput.quantity > invItem.quantity) {
        throw new Error(
          `Cannot return more than sold quantity for ${medicine.name}. Sold: ${invItem.quantity}, Returning: ${lineInput.quantity}`
        );
      }
    }

    const gst = calculateGST(
      lineInput.unit_price, lineInput.quantity, lineInput.discount_pct,
      medicine.gst_rate, supplyType,
    );

    resolvedItems.push({
      invoice_item_id: lineInput.invoice_item_id,
      medicine_id:    lineInput.medicine_id,
      medicine_name:  medicine.name,
      batch_id:       lineInput.batch_id,
      batch_number:   batch.batch_number,
      hsn_code:       medicine.hsn_code,
      quantity:       lineInput.quantity,
      unit_price:     lineInput.unit_price,
      discount_pct:   lineInput.discount_pct,
      taxable_amount: gst.taxable_amount,
      gst_rate:       medicine.gst_rate,
      cgst_rate:      gst.cgst_rate,
      sgst_rate:      gst.sgst_rate,
      igst_rate:      gst.igst_rate,
      cgst_amount:    gst.cgst_amount,
      sgst_amount:    gst.sgst_amount,
      igst_amount:    gst.igst_amount,
      total_amount:   gst.total_amount,
      reason:         lineInput.reason,
    });
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const taxableAmount = round2(resolvedItems.reduce((s, i) => s + i.taxable_amount, 0));
  const cgstAmount    = round2(resolvedItems.reduce((s, i) => s + i.cgst_amount, 0));
  const sgstAmount    = round2(resolvedItems.reduce((s, i) => s + i.sgst_amount, 0));
  const igstAmount    = round2(resolvedItems.reduce((s, i) => s + i.igst_amount, 0));
  const totalGst      = round2(cgstAmount + sgstAmount + igstAmount);
  const totalAmount   = round2(taxableAmount + totalGst);

  // ── Generate return number ────────────────────────────────────────────────
  const returnNumber = generateReturnNumber(db);

  // ── Persist in transaction ────────────────────────────────────────────────
  const result = db.transaction(() => {
    const ret = db.prepare(`
      INSERT INTO returns
        (return_number, invoice_id, invoice_number, customer_id, customer_name,
         return_type, return_date, taxable_amount, cgst_amount, sgst_amount,
         igst_amount, total_gst, total_amount, credit_note_issued, notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      returnNumber,
      input.invoice_id ?? null,
      invoiceNumber ?? null,
      input.customer_id ?? null,
      input.customer_name,
      input.return_type,
      input.return_date,
      taxableAmount, cgstAmount, sgstAmount, igstAmount, totalGst, totalAmount,
      1, // credit_note_issued = true
      input.notes ?? null,
      input.created_by,
    );

    const returnId = Number(ret.lastInsertRowid);

    // Insert return items and restore stock
    for (const item of resolvedItems) {
      db.prepare(`
        INSERT INTO return_items
          (return_id, invoice_item_id, medicine_id, medicine_name, batch_id,
           batch_number, hsn_code, quantity, unit_price, discount_pct,
           taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate,
           cgst_amount, sgst_amount, igst_amount, total_amount, reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        returnId,
        item.invoice_item_id ?? null,
        item.medicine_id, item.medicine_name,
        item.batch_id, item.batch_number, item.hsn_code,
        item.quantity, item.unit_price, item.discount_pct,
        item.taxable_amount, item.gst_rate,
        item.cgst_rate, item.sgst_rate, item.igst_rate,
        item.cgst_amount, item.sgst_amount, item.igst_amount,
        item.total_amount, item.reason ?? null,
      );

      // Restore stock (return_in movement)
      recordMovement(db, {
        batch_id:        item.batch_id,
        medicine_id:     item.medicine_id,
        movement_type:   'return_in',
        quantity:        item.quantity, // positive = stock restored
        reference_type:  'return',
        reference_id:    returnId,
        reference_number: returnNumber,
        remarks:         `Return: ${item.reason ?? input.return_type}`,
        created_by:      input.created_by,
      });
    }

    // Reduce customer credit_used if original was a credit sale
    if (input.customer_id && input.invoice_id) {
      const inv = db.prepare('SELECT payment_method FROM invoices WHERE id = ?').get(input.invoice_id) as any;
      if (inv?.payment_method === 'credit') {
        db.prepare(`
          UPDATE customers
          SET credit_used = MAX(0, credit_used - ?), updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(totalAmount, input.customer_id);
      }
    }

    // Ledger entry — credit to customer (reducing what they owe)
    if (input.customer_id) {
      addLedgerEntry(db, {
        entity_type:      'customer',
        entity_id:        input.customer_id,
        entry_date:       input.return_date,
        reference_type:   'return',
        reference_id:     returnId,
        reference_number: returnNumber,
        debit:            0,
        credit:           totalAmount,
        narration:        `Credit note ${returnNumber} against ${invoiceNumber ?? 'direct return'}`,
      });
    }

    return returnId;
  })();

  return getReturnById(db, result);
}

export function getReturnById(db: DB, returnId: number): ReturnWithItems {
  const ret   = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as any;
  if (!ret) throw new Error(`Return ${returnId} not found`);
  const items = db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(returnId) as ReturnItem[];
  return { ...ret, items };
}

export function getReturnList(
  db: DB,
  opts: { fromDate?: string; toDate?: string; customerId?: number; limit?: number; offset?: number },
): { rows: any[]; total: number } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.fromDate)   { conditions.push('return_date >= ?');  params.push(opts.fromDate);   }
  if (opts.toDate)     { conditions.push('return_date <= ?');  params.push(opts.toDate);     }
  if (opts.customerId) { conditions.push('customer_id = ?');   params.push(opts.customerId); }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const total = (db.prepare(`SELECT COUNT(*) as c FROM returns ${where}`).get(...params) as any).c;
  const rows  = db.prepare(`SELECT * FROM returns ${where} ORDER BY return_date DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return { rows, total };
}

// ─── Return number generation ─────────────────────────────────────────────────

function generateReturnNumber(db: DB): string {
  const prefix = (db.prepare("SELECT value FROM settings WHERE key='return_prefix'").get() as any)?.value ?? 'RET';
  const last   = db.prepare(
    `SELECT return_number FROM returns WHERE return_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`) as any;

  if (!last) return `${prefix}00001`;
  const num = parseInt(last.return_number.replace(prefix, '')) + 1;
  return `${prefix}${String(num).padStart(5, '0')}`;
}
