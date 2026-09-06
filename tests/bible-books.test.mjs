import assert from "node:assert/strict"
import test from "node:test"
import { resolveBibleBook, suggestBibleBooks } from "../shared/bible-books.js"

test("short English aliases produce canonical suggestions", () => {
  assert.equal(suggestBibleBooks("mat")[0].reference, "Matthew")
  assert.equal(suggestBibleBooks("ps 23:1-2")[0].reference, "Psalms 23:1-2")
})

test("German aliases and umlauts work", () => {
  assert.equal(suggestBibleBooks("joh 3:16")[0].reference, "John 3:16")
  assert.equal(suggestBibleBooks("1 kor 13")[0].reference, "1 Corinthians 13")
  assert.equal(resolveBibleBook("Matthäus").code, "MAT")
  assert.deepEqual(suggestBibleBooks("1 kor 13").map((book) => book.name), ["1 Corinthians"])
})

test("common spelling mistakes still find the intended book", () => {
  assert.equal(suggestBibleBooks("mathew")[0].name, "Matthew")
  assert.equal(suggestBibleBooks("psamls")[0].name, "Psalms")
})
