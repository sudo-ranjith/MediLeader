// ARCHITECTURE NOTE:
// This file is compiled as CommonJS (vite.config.ts: format: 'cjs', entryFileNames: 'preload.cjs').
//
// ROOT CAUSE HISTORY: Using top-level ESM `import { contextBridge } from 'electron'` caused
// Rollup to generate a CJS-body-wrapped-inside-ESM hybrid output (import/export at the top level),
// because "type":"module" in root package.json made Rollup treat the source as ESM-external.
// The .cjs extension forces Node.js CJS loader, which then failed with:
//   "SyntaxError: Cannot use import statement outside a module"
//
// FIX: Use require('electron') directly. In Electron's preload context (sandbox: false,
// nodeIntegration: false), require() is always available. This gives Rollup a plain CJS
// function call it passes straight through, producing clean CJS output with no import/export.

// @types/node provides NodeRequire globally. This explicit declaration is a safeguard
// for TypeScript strict-mode environments where require may not be inferred.
declare const require: NodeRequire;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Database ──────────────────────────────────────────────────────────────
  dbSelect: (sql: string, params?: any[]) =>
    ipcRenderer.invoke('db:select', sql, params ?? []),
  dbGet: (sql: string, params?: any[]) =>
    ipcRenderer.invoke('db:get', sql, params ?? []),
  dbRun: (sql: string, params?: any[]) =>
    ipcRenderer.invoke('db:run', sql, params ?? []),
  dbTransaction: (ops: Array<{ sql: string; params: any[] }>) =>
    ipcRenderer.invoke('db:transaction', ops),

  // ── Auth ──────────────────────────────────────────────────────────────────
  authLogin: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  authVerify: (token: string) =>
    ipcRenderer.invoke('auth:verify', token),
  authCreateUser: (userData: any, token: string) =>
    ipcRenderer.invoke('auth:create-user', userData, token),
  authSetupAdmin: (email: string, password: string) =>
    ipcRenderer.invoke('auth:setup-admin', email, password),

  // ── Invoice / PO ──────────────────────────────────────────────────────────
  generateInvoiceNumber: () => ipcRenderer.invoke('invoice:generate-number'),
  generatePONumber: () => ipcRenderer.invoke('po:generate-number'),
  generateUUID: () => ipcRenderer.invoke('util:uuid'),

  // ── App ───────────────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),

  // ── Cloud Sync ────────────────────────────────────────────────────────────
  syncManual: (token: string) => ipcRenderer.invoke('sync:manual', token),
  syncGetConflicts: () => ipcRenderer.invoke('sync:get-conflicts'),
  syncResolveConflict: (id: number) => ipcRenderer.invoke('sync:resolve-conflict', id),
  onSyncStatus: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onSyncComplete: (callback: (data: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('sync:complete', handler);
    return () => ipcRenderer.removeListener('sync:complete', handler);
  },

  // ── Backup / Restore ──────────────────────────────────────────────────────
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),

  // ── Secure storage ────────────────────────────────────────────────────────
  authEncrypt: (data: string) => ipcRenderer.invoke('auth:encrypt', data),
  authDecrypt: (data: string) => ipcRenderer.invoke('auth:decrypt', data),
});
