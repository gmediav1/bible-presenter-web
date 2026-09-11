const fs = require("node:fs")
const path = require("node:path")

const MAX_CACHE_ENTRIES = 80
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return fallback
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(value), "utf8")
  fs.renameSync(temporaryPath, filePath)
}

function normalizeReference(reference) {
  return String(reference).trim().toLowerCase().replace(/\s+/g, " ")
}

function createPersistence({ directory, now = () => Date.now() }) {
  const settingsPath = path.join(directory, "settings.json")
  const cachePath = path.join(directory, "passage-cache.json")

  function readSettings() {
    const settings = readJson(settingsPath, {}) || {}
    return {
      controlWindowBounds: validBounds(settings.controlWindowBounds) ? settings.controlWindowBounds : null,
      lastReference: typeof settings.lastReference === "string" ? settings.lastReference : "",
      lastTranslation: typeof settings.lastTranslation === "string" ? settings.lastTranslation : "",
      preferredOutputDisplayId: typeof settings.preferredOutputDisplayId === "string" ? settings.preferredOutputDisplayId : null
    }
  }

  function saveSettings(settings) {
    try {
      writeJson(settingsPath, {
        controlWindowBounds: validBounds(settings.controlWindowBounds) ? settings.controlWindowBounds : null,
        lastReference: typeof settings.lastReference === "string" ? settings.lastReference.slice(0, 120) : "",
        lastTranslation: typeof settings.lastTranslation === "string" ? settings.lastTranslation : "",
        preferredOutputDisplayId: typeof settings.preferredOutputDisplayId === "string" ? settings.preferredOutputDisplayId : null
      })
    } catch {
      // The desktop app still works when its settings directory is unavailable.
    }
  }

  function readPassage(translation, reference) {
    const cache = readJson(cachePath, { entries: {} }) || { entries: {} }
    const key = `${translation}:${normalizeReference(reference)}`
    const entry = cache.entries?.[key]
    if (!Number.isFinite(entry?.savedAt) || !entry.payload || now() - entry.savedAt > CACHE_MAX_AGE) {
      if (entry) {
        delete cache.entries[key]
        try { writeJson(cachePath, cache) } catch { /* A failed cleanup must not block reading. */ }
      }
      return null
    }
    return entry.payload
  }

  function savePassage(translation, reference, payload) {
    try {
      if (JSON.stringify(payload).length > 512_000) return
      const cache = readJson(cachePath, { entries: {} }) || { entries: {} }
      const key = `${translation}:${normalizeReference(reference)}`
      cache.entries = cache.entries && typeof cache.entries === "object" ? cache.entries : {}
      cache.entries[key] = { savedAt: now(), payload }
      const entries = Object.entries(cache.entries)
        .filter(([, entry]) => entry && Number.isFinite(entry.savedAt))
        .sort((a, b) => b[1].savedAt - a[1].savedAt)
      cache.entries = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES))
      writeJson(cachePath, cache)
    } catch {
      // The online response remains usable when caching fails.
    }
  }

  return { readSettings, saveSettings, readPassage, savePassage }
}

function validBounds(value) {
  return value && ["x", "y", "width", "height"].every((key) => Number.isFinite(value[key])) && value.width >= 980 && value.height >= 680
}

module.exports = { CACHE_MAX_AGE, MAX_CACHE_ENTRIES, createPersistence }
