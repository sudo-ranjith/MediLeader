import type { DB } from '../db/index.js';
import type {
  GSTBreakdown,
  InvoiceGSTSummary,
  SupplyType,
  GSTR1Data,
  GSTR1B2B,
  GSTR1B2CS,
  GSTR1B2CL,
  GSTR1CDNR,
  GSTR1CDNUR,
  GSTR1HSN,
  GSTR3BData,
  GSTR3BTaxAmt,
} from '../types/index.js';

// Tamil Nadu state code — used to determine intra vs interstate
const TN_STATE_CODE = '33';

// B2CL threshold: interstate B2C invoices above ₹2,50,000 reported separately
const B2CL_THRESHOLD = 250000;

// ─── Pure GST calculation helpers ────────────────────────────────────────────

export function calculateGST(
  unitPrice: number,
  quantity: number,
  discountPct: number,
  gstRate: number,
  supplyType: SupplyType,
): GSTBreakdown {
  const lineValue = unitPrice * quantity;
  const discountAmt = (lineValue * discountPct) / 100;
  const taxableAmount = round2(lineValue - discountAmt);

  const cgstRate = supplyType === 'intrastate' ? gstRate / 2 : 0;
  const sgstRate = supplyType === 'intrastate' ? gstRate / 2 : 0;
  const igstRate = supplyType === 'interstate' ? gstRate : 0;

  const cgstAmount = round2((taxableAmount * cgstRate) / 100);
  const sgstAmount = round2((taxableAmount * sgstRate) / 100);
  const igstAmount = round2((taxableAmount * igstRate) / 100);
  const totalGst = round2(cgstAmount + sgstAmount + igstAmount);

  return {
    taxable_amount: taxableAmount,
    gst_rate: gstRate,
    cgst_rate: cgstRate,
    sgst_rate: sgstRate,
    igst_rate: igstRate,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    total_gst: totalGst,
    total_amount: round2(taxableAmount + totalGst),
  };
}

export function computeInvoiceGSTSummary(
  items: Array<{
    gst_rate: number;
    hsn_code: string;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
  }>,
  supplyType: SupplyType,
): InvoiceGSTSummary {
  const byRate = new Map<number, {
    gst_rate: number;
    hsn_codes: Set<string>;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_gst: number;
  }>();

  for (const item of items) {
    const existing = byRate.get(item.gst_rate) ?? {
      gst_rate: item.gst_rate,
      hsn_codes: new Set<string>(),
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_gst: 0,
    };
    if (item.hsn_code) existing.hsn_codes.add(item.hsn_code);
    existing.taxable_amount = round2(existing.taxable_amount + item.taxable_amount);
    existing.cgst_amount    = round2(existing.cgst_amount    + item.cgst_amount);
    existing.sgst_amount    = round2(existing.sgst_amount    + item.sgst_amount);
    existing.igst_amount    = round2(existing.igst_amount    + item.igst_amount);
    existing.total_gst      = round2(existing.cgst_amount + existing.sgst_amount + existing.igst_amount);
    byRate.set(item.gst_rate, existing);
  }

  const byRateArr = Array.from(byRate.values()).map(r => ({
    ...r,
    hsn_codes: Array.from(r.hsn_codes),
  }));

  return {
    supply_type: supplyType,
    by_rate: byRateArr,
    total_taxable: round2(byRateArr.reduce((s, r) => s + r.taxable_amount, 0)),
    total_cgst:    round2(byRateArr.reduce((s, r) => s + r.cgst_amount, 0)),
    total_sgst:    round2(byRateArr.reduce((s, r) => s + r.sgst_amount, 0)),
    total_igst:    round2(byRateArr.reduce((s, r) => s + r.igst_amount, 0)),
    total_gst:     round2(byRateArr.reduce((s, r) => s + r.total_gst, 0)),
  };
}

// Determine supply type based on pharmacy state code vs customer state code
export function determineSupplyType(
  pharmacyStateCode: string,
  customerStateCode?: string,
): SupplyType {
  if (!customerStateCode || customerStateCode === pharmacyStateCode) return 'intrastate';
  return 'interstate';
}

// ─── GSTR-1 export ───────────────────────────────────────────────────────────

