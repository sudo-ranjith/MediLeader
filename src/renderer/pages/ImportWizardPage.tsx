import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, Upload, FileText, CheckCircle, XCircle,
  AlertTriangle, RotateCcw, RefreshCw, ArrowRight, Info,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityType = 'medicines' | 'batches' | 'customers' | 'suppliers';
type SourceSoftware = 'marg' | 'wings' | 'busy' | 'gofrugal' | 'retailgraph' | 'medico' | 'excel' | 'generic_csv';
type DuplicateHandling = 'skip' | 'overwrite' | 'merge';

interface FieldDef { key: string; label: string; required: boolean; type: string; hint?: string; }
interface RowValidation {
  rowNumber: number;
  status: 'valid' | 'warning' | 'error';
  errors: Array<{ field: string; message: string; severity: string }>;
  normalized: Record<string, string>;
  raw: Record<string, string>;
}
interface AnalyzeResult {
  sessionId: string;
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  detectedSoftware: SourceSoftware;
  autoMapping: Record<string, string>;
  mappingConfidence: Record<string, number>;
  unmappedCanonical: string[];
  error?: string;
}
interface PreviewResult {
  sessionId: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  previewValidations: RowValidation[];
  canProceed: boolean;
}
interface ExecuteResult {
  imported: number;
  skipped: number;
  failed: number;
  overwritten: number;
  totalRows: number;
  errorLog: Array<{ row: number; reason: string }>;
  rollbackAvailable: boolean;
}

// ── Step config ───────────────────────────────────────────────────────────────

const STEPS = [
  'Source',
  'Entity',
  'Upload',
  'Mapping',
  'Preview',
  'Settings',
  'Execute',
  'Results',
];

const ENTITY_OPTIONS: Array<{ id: EntityType; label: string; desc: string; icon: string }> = [
  { id: 'medicines', label: 'Medicine Master',   desc: 'Drug names, HSN, GST, MRP, schedule',   icon: '💊' },
  { id: 'batches',   label: 'Stock / Batches',   desc: 'Batch numbers, expiry, quantities, MRP', icon: '📦' },
  { id: 'customers', label: 'Customers',         desc: 'Names, phones, GSTIN, credit limits',   icon: '👤' },
  { id: 'suppliers', label: 'Suppliers',         desc: 'Supplier details, GSTIN, drug license',  icon: '🏭' },
];

const SOURCE_OPTIONS: Array<{ id: SourceSoftware; label: string; desc: string }> = [
  { id: 'marg',        label: 'Marg ERP',      desc: 'Auto-detects Marg column format' },
  { id: 'wings',       label: 'Wings',          desc: 'Wings Pharmacy Software' },
  { id: 'busy',        label: 'Busy',           desc: 'Busy Accounting & Billing' },
  { id: 'gofrugal',    label: 'GoFrugal',       desc: 'GoFrugal RetailEasy' },
  { id: 'retailgraph', label: 'RetailGraph',    desc: 'RetailGraph Pharmacy' },
  { id: 'medico',      label: 'Medico',         desc: 'Medico Software' },
  { id: 'excel',       label: 'Excel / CSV',    desc: 'Generic spreadsheet export' },
  { id: 'generic_csv', label: 'Custom CSV',     desc: 'Any CSV/TSV/JSON file' },
];

