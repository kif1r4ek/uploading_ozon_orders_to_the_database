import { appendFileSync } from 'fs';

const LOG_FILE = process.env.LOG_FILE || 'sync.log';

export function log(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(line);
  
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // ignore file write errors
  }
}

export function info(message) { log('info', message); }
export function error(message) { log('error', message); }
export function warn(message) { log('warn', message); }
