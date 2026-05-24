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
    };
  }
}
