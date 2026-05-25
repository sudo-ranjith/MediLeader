import { app, BrowserWindow, shell } from 'electron/main';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, closeDatabase } from './db/index.js';
import { registerAllHandlers } from './ipc/router.js';
import { startSyncTimer, stopSyncTimer } from './sync.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let currentToken: string | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
    },
    titleBarStyle: 'default',
    show: false,
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5300';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith('data:')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  try {
    const db = initDatabase();
    registerAllHandlers(db, mainWindow, () => currentToken);
    createWindow();
    startSyncTimer(db, mainWindow, () => currentToken);
    logger.info('MediLeader started');
  } catch (e: any) {
    logger.error(`Startup failed: ${e.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopSyncTimer();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeDatabase();
});
