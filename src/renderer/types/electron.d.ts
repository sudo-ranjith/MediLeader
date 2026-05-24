export {};

declare global {
  interface Window {
    api: {
      dbSelect: (sql: string, params?: any[]) => Promise<any[]>;
      dbGet: (sql: string, params?: any[]) => Promise<any>;
      dbRun: (sql: string, params?: any[]) => Promise<{ lastID: number; changes: number; error?: string }>;
      dbTransaction: (ops: Array<{sql: string, params: any[]}>) => Promise<any>;
      authLogin: (email: string, password: string) => Promise<{ token?: string; user?: any; error?: string }>;
      authVerify: (token: string) => Promise<any>;
      authCreateUser: (userData: any, token: string) => Promise<any>;
      authSetupAdmin: (email: string, password: string) => Promise<any>;
      generateInvoiceNumber: () => Promise<string>;
      generatePONumber: () => Promise<string>;
      generateUUID: () => Promise<string>;
      getVersion: () => Promise<string>;
      getUserDataPath: () => Promise<string>;
      syncManual: (token: string) => Promise<{ success: boolean; error?: string; pulled?: number; pushed?: number; conflicts?: number }>;
      syncGetConflicts: () => Promise<Array<{ id: number; entity_type: string; sync_id: string; created_at: string }>>;
      syncResolveConflict: (id: number) => Promise<{ success: boolean }>;
      onSyncStatus: (callback: (data: { syncing: boolean; lastSync?: string; error?: string }) => void) => () => void;
      onSyncComplete: (callback: (data: { success: boolean; pulled?: number; pushed?: number; conflicts?: number }) => void) => () => void;
      backupExport: () => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
      backupImport: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
      authEncrypt: (data: string) => Promise<string>;
      authDecrypt: (data: string) => Promise<string | null>;
    };
  }
}
