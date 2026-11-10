// Native JSON persistence may reorder object keys while preserving the model.
function canonicalJSON(document) {
  return JSON.stringify(document, (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}

/** Used only at installation/restart, never on the typing path. */
export async function flushForUpdate({session,repository,backups}) {
  if (!session) throw new Error('Wait for the screenplay to finish opening.');
  await session.flush();
  await backups.queue;
  if (session.storageError || !session.recoveryCurrent) throw new Error('Recovery could not be saved. Keep ScriptForge open and resolve the storage warning.');
  if (session.fileError || (session.record.handle && session.dirty)) throw new Error('The linked Fountain file has unsaved changes or a save error. Save it or resolve the file warning before updating.');
  const stored=await repository.get(session.record.id);
  if (canonicalJSON(stored?.recovery?.document) !== canonicalJSON(session.document)) throw new Error('Recovery verification failed. Your screenplay remains open.');
}
