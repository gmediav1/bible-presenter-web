import type { Config, Context } from "@netlify/functions"
import { resolveBibleBook } from "../../shared/bible-books.js"

const translations: Record<string, { id: string; short: string; name: string; publicId?: string }> = {
  amp: { id: "1588", short: "AMP", name: "Amplified Bible" },
  niv: { id: "111", short: "NIV", name: "New International Version" },
  nlt: { id: "nlt", short: "NLT", name: "New Living Translation" },
  kjv: { id: "kjv", short: "KJV", name: "King James Version" },
  asv: { id: "12", short: "ASV", name: "American Standard Version", publicId: "eng_asv" },
  web: { id: "206", short: "WEB", name: "World English Bible", publicId: "ENGWEBP" },
  wmb: { id: "1209", short: "WMB", name: "World Messianic Bible", publicId: "eng_wmb" },
  bsb: { id: "3034", short: "BSB", name: "Berean Study Bible", publicId: "BSB" }
}

function parseReference(reference: string) {
  const match = reference.trim().match(/^((?:[1-3]\s*)?[\p{L}. ]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/u)
  if (!match) throw new Error("Bitte eine Stelle wie John 3:16 oder John 3:16-18 eingeben.")
  const book = resolveBibleBook(match[1])
  if (!book) throw new Error("Dieses Buch wurde nicht erkannt. Bitte ein Buch oder Kürzel aus den Vorschlägen wählen.")
  const wholeChapter = !match[3]
  const firstVerse = Number(match[3] || 1)
  const lastVerse = Number(match[4] || match[3] || 1)
  if (!wholeChapter && lastVerse - firstVerse > 49) throw new Error("Bitte höchstens 50 Verse gleichzeitig anzeigen.")
  return { book: book.code, bookName: book.name, canonicalReference: `${book.name} ${match[2]}${match[3] ? `:${match[3]}${match[4] ? `-${match[4]}` : ""}` : ""}`, chapter: Number(match[2]), firstVerse, lastVerse, wholeChapter }
}

function text(value: unknown): string {
  if (typeof value === "string") return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  if (Array.isArray(value)) return value.map(text).join(" ")
  if (value && typeof value === "object") return text((value as any).content || (value as any).text || (value as any).body || "")
  return ""
}

async function yv(path: string, key: string) {
  const response = await fetch(`https://api.youversion.com/v1/${path}`, { headers: { Accept:"application/json", "Accept-Language":"en", "X-YVP-App-Key":key } })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error("Der YouVersion-Schlüssel wurde nicht akzeptiert.")
    if (response.status === 403) throw new Error("Für diese Übersetzung fehlt die YouVersion-Lizenz.")
    if (response.status === 429) throw new Error("YouVersion begrenzt gerade weitere Abrufe. Bereits geladene Stellen bleiben im Cache verfügbar; bitte kurz warten.")
    throw new Error(body?.message || body?.error || "YouVersion konnte die Stelle gerade nicht liefern.")
  }
  return body?.data || body
}

