import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { initDatabase } from './db';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth';
import { v4 as uuidv4 } from 'uuid';

let mainWindow: BrowserWindow | null = null;
let db: any;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'default',
    show: false,
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  db = initDatabase();
  registerIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIPCHandlers() {
  // Database handlers
  ipcMain.handle('db:select', (_event, sql: string, params: any[] = []) => {
    try {
      return db.prepare(sql).all(...params);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:get', (_event, sql: string, params: any[] = []) => {
    try {
      return db.prepare(sql).get(...params);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:run', (_event, sql: string, params: any[] = []) => {
    try {
      const result = db.prepare(sql).run(...params);
      return { lastID: result.lastInsertRowid, changes: result.changes };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('db:transaction', (_event, operations: Array<{sql: string, params: any[]}>) => {
    try {
      const tx = db.transaction(() => {
        const results = [];
        for (const op of operations) {
          const result = db.prepare(op.sql).run(...op.params);
          results.push({ lastID: result.lastInsertRowid, changes: result.changes });
        }
        return results;
      });
      return tx();
    } catch (err: any) {
      return { error: err.message };
    }
  });

  // Auth handlers
  ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
      if (!user) return { error: 'User not found' };

      const valid = verifyPassword(password, user.password_hash);
      if (!valid) return { error: 'Invalid password' };

      const token = signToken({ id: user.id, email: user.email, role: user.role });
      return { token, user: { id: user.id, email: user.email, role: user.role } };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('auth:verify', (_event, token: string) => {
    return verifyToken(token);
  });

  ipcMain.handle('auth:create-user', async (_event, userData: any, requestingToken: string) => {
    const requester = verifyToken(requestingToken);
    if (!requester || requester.role !== 'admin') {
      return { error: 'Unauthorized: admin only' };
    }
    try {
      const hash = hashPassword(userData.password);
      const result = db.prepare(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
      ).run(userData.email, hash, userData.role || 'cashier');
      return { id: result.lastInsertRowid };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('auth:setup-admin', async (_event, email: string, password: string) => {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    if (existingAdmin) return { error: 'Admin already exists' };

    const hash = hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
    ).run(email, hash, 'admin');
    return { id: result.lastInsertRowid };
  });

  // Invoice number generator
  ipcMain.handle('invoice:generate-number', () => {
    const prefix = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get() as any;
    const p = prefix?.value || 'INV';
    const last = db.prepare(`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${p}%`) as any;
    if (!last) return `${p}00001`;
    const num = parseInt(last.invoice_number.replace(p, '')) + 1;
    return `${p}${String(num).padStart(5, '0')}`;
  });

  ipcMain.handle('po:generate-number', () => {
    const prefix = db.prepare("SELECT value FROM settings WHERE key = 'po_prefix'").get() as any;
    const p = prefix?.value || 'PO';
    const last = db.prepare(`SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${p}%`) as any;
    if (!last) return `${p}00001`;
    const num = parseInt(last.po_number.replace(p, '')) + 1;
    return `${p}${String(num).padStart(5, '0')}`;
  });

  ipcMain.handle('util:uuid', () => uuidv4());

  // App info
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:userDataPath', () => app.getPath('userData'));
}
