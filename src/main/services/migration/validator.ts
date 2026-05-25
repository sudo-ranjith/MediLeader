// ── Validation Engine ─────────────────────────────────────────────────────────
import type { EntityType } from './adapters.js';

export interface RowError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface RowValidation {
  rowNumber: number;
  status: 'valid' | 'warning' | 'error';
  errors: RowError[];
  normalized: Record<string, string>; // cleaned/normalized values
}

// ── GST normalization ──────────────────────────────────────────────────────────

const VALID_GST = [0, 5, 12, 18];

function normalizeGST(raw: string): { value: number | null; warning?: string } {
  if (!raw) return { value: 12, warning: 'GST rate missing, defaulted to 12%' };
  const n = parseFloat(raw.replace('%', '').trim());
  if (isNaN(n)) return { value: 12, warning: `Invalid GST "${raw}", defaulted to 12%` };
  if (VALID_GST.includes(n)) return { value: n };
  // Round to nearest valid slab
  const nearest = VALID_GST.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
  return { value: nearest, warning: `GST ${n}% rounded to nearest slab ${nearest}%` };
}

// ── Date normalization ─────────────────────────────────────────────────────────

function normalizeDate(raw: string): { value: string | null; error?: string; warning?: string } {
  if (!raw) return { value: null, error: 'Expiry date is required' };

  // MM/YYYY → last day of month
  if (/^\d{1,2}\/\d{4}$/.test(raw)) {
    const [m, y] = raw.split('/');
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    return { value: `${y}-${m.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
  }
  // MM-YYYY
  if (/^\d{1,2}-\d{4}$/.test(raw)) {
    const [m, y] = raw.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    return { value: `${y}-${m.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
  }
  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/');
    return { value: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` };
  }
  // DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('-');
    return { value: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` };
  }
  // YYYY-MM-DD (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return { value: null, error: `Invalid date: ${raw}` };
    return { value: raw };
  }
  // Try JS Date
  const dt = new Date(raw);
  if (!isNaN(dt.getTime())) {
    const iso = dt.toISOString().split('T')[0];
    return { value: iso, warning: `Date "${raw}" parsed as ${iso}` };
  }
  return { value: null, error: `Cannot parse date: "${raw}"` };
}

// ── Phone normalization ───────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  // Strip spaces, dashes, country codes
  const digits = raw.replace(/[\s\-\+\(\)]/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits.slice(-10); // take last 10 digits
}

// ── GSTIN validation ──────────────────────────────────────────────────────────

function validateGSTIN(gstin: string): boolean {
  if (!gstin) return true; // optional
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

// ── Schedule normalization ─────────────────────────────────────────────────────

const SCHEDULE_MAP: Record<string, string> = {
  'otc': 'OTC', 'over the counter': 'OTC', 'general': 'OTC',
  'h': 'H', 'rx': 'H', 'prescription': 'H',
  'h1': 'H1',
  'x': 'X', 'narcotic': 'X',
  'g': 'G',
};

function normalizeSchedule(raw: string): string {
  return SCHEDULE_MAP[raw.toLowerCase().trim()] ?? 'OTC';
}

// ── Unit normalization ─────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  'tab': 'tablet', 'tabs': 'tablet', 'tablet': 'tablet', 'tablets': 'tablet',
  'cap': 'capsule', 'caps': 'capsule', 'capsule': 'capsule',
  'strip': 'strip', 'strips': 'strip',
  'bottle': 'bottle', 'bot': 'bottle',
  'ml': 'ml', 'syrup': 'ml', 'solution': 'ml',
  'gm': 'gm', 'gram': 'gm', 'g': 'gm',
  'mg': 'mg',
  'inj': 'injection', 'injection': 'injection',
  'cream': 'tube', 'ointment': 'tube', 'gel': 'tube', 'tube': 'tube',
  'sachet': 'sachet',
  'unit': 'unit',
};

function normalizeUnit(raw: string): string {
  return UNIT_MAP[raw.toLowerCase().trim()] ?? (raw || 'strip');
}

// ── Entity validators ─────────────────────────────────────────────────────────

export function validateMedicineRow(row: Record<string, string>, rowNumber: number): RowValidation {
  const errors: RowError[] = [];
  const normalized = { ...row };

  // Name (required)
  const name = row.name?.trim();
  if (!name) {
    errors.push({ field: 'name', message: 'Medicine name is required', severity: 'error' });
  } else {
    normalized.name = name;
  }

  // GST
  const gstResult = normalizeGST(row.gst_rate ?? '');
  normalized.gst_rate = String(gstResult.value ?? 12);
  if (gstResult.warning) errors.push({ field: 'gst_rate', message: gstResult.warning, severity: 'warning' });

  // MRP
  const mrp = parseFloat(row.mrp ?? '0');
  normalized.mrp = String(isNaN(mrp) ? 0 : Math.abs(mrp));
  if (row.mrp && isNaN(parseFloat(row.mrp))) {
    errors.push({ field: 'mrp', message: `Invalid MRP "${row.mrp}"`, severity: 'warning' });
  }

  // Cost
  const cost = parseFloat(row.cost ?? '0');
  normalized.cost = String(isNaN(cost) ? 0 : Math.abs(cost));

  // Schedule
  normalized.schedule = normalizeSchedule(row.schedule ?? 'OTC');

  // Unit
  normalized.unit = normalizeUnit(row.unit ?? 'strip');

  // Reorder level
  const rl = parseInt(row.reorder_level ?? '10');
  normalized.reorder_level = String(isNaN(rl) || rl < 0 ? 10 : rl);

  // Barcode uniqueness check can only happen at import time
  const hasErrors = errors.some(e => e.severity === 'error');
  const hasWarnings = errors.some(e => e.severity === 'warning');
  return {
    rowNumber,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
    errors,
    normalized,
  };
}

