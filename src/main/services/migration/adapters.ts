// ── Competitor Software Column Mapping Adapters ───────────────────────────────
//
// Each adapter defines how that software's column headers map to our canonical
// field names. Multiple aliases are listed in priority order (first match wins).

export type EntityType = 'medicines' | 'batches' | 'customers' | 'suppliers';
export type SourceSoftware = 'marg' | 'wings' | 'busy' | 'gofrugal' | 'retailgraph' | 'medico' | 'excel' | 'generic_csv';

export interface FieldMapping {
  [canonicalField: string]: string; // canonical → source column header
}

// Canonical field definitions per entity type
export const CANONICAL_FIELDS: Record<EntityType, Array<{
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date';
  hint?: string;
}>> = {
  medicines: [
    { key: 'name',         label: 'Medicine Name',    required: true,  type: 'string' },
    { key: 'generic_name', label: 'Generic / Salt',   required: false, type: 'string' },
    { key: 'manufacturer', label: 'Manufacturer',     required: false, type: 'string' },
    { key: 'category',     label: 'Category',         required: false, type: 'string' },
    { key: 'hsn_code',     label: 'HSN Code',         required: false, type: 'string' },
    { key: 'gst_rate',     label: 'GST %',            required: false, type: 'number', hint: '0 / 5 / 12 / 18' },
    { key: 'unit',         label: 'Unit',             required: false, type: 'string', hint: 'strip / tablet / bottle' },
    { key: 'mrp',          label: 'MRP (₹)',          required: false, type: 'number' },
    { key: 'cost',         label: 'Purchase Rate (₹)', required: false, type: 'number' },
    { key: 'barcode',      label: 'Barcode',          required: false, type: 'string' },
    { key: 'schedule',     label: 'Schedule',         required: false, type: 'string', hint: 'OTC / H / H1 / X / G' },
    { key: 'reorder_level',label: 'Reorder Level',   required: false, type: 'number' },
  ],
  batches: [
    { key: 'medicine_name',  label: 'Medicine Name',   required: true,  type: 'string' },
    { key: 'batch_number',   label: 'Batch Number',    required: true,  type: 'string' },
    { key: 'expiry_date',    label: 'Expiry Date',     required: true,  type: 'date',   hint: 'MM/YYYY or YYYY-MM-DD' },
    { key: 'quantity',       label: 'Quantity',        required: true,  type: 'number' },
    { key: 'purchase_price', label: 'Purchase Price (₹)', required: false, type: 'number' },
    { key: 'mrp',            label: 'MRP (₹)',         required: false, type: 'number' },
    { key: 'reorder_level',  label: 'Reorder Level',  required: false, type: 'number' },
    { key: 'supplier_name',  label: 'Supplier Name',  required: false, type: 'string' },
    { key: 'mfg_date',       label: 'Mfg. Date',      required: false, type: 'date' },
  ],
  customers: [
    { key: 'name',         label: 'Customer Name',  required: true,  type: 'string' },
    { key: 'phone',        label: 'Phone',          required: false, type: 'string' },
    { key: 'email',        label: 'Email',          required: false, type: 'string' },
    { key: 'address',      label: 'Address',        required: false, type: 'string' },
    { key: 'gstin',        label: 'GSTIN',          required: false, type: 'string' },
    { key: 'credit_limit', label: 'Credit Limit',   required: false, type: 'number' },
    { key: 'outstanding',  label: 'Outstanding (₹)', required: false, type: 'number' },
  ],
  suppliers: [
    { key: 'name',         label: 'Supplier Name', required: true,  type: 'string' },
    { key: 'phone',        label: 'Phone',         required: false, type: 'string' },
    { key: 'email',        label: 'Email',         required: false, type: 'string' },
    { key: 'address',      label: 'Address',       required: false, type: 'string' },
    { key: 'gstin',        label: 'GSTIN',         required: false, type: 'string' },
    { key: 'dl_number',    label: 'Drug License No.', required: false, type: 'string' },
    { key: 'outstanding',  label: 'Outstanding (₹)',  required: false, type: 'number' },
    { key: 'credit_days',  label: 'Credit Days',      required: false, type: 'number' },
  ],
};

