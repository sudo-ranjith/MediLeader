import { ipcMain } from 'electron/main';
import type { DB } from '../db/index.js';
import type { BrowserWindow } from 'electron';
import { ok, err } from '../types/index.js';
import { logger } from '../utils/logger.js';

// ── Services ──────────────────────────────────────────────────────────────────
import { hashPassword, verifyPassword, signToken, verifyToken } from '../auth.js';
import {
  createInvoice, getInvoiceById, cancelInvoice, getInvoiceList,
} from '../services/invoice.service.js';
import {
  createReturn, getReturnById, getReturnList,
} from '../services/return.service.js';
import {
  createPurchaseOrder, receivePurchaseOrder, recordSupplierPayment,
  getPOById, getPOList, getReceiptById, getSupplierPayments,
} from '../services/purchase.service.js';
import {
  searchMedicinesWithStock, getBatchesForMedicine, getAllBatchesWithMedicine,
  getLowStockBatches, getExpiringBatches, getSlowMovingBatches,
  adjustStock, createBatch, getMovementHistory,
} from '../services/stock.service.js';
import {
  generateGSTR1, generateGSTR3B, generateHSNSummary,
} from '../services/gst.service.js';
import {
  getDailySales, getMedicineSales, getExpiryReport, getSlowMovingReport,
  getInventoryValuation, getCreditReport, getSupplierOutstandingReport,
  getPurchaseSummary, getGSTSummary, getStockMovementReport, getDashboardStats,
  getDeadStockReport,
} from '../services/report.service.js';
import {
  getLedger, getCustomerOutstanding, getSupplierOutstanding,
} from '../services/ledger.service.js';
import {
  buildThermalInvoiceHTML, buildA4InvoiceHTML, buildCreditNoteHTML, printHTML,
} from '../services/print.service.js';
import {
  analyzeFile, previewAndValidate, executeImport, rollbackSession,
  getImportHistory, getSessionDetail,
} from '../services/migration/index.js';

type Handler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any;

function safe(name: string, fn: Handler): Handler {
  return async (event, ...args) => {
    try {
      const result = await fn(event, ...args);
      return result;
    } catch (e: any) {
      logger.error(`IPC ${name}: ${e.message}`);
      return err(e.message);
    }
  };
}

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, safe(channel, fn));
}

