// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'cashier';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'credit' | 'cheque' | 'neft';
export type InvoiceStatus = 'draft' | 'paid' | 'partial' | 'cancelled';
export type POStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
export type ReturnType = 'customer_return' | 'expired' | 'damaged' | 'other';
export type StockMovementType =
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'adjustment'
  | 'expired_write_off'
  | 'opening_stock';
export type LedgerType = 'debit' | 'credit';
export type LedgerEntity = 'customer' | 'supplier';
export type GSTReturnType = 'GSTR1' | 'GSTR3B';
export type SupplyType = 'intrastate' | 'interstate';
export type MedicineSchedule = 'OTC' | 'H' | 'H1' | 'X' | 'G';

// ─── Users ───────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: 0 | 1;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  phone?: string;
}

// ─── Pharmacy Settings ────────────────────────────────────────────────────────

export interface PharmacySettings {
  pharmacy_name: string;
  pharmacy_address: string;
  pharmacy_phone: string;
  pharmacy_email: string;
  pharmacy_gstin: string;
  pharmacy_state_code: string; // '33' for Tamil Nadu
  pharmacy_dl_number: string;  // Drug License number
  invoice_prefix: string;
  po_prefix: string;
  return_prefix: string;
  currency_symbol: string;
  language: string;
  backend_url: string;
  auto_sync: string;
  sync_interval: string;
  last_sync_time: string;
  thermal_print_width: string; // '80mm' | '58mm'
  show_mrp_on_invoice: string;
  show_batch_on_invoice: string;
  round_off_tax: string;
}

// ─── Medicines ────────────────────────────────────────────────────────────────

