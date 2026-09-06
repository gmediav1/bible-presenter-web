const CACHE_PREFIX = "bible-presenter-passage-v1:"
const CACHE_INDEX = "bible-presenter-passage-index-v1"
const MAX_ENTRIES = 80
const MAX_AGE = 1000 * 60 * 60 * 24 * 30

export function passageCacheKey(translation, reference) {
  const normalizedReference = String(reference).trim().toLowerCase().replace(/\s+/g, " ")
  return `${CACHE_PREFIX}${translation}:${normalizedReference}`
}

export function readCachedPassage(storage, translation, reference, now = Date.now()) {
  try {
    const key = passageCacheKey(translation, reference)
    const cached = JSON.parse(storage.getItem(key) || "null")
    if (!cached?.savedAt || !cached?.payload || now - cached.savedAt > MAX_AGE) {
      if (cached) storage.removeItem(key)
      return null
    }
    return cached.payload
  } catch {
    return null
  }
}

export function cachePassage(storage, translation, reference, payload, now = Date.now()) {
  try {
    const key = passageCacheKey(translation, reference)
    storage.setItem(key, JSON.stringify({ savedAt: now, payload }))
    const previous = JSON.parse(storage.getItem(CACHE_INDEX) || "[]").filter((entry) => entry.key !== key)
    const entries = [{ key, savedAt: now }, ...previous]
    entries.slice(MAX_ENTRIES).forEach((entry) => storage.removeItem(entry.key))
    storage.setItem(CACHE_INDEX, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // The live request still works if private browsing or a full storage quota blocks caching.
  }
}