export function registerAllHandlers(
  db: DB,
  mainWindow: BrowserWindow | null,
  getCurrentToken: () => string | null,
): void {

  // ── Auth ────────────────────────────────────────────────────────────────────
  handle('auth:login', async (_e, email: string, password: string) => {
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email) as any;
    if (!user) return err('User not found or inactive', 'AUTH_NOT_FOUND');
    if (!verifyPassword(password, user.password_hash)) return err('Invalid password', 'AUTH_INVALID');
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return ok({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  });

  handle('auth:verify', (_e, token: string) => {
    const payload = verifyToken(token);
    return payload ? ok(payload) : err('Invalid token');
  });

  handle('auth:has-admin', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
    return ok({ hasAdmin: !!admin });
  });

  handle('auth:setup-admin', (_e, email: string, password: string, name: string) => {
    const existingAdmin = db.prepare("SELECT id FROM users WHERE role='admin'").get();
    if (existingAdmin) return err('Admin already exists');
    const hash   = hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?)'
    ).run(email, name ?? 'Admin', hash, 'admin');
    return ok({ id: result.lastInsertRowid });
  });

  handle('auth:create-user', (_e, userData: any, requestingToken: string) => {
    const requester = verifyToken(requestingToken);
    if (!requester || requester.role !== 'admin') return err('Unauthorized');
    const hash   = hashPassword(userData.password);
    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?)'
    ).run(userData.email, userData.name ?? '', hash, userData.role ?? 'cashier');
    return ok({ id: result.lastInsertRowid });
  });

  handle('auth:list-users', (_e, token: string) => {
    const requester = verifyToken(token);
    if (!requester || requester.role === 'cashier') return err('Unauthorized');
    const users = db.prepare('SELECT id, email, name, role, is_active, created_at FROM users ORDER BY id').all();
    return ok(users);
  });

  handle('auth:toggle-user', (_e, userId: number, token: string) => {
    const requester = verifyToken(token);
    if (!requester || requester.role !== 'admin') return err('Unauthorized');
    db.prepare(`UPDATE users SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id = ?`).run(userId);
    return ok(null);
  });

  // ── Medicines ────────────────────────────────────────────────────────────────
  handle('medicine:list', (_e, search: string) => {
    if (search) {
      const q = `%${search}%`;
      return ok(db.prepare(`
        SELECT * FROM medicines WHERE is_active=1
          AND (name LIKE ? OR generic_name LIKE ? OR barcode=? OR hsn_code LIKE ?)
        ORDER BY name LIMIT 100
      `).all(q, q, search, q));
    }
    return ok(db.prepare('SELECT * FROM medicines WHERE is_active=1 ORDER BY name').all());
  });

  handle('medicine:search-with-stock', (_e, query: string) => {
    return ok(searchMedicinesWithStock(db, query));
  });

  handle('medicine:get', (_e, id: number) => {
    const med = db.prepare('SELECT * FROM medicines WHERE id=?').get(id);
    return med ? ok(med) : err('Not found');
  });

  handle('medicine:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO medicines (name, generic_name, hsn_code, gst_rate, unit, mrp, cost, barcode, manufacturer, schedule, category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(data.name, data.generic_name ?? null, data.hsn_code ?? '', data.gst_rate ?? 12,
           data.unit ?? 'strip', data.mrp ?? 0, data.cost ?? 0,
           data.barcode ?? null, data.manufacturer ?? null,
           data.schedule ?? 'OTC', data.category ?? null);
    return ok({ id: result.lastInsertRowid });
  });

  handle('medicine:update', (_e, id: number, data: any) => {
    db.prepare(`
      UPDATE medicines SET name=?, generic_name=?, hsn_code=?, gst_rate=?, unit=?,
        mrp=?, cost=?, barcode=?, manufacturer=?, schedule=?, category=?,
        updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(data.name, data.generic_name ?? null, data.hsn_code ?? '', data.gst_rate ?? 12,
           data.unit ?? 'strip', data.mrp ?? 0, data.cost ?? 0,
           data.barcode ?? null, data.manufacturer ?? null,
           data.schedule ?? 'OTC', data.category ?? null, id);
    return ok(null);
  });

  handle('medicine:delete', (_e, id: number) => {
    db.prepare("UPDATE medicines SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(id);
    return ok(null);
  });

  // ── Batches & Stock ──────────────────────────────────────────────────────────
  handle('batch:list', (_e, medicineId: number) => {
    return ok(getBatchesForMedicine(db, medicineId));
  });

  handle('batch:list-all', () => {
    return ok(getAllBatchesWithMedicine(db));
  });

  handle('batch:create', (_e, data: any) => {
    const batchId = createBatch(db, {
      medicine_id:    data.medicine_id,
      batch_number:   data.batch_number,
      expiry_date:    data.expiry_date,
      purchase_price: data.purchase_price ?? 0,
      mrp:            data.mrp ?? 0,
      quantity:       data.quantity ?? 0,
      reorder_level:  data.reorder_level ?? 10,
      created_by:     data.created_by ?? 1,
    });
    return ok({ id: batchId });
  });

  handle('batch:adjust', (_e, batchId: number, newQty: number, reason: string, userId: number) => {
    adjustStock(db, batchId, newQty, reason, userId);
    return ok(null);
  });

  handle('batch:low-stock', () => {
    return ok(getLowStockBatches(db));
  });

  handle('batch:expiring', (_e, withinDays: number) => {
    return ok(getExpiringBatches(db, withinDays ?? 90));
  });

  handle('batch:slow-moving', (_e, days: number) => {
    return ok(getSlowMovingBatches(db, days ?? 90));
  });

  handle('stock:movements', (_e, opts: any) => {
    return ok(getMovementHistory(db, opts ?? {}));
  });

  // ── Customers ─────────────────────────────────────────────────────────────────
  handle('customer:list', (_e, search?: string) => {
    if (search) {
      const q = `%${search}%`;
      return ok(db.prepare(
        'SELECT * FROM customers WHERE is_active=1 AND (name LIKE ? OR phone LIKE ? OR gst_number LIKE ?) ORDER BY name'
      ).all(q, q, q));
    }
    return ok(db.prepare('SELECT * FROM customers WHERE is_active=1 ORDER BY name').all());
  });

  handle('customer:get', (_e, id: number) => {
    const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    return customer ? ok(customer) : err('Not found');
  });

  handle('customer:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO customers (name, phone, email, address, city, state, state_code, gst_number, credit_limit)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(data.name, data.phone ?? null, data.email ?? null, data.address ?? null,
           data.city ?? null, data.state ?? 'Tamil Nadu', data.state_code ?? '33',
           data.gst_number ?? null, data.credit_limit ?? 0);
    return ok({ id: result.lastInsertRowid });
  });

  handle('customer:update', (_e, id: number, data: any) => {
    db.prepare(`
      UPDATE customers SET name=?, phone=?, email=?, address=?, city=?, state=?,
        state_code=?, gst_number=?, credit_limit=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(data.name, data.phone ?? null, data.email ?? null, data.address ?? null,
           data.city ?? null, data.state ?? 'Tamil Nadu', data.state_code ?? '33',
           data.gst_number ?? null, data.credit_limit ?? 0, id);
    return ok(null);
  });

  handle('customer:delete', (_e, id: number) => {
    db.prepare("UPDATE customers SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(id);
    return ok(null);
  });

  handle('customer:ledger', (_e, customerId: number, fromDate?: string, toDate?: string) => {
    return ok(getLedger(db, 'customer', customerId, fromDate, toDate));
  });

  handle('customer:invoices', (_e, customerId: number) => {
    const invoices = db.prepare(
      'SELECT * FROM invoices WHERE customer_id=? ORDER BY invoice_date DESC'
    ).all(customerId);
    return ok(invoices);
  });

  handle('customer:collect-payment', (_e, data: any) => {
    const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(data.customer_id) as any;
    if (!customer) return err('Customer not found');

    db.transaction(() => {
      db.prepare(`
        INSERT INTO customer_payments (customer_id, customer_name, invoice_id, payment_date, amount, method, reference, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(data.customer_id, customer.name, data.invoice_id ?? null,
             data.payment_date, data.amount, data.method ?? 'cash',
             data.reference ?? null, data.notes ?? null, data.created_by ?? 1);

      db.prepare(`
        UPDATE customers SET credit_used = MAX(0, credit_used - ?), updated_at=datetime('now','localtime') WHERE id=?
      `).run(data.amount, data.customer_id);
    })();
    return ok(null);
  });

  // ── Suppliers ─────────────────────────────────────────────────────────────────
  handle('supplier:list', (_e, search?: string) => {
    if (search) {
      const q = `%${search}%`;
      return ok(db.prepare(
        'SELECT * FROM suppliers WHERE is_active=1 AND (name LIKE ? OR phone LIKE ? OR city LIKE ?) ORDER BY name'
      ).all(q, q, q));
    }
    return ok(db.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all());
  });

  handle('supplier:get', (_e, id: number) => {
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id=?').get(id);
    return supplier ? ok(supplier) : err('Not found');
  });

  handle('supplier:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO suppliers (name, phone, email, address, city, state, state_code, gstin, dl_number, dl_expiry, credit_days)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(data.name, data.phone ?? null, data.email ?? null, data.address ?? null,
           data.city ?? null, data.state ?? 'Tamil Nadu', data.state_code ?? '33',
           data.gstin ?? null, data.dl_number ?? null, data.dl_expiry ?? null,
           data.credit_days ?? 30);
    return ok({ id: result.lastInsertRowid });
  });

  handle('supplier:update', (_e, id: number, data: any) => {
    db.prepare(`
      UPDATE suppliers SET name=?, phone=?, email=?, address=?, city=?, state=?,
        state_code=?, gstin=?, dl_number=?, dl_expiry=?, credit_days=?,
        updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(data.name, data.phone ?? null, data.email ?? null, data.address ?? null,
           data.city ?? null, data.state ?? 'Tamil Nadu', data.state_code ?? '33',
           data.gstin ?? null, data.dl_number ?? null, data.dl_expiry ?? null,
           data.credit_days ?? 30, id);
    return ok(null);
  });

  handle('supplier:delete', (_e, id: number) => {
    db.prepare("UPDATE suppliers SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(id);
    return ok(null);
  });

  handle('supplier:payments', (_e, supplierId: number) => {
    return ok(getSupplierPayments(db, supplierId));
  });

  handle('supplier:pay', (_e, data: any) => {
    const id = recordSupplierPayment(db, data);
    return ok({ id });
  });

  handle('supplier:ledger', (_e, supplierId: number, fromDate?: string, toDate?: string) => {
    return ok(getLedger(db, 'supplier', supplierId, fromDate, toDate));
  });

  // ── Invoices ──────────────────────────────────────────────────────────────────
  handle('invoice:create', (_e, input: any) => {
    const invoice = createInvoice(db, input);
    return ok(invoice);
  });

  handle('invoice:get', (_e, id: number) => {
    return ok(getInvoiceById(db, id));
  });

  handle('invoice:list', (_e, opts: any) => {
    return ok(getInvoiceList(db, opts ?? {}));
  });

  handle('invoice:cancel', (_e, id: number, userId: number) => {
    cancelInvoice(db, id, userId);
    return ok(null);
  });

  handle('invoice:generate-number', () => {
    const prefix = (db.prepare("SELECT value FROM settings WHERE key='invoice_prefix'").get() as any)?.value ?? 'INV';
    const last   = db.prepare(`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as any;
    if (!last) return ok(`${prefix}00001`);
    const num = parseInt(last.invoice_number.replace(prefix, '')) + 1;
    return ok(`${prefix}${String(num).padStart(5, '0')}`);
  });

  // ── Returns ───────────────────────────────────────────────────────────────────
  handle('return:create', (_e, input: any) => {
    const ret = createReturn(db, input);
    return ok(ret);
  });

  handle('return:get', (_e, id: number) => {
    return ok(getReturnById(db, id));
  });

  handle('return:list', (_e, opts: any) => {
    return ok(getReturnList(db, opts ?? {}));
  });

  // ── Purchase Orders ───────────────────────────────────────────────────────────
  handle('po:create', (_e, input: any) => {
    const po = createPurchaseOrder(db, input);
    return ok(po);
  });

  handle('po:get', (_e, id: number) => {
    return ok(getPOById(db, id));
  });

  handle('po:list', (_e, opts: any) => {
    return ok(getPOList(db, opts ?? {}));
  });

  handle('po:receive', (_e, input: any) => {
    const receipt = receivePurchaseOrder(db, input);
    return ok(receipt);
  });

  handle('po:update-status', (_e, id: number, status: string) => {
    db.prepare("UPDATE purchase_orders SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(status, id);
    return ok(null);
  });

  handle('po:generate-number', () => {
    const prefix = (db.prepare("SELECT value FROM settings WHERE key='po_prefix'").get() as any)?.value ?? 'PO';
    const last   = db.prepare(`SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as any;
    if (!last) return ok(`${prefix}00001`);
    const num = parseInt(last.po_number.replace(prefix, '')) + 1;
    return ok(`${prefix}${String(num).padStart(5, '0')}`);
  });

  // ── GST ───────────────────────────────────────────────────────────────────────
  handle('gst:gstr1', (_e, period: string) => {
    const gstin = (db.prepare("SELECT value FROM settings WHERE key='pharmacy_gstin'").get() as any)?.value ?? '';
    return ok(generateGSTR1(db, period, gstin));
  });

  handle('gst:gstr3b', (_e, period: string) => {
    const gstin = (db.prepare("SELECT value FROM settings WHERE key='pharmacy_gstin'").get() as any)?.value ?? '';
    return ok(generateGSTR3B(db, period, gstin));
  });

  handle('gst:hsn-summary', (_e, fromDate: string, toDate: string) => {
    return ok(generateHSNSummary(db, fromDate, toDate));
  });

  handle('gst:summary', (_e, fromDate: string, toDate: string) => {
    return ok(getGSTSummary(db, fromDate, toDate));
  });

  // ── Reports ───────────────────────────────────────────────────────────────────
  handle('report:dashboard', () => {
    return ok(getDashboardStats(db));
  });

  handle('report:daily-sales', (_e, fromDate: string, toDate: string) => {
    return ok(getDailySales(db, fromDate, toDate));
  });

  handle('report:medicine-sales', (_e, fromDate: string, toDate: string) => {
    return ok(getMedicineSales(db, fromDate, toDate));
  });

  handle('report:expiry', () => {
    return ok(getExpiryReport(db));
  });

  handle('report:slow-moving', (_e, days: number) => {
    return ok(getSlowMovingReport(db, days ?? 90));
  });

  handle('report:dead-stock', () => {
    return ok(getDeadStockReport(db));
  });

  handle('report:inventory-valuation', () => {
    return ok(getInventoryValuation(db));
  });

  handle('report:credit', () => {
    return ok(getCreditReport(db));
  });

  handle('report:supplier-outstanding', () => {
    return ok(getSupplierOutstandingReport(db));
  });

  handle('report:purchase-summary', (_e, fromDate: string, toDate: string) => {
    return ok(getPurchaseSummary(db, fromDate, toDate));
  });

  handle('report:stock-movements', (_e, fromDate: string, toDate: string) => {
    return ok(getStockMovementReport(db, fromDate, toDate));
  });

  // ── Print ─────────────────────────────────────────────────────────────────────
  handle('print:invoice-thermal', async (_e, invoiceId: number) => {
    const invoice  = getInvoiceById(db, invoiceId);
    const settings = getSettingsMap(db);
    const html     = buildThermalInvoiceHTML(invoice, settings);
    await printHTML(html, false);
    return ok(null);
  });

  handle('print:invoice-a4', async (_e, invoiceId: number) => {
    const invoice  = getInvoiceById(db, invoiceId);
    const settings = getSettingsMap(db);
    const html     = buildA4InvoiceHTML(invoice, settings);
    await printHTML(html, false);
    return ok(null);
  });

  handle('print:invoice-html', (_e, invoiceId: number, type: 'thermal' | 'a4') => {
    const invoice  = getInvoiceById(db, invoiceId);
    const settings = getSettingsMap(db);
    const html     = type === 'thermal'
      ? buildThermalInvoiceHTML(invoice, settings)
      : buildA4InvoiceHTML(invoice, settings);
    return ok(html);
  });

  handle('print:credit-note-html', (_e, returnId: number) => {
    const ret      = getReturnById(db, returnId);
    const settings = getSettingsMap(db);
    const html     = buildCreditNoteHTML(ret, settings);
    return ok(html);
  });

  // ── Settings ──────────────────────────────────────────────────────────────────
  handle('settings:get', () => {
    return ok(getSettingsMap(db));
  });

  handle('settings:set', (_e, key: string, value: string) => {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')
    `).run(key, value);
    return ok(null);
  });

  handle('settings:set-bulk', (_e, pairs: Record<string, string>) => {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')
    `);
    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(pairs)) stmt.run(key, value);
    });
    tx();
    return ok(null);
  });

  // ── Utility ───────────────────────────────────────────────────────────────────
  handle('util:uuid', () => {
    return ok(crypto.randomUUID());
  });

  handle('app:version', () => {
    const { app } = require('electron');
    return ok(app.getVersion());
  });

  handle('app:userDataPath', () => {
    const { app } = require('electron');
    return ok(app.getPath('userData'));
  });

  // ── Secure storage ────────────────────────────────────────────────────────────
  handle('auth:encrypt', (_e, data: string) => {
    const { safeStorage } = require('electron');
    if (safeStorage.isEncryptionAvailable()) {
      return ok(safeStorage.encryptString(data).toString('base64'));
    }
    return ok(data);
  });

  handle('auth:decrypt', (_e, data: string) => {
    const { safeStorage } = require('electron');
    if (safeStorage.isEncryptionAvailable()) {
      try { return ok(safeStorage.decryptString(Buffer.from(data, 'base64'))); }
      catch { return err('Decryption failed'); }
    }
    return ok(data);
  });

  // ── Backup / Restore ──────────────────────────────────────────────────────────
  handle('backup:export', async () => {
    const { dialog, app } = require('electron');
    const fs = require('fs');
    const path = require('path');
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `medileader-backup-${todayISO()}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (!filePath) return ok({ cancelled: true });
    const dbPath = path.join(app.getPath('userData'), 'medileader.db');
    fs.copyFileSync(dbPath, filePath);
    return ok({ path: filePath });
  });

  handle('backup:import', async () => {
    const { dialog, app } = require('electron');
    const fs = require('fs');
    const path = require('path');
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Restore Database',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (!filePaths.length) return ok({ cancelled: true });
    const dbPath   = path.join(app.getPath('userData'), 'medileader.db');
    const safePath = path.join(app.getPath('userData'), `medileader-pre-restore-${Date.now()}.db`);
    fs.copyFileSync(dbPath, safePath);
    fs.copyFileSync(filePaths[0], dbPath);
    app.relaunch();
    app.exit(0);
    return ok(null);
  });

  // ── Ledger ────────────────────────────────────────────────────────────────────
  handle('ledger:customer-outstanding', () => {
    return ok(getCustomerOutstanding(db));
  });

  handle('ledger:supplier-outstanding', () => {
    return ok(getSupplierOutstanding(db));
  });

  // ── Migration / Bulk Import ───────────────────────────────────────────────────

  handle('migration:analyze', (_e, filename: string, bufferOrArray: any, entityType: string, userId: number) => {
    const buffer = Buffer.isBuffer(bufferOrArray) ? bufferOrArray : Buffer.from(bufferOrArray);
    return ok(analyzeFile(db, filename, buffer, entityType as any, userId));
  });

  handle('migration:preview', (_e, sessionId: string, filename: string, bufferOrArray: any, fieldMapping: any) => {
    const buffer = Buffer.isBuffer(bufferOrArray) ? bufferOrArray : Buffer.from(bufferOrArray);
    return ok(previewAndValidate(db, sessionId, filename, buffer, fieldMapping));
  });

  handle('migration:execute', (_e, sessionId: string, filename: string, bufferOrArray: any, importSettings: any, userId: number) => {
    const buffer = Buffer.isBuffer(bufferOrArray) ? bufferOrArray : Buffer.from(bufferOrArray);
    return ok(executeImport(db, sessionId, filename, buffer, importSettings, userId));
  });

  handle('migration:rollback', (_e, sessionId: string) => {
    return ok(rollbackSession(db, sessionId));
  });

  handle('migration:history', () => {
    return ok(getImportHistory(db));
  });

  handle('migration:session-detail', (_e, sessionId: string) => {
    return ok(getSessionDetail(db, sessionId));
  });

  logger.info('All IPC handlers registered');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSettingsMap(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as any[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