export interface Medicine {
  id: number;
  name: string;
  generic_name?: string;
  hsn_code: string;
  gst_rate: number; // 0 | 5 | 12 | 18
  unit: string;     // strip | bottle | box | tablet | ml | injection | sachet
  mrp: number;
  cost: number;
  barcode?: string;
  manufacturer?: string;
  schedule: MedicineSchedule; // OTC | H | H1 | X | G
  category?: string;
  is_active: 0 | 1;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Batches ──────────────────────────────────────────────────────────────────

export interface Batch {
  id: number;
  medicine_id: number;
  medicine_name?: string; // joined
  batch_number: string;
  expiry_date: string;    // YYYY-MM-DD
  purchase_price: number;
  mrp: number;
  quantity: number;
  reorder_level: number;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

export interface BatchWithMedicine extends Batch {
  medicine_name: string;
  hsn_code: string;
  gst_rate: number;
  unit: string;
}

// ─── Stock Movements ──────────────────────────────────────────────────────────

export interface StockMovement {
  id: number;
  batch_id: number;
  medicine_id: number;
  movement_type: StockMovementType;
  quantity: number;       // positive = in, negative = out
  reference_type?: string; // 'invoice' | 'purchase_receipt' | 'return' | 'adjustment'
  reference_id?: number;
  reference_number?: string;
  remarks?: string;
  created_by: number;
  created_at: string;
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  gst_number?: string;
  credit_limit: number;
  credit_used: number;
  is_active: 0 | 1;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  gstin?: string;
  dl_number?: string;
  dl_expiry?: string;
  credit_days: number;    // payment due in N days
  outstanding: number;    // total amount owed
  is_active: 0 | 1;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── GST Calculation ──────────────────────────────────────────────────────────

export interface GSTBreakdown {
  taxable_amount: number;
  gst_rate: number;
  cgst_rate: number;   // gst_rate / 2 for intrastate
  sgst_rate: number;   // gst_rate / 2 for intrastate
  igst_rate: number;   // gst_rate for interstate, 0 for intrastate
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  total_amount: number;
}

export interface InvoiceGSTSummary {
  supply_type: SupplyType;
  by_rate: Array<{
    gst_rate: number;
    hsn_codes: string[];
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_gst: number;
  }>;
  total_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  medicine_id: number;
  medicine_name: string;
  batch_id: number;
  batch_number: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  mrp: number;
  unit_price: number;    // selling price per unit
  discount_pct: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  customer_id?: number;
  customer_name: string;
  customer_gstin?: string;
  customer_state_code?: string;
  supply_type: SupplyType;
  invoice_date: string;
  due_date?: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  round_off: number;
  total_amount: number;
  paid_amount: number;
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  notes?: string;
  created_by: number;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

export interface CreateInvoiceInput {
  customer_id?: number;
  customer_name: string;
  customer_gstin?: string;
  customer_state_code?: string;
  supply_type: SupplyType;
  invoice_date: string;
  items: Array<{
    medicine_id: number;
    batch_id?: number; // optional — FEFO auto-picks if not given
    quantity: number;
    unit_price: number;
    discount_pct: number;
  }>;
  discount_amount: number;
  payment_method: PaymentMethod;
  paid_amount: number;
  notes?: string;
  created_by: number;
}

// ─── Returns / Credit Notes ───────────────────────────────────────────────────

export interface ReturnItem {
  id?: number;
  return_id?: number;
  invoice_item_id?: number;
  medicine_id: number;
  medicine_name: string;
  batch_id: number;
  batch_number: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  reason?: string;
}

export interface Return {
  id: number;
  return_number: string;
  invoice_id?: number;
  invoice_number?: string;
  customer_id?: number;
  customer_name: string;
  return_type: ReturnType;
  return_date: string;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_gst: number;
  total_amount: number;
  credit_note_issued: 0 | 1;
  notes?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ReturnWithItems extends Return {
  items: ReturnItem[];
}

export interface CreateReturnInput {
  invoice_id?: number;
  customer_id?: number;
  customer_name: string;
  return_type: ReturnType;
  return_date: string;
  items: Array<{
    invoice_item_id?: number;
    medicine_id: number;
    batch_id: number;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    reason?: string;
  }>;
  notes?: string;
  created_by: number;
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export interface POItem {
  id?: number;
  po_id?: number;
  medicine_id: number;
  medicine_name: string;
  hsn_code: string;
  ordered_qty: number;
  received_qty: number;
  free_qty: number;       // bonus units (10+1 scheme)
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  supply_type: SupplyType;
  order_date: string;
  expected_delivery?: string;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  status: POStatus;
  notes?: string;
  created_by: number;
  sync_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: POItem[];
}

// ─── Purchase Receipts (GRN) ──────────────────────────────────────────────────

export interface GRNItem {
  id?: number;
  receipt_id?: number;
  po_item_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  ordered_qty: number;
  received_qty: number;
  free_qty: number;
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  reorder_level: number;
}

export interface PurchaseReceipt {
  id: number;
  receipt_number: string;
  po_id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  supplier_invoice_number?: string;
  receipt_date: string;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  notes?: string;
  created_by: number;
  created_at: string;
}

export interface PurchaseReceiptWithItems extends PurchaseReceipt {
  items: GRNItem[];
}

// ─── Supplier Payments ────────────────────────────────────────────────────────

export interface SupplierPayment {
  id: number;
  supplier_id: number;
  supplier_name: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;    // cheque/transaction number
  notes?: string;
  created_by: number;
  created_at: string;
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  id: number;
  entity_type: LedgerEntity;
  entity_id: number;
  entry_date: string;
  reference_type: string; // 'invoice' | 'return' | 'payment' | 'adjustment'
  reference_id: number;
  reference_number: string;
  debit: number;
  credit: number;
  balance: number;
  narration: string;
  created_at: string;
}

// ─── GST Returns ─────────────────────────────────────────────────────────────

export interface GSTR1Data {
  gstin: string;
  fp: string; // MMYYYY
  b2b: GSTR1B2B[];
  b2cs: GSTR1B2CS[];
  b2cl: GSTR1B2CL[];
  cdnr: GSTR1CDNR[];
  cdnur: GSTR1CDNUR[];
  hsn: { data: GSTR1HSN[] };
  doc_issue: { doc_det: GSTR1DocDetail[] };
}

export interface GSTR1B2B {
  ctin: string;           // customer GSTIN
  inv: Array<{
    inum: string;         // invoice number
    idt: string;          // date DD-MM-YYYY
    val: number;          // total value
    pos: string;          // place of supply state code
    rchrg: 'Y' | 'N';    // reverse charge
    inv_typ: string;      // 'R' regular
    itms: Array<{
      num: number;        // serial item no
      itm_det: {
        rt: number;       // GST rate
        txval: number;    // taxable value
        iamt: number;     // IGST
        camt: number;     // CGST
        samt: number;     // SGST
        csamt: number;    // cess
      };
    }>;
  }>;
}

export interface GSTR1B2CS {
  sply_tp: string;        // 'INTRA' | 'INTER'
  pos: string;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface GSTR1B2CL {
  pos: string;
  inv: Array<{
    inum: string;
    idt: string;
    val: number;
    itms: Array<{
      num: number;
      itm_det: { rt: number; txval: number; iamt: number; csamt: number };
    }>;
  }>;
}

export interface GSTR1CDNR {
  ctin: string;
  nt: Array<{
    ntty: 'C' | 'D';    // Credit/Debit note
    nt_num: string;
    nt_dt: string;
    val: number;
    itms: Array<{
      num: number;
      itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };
    }>;
  }>;
}

export interface GSTR1CDNUR {
  ntty: 'C' | 'D';
  nt_num: string;
  nt_dt: string;
  typ: string;
  val: number;
  itms: Array<{
    num: number;
    itm_det: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };
  }>;
}

export interface GSTR1HSN {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;     // unit code e.g. 'NOS', 'KGS'
  qty: number;
  val: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface GSTR1DocDetail {
  doc_num: number;
  docs: Array<{
    num: number;
    from: string;
    to: string;
    totnum: number;
    cancel: number;
    net_issue: number;
  }>;
}

export interface GSTR3BData {
  gstin: string;
  ret_period: string; // MMYYYY
  sup_details: {
    osup_det: GSTR3BTaxAmt;   // 3.1a - outward taxable supplies
    osup_zero: GSTR3BTaxAmt;  // 3.1b - zero-rated
    osup_nil_exmp: GSTR3BTaxAmt; // 3.1c - nil/exempt
    isup_rev: GSTR3BTaxAmt;   // 3.1d - inward supplies (reverse charge)
    osup_nongst: GSTR3BTaxAmt; // 3.1e - non-GST
  };
  inter_sup: {
    unreg_details: Array<{ pos: string; txval: number; iamt: number }>;
    comp_details: Array<{ pos: string; txval: number; iamt: number }>;
    uin_details: Array<{ pos: string; txval: number; iamt: number }>;
  };
  itc_elg: {
    itc_avl: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
    itc_rev: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
    itc_net: { iamt: number; camt: number; samt: number; csamt: number };
    itc_inelg: Array<{ ty: string; iamt: number; camt: number; samt: number; csamt: number }>;
  };
  inward_sup: {
    isup_details: Array<{ ty: string; inter: number; intra: number }>;
  };
  intr_ltfee: {
    intr_details: { iamt: number; camt: number; samt: number; csamt: number };
    ltfee_details: { iamt: number; camt: number; samt: number; csamt: number };
  };
}

export interface GSTR3BTaxAmt {
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface DailySalesReport {
  date: string;
  invoice_count: number;
  total_revenue: number;
  total_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
  cash_total: number;
  card_total: number;
  upi_total: number;
  credit_total: number;
}

export interface MedicineSalesReport {
  medicine_id: number;
  medicine_name: string;
  hsn_code: string;
  total_qty: number;
  total_revenue: number;
  total_taxable: number;
  total_gst: number;
  avg_selling_price: number;
  cost: number;
  gross_profit: number;
  profit_margin_pct: number;
}

export interface ExpiryReport {
  batch_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  days_to_expiry: number;
  status: 'expired' | 'critical' | 'warning' | 'ok'; // <0, <30, <90, >=90
  stock_value: number;
}

export interface SlowMovingReport {
  medicine_id: number;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  last_sold_date?: string;
  days_since_last_sale: number;
  stock_value: number;
}

export interface SupplierLedgerSummary {
  supplier_id: number;
  supplier_name: string;
  total_purchases: number;
  total_payments: number;
  outstanding: number;
}

export interface CustomerLedgerSummary {
  customer_id: number;
  customer_name: string;
  credit_limit: number;
  credit_used: number;
  available_credit: number;
  total_purchases: number;
  total_returns: number;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: number;
  table_name: string;
  record_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_values?: string; // JSON
  new_values?: string; // JSON
  user_id: number;
  user_email: string;
  created_at: string;
}

// ─── IPC Response envelope ────────────────────────────────────────────────────

export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export function ok<T>(data: T): IPCResult<T> {
  return { success: true, data };
}

export function err(message: string, code?: string): IPCResult<never> {
  return { success: false, error: message, code };
}
