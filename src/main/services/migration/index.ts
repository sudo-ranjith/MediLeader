// ── Migration Orchestrator ────────────────────────────────────────────────────
import { randomUUID } from 'crypto';
import type { DB } from '../../db/index.js';
import { parseFile, getPreviewRows } from './parser.js';
import { detectSourceSoftware, autoMapFields, applyMapping } from './adapters.js';
import type { EntityType, SourceSoftware, FieldMapping } from './adapters.js';
import { validateRows } from './validator.js';
import { importEntities, rollbackImport } from './importer.js';
import type { ImportSettings } from './importer.js';

// ── Session helpers ───────────────────────────────────────────────────────────

function createSession(db: DB, data: {
  session_id: string;
  source_software: string;
  entity_type: string;
  file_name: string;
  file_size: number;
  total_rows: number;
  created_by: number;
}): void {
  db.prepare(`
    INSERT INTO import_sessions
      (session_id, source_software, entity_type, file_name, file_size, total_rows, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.session_id, data.source_software, data.entity_type,
    data.file_name, data.file_size, data.total_rows, data.created_by,
  );
}

function updateSession(db: DB, sessionId: string, data: Record<string, any>): void {
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(data);
  db.prepare(`UPDATE import_sessions SET ${sets} WHERE session_id = ?`).run(...vals, sessionId);
}

function getSession(db: DB, sessionId: string): any {
  return db.prepare(`SELECT * FROM import_sessions WHERE session_id = ?`).get(sessionId);
}

// ── Step 1: Analyze file ──────────────────────────────────────────────────────

export interface AnalyzeResult {
  sessionId: string;
  fileName: string;
  totalRows: number;
  headers: string[];
  previewRows: Record<string, string>[];
  detectedSoftware: SourceSoftware;
  autoMapping: FieldMapping;
  mappingConfidence: Record<string, number>;
  unmappedCanonical: string[];
  error?: string;
}

export function analyzeFile(
  db: DB,
  filename: string,
  buffer: Buffer,
  entityType: EntityType,
  userId: number,
): AnalyzeResult {
  const parsed = parseFile(filename, buffer);
  if (parsed.error) {
    return {
      sessionId: '', fileName: filename, totalRows: 0, headers: [],
      previewRows: [], detectedSoftware: 'generic_csv',
      autoMapping: {}, mappingConfidence: {}, unmappedCanonical: [],
      error: parsed.error,
    };
  }

  const detectedSoftware = detectSourceSoftware(parsed.headers);
  const { mapping, confidence, unmapped } = autoMapFields(parsed.headers, entityType);

  const sessionId = randomUUID();
  createSession(db, {
    session_id: sessionId,
    source_software: detectedSoftware,
    entity_type: entityType,
    file_name: filename,
    file_size: buffer.length,
    total_rows: parsed.totalRows,
    created_by: userId,
  });
  updateSession(db, sessionId, {
    field_mapping: JSON.stringify(mapping),
    status: 'analyzed',
  });

  return {
    sessionId,
    fileName: filename,
    totalRows: parsed.totalRows,
    headers: parsed.headers,
    previewRows: getPreviewRows(parsed.rows, 20),
    detectedSoftware,
    autoMapping: mapping,
    mappingConfidence: confidence,
    unmappedCanonical: unmapped,
  };
}

// ── Step 2: Preview + validate ────────────────────────────────────────────────

export interface PreviewResult {
  sessionId: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  previewValidations: Array<{
    rowNumber: number;
    status: 'valid' | 'warning' | 'error';
    errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }>;
    normalized: Record<string, string>;
    raw: Record<string, string>;
  }>;
  canProceed: boolean;
}

export function previewAndValidate(
  db: DB,
  sessionId: string,
  filename: string,
  buffer: Buffer,
  fieldMapping: FieldMapping,
): PreviewResult {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const parsed = parseFile(filename, buffer);
  const entityType = session.entity_type as EntityType;

  // Apply field mapping to all rows
  const mappedRows = parsed.rows.map(row => applyMapping(row, fieldMapping));

  // Validate all rows
  const validations = validateRows(mappedRows, entityType);

  const validRows   = validations.filter(v => v.status === 'valid').length;
  const warningRows = validations.filter(v => v.status === 'warning').length;
  const errorRows   = validations.filter(v => v.status === 'error').length;

  // Store mapping + stats in session
  updateSession(db, sessionId, {
    field_mapping: JSON.stringify(fieldMapping),
    total_rows:    parsed.totalRows,
    valid_rows:    validRows,
    failed_rows:   errorRows,
    status: 'ready',
  });

  return {
    sessionId,
    totalRows:    parsed.totalRows,
    validRows,
    warningRows,
    errorRows,
    previewValidations: validations.slice(0, 50).map((v, i) => ({
      ...v,
      raw: parsed.rows[i] ?? {},
    })),
    canProceed: validRows + warningRows > 0,
  };
}

// ── Step 3: Execute import ────────────────────────────────────────────────────

export interface ExecuteResult {
  sessionId: string;
  imported: number;
  skipped: number;
  failed: number;
  overwritten: number;
  totalRows: number;
  errorLog: Array<{ row: number; reason: string }>;
  rollbackAvailable: boolean;
}

export function executeImport(
  db: DB,
  sessionId: string,
  filename: string,
  buffer: Buffer,
  importSettings: ImportSettings,
  userId: number,
): ExecuteResult {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const entityType = session.entity_type as EntityType;
  const fieldMapping: FieldMapping = JSON.parse(session.field_mapping || '{}');

  updateSession(db, sessionId, { status: 'importing', started_at: new Date().toISOString() });

  const parsed = parseFile(filename, buffer);
  const mappedRows = parsed.rows.map(row => applyMapping(row, fieldMapping));
  const validations = validateRows(mappedRows, entityType);

  const importResult = importEntities(db, validations, entityType, importSettings, userId);

  const errorLog = importResult.results
    .filter(r => r.status === 'failed')
    .map(r => ({ row: r.rowNumber, reason: r.reason ?? 'Unknown error' }));

  const rollbackData: Record<string, number[]> = { [entityType]: importResult.rollbackIds };

  updateSession(db, sessionId, {
    imported_rows:   importResult.imported,
    skipped_rows:    importResult.skipped,
    failed_rows:     importResult.failed,
    rollback_ids:    JSON.stringify(rollbackData),
    error_log:       JSON.stringify(errorLog),
    import_settings: JSON.stringify(importSettings),
    status:          'completed',
    completed_at:    new Date().toISOString(),
  });

  return {
    sessionId,
    imported:         importResult.imported,
    skipped:          importResult.skipped,
    failed:           importResult.failed,
    overwritten:      importResult.overwritten,
    totalRows:        parsed.totalRows,
    errorLog,
    rollbackAvailable: importResult.rollbackIds.length > 0,
  };
}

// ── Rollback ──────────────────────────────────────────────────────────────────

export function rollbackSession(db: DB, sessionId: string): { rolledBack: number } {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (session.status === 'rolled_back') throw new Error('Session already rolled back');

  const rollbackData: Record<EntityType, number[]> = JSON.parse(session.rollback_ids || '{}');
  let totalRolledBack = 0;

  for (const [entityType, ids] of Object.entries(rollbackData) as [EntityType, number[]][]) {
    if (ids?.length) {
      rollbackImport(db, entityType, ids);
      totalRolledBack += ids.length;
    }
  }

  updateSession(db, sessionId, { status: 'rolled_back', completed_at: new Date().toISOString() });
  return { rolledBack: totalRolledBack };
}

// ── History ───────────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: number;
  session_id: string;
  source_software: string;
  entity_type: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  failed_rows: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export function getImportHistory(db: DB): SessionSummary[] {
  return db.prepare(`
    SELECT id, session_id, source_software, entity_type, file_name,
           total_rows, imported_rows, skipped_rows, failed_rows,
           status, created_at, completed_at
    FROM import_sessions ORDER BY id DESC LIMIT 100
  `).all() as SessionSummary[];
}

export function getSessionDetail(db: DB, sessionId: string): any {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  const errorLog = JSON.parse(session.error_log || '[]');
  return { ...session, errorLog };
}
