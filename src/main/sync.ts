import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';

let syncTimer: ReturnType<typeof setInterval> | null = null;

function getSetting(db: Database.Database, key: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value || '';
}

function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
}

export async function doSync(
  db: Database.Database,
  mainWindow: BrowserWindow | null,
  token: string
): Promise<{ success: boolean; error?: string; pulled?: number; pushed?: number; conflicts?: number }> {
  const backendUrl = getSetting(db, 'backend_url');
  if (!backendUrl || !token) {
    return { success: false, error: 'Backend URL or token not configured' };
  }

  const lastSyncTime = getSetting(db, 'last_sync_time') || '2000-01-01T00:00:00.000Z';
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  try {
    mainWindow?.webContents.send('sync:status', { syncing: true });

    // PULL: get server changes since last sync
    const pullRes = await fetch(`${backendUrl}/api/v1/sync/pull`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ last_sync_time: lastSyncTime }),
      signal: AbortSignal.timeout(20000),
    });

    if (!pullRes.ok) throw new Error(`Pull failed: ${pullRes.status}`);

    const pullData = await pullRes.json();
    let pulled = 0;

    const mergePull = db.transaction(() => {
      for (const m of pullData.medicines || []) {
        if (!m.sync_id) continue;
        const exists = db.prepare('SELECT id FROM medicines WHERE sync_id = ?').get(m.sync_id);
        if (exists) {
          db.prepare(`UPDATE medicines SET name=?,hsn_code=?,gst_rate=?,unit=?,price=?,cost=?,barcode=?,manufacturer=?,updated_at=? WHERE sync_id=?`)
            .run(m.name, m.hsn_code, m.gst_rate, m.unit, m.price, m.cost, m.barcode, m.manufacturer, m.updated_at, m.sync_id);
        } else {
          db.prepare(`INSERT OR IGNORE INTO medicines (name,hsn_code,gst_rate,unit,price,cost,barcode,manufacturer,sync_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(m.name, m.hsn_code, m.gst_rate, m.unit, m.price, m.cost, m.barcode, m.manufacturer, m.sync_id, m.updated_at);
        }
        pulled++;
      }

      for (const c of pullData.customers || []) {
        if (!c.sync_id) continue;
        const exists = db.prepare('SELECT id FROM customers WHERE sync_id = ?').get(c.sync_id);
        if (exists) {
          db.prepare(`UPDATE customers SET name=?,phone=?,email=?,address=?,city=?,gst_number=?,credit_limit=?,credit_used=?,updated_at=? WHERE sync_id=?`)
            .run(c.name, c.phone, c.email, c.address, c.city, c.gst_number, c.credit_limit, c.credit_used, c.updated_at, c.sync_id);
        } else {
          db.prepare(`INSERT OR IGNORE INTO customers (name,phone,email,address,city,gst_number,credit_limit,credit_used,sync_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(c.name, c.phone, c.email, c.address, c.city, c.gst_number, c.credit_limit, c.credit_used, c.sync_id, c.updated_at);
        }
        pulled++;
      }

      for (const s of pullData.suppliers || []) {
        if (!s.sync_id) continue;
        const exists = db.prepare('SELECT id FROM suppliers WHERE sync_id = ?').get(s.sync_id);
        if (exists) {
          db.prepare(`UPDATE suppliers SET name=?,phone=?,email=?,address=?,city=?,gst_number=?,dl_number=?,updated_at=? WHERE sync_id=?`)
            .run(s.name, s.phone, s.email, s.address, s.city, s.gst_number, s.dl_number, s.updated_at, s.sync_id);
        } else {
          db.prepare(`INSERT OR IGNORE INTO suppliers (name,phone,email,address,city,gst_number,dl_number,sync_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
            .run(s.name, s.phone, s.email, s.address, s.city, s.gst_number, s.dl_number, s.sync_id, s.updated_at);
        }
        pulled++;
      }
    });
    mergePull();

    // PUSH: local changes since last sync
    const medicines = db.prepare(`SELECT * FROM medicines WHERE updated_at > ? OR sync_id IS NULL`).all(lastSyncTime);
    const customers = db.prepare(`SELECT * FROM customers WHERE updated_at > ?`).all(lastSyncTime);
    const suppliers = db.prepare(`SELECT * FROM suppliers WHERE updated_at > ?`).all(lastSyncTime);
    const invoices = db.prepare(`SELECT * FROM invoices WHERE updated_at > ?`).all(lastSyncTime);
    const stock = db.prepare(`SELECT * FROM stock WHERE updated_at > ?`).all(lastSyncTime);

    const pushRes = await fetch(`${backendUrl}/api/v1/sync/push`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ changes: { medicines, customers, suppliers, invoices, stock } }),
      signal: AbortSignal.timeout(20000),
    });

    const pushData = await pushRes.json();
    const pushed = medicines.length + customers.length + suppliers.length + invoices.length + stock.length;
    const conflicts = pushData.conflicts?.length || 0;

    if (conflicts > 0) {
      const insertConflict = db.prepare(`INSERT OR IGNORE INTO sync_conflicts (entity_type, sync_id) VALUES (?, ?)`);
      for (const c of pushData.conflicts) insertConflict.run(c.type, c.sync_id);
    }

    const newSyncTime = pullData.server_time || new Date().toISOString();
    setSetting(db, 'last_sync_time', newSyncTime);

    mainWindow?.webContents.send('sync:status', { syncing: false, lastSync: newSyncTime });
    mainWindow?.webContents.send('sync:complete', { success: true, pulled, pushed, conflicts });

    return { success: true, pulled, pushed, conflicts };
  } catch (err: any) {
    const message = err.name === 'AbortError' ? 'Sync timed out' : err.message;
    mainWindow?.webContents.send('sync:status', { syncing: false, error: message });
    return { success: false, error: message };
  }
}

export function startSyncTimer(
  db: Database.Database,
  mainWindow: BrowserWindow | null,
  getToken: () => string | null
): void {
  stopSyncTimer();
  const intervalMinutes = parseInt(getSetting(db, 'sync_interval') || '15', 10);
  const intervalMs = intervalMinutes * 60 * 1000;

  syncTimer = setInterval(async () => {
    if (getSetting(db, 'auto_sync') !== 'true') return;
    const token = getToken();
    if (!token) return;
    await doSync(db, mainWindow, token);
  }, intervalMs);
}

export function stopSyncTimer(): void {
  if (syncTimer !== null) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