// Aliases: canonical field → list of known source column names (case-insensitive match)
const ALIASES: Record<EntityType, Record<string, string[]>> = {
  medicines: {
    name:          ['item name','item desc','product name','medicine name','drug name','name','product','item','medicine','description','prod name','product description'],
    generic_name:  ['generic name','generic','salt name','composition','salt','formula','generic/salt','drug composition','active ingredient'],
    manufacturer:  ['manufacturer','company','mfg','brand','mfg name','company name','mfr','brand name','made by'],
    category:      ['category','type','group','product type','item group','drug type','classification','class'],
    hsn_code:      ['hsn','hsn code','hsn/sac','hsn no','sac','tariff code'],
    gst_rate:      ['gst%','gst rate','gst','tax%','tax rate','vat%','vat rate','gst%','gst slab','tax slab','igst%','cgst+sgst'],
    unit:          ['unit','unit type','pack type','form','dosage form','uom','measure'],
    mrp:           ['mrp','m.r.p','m.r.p.','selling price','s.p.','sale price','retail price','max retail price','sp'],
    cost:          ['purchase rate','cost','purchase price','p.rate','cost price','purchase','rate','p rate','buying price','p/r'],
    barcode:       ['barcode','ean','ean code','sku','item code','product code','ean no','barcode no','scan code'],
    schedule:      ['schedule','drug schedule','sch','schedule type','drug type (h/otc)','rx/otc'],
    reorder_level: ['reorder level','reorder','min stock','minimum stock','reorder qty','minimum qty','min qty','alert qty'],
  },
  batches: {
    medicine_name:  ['item name','product name','medicine name','drug name','name','item','medicine','product','description'],
    batch_number:   ['batch no','batch number','batch','lot no','lot number','batch no.','b.no','lot'],
    expiry_date:    ['expiry date','expiry','exp date','exp','exp.date','expire date','expiry month','exp. date','best before','use before'],
    quantity:       ['qty','quantity','stock','current stock','available qty','closing qty','balance qty','on hand','in stock'],
    purchase_price: ['purchase rate','cost','purchase price','p.rate','cost price','rate','buying price'],
    mrp:            ['mrp','m.r.p','selling price','sale price','retail price','max retail price'],
    reorder_level:  ['reorder level','reorder','min stock','minimum stock','alert qty'],
    supplier_name:  ['supplier','supplier name','vendor','vendor name','distributor'],
    mfg_date:       ['mfg date','manufacturing date','mfg','manufacture date','prod date'],
  },
  customers: {
    name:         ['name','customer name','party name','account name','client name','consumer name'],
    phone:        ['phone','mobile','contact','phone no','mobile no','contact no','tel','telephone','cell'],
    email:        ['email','e-mail','email id','mail'],
    address:      ['address','addr','full address','billing address','street'],
    gstin:        ['gstin','gst no','gst number','gst','gstin no','tax id','vat no'],
    credit_limit: ['credit limit','credit','limit','credit amount','max credit'],
    outstanding:  ['outstanding','balance','due amount','pending','dues','amount due','opening balance'],
  },
  suppliers: {
    name:        ['supplier name','vendor name','party name','name','company name','distributor','firm name'],
    phone:       ['phone','mobile','contact','phone no','mobile no','contact no'],
    email:       ['email','e-mail','email id','mail'],
    address:     ['address','addr','full address','office address'],
    gstin:       ['gstin','gst no','gst number','gst','vendor gst','supplier gst'],
    dl_number:   ['dl no','drug license','dl number','drug license no','licence no','dl'],
    outstanding: ['outstanding','balance','due','pending','amount due','payable','opening balance'],
    credit_days: ['credit days','payment terms','credit period','terms','due days'],
  },
};