export function generateGSTR1(db: DB, period: string, gstin: string): GSTR1Data {
  // period = MMYYYY e.g. '042025'
  const month = period.substring(0, 2);
  const year  = period.substring(2);
  const fromDate = `${year}-${month}-01`;
  const toDate   = lastDayOfMonth(year, month);

  // Fetch all paid invoices in period with items
  const invoices = db.prepare(`
    SELECT i.*, c.gst_number as c_gstin, c.state_code as c_state_code
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status IN ('paid','partial')
    ORDER BY i.invoice_date
  `).all(fromDate, toDate) as any[];

  const invoiceItems = new Map<number, any[]>();
  if (invoices.length > 0) {
    const ids = invoices.map(i => i.id);
    const items = db.prepare(
      `SELECT * FROM invoice_items WHERE invoice_id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids) as any[];
    for (const item of items) {
      if (!invoiceItems.has(item.invoice_id)) invoiceItems.set(item.invoice_id, []);
      invoiceItems.get(item.invoice_id)!.push(item);
    }
  }

  // Fetch credit notes (returns) in period
  const returns = db.prepare(`
    SELECT r.*, c.gst_number as c_gstin
    FROM returns r
    LEFT JOIN customers c ON c.id = r.customer_id
    WHERE r.return_date BETWEEN ? AND ?
    ORDER BY r.return_date
  `).all(fromDate, toDate) as any[];

  const returnItems = new Map<number, any[]>();
  if (returns.length > 0) {
    const ids = returns.map(r => r.id);
    const items = db.prepare(
      `SELECT * FROM return_items WHERE return_id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids) as any[];
    for (const item of items) {
      if (!returnItems.has(item.return_id)) returnItems.set(item.return_id, []);
      returnItems.get(item.return_id)!.push(item);
    }
  }

  // Build GSTR-1 sections
  const b2b: GSTR1B2B[] = [];
  const b2csByKey = new Map<string, GSTR1B2CS>();
  const b2cl: GSTR1B2CL[] = [];
  const cdnr: GSTR1CDNR[] = [];
  const cdnur: GSTR1CDNUR[] = [];
  const hsnAccum = new Map<string, {
    desc: string; qty: number; val: number;
    txval: number; iamt: number; camt: number; samt: number;
  }>();

  // ── B2B & B2C invoices ────────────────────────────────────────────────────
  for (const inv of invoices) {
    const items = invoiceItems.get(inv.id) ?? [];
    const custGstin = inv.customer_gstin || inv.c_gstin;
    const custStateCode = inv.customer_state_code || inv.c_state_code || TN_STATE_CODE;
    const isB2B = Boolean(custGstin);
    const isInterstate = inv.supply_type === 'interstate';

    // Accumulate HSN data
    for (const item of items) {
      accumulateHSN(hsnAccum, item);
    }

    const invoiceLineItems = items.map((item, idx) => ({
      num: idx + 1,
      itm_det: {
        rt:    item.gst_rate,
        txval: round2(item.taxable_amount),
        iamt:  round2(item.igst_amount),
        camt:  round2(item.cgst_amount),
        samt:  round2(item.sgst_amount),
        csamt: 0,
      },
    }));

    if (isB2B) {
      // B2B — GST registered buyer
      const existing = b2b.find(b => b.ctin === custGstin);
      const invoiceEntry = {
        inum:    inv.invoice_number,
        idt:     formatGSTDate(inv.invoice_date),
        val:     round2(inv.total_amount),
        pos:     custStateCode,
        rchrg:   'N' as const,
        inv_typ: 'R',
        itms:    invoiceLineItems,
      };
      if (existing) {
        existing.inv.push(invoiceEntry);
      } else {
        b2b.push({ ctin: custGstin, inv: [invoiceEntry] });
      }
    } else if (isInterstate && inv.total_amount > B2CL_THRESHOLD) {
      // B2CL — large interstate unregistered
      const existing = b2cl.find(b => b.pos === custStateCode);
      const entry = {
        inum: inv.invoice_number,
        idt:  formatGSTDate(inv.invoice_date),
        val:  round2(inv.total_amount),
        itms: invoiceLineItems,
      };
      if (existing) {
        existing.inv.push(entry);
      } else {
        b2cl.push({ pos: custStateCode, inv: [entry] });
      }
    } else {
      // B2CS — small/intrastate unregistered
      for (const item of items) {
        const key = `${inv.supply_type}|${custStateCode}|${item.gst_rate}`;
        const ex = b2csByKey.get(key) ?? {
          sply_tp: isInterstate ? 'INTER' : 'INTRA',
          pos:     custStateCode,
          rt:      item.gst_rate,
          txval:   0,
          iamt:    0,
          camt:    0,
          samt:    0,
          csamt:   0,
        };
        ex.txval = round2(ex.txval + item.taxable_amount);
        ex.iamt  = round2(ex.iamt  + item.igst_amount);
        ex.camt  = round2(ex.camt  + item.cgst_amount);
        ex.samt  = round2(ex.samt  + item.sgst_amount);
        b2csByKey.set(key, ex);
      }
    }
  }

  // ── Credit/Debit notes ────────────────────────────────────────────────────
  for (const ret of returns) {
    const items = returnItems.get(ret.id) ?? [];
    const custGstin = ret.customer_gstin || ret.c_gstin;

    for (const item of items) {
      accumulateHSN(hsnAccum, item, true);
    }

    const lineItems = items.map((item, idx) => ({
      num: idx + 1,
      itm_det: {
        rt:    item.gst_rate,
        txval: round2(item.taxable_amount),
        iamt:  round2(item.igst_amount),
        camt:  round2(item.cgst_amount),
        samt:  round2(item.sgst_amount),
        csamt: 0,
      },
    }));

    if (custGstin) {
      const existing = cdnr.find(c => c.ctin === custGstin);
      const entry = {
        ntty:   'C' as const,
        nt_num: ret.return_number,
        nt_dt:  formatGSTDate(ret.return_date),
        val:    round2(ret.total_amount),
        itms:   lineItems,
      };
      if (existing) {
        existing.nt.push(entry);
      } else {
        cdnr.push({ ctin: custGstin, nt: [entry] });
      }
    } else {
      cdnur.push({
        ntty:   'C',
        nt_num: ret.return_number,
        nt_dt:  formatGSTDate(ret.return_date),
        typ:    'B2CL',
        val:    round2(ret.total_amount),
        itms:   lineItems,
      });
    }
  }

  // ── HSN summary ───────────────────────────────────────────────────────────
  const hsnData: GSTR1HSN[] = Array.from(hsnAccum.entries()).map(([hsn, data], idx) => ({
    num:    idx + 1,
    hsn_sc: hsn,
    desc:   data.desc,
    uqc:    'NOS',
    qty:    data.qty,
    val:    round2(data.val),
    txval:  round2(data.txval),
    iamt:   round2(data.iamt),
    camt:   round2(data.camt),
    samt:   round2(data.samt),
    csamt:  0,
  }));

  // ── Document issue details ────────────────────────────────────────────────
  const firstInvNum = invoices[0]?.invoice_number ?? `INV00001`;
  const lastInvNum  = invoices[invoices.length - 1]?.invoice_number ?? firstInvNum;
  const docIssue = {
    doc_det: [
      {
        doc_num: 1,
        docs: [{
          num:       1,
          from:      firstInvNum,
          to:        lastInvNum,
          totnum:    invoices.length,
          cancel:    0,
          net_issue: invoices.length,
        }],
      },
    ],
  };

  return {
    gstin,
    fp: period,
    b2b,
    b2cs: Array.from(b2csByKey.values()),
    b2cl,
    cdnr,
    cdnur,
    hsn: { data: hsnData },
    doc_issue: docIssue,
  };
}

