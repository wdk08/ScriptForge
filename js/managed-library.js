import { desktopInvoke, invokeDesktop } from './desktop.js';
import { fileService } from './files.js';
import { repository as legacyRepository, StorageConflictError } from './storage.js';
import { documentFingerprint, recordForFile } from './session.js';

export function managedRecord(record) {
  const { handle, fileDirectory, fileTitle, pendingRenames, folderPending, folderSaveError,
    downloadOnly, fileReferenceWarning, ...retained } = record;
  return { ...retained, managed: true, handle: null, fileName: null,
    originalFileName: record.originalFileName ?? record.fileName,
    savedFingerprint: documentFingerprint(record.recovery.document),
    recovery: { ...record.recovery, dirty: false } };
}

export async function migrateRecord(record, files, { allowLegacyRead = true } = {}) {
  const migrated = managedRecord(record);
  if (!record.handle) return migrated;
  if (record.recovery.dirty) {
    migrated.migrationNotice = 'Recovered edits were copied to your library. Your original Fountain file remains separate.';
  }
  try {
    if (!allowLegacyRead) throw new Error('Legacy references are outside this isolated library.');
    const original = await files.read(record.handle);
    if (original.hash === record.fileHash) {
      migrated.cachedSource ??= original.source;
      return migrated;
    }
    // Keep both copies when an original changed. The new working document
    // retains exact element IDs, settings, recovery data, and associations.
    migrated.legacySource = { name: original.name, source: original.source, hash: original.hash };
    migrated.migrationNotice = 'The original Fountain file changed. Your existing editor version was preserved; open the saved original as a separate screenplay from this banner.';
  } catch {
    migrated.migrationNotice = 'The original file could not be read. Your stored editor copy was preserved. You can import the original if you locate it.';
  }
  return migrated;
}

export function createManagedLibrary(legacy, files, native = null, { allowLegacyRead = true } = {}) {
  const migrations = new Map();
  const listeners = new Set();
  let migrationIssue = '';
  async function put(record, revision = null) {
    const normalized = managedRecord(record);
    if (!native) return legacy.put(normalized, revision);
    const stored = await native('library-put', { record: normalized, revision });
    for (const listener of listeners) listener();
    return stored;
  }
  async function migrate(record) {
    if (!native && record.managed) return record;
    if (!migrations.has(record.id)) {
      const work = (async () => {
        if (native) {
          const saved = await native('library-get', { id: record.id });
          if (saved) return saved;
        }
        const migrated = await migrateRecord(record, files, { allowLegacyRead });
        try { return await put(migrated, native ? null : record.revision); }
        catch (error) {
          if (error.name !== 'StorageConflictError') throw error;
          const current = native ? await native('library-get', { id: record.id }) : await legacy.get(record.id);
          if (current?.managed) return current;
          throw error;
        }
      })().finally(() => migrations.delete(record.id));
      migrations.set(record.id, work);
    }
    return migrations.get(record.id);
  }
  async function get(id) {
    if (native) {
      const saved = await native('library-get', { id });
      if (saved) return saved;
    }
    const record = await legacy.get(id);
    return record ? migrate(record) : record;
  }

  return {
    ...legacy,
    getPreference: (...args) => legacy.getPreference(...args),
    setPreference: (...args) => legacy.setPreference(...args),
    subscribe(listener) {
      if (!native) return legacy.subscribe(listener);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get, put,
    get migrationIssue() { return migrationIssue; },
    async list() {
      if (!native) return legacy.list();
      const saved = await native('library-list');
      const existing = new Set(saved.map(record => record.id));
      migrationIssue = '';
      const old = await legacy.list().catch(error => {
        migrationIssue = 'Could not check the previous library: ' + error.message;
        return [];
      });
      for (const record of old) {
        if (existing.has(record.id)) continue;
        try { saved.push(await migrate(record)); }
        catch (error) {
          migrationIssue = 'Some screenplays could not be copied yet. Their existing records are preserved. ' + error.message;
          saved.push(record);
        }
      }
      return saved.filter(record => !record.deletedAt).sort((a, b) => b.modifiedAt - a.modifiedAt);
    },
    async archive(id, revision) {
      const record = native ? await get(id) : await legacy.get(id);
      if (!record || record.deletedAt || record.revision !== revision) throw new StorageConflictError();
      if (!native && !record.managed) {
        const migrated = await migrateRecord(record, files, { allowLegacyRead });
        return put({ ...migrated, deletedAt: Date.now() }, revision);
      }
      return put({ ...record, deletedAt: Date.now() }, revision);
    },
    async restore(id, revision) {
      const record = await get(id);
      if (!record?.deletedAt || record.revision !== revision) throw new StorageConflictError();
      return put({ ...record, deletedAt: null }, revision);
    },
  };
}

const native = desktopInvoke() ? (action, body = {}) => invokeDesktop('desktop_local', { action, body }) : null;
export const libraryRepository = createManagedLibrary(legacyRepository, fileService, native, {
  allowLegacyRead: !globalThis.scriptForgeDev || Boolean(native),
});

export async function openMigratedOriginal(record, store = libraryRepository) {
  if (!record.legacySource) throw new Error('No separate original is available.');
  const existing = (await store.list()).find(item => item.originalVersionOf === record.id && item.fileHash === record.legacySource.hash);
  if (existing) return existing;
  const copy = await recordForFile({ ...record.legacySource, handle: null });
  // Derive a stable ID from the working document and original contents so
  // simultaneous clicks or a retry after interruption cannot create duplicates.
  const input = new TextEncoder().encode(record.id + ':' + record.legacySource.hash);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input)).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  copy.id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  copy.recovery.document.id = copy.id;
  copy.originalVersionOf = record.id;
  try { return await store.put(copy); }
  catch (error) {
    if (error.name !== 'StorageConflictError') throw error;
    const saved = await store.get(copy.id);
    if (!saved || saved.deletedAt) throw error;
    return saved;
  }
}
