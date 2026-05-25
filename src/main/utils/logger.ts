import fs from 'fs';
import path from 'path';

let logFile: string | null = null;

function getLogFile(): string {
  if (!logFile) {
    try {
      const { app } = require('electron');
      logFile = path.join(app.getPath('userData'), 'medileader.log');
    } catch {
      logFile = path.join(process.cwd(), 'medileader.log');
    }
  }
  return logFile;
}

function write(level: string, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(getLogFile(), line);
  } catch { /* ignore */ }
}

export const logger = {
  debug: (msg: string) => { if (process.env.NODE_ENV === 'development') write('DEBUG', msg); },
  info:  (msg: string) => write('INFO',  msg),
  warn:  (msg: string) => write('WARN',  msg),
  error: (msg: string) => write('ERROR', msg),
};
