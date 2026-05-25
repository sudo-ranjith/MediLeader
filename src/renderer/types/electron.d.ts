export {};

declare global {
  interface Window {
    api: {
      // Auth
      authLogin:        (email: string, password: string) => Promise<any>;
      authHasAdmin:     ()                                => Promise<any>;
      authVerify:       (token: string)                   => Promise<any>;
      authSetupAdmin:   (email: string, password: string, name?: string) => Promise<any>;
      authCreateUser:   (userData: any, token: string)    => Promise<any>;
      authListUsers:    (token: string)                   => Promise<any>;
      authToggleUser:   (userId: number, token: string)   => Promise<any>;
      authEncrypt:      (data: string)                    => Promise<any>;
      authDecrypt:      (data: string)                    => Promise<any>;

      // Medicines
      medicineList:           (search?: string)           => Promise<any>;
      medicineSearchWithStock:(query: string)             => Promise<any>;
      medicineGet:            (id: number)                => Promise<any>;
      medicineCreate:         (data: any)                 => Promise<any>;
      medicineUpdate:         (id: number, data: any)     => Promise<any>;
      medicineDelete:         (id: number)                => Promise<any>;

      // Batches & Stock
      batchList:       (medicineId: number)                               => Promise<any>;
      batchListAll:    ()                                                  => Promise<any>;
      batchCreate:     (data: any)                                         => Promise<any>;
      batchAdjust:     (id: number, qty: number, reason: string, userId: number) => Promise<any>;
      batchLowStock:   ()                                                  => Promise<any>;
      batchExpiring:   (days: number)                                      => Promise<any>;
      batchSlowMoving: (days: number)                                      => Promise<any>;
      stockMovements:  (opts: any)                                         => Promise<any>;

      // Customers
      customerList:           (search?: string)           => Promise<any>;
      customerGet:            (id: number)                => Promise<any>;
      customerCreate:         (data: any)                 => Promise<any>;
      customerUpdate:         (id: number, data: any)     => Promise<any>;
      customerDelete:         (id: number)                => Promise<any>;
      customerLedger:         (id: number, from?: string, to?: string) => Promise<any>;
      customerInvoices:       (id: number)                => Promise<any>;
      customerCollectPayment: (data: any)                 => Promise<any>;

      // Suppliers
      supplierList:    (search?: string)                  => Promise<any>;
      supplierGet:     (id: number)                       => Promise<any>;
      supplierCreate:  (data: any)                        => Promise<any>;
      supplierUpdate:  (id: number, data: any)            => Promise<any>;
      supplierDelete:  (id: number)                       => Promise<any>;
      supplierPayments:(id: number)                       => Promise<any>;
      supplierPay:     (data: any)                        => Promise<any>;
      supplierLedger:  (id: number, from?: string, to?: string) => Promise<any>;

      // Invoices
      invoiceCreate:         (input: any)                 => Promise<any>;
      invoiceGet:            (id: number)                 => Promise<any>;
      invoiceList:           (opts: any)                  => Promise<any>;
      invoiceCancel:         (id: number, userId: number) => Promise<any>;
      invoiceGenerateNumber: ()                           => Promise<any>;

      // Returns
      returnCreate:    (input: any)                       => Promise<any>;
      returnGet:       (id: number)                       => Promise<any>;
      returnList:      (opts: any)                        => Promise<any>;

      // Purchase Orders
      poCreate:         (input: any)                      => Promise<any>;
      poGet:            (id: number)                      => Promise<any>;
      poList:           (opts: any)                       => Promise<any>;
      poReceive:        (input: any)                      => Promise<any>;
      poUpdateStatus:   (id: number, status: string)      => Promise<any>;
      poGenerateNumber: ()                                => Promise<any>;

      // GST
      gstGSTR1:      (period: string)                     => Promise<any>;
      gstGSTR3B:     (period: string)                     => Promise<any>;
      gstHSNSummary: (from: string, to: string)           => Promise<any>;
      gstSummary:    (from: string, to: string)           => Promise<any>;

      // Reports
      reportDashboard:          ()                        => Promise<any>;
      reportDailySales:         (from: string, to: string) => Promise<any>;
      reportMedicineSales:      (from: string, to: string) => Promise<any>;
      reportExpiry:             ()                        => Promise<any>;
      reportSlowMoving:         (days: number)            => Promise<any>;
      reportDeadStock:          ()                        => Promise<any>;
      reportInventoryValuation: ()                        => Promise<any>;
      reportCredit:             ()                        => Promise<any>;
      reportSupplierOutstanding:()                        => Promise<any>;
      reportPurchaseSummary:    (from: string, to: string) => Promise<any>;
      reportStockMovements:     (from: string, to: string) => Promise<any>;

      // Print
      printInvoiceThermal:  (invoiceId: number)           => Promise<any>;
      printInvoiceA4:       (invoiceId: number)           => Promise<any>;
      printInvoiceHTML:     (invoiceId: number, type: 'thermal' | 'a4') => Promise<any>;
      printCreditNoteHTML:  (returnId: number)            => Promise<any>;

      // Settings
      settingsGet:     ()                                 => Promise<any>;
      settingsSet:     (key: string, value: string)       => Promise<any>;
      settingsSetBulk: (pairs: Record<string, string>)    => Promise<any>;

      // Ledger
      ledgerCustomerOutstanding: ()                       => Promise<any>;
      ledgerSupplierOutstanding: ()                       => Promise<any>;

      // Sync
      syncManual:        (token: string)                  => Promise<any>;
      syncGetConflicts:  ()                               => Promise<any>;
      syncResolveConflict: (id: number)                   => Promise<any>;
      onSyncStatus:      (cb: (data: any) => void)        => () => void;
      onSyncComplete:    (cb: (data: any) => void)        => () => void;

      // Backup
      backupExport: ()                                    => Promise<any>;
      backupImport: ()                                    => Promise<any>;

      // Migration / Bulk Import
      migrationAnalyze:       (filename: string, buffer: ArrayBuffer, entityType: string, userId: number) => Promise<any>;
      migrationPreview:       (sessionId: string, filename: string, buffer: ArrayBuffer, fieldMapping: Record<string, string>) => Promise<any>;
      migrationExecute:       (sessionId: string, filename: string, buffer: ArrayBuffer, settings: any, userId: number) => Promise<any>;
      migrationRollback:      (sessionId: string)        => Promise<any>;
      migrationHistory:       ()                         => Promise<any>;
      migrationSessionDetail: (sessionId: string)        => Promise<any>;

      // Utility (legacy compatibility kept)
      utilUUID:         ()                                => Promise<any>;
      getVersion:       ()                                => Promise<any>;
      getUserDataPath:  ()                                => Promise<any>;
      generateInvoiceNumber: ()                           => Promise<any>;
      generatePONumber: ()                                => Promise<any>;
      generateUUID:     ()                                => Promise<any>;
    };
  }
}