function cleanNltHtml(value: string) {
  let output = value
  const noteStart = /<span\b[^>]*class=["'][^"']*\btn\b[^"']*["'][^>]*>/i
  let match = noteStart.exec(output)
  while (match) {
    let depth = 1
    let cursor = match.index + match[0].length
    const tag = /<\/?span\b[^>]*>/gi
    tag.lastIndex = cursor
    let token
    while (depth && (token = tag.exec(output))) {
      depth += token[0].startsWith("</") ? -1 : 1
      cursor = tag.lastIndex
    }
    output = output.slice(0, match.index) + output.slice(cursor)
    match = noteStart.exec(output)
  }
  return text(output.replace(/<a\b[^>]*class=["'][^"']*a-tn[^"']*["'][^>]*>.*?<\/a>/gis, ""))
}

function removeEmbeddedVerseNumber(value: string, number: number) {
  return value.replace(new RegExp(`^\\s*${number}(?=[\\s“”"'])\\s*`), "")
}

function nltReference(parsed: ReturnType<typeof parseReference>) {
  const names: Record<string, string> = {
    "1 Samuel":"1Sam", "2 Samuel":"2Sam", "1 Kings":"1Kgs", "2 Kings":"2Kgs", "1 Chronicles":"1Chr", "2 Chronicles":"2Chr",
    "1 Corinthians":"1Cor", "2 Corinthians":"2Cor", "1 Thessalonians":"1Thess", "2 Thessalonians":"2Thess", "1 Timothy":"1Tim", "2 Timothy":"2Tim",
    "1 Peter":"1Pet", "2 Peter":"2Pet", "1 John":"1John", "2 John":"2John", "3 John":"3John", "Song of Solomon":"Song"
  }
  const book = names[parsed.bookName] || parsed.bookName.replace(/\s/g, "")
  return `${book}.${parsed.chapter}${parsed.wholeChapter ? "" : `.${parsed.firstVerse}${parsed.lastVerse > parsed.firstVerse ? `-${parsed.lastVerse}` : ""}`}`
}

async function getNlt(parsed: ReturnType<typeof parseReference>) {
  const url = new URL("https://api.nlt.to/api/passages")
  url.searchParams.set("ref", nltReference(parsed))
  url.searchParams.set("version", "NLT")
  url.searchParams.set("key", Netlify.env.get("NLT_API_KEY") || "TEST")
  const response = await fetch(url)
  const html = await response.text()
  if (!response.ok) throw new Error("Die NLT-Quelle konnte die Stelle gerade nicht liefern.")
  const verses = [...html.matchAll(/<verse_export\b[^>]*\bvn="(\d+)"[^>]*>([\s\S]*?)<\/verse_export>/gi)]
    .map((match) => ({ number: Number(match[1]), text: removeEmbeddedVerseNumber(cleanNltHtml(match[2]), Number(match[1])) }))
    .filter((verse) => verse.text)
  if (!verses.length) throw new Error("Für diese NLT-Stelle wurden keine Verse gefunden.")
  return {
    verses,
    title: `New Living Translation · ${parsed.canonicalReference}`,
    copyright: "Scripture quotations are taken from the Holy Bible, New Living Translation, copyright © 1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Inc. All rights reserved."
  }
}

function publicText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(publicText).join("")
  if (value && typeof value === "object") return publicText((value as any).text || (value as any).content || "")
  return ""
}

async function getPublicDomainTranslation(translation: typeof translations[string], parsed: ReturnType<typeof parseReference>) {
  const response = await fetch(`https://bible.chandlerswift.com/api/${translation.publicId}/${parsed.book}/${parsed.chapter}.json`)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.chapter?.content) throw new Error(`${translation.short} konnte die Stelle gerade nicht liefern.`)
  const verses = payload.chapter.content
    .filter((item: any) => item.type === "verse" && (parsed.wholeChapter || (Number(item.number) >= parsed.firstVerse && Number(item.number) <= parsed.lastVerse)))
    .map((item: any) => ({ number: Number(item.number), text: publicText(item.content).trim() }))
    .filter((verse: any) => verse.text)
  if (!verses.length) throw new Error("Für diese Stelle wurden keine Verse gefunden.")
  return {
    verses,
    title: `${payload.translation?.name || translation.name} · ${parsed.canonicalReference}`,
    copyright: payload.translation?.licenseNotes || `Bible text: ${payload.translation?.name || translation.name}.`
  }
}

export default async (request: Request, _context: Context) => {
  try {
    const url = new URL(request.url)
    const translation = translations[url.searchParams.get("translation") || "niv"]
    if (!translation) return Response.json({ error:"Unbekannte Übersetzung." }, { status:400 })
    const parsed = parseReference(url.searchParams.get("reference") || "")
    if (translation.id === "nlt") {
      const payload = await getNlt(parsed)
      return Response.json(payload, { headers:{ "Cache-Control":"public, max-age=86400, s-maxage=2592000" } })
    }
    if (translation.publicId) {
      const payload = await getPublicDomainTranslation(translation, parsed)
      return Response.json(payload, { headers:{ "Cache-Control":"public, max-age=86400, s-maxage=2592000" } })
    }
    if (translation.id === "kjv") {
      const response = await fetch(`https://bible-api.com/${encodeURIComponent(parsed.canonicalReference)}?translation=kjv`)
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.verses?.length) return Response.json({ error:"Die KJV-Stelle konnte nicht geladen werden." }, { status:502 })
      return Response.json({
        verses: payload.verses.map((verse: any) => ({ number:Number(verse.verse), text:text(verse.text) })),
        title: `King James Version · ${payload.reference || url.searchParams.get("reference")}`,
        copyright: "King James Version - public domain outside the United Kingdom."
      }, { headers:{ "Cache-Control":"public, max-age=86400, s-maxage=2592000" } })
    }
    const key = Netlify.env.get("YOUVERSION_APP_KEY")
    if (!key) return Response.json({ error:"Die Bibelquelle ist noch nicht verbunden." }, { status:503 })
    const verses = []
    const passageNumbers = parsed.wholeChapter ? [null] : Array.from({ length: parsed.lastVerse - parsed.firstVerse + 1 }, (_, index) => parsed.firstVerse + index)
    for (const number of passageNumbers) {
      const passageId = number === null ? `${parsed.book}.${parsed.chapter}` : `${parsed.book}.${parsed.chapter}.${number}`
      const passage = await yv(`bibles/${translation.id}/passages/${passageId}?format=text&include_headings=false&include_notes=false`, key)
      const verseText = text(passage)
      if (verseText) verses.push({ number: number || 1, text: verseText })
    }
    if (!verses.length) return Response.json({ error:"Für diese Stelle wurden keine Verse gefunden." }, { status:404 })
    return Response.json({ verses, title: `${translation.name} · ${url.searchParams.get("reference")}`, copyright: "Bible text provided through YouVersion." }, { headers:{ "Cache-Control":"public, max-age=86400, s-maxage=2592000" } })
  } catch (error: any) {
    return Response.json({ error:error?.message || "Die Bibelstelle konnte nicht geladen werden." }, { status:400 })
  }
}

export const config: Config = { path: "/api/bible", method:["GET"] }
