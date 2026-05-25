import type { DB } from '../db/index.js';
import type { LedgerEntity } from '../types/index.js';

export function addLedgerEntry(
  db: DB,
  opts: {
    entity_type: LedgerEntity;
    entity_id: number;
    entry_date: string;
    reference_type: string;
    reference_id: number;
    reference_number: string;
    debit: number;
    credit: number;
    narration: string;
  },
): void {
  const last = db.prepare(`
    SELECT balance FROM ledger_entries
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(opts.entity_type, opts.entity_id) as any;

  const prevBalance = last?.balance ?? 0;
  const balance = round2(prevBalance + opts.debit - opts.credit);

  db.prepare(`
    INSERT INTO ledger_entries
      (entity_type, entity_id, entry_date, reference_type, reference_id,
       reference_number, debit, credit, balance, narration)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    opts.entity_type, opts.entity_id, opts.entry_date,
    opts.reference_type, opts.reference_id, opts.reference_number,
    round2(opts.debit), round2(opts.credit), balance, opts.narration,
  );
}

export function getLedger(
  db: DB,
  entityType: LedgerEntity,
  entityId: number,
  fromDate?: string,
  toDate?: string,
): { entries: any[]; openingBalance: number; closingBalance: number } {
  if (!fromDate && !toDate) {
    const entries = db.prepare(`
      SELECT * FROM ledger_entries
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY entry_date ASC, id ASC
    `).all(entityType, entityId) as any[];
    const closing = entries[entries.length - 1]?.balance ?? 0;
    return { entries, openingBalance: 0, closingBalance: closing };
  }

  // Opening balance = sum of all entries BEFORE fromDate
  const openingRow = db.prepare(`
    SELECT COALESCE(SUM(debit - credit), 0) as balance
    FROM ledger_entries
    WHERE entity_type = ? AND entity_id = ? AND entry_date < ?
  `).get(entityType, entityId, fromDate) as any;

  const openingBalance = round2(openingRow?.balance ?? 0);

  const conditions = ['entity_type = ?', 'entity_id = ?'];
  const params: any[] = [entityType, entityId];
  if (fromDate) { conditions.push('entry_date >= ?'); params.push(fromDate); }
  if (toDate)   { conditions.push('entry_date <= ?'); params.push(toDate);   }

  const entries = db.prepare(`
    SELECT * FROM ledger_entries
    WHERE ${conditions.join(' AND ')}
    ORDER BY entry_date ASC, id ASC
  `).all(...params) as any[];

  const periodNet  = entries.reduce((s, e) => s + e.debit - e.credit, 0);
  const closingBalance = round2(openingBalance + periodNet);

  return { entries, openingBalance, closingBalance };
}

export function getCustomerOutstanding(db: DB): any[] {
  return db.prepare(`
    SELECT c.id, c.name, c.phone,
      c.credit_limit, c.credit_used,
      (c.credit_limit - c.credit_used) as available_credit,
      COALESCE(SUM(i.total_amount - i.paid_amount), 0) as invoice_outstanding
    FROM customers c
    LEFT JOIN invoices i ON i.customer_id = c.id AND i.status IN ('partial','paid')
      AND i.payment_method = 'credit'
    WHERE c.is_active = 1
    GROUP BY c.id
    HAVING credit_used > 0
    ORDER BY credit_used DESC
  `).all();
}

export function getSupplierOutstanding(db: DB): any[] {
  return db.prepare(`
    SELECT s.id, s.name, s.phone,
      s.outstanding,
      COALESCE(SUM(sp.amount), 0) as total_paid,
      s.credit_days
    FROM suppliers s
    LEFT JOIN supplier_payments sp ON sp.supplier_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    HAVING s.outstanding > 0
    ORDER BY s.outstanding DESC
  `).all();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
