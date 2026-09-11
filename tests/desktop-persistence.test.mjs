import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import persistenceModule from "../electron/persistence.cjs"

const { CACHE_MAX_AGE, MAX_CACHE_ENTRIES, createPersistence } = persistenceModule

function withStore(callback) {
  const directory = mkdtempSync(join(tmpdir(), "bible-presenter-test-"))
  try { callback(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test("desktop settings use a separate local file", () => withStore((directory) => {
  const store = createPersistence({ directory })
  store.saveSettings({
    controlWindowBounds: { x: 12, y: 34, width: 1200, height: 800 },
    lastReference: "Psalm 23",
    lastTranslation: "nlt",
    preferredOutputDisplayId: "42"
  })
  assert.deepEqual(store.readSettings(), {
    controlWindowBounds: { x: 12, y: 34, width: 1200, height: 800 },
    lastReference: "Psalm 23",
    lastTranslation: "nlt",
    preferredOutputDisplayId: "42"
  })
  assert.match(readFileSync(join(directory, "settings.json"), "utf8"), /Psalm 23/)
}))

test("desktop cache expires passages after thirty days", () => withStore((directory) => {
  let currentTime = 1_000_000
  const store = createPersistence({ directory, now: () => currentTime })
  store.savePassage("nlt", "John 3:16", { verses: [{ number: 16, text: "For God" }] })
  assert.equal(store.readPassage("nlt", "john   3:16").verses[0].number, 16)
  currentTime += CACHE_MAX_AGE + 1
  assert.equal(store.readPassage("nlt", "John 3:16"), null)
}))

test("desktop cache keeps the newest bounded set of passages", () => withStore((directory) => {
  let currentTime = 0
  const store = createPersistence({ directory, now: () => ++currentTime })
  for (let index = 0; index < MAX_CACHE_ENTRIES + 3; index += 1) {
    store.savePassage("kjv", `John 1:${index + 1}`, { verses: [{ number: index + 1, text: "Text" }] })
  }
  assert.equal(store.readPassage("kjv", "John 1:1"), null)
  assert.equal(store.readPassage("kjv", `John 1:${MAX_CACHE_ENTRIES + 3}`).verses[0].number, MAX_CACHE_ENTRIES + 3)
}))
