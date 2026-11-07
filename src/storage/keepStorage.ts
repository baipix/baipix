/**
 * Asks the browser to keep Baipix's storage: by default it may clear it when the disk runs low, and
 * Safari after a week without a visit, drawings included. Chrome and Edge answer on their own, from
 * how much the site is used; Firefox asks the visitor once. Asked once per tab, after something was
 * drawn and saved, never for an untouched new file.
 */
let asked = false;

export async function keepStorage(): Promise<void> {
  if (asked) return;
  asked = true;
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persist) return;
  try {
    if (await storage.persisted?.()) return;
    await storage.persist();
  } catch {
    /* not granted, or not allowed here: the drawings are saved anyway */
  }
}

/** For tests: forgets that it already asked. */
export function resetKeepStorage(): void {
  asked = false;
}