// ── Auto-detection heuristics ─────────────────────────────────────────────────

const SOFTWARE_SIGNATURES: Record<SourceSoftware, string[][]> = {
  marg:        [['ITEM NAME','GROUP','COMPANY','GST%','MRP','PURCHASE RATE'], ['LEDGER NAME','DR/CR','AMOUNT']],
  wings:       [['Product Name','Item Code','HSN Code','Sale Rate','Purchase Rate'], ['Party Name','Balance']],
  busy:        [['Item Name','Group','Unit','Sale Price','Purchase Price','GSTIN'], ['Party Name','Cr/Dr']],
  gofrugal:    [['Product Name','Product Code','Category','UOM','Selling Price','Cost Price'], ['Customer Name','Balance Amount']],
  retailgraph: [['ITEM NAME','ITEM CODE','CATEGORY','S.PRICE','P.PRICE','BARCODE']],
  medico:      [['Med Name','Generic','Company','MRP','Purchase Rate','Batch','Expiry']],
  excel:       [],      // generic fallback
  generic_csv: [],
};

export function detectSourceSoftware(headers: string[]): SourceSoftware {
  const normalized = headers.map(h => h.trim().toUpperCase());
  let bestMatch: SourceSoftware = 'generic_csv';
  let bestScore = 0;

  for (const [software, signatures] of Object.entries(SOFTWARE_SIGNATURES) as [SourceSoftware, string[][]]) {
    for (const sig of signatures) {
      const matches = sig.filter(col => normalized.includes(col.toUpperCase())).length;
      const score = matches / sig.length;
      if (score > bestScore) { bestScore = score; bestMatch = software; }
    }
  }
  return bestMatch;
}

// ── Auto field mapping ────────────────────────────────────────────────────────

export interface MappingResult {
  mapping: FieldMapping;      // canonical → sourceColumn
  confidence: Record<string, number>; // canonical → 0..1
  unmapped: string[];         // canonical fields with no match
}

export function autoMapFields(sourceHeaders: string[], entityType: EntityType): MappingResult {
  const aliases = ALIASES[entityType];
  const mapping: FieldMapping = {};
  const confidence: Record<string, number> = {};
  const unmapped: string[] = [];
  const usedSourceCols = new Set<string>();

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    const normalizedAliases = aliasList.map(a => a.toLowerCase().trim());
    let matched: string | null = null;
    let conf = 0;

    // Exact match first
    for (const src of sourceHeaders) {
      const srcNorm = src.toLowerCase().trim();
      const aliasIdx = normalizedAliases.indexOf(srcNorm);
      if (aliasIdx >= 0 && !usedSourceCols.has(src)) {
        matched = src;
        conf = aliasIdx === 0 ? 1.0 : 0.85; // first alias = highest confidence
        break;
      }
    }

    // Partial / fuzzy match if no exact
    if (!matched) {
      for (const src of sourceHeaders) {
        if (usedSourceCols.has(src)) continue;
        const srcNorm = src.toLowerCase().trim();
        for (let i = 0; i < normalizedAliases.length; i++) {
          const alias = normalizedAliases[i];
          if (srcNorm.includes(alias) || alias.includes(srcNorm)) {
            matched = src;
            conf = 0.6 - i * 0.05;
            break;
          }
        }
        if (matched) break;
      }
    }

    if (matched) {
      mapping[canonical] = matched;
      confidence[canonical] = Math.max(0, conf);
      usedSourceCols.add(matched);
    } else {
      unmapped.push(canonical);
      confidence[canonical] = 0;
    }
  }

  return { mapping, confidence, unmapped };
}

export function applyMapping(
  row: Record<string, string>,
  mapping: FieldMapping,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [canonical, sourceCol] of Object.entries(mapping)) {
    result[canonical] = (row[sourceCol] ?? '').trim();
  }
  return result;
}