// ─── GSTR-3B export ──────────────────────────────────────────────────────────

export function generateGSTR3B(db: DB, period: string, gstin: string): GSTR3BData {
  const month    = period.substring(0, 2);
  const year     = period.substring(2);
  const fromDate = `${year}-${month}-01`;
  const toDate   = lastDayOfMonth(year, month);

  // Aggregate outward supplies
  const outward = db.prepare(`
    SELECT
      supply_type,
      SUM(taxable_amount) as taxable_amount,
      SUM(cgst_amount)    as cgst_amount,
      SUM(sgst_amount)    as sgst_amount,
      SUM(igst_amount)    as igst_amount
    FROM invoices
    WHERE invoice_date BETWEEN ? AND ?
      AND status IN ('paid','partial')
    GROUP BY supply_type
  `).all(fromDate, toDate) as any[];

  let osupDet: GSTR3BTaxAmt = zeroBucket();
  const interUnreg: Array<{ pos: string; txval: number; iamt: number }> = [];

  for (const row of outward) {
    osupDet.txval = round2(osupDet.txval + row.taxable_amount);
    osupDet.camt  = round2(osupDet.camt  + row.cgst_amount);
    osupDet.samt  = round2(osupDet.samt  + row.sgst_amount);
    osupDet.iamt  = round2(osupDet.iamt  + row.igst_amount);
  }

  // Aggregate inward (purchase receipts) for ITC
  const inward = db.prepare(`
    SELECT
      pr.supplier_id,
      s.state_code,
      SUM(pr.taxable_amount) as taxable_amount,
      SUM(pr.cgst_amount)    as cgst_amount,
      SUM(pr.sgst_amount)    as sgst_amount,
      SUM(pr.igst_amount)    as igst_amount
    FROM purchase_receipts pr
    JOIN suppliers s ON s.id = pr.supplier_id
    WHERE pr.receipt_date BETWEEN ? AND ?
    GROUP BY pr.supplier_id
  `).all(fromDate, toDate) as any[];

  let itcNet = zeroBucket();
  for (const row of inward) {
    itcNet.txval = round2(itcNet.txval + row.taxable_amount);
    itcNet.camt  = round2(itcNet.camt  + row.cgst_amount);
    itcNet.samt  = round2(itcNet.samt  + row.sgst_amount);
    itcNet.iamt  = round2(itcNet.iamt  + row.igst_amount);
  }

  return {
    gstin,
    ret_period: period,
    sup_details: {
      osup_det:      osupDet,
      osup_zero:     zeroBucket(),
      osup_nil_exmp: zeroBucket(),
      isup_rev:      zeroBucket(),
      osup_nongst:   zeroBucket(),
    },
    inter_sup: {
      unreg_details: interUnreg,
      comp_details:  [],
      uin_details:   [],
    },
    itc_elg: {
      itc_avl: [
        { ty: 'IMPG',   ...zeroBucket() },
        { ty: 'IMPS',   ...zeroBucket() },
        { ty: 'ISRC',   iamt: itcNet.iamt, camt: itcNet.camt, samt: itcNet.samt, csamt: 0 },
        { ty: 'ISD',    ...zeroBucket() },
        { ty: 'OTH',    ...zeroBucket() },
      ],
      itc_rev: [],
      itc_net: itcNet,
      itc_inelg: [],
    },
    inward_sup: {
      isup_details: [
        { ty: 'GST',  inter: 0, intra: 0 },
        { ty: 'NONGST', inter: 0, intra: 0 },
      ],
    },
    intr_ltfee: {
      intr_details: zeroBucket(),
      ltfee_details: zeroBucket(),
    },
  };
}

