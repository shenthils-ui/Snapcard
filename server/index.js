// Snapcard local server: Express + better-sqlite3. Serves the built frontend
// and exposes ALL app logic through one small RPC endpoint. The logic itself
// lives in shared/store.js and is identical to the standalone build.
import express from 'express';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { rpcMethods } from '../shared/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.SNAPCARD_DB || path.join(ROOT, 'data', 'snapcard.db');

const db = openDb(DB_PATH);
const app = express();
app.use(express.json({ limit: '30mb' })); // card photos travel as base64

app.post('/api/rpc', (req, res) => {
  const { method, args } = req.body || {};
  const fn = rpcMethods[method];
  if (!fn) return res.status(400).json({ error: `unknown method: ${method}` });
  try {
    const result = fn(db, ...(Array.isArray(args) ? args : []));
    res.json({ result });
  } catch (err) {
    res.status(422).json({ error: String(err.message || err) });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'snapcard' }));

if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  // History-routing fallback: any non-API GET serves the SPA.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res
      .status(503)
      .send('<h1>Snapcard</h1><p>Frontend not built yet. Run <code>npm run build</code> first (start.bat does this automatically).</p>');
  });
}

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Snapcard is running.');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  On your Wi-Fi:     http://${ip}:${PORT}   (phones on the same network)`);
  }
  console.log('');
});
