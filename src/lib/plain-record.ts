/**
 * Deep-copy reactive objects into a structured-clone-safe plain snapshot.
 * Every boundary that crosses into IndexedDB or a read-only search index
 * should use this instead of leaking Vue proxies.
 */
export function plainRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
