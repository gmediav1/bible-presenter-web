import assert from "node:assert/strict"
import test from "node:test"
import { cachePassage, passageCacheKey, readCachedPassage } from "../src/passage-cache.js"

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  }
}

test("a passage is reused for the same translation and normalized reference", () => {
  const storage = memoryStorage()
  const payload = { verses: [{ number: 16, text: "Example" }], title: "John 3:16" }
  cachePassage(storage, "niv", " John   3:16 ", payload, 1000)
  assert.deepEqual(readCachedPassage(storage, "niv", "john 3:16", 2000), payload)
  assert.equal(readCachedPassage(storage, "kjv", "john 3:16", 2000), null)
})

test("passages expire after thirty days", () => {
  const storage = memoryStorage()
  cachePassage(storage, "niv", "John 3:16", { verses: [] }, 1000)
  const thirtyOneDays = 1000 + 31 * 24 * 60 * 60 * 1000
  assert.equal(readCachedPassage(storage, "niv", "John 3:16", thirtyOneDays), null)
  assert.equal(storage.getItem(passageCacheKey("niv", "John 3:16")), null)
})