export function validateBatchRow(row: Record<string, string>, rowNumber: number): RowValidation {
  const errors: RowError[] = [];
  const normalized = { ...row };

  // Medicine name (required)
  if (!row.medicine_name?.trim()) {
    errors.push({ field: 'medicine_name', message: 'Medicine name is required', severity: 'error' });
  }

  // Batch number (required)
  if (!row.batch_number?.trim()) {
    errors.push({ field: 'batch_number', message: 'Batch number is required', severity: 'error' });
  }

  // Expiry date (required)
  const expiryResult = normalizeDate(row.expiry_date ?? '');
  if (expiryResult.error) {
    errors.push({ field: 'expiry_date', message: expiryResult.error, severity: 'error' });
  } else {
    normalized.expiry_date = expiryResult.value!;
    if (expiryResult.warning) errors.push({ field: 'expiry_date', message: expiryResult.warning, severity: 'warning' });
    // Expired stock warning
    if (expiryResult.value && new Date(expiryResult.value) < new Date()) {
      errors.push({ field: 'expiry_date', message: `Stock is already expired (${expiryResult.value})`, severity: 'warning' });
    }
  }

  // Quantity (required)
  const qty = parseInt(row.quantity ?? '0');
  if (isNaN(qty) || qty < 0) {
    errors.push({ field: 'quantity', message: `Invalid quantity "${row.quantity}"`, severity: 'error' });
  } else {
    normalized.quantity = String(qty);
    if (qty === 0) errors.push({ field: 'quantity', message: 'Quantity is 0 — stock will be imported with zero quantity', severity: 'warning' });
  }

  // MRP
  const mrp = parseFloat(row.mrp ?? '0');
  normalized.mrp = String(isNaN(mrp) ? 0 : Math.abs(mrp));

  // Purchase price
  const pp = parseFloat(row.purchase_price ?? '0');
  normalized.purchase_price = String(isNaN(pp) ? 0 : Math.abs(pp));

  // Reorder level
  const rl = parseInt(row.reorder_level ?? '10');
  normalized.reorder_level = String(isNaN(rl) || rl < 0 ? 10 : rl);

  const hasErrors = errors.some(e => e.severity === 'error');
  const hasWarnings = errors.some(e => e.severity === 'warning');
  return {
    rowNumber,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
    errors,
    normalized,
  };
}

export function validateCustomerRow(row: Record<string, string>, rowNumber: number): RowValidation {
  const errors: RowError[] = [];
  const normalized = { ...row };

  if (!row.name?.trim()) {
    errors.push({ field: 'name', message: 'Customer name is required', severity: 'error' });
  }

  if (row.phone) {
    normalized.phone = normalizePhone(row.phone);
    if (normalized.phone.length !== 10) {
      errors.push({ field: 'phone', message: `Phone "${row.phone}" is not a valid 10-digit number`, severity: 'warning' });
    }
  }

  if (row.gstin && !validateGSTIN(row.gstin)) {
    errors.push({ field: 'gstin', message: `GSTIN "${row.gstin}" appears invalid`, severity: 'warning' });
  }

  const cl = parseFloat(row.credit_limit ?? '0');
  normalized.credit_limit = String(isNaN(cl) || cl < 0 ? 0 : cl);

  const outstanding = parseFloat(row.outstanding ?? '0');
  normalized.outstanding = String(isNaN(outstanding) || outstanding < 0 ? 0 : outstanding);

  const hasErrors = errors.some(e => e.severity === 'error');
  const hasWarnings = errors.some(e => e.severity === 'warning');
  return {
    rowNumber,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
    errors,
    normalized,
  };
}

export function validateSupplierRow(row: Record<string, string>, rowNumber: number): RowValidation {
  const errors: RowError[] = [];
  const normalized = { ...row };

  if (!row.name?.trim()) {
    errors.push({ field: 'name', message: 'Supplier name is required', severity: 'error' });
  }

  if (row.phone) {
    normalized.phone = normalizePhone(row.phone);
  }

  if (row.gstin && !validateGSTIN(row.gstin)) {
    errors.push({ field: 'gstin', message: `GSTIN "${row.gstin}" appears invalid`, severity: 'warning' });
  }

  const outstanding = parseFloat(row.outstanding ?? '0');
  normalized.outstanding = String(isNaN(outstanding) || outstanding < 0 ? 0 : outstanding);

  const cd = parseInt(row.credit_days ?? '30');
  normalized.credit_days = String(isNaN(cd) || cd < 0 ? 30 : cd);

  const hasErrors = errors.some(e => e.severity === 'error');
  const hasWarnings = errors.some(e => e.severity === 'warning');
  return {
    rowNumber,
    status: hasErrors ? 'error' : hasWarnings ? 'warning' : 'valid',
    errors,
    normalized,
  };
}

export function validateRows(
  rows: Record<string, string>[],
  entityType: EntityType,
): RowValidation[] {
  const validators: Record<EntityType, (row: Record<string, string>, n: number) => RowValidation> = {
    medicines: validateMedicineRow,
    batches:   validateBatchRow,
    customers: validateCustomerRow,
    suppliers: validateSupplierRow,
  };
  const fn = validators[entityType];
  return rows.map((row, i) => fn(row, i + 1));
}
