// ── File Parser — CSV / TSV / JSON / XLSX ────────────────────────────────────
import * as XLSX from 'xlsx';

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  error?: string;
}

// ── CSV / TSV parser (no external dep needed) ─────────────────────────────────

function parseDelimited(content: string, delimiter: string): ParseResult {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return { headers: [], rows: [], totalRows: 0, error: 'File has no data rows' };

  const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim()).filter(Boolean);
  if (headers.length === 0) return { headers: [], rows: [], totalRows: 0, error: 'Could not read headers' };

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCSVLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });
    // Skip entirely blank rows
    if (Object.values(row).every(v => !v)) continue;
    rows.push(row);
  }

  return { headers, rows, totalRows: rows.length };
}

// RFC 4180-compliant CSV line parser with quote handling
function parseCSVLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 2; continue; }
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
    i++;
  }
  cells.push(current);
  return cells;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseJSON(content: string): ParseResult {
  try {
    const data = JSON.parse(content);
    const arr: any[] = Array.isArray(data) ? data : data.data ?? data.rows ?? data.items ?? [];
    if (!arr.length) return { headers: [], rows: [], totalRows: 0, error: 'JSON array is empty' };
    const headers = Object.keys(arr[0]).filter(k => typeof arr[0][k] !== 'object');
    const rows = arr.map(item => {
      const row: Record<string, string> = {};
      headers.forEach(h => { row[h] = String(item[h] ?? '').trim(); });
      return row;
    });
    return { headers, rows, totalRows: rows.length };
  } catch (e: any) {
    return { headers: [], rows: [], totalRows: 0, error: `Invalid JSON: ${e.message}` };
  }
}

// ── XLSX / XLS parser ─────────────────────────────────────────────────────────

function parseExcel(buffer: Buffer): ParseResult {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [], totalRows: 0, error: 'No sheets found' };
    const ws = wb.Sheets[sheetName];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (raw.length < 2) return { headers: [], rows: [], totalRows: 0, error: 'Sheet has no data rows' };

    const headers = raw[0].map((h: any) => String(h ?? '').trim()).filter(Boolean);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < raw.length; i++) {
      const row: Record<string, string> = {};
      let hasValue = false;
      headers.forEach((h, idx) => {
        const cell = raw[i][idx];
        const val = cell instanceof Date
          ? cell.toISOString().split('T')[0]
          : String(cell ?? '').trim();
        row[h] = val;
        if (val) hasValue = true;
      });
      if (hasValue) rows.push(row);
    }
    return { headers, rows, totalRows: rows.length };
  } catch (e: any) {
    return { headers: [], rows: [], totalRows: 0, error: `Excel parse error: ${e.message}` };
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function parseFile(filename: string, buffer: Buffer): ParseResult {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'csv':
      return parseDelimited(buffer.toString('utf8'), ',');
    case 'tsv':
    case 'txt':
      return parseDelimited(buffer.toString('utf8'), '\t');
    case 'json':
      return parseJSON(buffer.toString('utf8'));
    case 'xlsx':
    case 'xls':
      return parseExcel(buffer);
    default:
      // Try CSV as fallback
      return parseDelimited(buffer.toString('utf8'), ',');
  }
}

export function getPreviewRows(rows: Record<string, string>[], count = 20): Record<string, string>[] {
  return rows.slice(0, count);
}
