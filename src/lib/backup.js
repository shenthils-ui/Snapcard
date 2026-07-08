// Local backup: JSON export (download) + import (replace-all). The JSON body
// comes from shared/store.js and is identical on both builds, so a file
// exported on the laptop imports cleanly on the phone and vice versa.
import { call } from '../data/client.js';

export async function exportToFile() {
  const data = await call('exportData');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `snapcard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  await call('setMeta', 'last_backup_at', new Date().toISOString());
}

export async function importFromFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('bad-file');
  }
  if (!data || data.format !== 'snapcard-backup') throw new Error('bad-file');
  return call('importData', data);
}
