import type { DB } from '../db/index.js';
import type {
  CreateInvoiceInput, InvoiceWithItems, InvoiceItem, SupplyType,
} from '../types/index.js';
import { calculateGST, computeInvoiceGSTSummary } from './gst.service.js';
import { getFEFOBatches, recordMovement } from './stock.service.js';
import { addLedgerEntry } from './ledger.service.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function createInvoice(db: DB, input: CreateInvoiceInput): InvoiceWithItems {
  // Validate credit limit for credit sales
  if (input.payment_method === 'credit' && input.customer_id) {
    const customer = db.prepare('SELECT credit_limit, credit_used, name FROM customers WHERE id = ?')
      .get(input.customer_id) as any;
    if (customer) {
      const available = customer.credit_limit - customer.credit_used;
      // We'll compute total below; for now pre-check with a rough estimate
      if (customer.credit_limit > 0 && available <= 0) {
        throw new Error(
          `Credit limit exceeded for ${customer.name}. Available: ₹${available.toFixed(2)}`
        );
      }
    }
  }

  // ── Resolve items with FEFO batch picking ────────────────────────────────
  const resolvedItems: InvoiceItem[] = [];
  const supplyType: SupplyType = input.supply_type;

  for (const lineInput of input.items) {
    const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(lineInput.medicine_id) as any;
    if (!medicine) throw new Error(`Medicine ${lineInput.medicine_id} not found`);

    // FEFO: if batch_id provided use it; otherwise auto-pick
    if (lineInput.batch_id) {
      const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(lineInput.batch_id) as any;
      if (!batch) throw new Error(`Batch ${lineInput.batch_id} not found`);
      if (batch.quantity < lineInput.quantity) {
        throw new Error(
          `Insufficient qty for ${medicine.name} batch ${batch.batch_number}. Have ${batch.quantity}, need ${lineInput.quantity}`
        );
      }

      const gst = calculateGST(
        lineInput.unit_price, lineInput.quantity, lineInput.discount_pct,
        medicine.gst_rate, supplyType,
      );
      resolvedItems.push({
        medicine_id:    lineInput.medicine_id,
        medicine_name:  medicine.name,
        batch_id:       lineInput.batch_id,
        batch_number:   batch.batch_number,
        hsn_code:       medicine.hsn_code,
        quantity:       lineInput.quantity,
        unit:           medicine.unit,
        mrp:            batch.mrp,
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
      });
    } else {
      // FEFO auto-pick — may split across multiple batches
      const fefoBatches = getFEFOBatches(db, lineInput.medicine_id, lineInput.quantity);
      const totalAvailable = fefoBatches.reduce((s, b) => s + b.quantity, 0);

      if (totalAvailable < lineInput.quantity) {
        throw new Error(
          `Insufficient stock for ${medicine.name}. Available: ${totalAvailable}, Required: ${lineInput.quantity}`
        );
      }

      for (const batchAlloc of fefoBatches) {
        const gst = calculateGST(
          lineInput.unit_price, batchAlloc.quantity, lineInput.discount_pct,
          medicine.gst_rate, supplyType,
        );
        resolvedItems.push({
          medicine_id:    lineInput.medicine_id,
          medicine_name:  medicine.name,
          batch_id:       batchAlloc.batch_id,
          batch_number:   batchAlloc.batch_number,
          hsn_code:       medicine.hsn_code,
          quantity:       batchAlloc.quantity,
          unit:           medicine.unit,
          mrp:            lineInput.unit_price, // use mrp from medicine for display
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
        });
      }
    }
  }

  // ── Calculate invoice totals ──────────────────────────────────────────────
  const subtotal        = round2(resolvedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0));
  const taxableAmount   = round2(resolvedItems.reduce((s, i) => s + i.taxable_amount, 0));
  const cgstAmount      = round2(resolvedItems.reduce((s, i) => s + i.cgst_amount, 0));
  const sgstAmount      = round2(resolvedItems.reduce((s, i) => s + i.sgst_amount, 0));
  const igstAmount      = round2(resolvedItems.reduce((s, i) => s + i.igst_amount, 0));
  const totalGst        = round2(cgstAmount + sgstAmount + igstAmount);
  const preRound        = round2(taxableAmount + totalGst - input.discount_amount);
  const roundOff        = round2(Math.round(preRound) - preRound);
  const totalAmount     = round2(preRound + roundOff);
  const paidAmount      = input.paid_amount > totalAmount ? totalAmount : input.paid_amount;

  // Re-validate credit limit with actual total
  if (input.payment_method === 'credit' && input.customer_id) {
    const customer = db.prepare('SELECT credit_limit, credit_used, name FROM customers WHERE id = ?')
      .get(input.customer_id) as any;
    if (customer && customer.credit_limit > 0) {
      const available = customer.credit_limit - customer.credit_used;
      if (totalAmount > available) {
        throw new Error(
          `Credit limit exceeded for ${customer.name}. Available: ₹${available.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`
        );
      }
    }
  }

  const status = paidAmount >= totalAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'paid';

  // ── Generate invoice number ───────────────────────────────────────────────
  const invoiceNumber = generateInvoiceNumber(db);

  // ── Persist everything in a single transaction ────────────────────────────
  const result = db.transaction(() => {
    // Insert invoice header
    const inv = db.prepare(`
      INSERT INTO invoices
        (invoice_number, customer_id, customer_name, customer_gstin,
         customer_state_code, supply_type, invoice_date, due_date,
         subtotal, discount_amount, taxable_amount,
         cgst_amount, sgst_amount, igst_amount, total_gst,
         round_off, total_amount, paid_amount, payment_method, status,
         notes, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      invoiceNumber,
      input.customer_id ?? null,
      input.customer_name,
      input.customer_gstin ?? null,
      input.customer_state_code ?? '33',
      supplyType,
      input.invoice_date,
      null,
      subtotal,
      input.discount_amount,
      taxableAmount,
      cgstAmount, sgstAmount, igstAmount, totalGst,
      roundOff, totalAmount, paidAmount,
      input.payment_method,
      status,
      input.notes ?? null,
      input.created_by,
    );

    const invoiceId = Number(inv.lastInsertRowid);

    // Insert items + deduct stock
    for (const item of resolvedItems) {
      db.prepare(`
        INSERT INTO invoice_items
          (invoice_id, medicine_id, medicine_name, batch_id, batch_number,
           hsn_code, quantity, unit, mrp, unit_price, discount_pct,
           taxable_amount, gst_rate, cgst_rate, sgst_rate, igst_rate,
           cgst_amount, sgst_amount, igst_amount, total_amount)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        invoiceId, item.medicine_id, item.medicine_name, item.batch_id, item.batch_number,
        item.hsn_code, item.quantity, item.unit, item.mrp, item.unit_price, item.discount_pct,
        item.taxable_amount, item.gst_rate, item.cgst_rate, item.sgst_rate, item.igst_rate,
        item.cgst_amount, item.sgst_amount, item.igst_amount, item.total_amount,
      );

      // Deduct stock via movement
      recordMovement(db, {
        batch_id:        item.batch_id,
        medicine_id:     item.medicine_id,
        movement_type:   'sale',
        quantity:        -item.quantity,
        reference_type:  'invoice',
        reference_id:    invoiceId,
        reference_number: invoiceNumber,
        created_by:      input.created_by,
      });
    }

    // Update customer credit if credit sale
    if (input.payment_method === 'credit' && input.customer_id) {
      db.prepare(`
        UPDATE customers
        SET credit_used = credit_used + ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(totalAmount, input.customer_id);

      addLedgerEntry(db, {
        entity_type:      'customer',
        entity_id:        input.customer_id,
        entry_date:       input.invoice_date,
        reference_type:   'invoice',
        reference_id:     invoiceId,
        reference_number: invoiceNumber,
        debit:            totalAmount,
        credit:           0,
        narration:        `Invoice ${invoiceNumber} - Credit sale`,
      });
    } else if (paidAmount > 0 && input.customer_id) {
      addLedgerEntry(db, {
        entity_type:      'customer',
        entity_id:        input.customer_id,
        entry_date:       input.invoice_date,
        reference_type:   'invoice',
        reference_id:     invoiceId,
        reference_number: invoiceNumber,
        debit:            totalAmount - paidAmount,
        credit:           paidAmount,
        narration:        `Invoice ${invoiceNumber} - ${input.payment_method} payment`,
      });
    }

    return invoiceId;
  })();

  return getInvoiceById(db, result);
}

export function getInvoiceById(db: DB, invoiceId: number): InvoiceWithItems {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  const items   = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId) as InvoiceItem[];
  return { ...invoice, items };
}

export function cancelInvoice(db: DB, invoiceId: number, userId: number): void {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  if (invoice.status === 'cancelled') throw new Error('Invoice is already cancelled');

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId) as any[];

  db.transaction(() => {
    // Restore stock
    for (const item of items) {
      recordMovement(db, {
        batch_id:        item.batch_id,
        medicine_id:     item.medicine_id,
        movement_type:   'return_in',
        quantity:        item.quantity,
        reference_type:  'invoice_cancel',
        reference_id:    invoiceId,
        reference_number: invoice.invoice_number,
        remarks:         'Invoice cancelled',
        created_by:      userId,
      });
    }

    // Reverse credit
    if (invoice.payment_method === 'credit' && invoice.customer_id) {
      db.prepare(`
        UPDATE customers
        SET credit_used = MAX(0, credit_used - ?), updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(invoice.total_amount, invoice.customer_id);
    }

    db.prepare(`UPDATE invoices SET status = 'cancelled', updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(invoiceId);
  })();
}

export function getInvoiceList(
  db: DB,
  opts: { fromDate?: string; toDate?: string; status?: string; customerId?: number; search?: string; limit?: number; offset?: number },
): { rows: any[]; total: number } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.fromDate)   { conditions.push('invoice_date >= ?'); params.push(opts.fromDate); }
  if (opts.toDate)     { conditions.push('invoice_date <= ?'); params.push(opts.toDate);   }
  if (opts.status)     { conditions.push('status = ?');        params.push(opts.status);   }
  if (opts.customerId) { conditions.push('customer_id = ?');   params.push(opts.customerId); }
  if (opts.search)     {
    const q = `%${opts.search}%`;
    conditions.push('(invoice_number LIKE ? OR customer_name LIKE ?)');
    params.push(q, q);
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const total = (db.prepare(`SELECT COUNT(*) as c FROM invoices ${where}`).get(...params) as any).c;
  const rows  = db.prepare(`SELECT * FROM invoices ${where} ORDER BY invoice_date DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return { rows, total };
}

// ─── Invoice number generation ────────────────────────────────────────────────

function generateInvoiceNumber(db: DB): string {
  const prefix = (db.prepare("SELECT value FROM settings WHERE key='invoice_prefix'").get() as any)?.value ?? 'INV';
  const last   = db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`) as any;

  if (!last) return `${prefix}00001`;
  const num = parseInt(last.invoice_number.replace(prefix, '')) + 1;
  return `${prefix}${String(num).padStart(5, '0')}`;
}
