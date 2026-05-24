import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Database
  dbSelect: (sql: string, params?: any[]) => ipcRenderer.invoke('db:select', sql, params || []),
  dbGet: (sql: string, params?: any[]) => ipcRenderer.invoke('db:get', sql, params || []),
  dbRun: (sql: string, params?: any[]) => ipcRenderer.invoke('db:run', sql, params || []),
  dbTransaction: (ops: Array<{sql: string, params: any[]}>) => ipcRenderer.invoke('db:transaction', ops),

  // Auth
  authLogin: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  authVerify: (token: string) => ipcRenderer.invoke('auth:verify', token),
  authCreateUser: (userData: any, token: string) => ipcRenderer.invoke('auth:create-user', userData, token),
  authSetupAdmin: (email: string, password: string) => ipcRenderer.invoke('auth:setup-admin', email, password),

  // Invoice / PO
  generateInvoiceNumber: () => ipcRenderer.invoke('invoice:generate-number'),
  generatePONumber: () => ipcRenderer.invoke('po:generate-number'),
  generateUUID: () => ipcRenderer.invoke('util:uuid'),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUserDataPath: () => ipcRenderer.invoke('app:userDataPath'),

  // Cloud Sync
  syncManual: (token: string) => ipcRenderer.invoke('sync:manual', token),
  syncGetConflicts: () => ipcRenderer.invoke('sync:get-conflicts'),
  syncResolveConflict: (id: number) => ipcRenderer.invoke('sync:resolve-conflict', id),
  onSyncStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onSyncComplete: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:complete', handler);
    return () => ipcRenderer.removeListener('sync:complete', handler);
  },

  // Backup / Restore
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),

  // Secure storage
  authEncrypt: (data: string) => ipcRenderer.invoke('auth:encrypt', data),
  authDecrypt: (data: string) => ipcRenderer.invoke('auth:decrypt', data),
});
