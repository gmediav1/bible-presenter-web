import type { Config, Context } from "@netlify/functions"
import { resolveBibleBook } from "../../shared/bible-books.js"

const translations: Record<string, { id: string; short: string; name: string }> = {
  amp: { id: "1588", short: "AMP", name: "Amplified Bible" },
  niv: { id: "111", short: "NIV", name: "New International Version" },
  kjv: { id: "kjv", short: "KJV", name: "King James Version" },
  asv: { id: "12", short: "ASV", name: "American Standard Version" },
  web: { id: "206", short: "WEB", name: "World English Bible" },
  wmb: { id: "1209", short: "WMB", name: "World Messianic Bible" },
  bsb: { id: "3034", short: "BSB", name: "Berean Study Bible" }
}

function parseReference(reference: string) {
  const match = reference.trim().match(/^((?:[1-3]\s*)?[\p{L}. ]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/u)
  if (!match) throw new Error("Bitte eine Stelle wie John 3:16 oder John 3:16-18 eingeben.")
  const book = resolveBibleBook(match[1])
  if (!book) throw new Error("Dieses Buch wurde nicht erkannt. Bitte ein Buch oder Kürzel aus den Vorschlägen wählen.")
  return { book: book.code, canonicalReference: `${book.name} ${match[2]}${match[3] ? `:${match[3]}${match[4] ? `-${match[4]}` : ""}` : ""}`, chapter: Number(match[2]), firstVerse: Number(match[3] || 1), lastVerse: Number(match[4] || match[3] || 999) }
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
  if (!response.ok) throw new Error(response.status === 401 ? "Der YouVersion-Schlüssel wurde nicht akzeptiert." : response.status === 403 ? "Für diese Übersetzung fehlt die YouVersion-Lizenz." : "YouVersion konnte die Stelle gerade nicht liefern.")
  return body?.data || body
}

export default async (request: Request, _context: Context) => {
  try {
    const key = Netlify.env.get("YOUVERSION_APP_KEY")
    if (!key) return Response.json({ error:"Die Bibelquelle ist noch nicht verbunden." }, { status:503 })
    const url = new URL(request.url)
    const translation = translations[url.searchParams.get("translation") || "niv"]
    if (!translation) return Response.json({ error:"Unbekannte Übersetzung." }, { status:400 })
    const parsed = parseReference(url.searchParams.get("reference") || "")
    if (translation.id === "kjv") {
      const response = await fetch(`https://bible-api.com/${encodeURIComponent(parsed.canonicalReference)}?translation=kjv`)
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.verses?.length) return Response.json({ error:"Die KJV-Stelle konnte nicht geladen werden." }, { status:502 })
      return Response.json({
        verses: payload.verses.map((verse: any) => ({ number:Number(verse.verse), text:text(verse.text) })),
        title: `King James Version · ${payload.reference || url.searchParams.get("reference")}`,
        copyright: "King James Version - public domain outside the United Kingdom."
      }, { headers:{ "Cache-Control":"public, max-age=300" } })
    }
    const [details, versesPayload] = await Promise.all([
      yv(`bibles/${translation.id}`, key),
      yv(`bibles/${translation.id}/books/${parsed.book}/chapters/${parsed.chapter}/verses`, key)
    ])
    const rawVerses = Array.isArray(versesPayload) ? versesPayload : versesPayload?.items || []
    const selected = rawVerses.filter((verse: any) => {
      const number = Number(verse.number || verse.verse_number || verse.verse || verse.id || verse.title)
      return number >= parsed.firstVerse && number <= parsed.lastVerse
    })
    const verses = []
    for (const [index, verse] of selected.entries()) {
      const passage = verse.passage_id ? await yv(`bibles/${translation.id}/passages/${verse.passage_id}?format=text&include_headings=false&include_notes=false`, key) : verse
      verses.push({ number: Number(verse.number || verse.verse_number || verse.verse || verse.id || verse.title || index + parsed.firstVerse), text: text(passage) })
    }
    if (!verses.length) return Response.json({ error:"Für diese Stelle wurden keine Verse gefunden." }, { status:404 })
    return Response.json({ verses, title: `${details?.localized_title || details?.title || translation.name} · ${url.searchParams.get("reference")}`, copyright: details?.copyright || details?.copyright_text || "" }, { headers:{ "Cache-Control":"public, max-age=300" } })
  } catch (error: any) {
    return Response.json({ error:error?.message || "Die Bibelstelle konnte nicht geladen werden." }, { status:400 })
  }
}

export const config: Config = { path: "/api/bible", method:["GET"] }