const CANONICAL_FIELDS: Record<EntityType, FieldDef[]> = {
  medicines: [
    { key: 'name',          label: 'Medicine Name',     required: true,  type: 'string' },
    { key: 'generic_name',  label: 'Generic / Salt',    required: false, type: 'string' },
    { key: 'manufacturer',  label: 'Manufacturer',      required: false, type: 'string' },
    { key: 'category',      label: 'Category',          required: false, type: 'string' },
    { key: 'hsn_code',      label: 'HSN Code',          required: false, type: 'string' },
    { key: 'gst_rate',      label: 'GST %',             required: false, type: 'number', hint: '0/5/12/18' },
    { key: 'unit',          label: 'Unit',              required: false, type: 'string', hint: 'strip/tablet/bottle' },
    { key: 'mrp',           label: 'MRP (₹)',           required: false, type: 'number' },
    { key: 'cost',          label: 'Purchase Rate (₹)', required: false, type: 'number' },
    { key: 'barcode',       label: 'Barcode',           required: false, type: 'string' },
    { key: 'schedule',      label: 'Schedule',          required: false, type: 'string', hint: 'OTC/H/H1/X/G' },
    { key: 'reorder_level', label: 'Reorder Level',     required: false, type: 'number' },
  ],
  batches: [
    { key: 'medicine_name',  label: 'Medicine Name',      required: true,  type: 'string' },
    { key: 'batch_number',   label: 'Batch Number',       required: true,  type: 'string' },
    { key: 'expiry_date',    label: 'Expiry Date',        required: true,  type: 'date',   hint: 'MM/YYYY or YYYY-MM-DD' },
    { key: 'quantity',       label: 'Quantity',           required: true,  type: 'number' },
    { key: 'purchase_price', label: 'Purchase Price (₹)', required: false, type: 'number' },
    { key: 'mrp',            label: 'MRP (₹)',            required: false, type: 'number' },
    { key: 'reorder_level',  label: 'Reorder Level',      required: false, type: 'number' },
    { key: 'supplier_name',  label: 'Supplier Name',      required: false, type: 'string' },
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
    { key: 'name',        label: 'Supplier Name',   required: true,  type: 'string' },
    { key: 'phone',       label: 'Phone',           required: false, type: 'string' },
    { key: 'email',       label: 'Email',           required: false, type: 'string' },
    { key: 'address',     label: 'Address',         required: false, type: 'string' },
    { key: 'gstin',       label: 'GSTIN',           required: false, type: 'string' },
    { key: 'dl_number',   label: 'Drug License No.',required: false, type: 'string' },
    { key: 'outstanding', label: 'Outstanding (₹)', required: false, type: 'number' },
    { key: 'credit_days', label: 'Credit Days',     required: false, type: 'number' },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportWizardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [source, setSource]         = useState<SourceSoftware>('generic_csv');
  const [entityType, setEntityType] = useState<EntityType>('medicines');
  const [file, setFile]             = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analyzeResult, setAnalyzeResult]   = useState<AnalyzeResult | null>(null);
  const [previewResult, setPreviewResult]   = useState<PreviewResult | null>(null);
  const [executeResult, setExecuteResult]   = useState<ExecuteResult | null>(null);
  const [fieldMapping, setFieldMapping]     = useState<Record<string, string>>({});
  const [settings, setSettings] = useState({
    duplicateHandling: 'skip' as DuplicateHandling,
    skipErrors: true,
    skipExpired: false,
    skipZeroQty: false,
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [sessionId, setSessionId] = useState('');
  const [rollingBack, setRollingBack] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fieldDefs = CANONICAL_FIELDS[entityType] ?? [];

  // ── File handling ─────────────────────────────────────────────────────────

  async function acceptFile(f: File) {
    setFile(f);
    const buf = await f.arrayBuffer();
    setFileBuffer(buf);
    setError('');
    setAnalyzeResult(null);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  // ── Step transitions ──────────────────────────────────────────────────────

  async function goToMapping() {
    if (!file || !fileBuffer) return;
    setLoading(true);
    setError('');
    try {
      const res = await window.api.migrationAnalyze(file.name, fileBuffer, entityType, user?.id ?? 1);
      if (!res.success) { setError(res.error ?? 'Analysis failed'); return; }
      const data: AnalyzeResult = res.data;
      if (data.error) { setError(data.error); return; }
      setAnalyzeResult(data);
      setSessionId(data.sessionId);
      setFieldMapping(data.autoMapping);
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  async function goToPreview() {
    if (!file || !fileBuffer || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await window.api.migrationPreview(sessionId, file.name, fileBuffer, fieldMapping);
      if (!res.success) { setError(res.error ?? 'Preview failed'); return; }
      setPreviewResult(res.data);
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  async function executeImport() {
    if (!file || !fileBuffer || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const res = await window.api.migrationExecute(sessionId, file.name, fileBuffer, settings, user?.id ?? 1);
      if (!res.success) { setError(res.error ?? 'Import failed'); return; }
      setExecuteResult(res.data);
      setStep(7);
    } finally {
      setLoading(false);
    }
  }

  async function handleRollback() {
    if (!sessionId) return;
    if (!confirm(`Roll back this import? All ${executeResult?.imported} imported records will be deleted.`)) return;
    setRollingBack(true);
    const res = await window.api.migrationRollback(sessionId);
    setRollingBack(false);
    if (res.success) {
      alert(`Rolled back ${res.data.rolledBack} records successfully.`);
      navigate('/import');
    } else {
      alert(res.error ?? 'Rollback failed');
    }
  }

  // ── Shared UI ─────────────────────────────────────────────────────────────

  function StepBar() {
    return (
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              i === step ? 'bg-blue-600 text-white' :
              i < step  ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-400'
            }`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-500'
              }`}>{i < step ? '✓' : i + 1}</span>
              {s}
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
          </div>
        ))}
      </div>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  // STEP 0: Source Selection
  if (step === 0) return (
    <div className="max-w-3xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Select Source Software</h2>
        <p className="text-sm text-slate-500 mb-6">MediLeader auto-detects column formats for each software</p>
        <div className="grid grid-cols-2 gap-3">
          {SOURCE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSource(opt.id)}
              className={`p-4 border-2 rounded-xl text-left transition-all ${
                source === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="font-semibold text-slate-800">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={() => setStep(1)} className="btn-primary">
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 1: Entity Selection
  if (step === 1) return (
    <div className="max-w-3xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">What are you importing?</h2>
        <p className="text-sm text-slate-500 mb-6">
          Import medicines first, then stock — stock import needs medicines already in the system
        </p>
        <div className="grid grid-cols-2 gap-4">
          {ENTITY_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setEntityType(opt.id)}
              className={`p-5 border-2 rounded-xl text-left transition-all ${
                entityType === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="text-2xl mb-2">{opt.icon}</div>
              <div className="font-semibold text-slate-800">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
        {entityType === 'batches' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-sm text-amber-700">
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            Stock import requires medicines to be in MediLeader first. Import Medicine Master before importing stock.
          </div>
        )}
        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(0)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
          <button onClick={() => setStep(2)} className="btn-primary flex items-center gap-1">Next <ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );

  // STEP 2: File Upload
  if (step === 2) return (
    <div className="max-w-3xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Upload Your File</h2>
        <p className="text-sm text-slate-500 mb-6">Supports CSV, Excel (XLSX/XLS), TSV, JSON</p>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
        <div
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            isDragOver ? 'border-blue-400 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-blue-300'
          }`}
        >
          {file ? (
            <>
              <CheckCircle size={36} className="mx-auto mb-3 text-green-500" />
              <div className="font-semibold text-slate-700">{file.name}</div>
              <div className="text-sm text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</div>
              <button onClick={() => { setFile(null); setFileBuffer(null); }} className="mt-3 text-xs text-red-500 hover:underline">Remove</button>
            </>
          ) : (
            <>
              <Upload size={36} className="mx-auto mb-3 text-slate-400" />
              <div className="font-medium text-slate-600">Drag & drop your file here</div>
              <div className="text-sm text-slate-400 mt-1">or</div>
              <label className="mt-3 inline-block cursor-pointer btn-secondary text-sm">
                Browse File
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls,.tsv,.json,.txt" onChange={handleFileInput} />
              </label>
              <div className="text-xs text-slate-400 mt-3">CSV • XLSX • XLS • TSV • JSON</div>
            </>
          )}
        </div>

        {/* Format tips */}
        <div className="mt-4 p-3 bg-slate-50 rounded-lg">
          <div className="text-xs font-medium text-slate-600 mb-2">Tips for a smooth import:</div>
          <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>First row must contain column headers</li>
            <li>Dates accepted: MM/YYYY, DD/MM/YYYY, YYYY-MM-DD</li>
            <li>GST rates: 0, 5, 12 or 18 (auto-rounded if different)</li>
            <li>Remove filters and subtotal rows from Excel before exporting</li>
          </ul>
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
          <button onClick={goToMapping} disabled={!file || loading} className="btn-primary flex items-center gap-1">
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Analyzing...</> : <>Analyze File <ChevronRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 3: Field Mapping
  if (step === 3 && analyzeResult) return (
    <div className="max-w-4xl mx-auto">
      <StepBar />
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Field Mapping</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Map your file's columns to MediLeader fields.
              {analyzeResult.detectedSoftware !== 'generic_csv' && (
                <span className="ml-1 text-blue-600">Auto-detected: <strong>{analyzeResult.detectedSoftware}</strong></span>
              )}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{analyzeResult.totalRows} rows detected</div>
            <div>{analyzeResult.headers.length} columns in file</div>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-48">MediLeader Field</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Map to File Column</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-28">Confidence</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-500">Hint</th>
              </tr>
            </thead>
            <tbody>
              {fieldDefs.map(fd => {
                const mapped = fieldMapping[fd.key] ?? '';
                const conf = analyzeResult.mappingConfidence[fd.key] ?? 0;
                return (
                  <tr key={fd.key} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-700">{fd.label}</div>
                      {fd.required && <span className="text-xs text-red-500">Required</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="select text-sm"
                        value={mapped}
                        onChange={e => setFieldMapping(m => ({ ...m, [fd.key]: e.target.value }))}
                      >
                        <option value="">— Not mapped —</option>
                        {analyzeResult.headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {mapped ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${conf >= 0.8 ? 'bg-green-500' : conf >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.round(conf * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">{Math.round(conf * 100)}%</span>
                        </div>
                      ) : <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{fd.hint ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Preview of raw data */}
        <div className="mt-4">
          <div className="text-xs font-medium text-slate-600 mb-2">File Preview (first 3 rows)</div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="text-xs w-full">
              <thead className="bg-slate-50">
                <tr>
                  {analyzeResult.headers.slice(0, 8).map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analyzeResult.previewRows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {analyzeResult.headers.slice(0, 8).map(h => (
                      <td key={h} className="px-3 py-1.5 text-slate-600 truncate max-w-[120px]">{row[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(2)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
          <button onClick={goToPreview} disabled={loading} className="btn-primary flex items-center gap-1">
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Validating...</> : <>Preview & Validate <ChevronRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 4: Preview + Validation
  if (step === 4 && previewResult) return (
    <div className="max-w-5xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Data Preview & Validation</h2>
        <p className="text-sm text-slate-500 mb-4">Showing first 50 rows. Full validation runs on all {previewResult.totalRows} rows.</p>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Rows', value: previewResult.totalRows, color: 'text-slate-700', bg: 'bg-slate-50' },
            { label: 'Valid',      value: previewResult.validRows,   color: 'text-green-700', bg: 'bg-green-50' },
            { label: 'Warnings',   value: previewResult.warningRows, color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'Errors',     value: previewResult.errorRows,   color: 'text-red-700',   bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {!previewResult.canProceed && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-red-700 text-sm">
            <XCircle size={16} className="flex-shrink-0 mt-0.5" />
            All rows have errors. Please fix your file or update the field mapping.
          </div>
        )}

        {/* Row table */}
        <div className="overflow-auto max-h-96 border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-slate-500 w-12">Row</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-500 w-24">Status</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-500">Key Value</th>
                <th className="text-left px-3 py-2.5 font-medium text-slate-500">Issues</th>
              </tr>
            </thead>
            <tbody>
              {previewResult.previewValidations.map(v => (
                <tr key={v.rowNumber} className={`border-t border-slate-100 ${
                  v.status === 'error' ? 'bg-red-50' : v.status === 'warning' ? 'bg-amber-50' : ''
                }`}>
                  <td className="px-3 py-2 text-slate-400 text-xs">{v.rowNumber}</td>
                  <td className="px-3 py-2">
                    {v.status === 'valid'   && <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full"><CheckCircle size={10} /> OK</span>}
                    {v.status === 'warning' && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><AlertTriangle size={10} /> Warn</span>}
                    {v.status === 'error'   && <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full"><XCircle size={10} /> Error</span>}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-700 truncate max-w-xs">
                    {v.normalized.name || v.normalized.medicine_name || '—'}
                  </td>
                  <td className="px-3 py-2">
                    {v.errors.length > 0 ? (
                      <div className="space-y-0.5">
                        {v.errors.map((e, i) => (
                          <div key={i} className={`text-xs ${e.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                            <span className="font-medium">{e.field}:</span> {e.message}
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(3)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back to Mapping</button>
          <button onClick={() => setStep(5)} disabled={!previewResult.canProceed} className="btn-primary flex items-center gap-1">
            Configure Settings <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 5: Settings
  if (step === 5) return (
    <div className="max-w-2xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Import Settings</h2>
        <p className="text-sm text-slate-500 mb-6">Configure how duplicates and errors are handled</p>

        <div className="space-y-5">
          {/* Duplicate handling */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">When duplicate is found</label>
            <div className="space-y-2">
              {([
                { value: 'skip',      label: 'Skip duplicate',     desc: 'Leave existing record unchanged, skip the imported row' },
                { value: 'overwrite', label: 'Overwrite existing', desc: 'Replace existing record with imported data' },
                { value: 'merge',     label: 'Merge / Add',        desc: 'For stock: add to existing quantity. For others: update fields' },
              ] as const).map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-colors ${
                  settings.duplicateHandling === opt.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-200'
                }`}>
                  <input type="radio" name="dup" value={opt.value} checked={settings.duplicateHandling === opt.value}
                    onChange={() => setSettings(s => ({ ...s, duplicateHandling: opt.value }))} className="mt-0.5" />
                  <div>
                    <div className="font-medium text-slate-700 text-sm">{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error handling */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Error handling</label>
            {[
              { key: 'skipErrors',  label: 'Skip rows with errors', desc: 'Import valid rows, skip invalid ones (recommended)' },
              ...(entityType === 'batches' ? [
                { key: 'skipExpired', label: 'Skip expired stock',    desc: 'Do not import batches that are already expired' },
                { key: 'skipZeroQty',label: 'Skip zero quantity',    desc: 'Do not import batches with 0 quantity' },
              ] : []),
            ].map(opt => (
              <label key={opt.key} className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={(settings as any)[opt.key]}
                  onChange={e => setSettings(s => ({ ...s, [opt.key]: e.target.checked }))} />
                <div>
                  <div className="text-sm font-medium text-slate-700">{opt.label}</div>
                  <div className="text-xs text-slate-500">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Summary */}
          <div className="p-4 bg-slate-50 rounded-xl text-sm">
            <div className="font-medium text-slate-700 mb-2">Import Summary</div>
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between"><span>Entity type:</span><span className="font-medium capitalize">{entityType}</span></div>
              <div className="flex justify-between"><span>Total rows:</span><span className="font-medium">{previewResult?.totalRows}</span></div>
              <div className="flex justify-between"><span>Valid + warning rows:</span><span className="font-medium text-green-600">{(previewResult?.validRows ?? 0) + (previewResult?.warningRows ?? 0)}</span></div>
              <div className="flex justify-between"><span>Error rows:</span><span className="font-medium text-red-600">{previewResult?.errorRows ?? 0}</span></div>
              <div className="flex justify-between"><span>Duplicate strategy:</span><span className="font-medium capitalize">{settings.duplicateHandling}</span></div>
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <button onClick={() => setStep(4)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
          <button onClick={() => setStep(6)} className="btn-primary flex items-center gap-1">
            Ready to Import <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 6: Execute confirmation
  if (step === 6) return (
    <div className="max-w-2xl mx-auto">
      <StepBar />
      <div className="card">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Ready to Import</h2>
        <p className="text-sm text-slate-500 mb-6">Review and confirm before MediLeader writes to your database</p>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="space-y-3 mb-6">
          {[
            { label: 'Source', value: source.replace('_', ' ').toUpperCase() },
            { label: 'Entity', value: ENTITY_OPTIONS.find(e => e.id === entityType)?.label ?? entityType },
            { label: 'File',   value: file?.name ?? '—' },
            { label: 'Total rows', value: String(previewResult?.totalRows ?? 0) },
            { label: 'Will import', value: `${(previewResult?.validRows ?? 0) + (previewResult?.warningRows ?? 0)} rows` },
            { label: 'Will skip',  value: `${previewResult?.errorRows ?? 0} error rows${settings.skipErrors ? ' (auto-skip on)' : ''}` },
            { label: 'Duplicates', value: settings.duplicateHandling },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-slate-500">{row.label}</span>
              <span className="font-medium text-slate-700 capitalize">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-sm text-amber-800 mb-6">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            This will write to your database. You can rollback from the Import History page if anything goes wrong.
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => setStep(5)} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
          <button onClick={executeImport} disabled={loading} className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2 transition-colors">
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Importing...</> : <><ArrowRight size={16} /> Start Import</>}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 7: Results
  if (step === 7 && executeResult) return (
    <div className="max-w-2xl mx-auto">
      <StepBar />
      <div className="card">
        <div className="text-center mb-6">
          <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
          <h2 className="text-xl font-bold text-slate-800">Import Complete</h2>
          <p className="text-sm text-slate-500 mt-1">Your data has been imported into MediLeader</p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Imported',    value: executeResult.imported,    color: 'text-green-700',  bg: 'bg-green-50' },
            { label: 'Updated',     value: executeResult.overwritten, color: 'text-blue-700',   bg: 'bg-blue-50' },
            { label: 'Skipped',     value: executeResult.skipped,     color: 'text-amber-700',  bg: 'bg-amber-50' },
            { label: 'Failed',      value: executeResult.failed,      color: 'text-red-700',    bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {executeResult.errorLog.length > 0 && (
          <div className="mb-5">
            <div className="text-sm font-semibold text-slate-700 mb-2">Failed Rows</div>
            <div className="max-h-48 overflow-auto border border-red-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-red-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-red-600">Row</th>
                    <th className="text-left px-3 py-2 text-red-600">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {executeResult.errorLog.map((e, i) => (
                    <tr key={i} className="border-t border-red-100">
                      <td className="px-3 py-1.5 text-slate-500">{e.row}</td>
                      <td className="px-3 py-1.5 text-red-600">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/import')}
            className="btn-secondary flex-1"
          >
            Import History
          </button>
          {executeResult.rollbackAvailable && (
            <button
              onClick={handleRollback}
              disabled={rollingBack}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RotateCcw size={14} /> {rollingBack ? 'Rolling back...' : 'Rollback'}
            </button>
          )}
          <button
            onClick={() => navigate(`/${entityType}`)}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            View {ENTITY_OPTIONS.find(e => e.id === entityType)?.label} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return null;
}
