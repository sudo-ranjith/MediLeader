'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  // ── Auth ──────────────────────────────────────────────────────────────────
  authLogin:       (email, password)         => invoke('auth:login', email, password),
  authHasAdmin:    ()                        => invoke('auth:has-admin'),
  authVerify:      (token)                   => invoke('auth:verify', token),
  authSetupAdmin:  (email, password, name)   => invoke('auth:setup-admin', email, password, name),
  authCreateUser:  (userData, token)         => invoke('auth:create-user', userData, token),
  authListUsers:   (token)                   => invoke('auth:list-users', token),
  authToggleUser:  (userId, token)           => invoke('auth:toggle-user', userId, token),
  authEncrypt:     (data)                    => invoke('auth:encrypt', data),
  authDecrypt:     (data)                    => invoke('auth:decrypt', data),

  // ── Medicines ─────────────────────────────────────────────────────────────
  medicineList:           (search)           => invoke('medicine:list', search),
  medicineSearchWithStock:(query)            => invoke('medicine:search-with-stock', query),
  medicineGet:            (id)               => invoke('medicine:get', id),
  medicineCreate:         (data)             => invoke('medicine:create', data),
  medicineUpdate:         (id, data)         => invoke('medicine:update', id, data),
  medicineDelete:         (id)               => invoke('medicine:delete', id),

  // ── Batches & Stock ───────────────────────────────────────────────────────
  batchList:       (medicineId)              => invoke('batch:list', medicineId),
  batchListAll:    ()                        => invoke('batch:list-all'),
  batchCreate:     (data)                    => invoke('batch:create', data),
  batchAdjust:     (id, qty, reason, userId) => invoke('batch:adjust', id, qty, reason, userId),
  batchLowStock:   ()                        => invoke('batch:low-stock'),
  batchExpiring:   (days)                    => invoke('batch:expiring', days),
  batchSlowMoving: (days)                    => invoke('batch:slow-moving', days),
  stockMovements:  (opts)                    => invoke('stock:movements', opts),

  // ── Customers ─────────────────────────────────────────────────────────────
  customerList:           (search)           => invoke('customer:list', search),
  customerGet:            (id)               => invoke('customer:get', id),
  customerCreate:         (data)             => invoke('customer:create', data),
  customerUpdate:         (id, data)         => invoke('customer:update', id, data),
  customerDelete:         (id)               => invoke('customer:delete', id),
  customerLedger:         (id, from, to)     => invoke('customer:ledger', id, from, to),
  customerInvoices:       (id)               => invoke('customer:invoices', id),
  customerCollectPayment: (data)             => invoke('customer:collect-payment', data),

  // ── Suppliers ─────────────────────────────────────────────────────────────
  supplierList:    (search)                  => invoke('supplier:list', search),
  supplierGet:     (id)                      => invoke('supplier:get', id),
  supplierCreate:  (data)                    => invoke('supplier:create', data),
  supplierUpdate:  (id, data)                => invoke('supplier:update', id, data),
  supplierDelete:  (id)                      => invoke('supplier:delete', id),
  supplierPayments:(id)                      => invoke('supplier:payments', id),
  supplierPay:     (data)                    => invoke('supplier:pay', data),
  supplierLedger:  (id, from, to)            => invoke('supplier:ledger', id, from, to),

  // ── Invoices ──────────────────────────────────────────────────────────────
  invoiceCreate:         (input)             => invoke('invoice:create', input),
  invoiceGet:            (id)                => invoke('invoice:get', id),
  invoiceList:           (opts)              => invoke('invoice:list', opts),
  invoiceCancel:         (id, userId)        => invoke('invoice:cancel', id, userId),
  invoiceGenerateNumber: ()                  => invoke('invoice:generate-number'),

  // ── Returns ───────────────────────────────────────────────────────────────
  returnCreate:    (input)                   => invoke('return:create', input),
  returnGet:       (id)                      => invoke('return:get', id),
  returnList:      (opts)                    => invoke('return:list', opts),

  // ── Purchase Orders ───────────────────────────────────────────────────────
  poCreate:         (input)                  => invoke('po:create', input),
  poGet:            (id)                     => invoke('po:get', id),
  poList:           (opts)                   => invoke('po:list', opts),
  poReceive:        (input)                  => invoke('po:receive', input),
  poUpdateStatus:   (id, status)             => invoke('po:update-status', id, status),
  poGenerateNumber: ()                       => invoke('po:generate-number'),

  // ── GST ───────────────────────────────────────────────────────────────────
  gstGSTR1:      (period)                    => invoke('gst:gstr1', period),
  gstGSTR3B:     (period)                    => invoke('gst:gstr3b', period),
  gstHSNSummary: (from, to)                  => invoke('gst:hsn-summary', from, to),
  gstSummary:    (from, to)                  => invoke('gst:summary', from, to),

  // ── Reports ───────────────────────────────────────────────────────────────
  reportDashboard:          ()               => invoke('report:dashboard'),
  reportDailySales:         (from, to)       => invoke('report:daily-sales', from, to),
  reportMedicineSales:      (from, to)       => invoke('report:medicine-sales', from, to),
  reportExpiry:             ()               => invoke('report:expiry'),
  reportSlowMoving:         (days)           => invoke('report:slow-moving', days),
  reportDeadStock:          ()               => invoke('report:dead-stock'),
  reportInventoryValuation: ()               => invoke('report:inventory-valuation'),
  reportCredit:             ()               => invoke('report:credit'),
  reportSupplierOutstanding:()               => invoke('report:supplier-outstanding'),
  reportPurchaseSummary:    (from, to)       => invoke('report:purchase-summary', from, to),
  reportStockMovements:     (from, to)       => invoke('report:stock-movements', from, to),

  // ── Print ─────────────────────────────────────────────────────────────────
  printInvoiceThermal:  (invoiceId)          => invoke('print:invoice-thermal', invoiceId),
  printInvoiceA4:       (invoiceId)          => invoke('print:invoice-a4', invoiceId),
  printInvoiceHTML:     (invoiceId, type)    => invoke('print:invoice-html', invoiceId, type),
  printCreditNoteHTML:  (returnId)           => invoke('print:credit-note-html', returnId),

  // ── Settings ──────────────────────────────────────────────────────────────
  settingsGet:     ()                        => invoke('settings:get'),
  settingsSet:     (key, value)              => invoke('settings:set', key, value),
  settingsSetBulk: (pairs)                   => invoke('settings:set-bulk', pairs),

  // ── Ledger ────────────────────────────────────────────────────────────────
  ledgerCustomerOutstanding: ()              => invoke('ledger:customer-outstanding'),
  ledgerSupplierOutstanding: ()              => invoke('ledger:supplier-outstanding'),

  // ── Sync ──────────────────────────────────────────────────────────────────
  syncManual:        (token)                 => invoke('sync:manual', token),
  syncGetConflicts:  ()                      => invoke('sync:get-conflicts'),
  syncResolveConflict: (id)                  => invoke('sync:resolve-conflict', id),
  onSyncStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onSyncComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sync:complete', handler);
    return () => ipcRenderer.removeListener('sync:complete', handler);
  },

  // ── Backup ────────────────────────────────────────────────────────────────
  backupExport: () => invoke('backup:export'),
  backupImport: () => invoke('backup:import'),

  // ── Migration / Bulk Import ───────────────────────────────────────────────
  migrationAnalyze:      (filename, buffer, entityType, userId)        => invoke('migration:analyze', filename, buffer, entityType, userId),
  migrationPreview:      (sessionId, filename, buffer, fieldMapping)   => invoke('migration:preview', sessionId, filename, buffer, fieldMapping),
  migrationExecute:      (sessionId, filename, buffer, settings, userId) => invoke('migration:execute', sessionId, filename, buffer, settings, userId),
  migrationRollback:     (sessionId)                                   => invoke('migration:rollback', sessionId),
  migrationHistory:      ()                                            => invoke('migration:history'),
  migrationSessionDetail:(sessionId)                                   => invoke('migration:session-detail', sessionId),

  // ── Utility ───────────────────────────────────────────────────────────────
  utilUUID:       ()         => invoke('util:uuid'),
  getVersion:     ()         => invoke('app:version'),
  getUserDataPath:()         => invoke('app:userDataPath'),
});