// ─── HSN Summary report ───────────────────────────────────────────────────────

export function generateHSNSummary(db: DB, fromDate: string, toDate: string) {
  return db.prepare(`
    SELECT
      m.hsn_code,
      m.name          AS medicine_name,
      m.unit,
      SUM(ii.quantity)       AS total_qty,
      SUM(ii.taxable_amount) AS taxable_amount,
      SUM(ii.cgst_amount)    AS cgst_amount,
      SUM(ii.sgst_amount)    AS sgst_amount,
      SUM(ii.igst_amount)    AS igst_amount,
      SUM(ii.total_amount)   AS total_amount,
      ii.gst_rate
    FROM invoice_items ii
    JOIN medicines m ON m.id = ii.medicine_id
    JOIN invoices  i ON i.id = ii.invoice_id
    WHERE i.invoice_date BETWEEN ? AND ?
      AND i.status IN ('paid','partial')
    GROUP BY m.hsn_code, ii.gst_rate
    ORDER BY taxable_amount DESC
  `).all(fromDate, toDate);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function zeroBucket(): GSTR3BTaxAmt {
  return { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
}

function formatGSTDate(isoDate: string): string {
  // YYYY-MM-DD → DD-MM-YYYY
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

function lastDayOfMonth(year: string, month: string): string {
  const d = new Date(Number(year), Number(month), 0); // day 0 of next month = last day of month
  return `${year}-${month}-${String(d.getDate()).padStart(2, '0')}`;
}

function accumulateHSN(
  map: Map<string, { desc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number }>,
  item: any,
  isReturn = false,
): void {
  const hsn = item.hsn_code || 'XXXX';
  const ex = map.get(hsn) ?? { desc: item.medicine_name ?? '', qty: 0, val: 0, txval: 0, iamt: 0, camt: 0, samt: 0 };
  const sign = isReturn ? -1 : 1;
  ex.qty   += sign * item.quantity;
  ex.val   = round2(ex.val   + sign * item.total_amount);
  ex.txval = round2(ex.txval + sign * item.taxable_amount);
  ex.iamt  = round2(ex.iamt  + sign * item.igst_amount);
  ex.camt  = round2(ex.camt  + sign * item.cgst_amount);
  ex.samt  = round2(ex.samt  + sign * item.sgst_amount);
  map.set(hsn, ex);
}
