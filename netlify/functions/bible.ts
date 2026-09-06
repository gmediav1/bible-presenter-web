import type { Config, Context } from "@netlify/functions"

const translations: Record<string, { id: string; short: string; name: string }> = {
  amp: { id: "1588", short: "AMP", name: "Amplified Bible" },
  niv: { id: "111", short: "NIV", name: "New International Version" },
  kjv: { id: "kjv", short: "KJV", name: "King James Version" },
  asv: { id: "12", short: "ASV", name: "American Standard Version" },
  web: { id: "206", short: "WEB", name: "World English Bible" },
  wmb: { id: "1209", short: "WMB", name: "World Messianic Bible" },
  bsb: { id: "3034", short: "BSB", name: "Berean Study Bible" }
}

const books: Record<string, string> = {
  genesis:"GEN", exodus:"EXO", leviticus:"LEV", numbers:"NUM", deuteronomy:"DEU", joshua:"JOS", judges:"JDG", ruth:"RUT", "1 samuel":"1SA", "2 samuel":"2SA", "1 kings":"1KI", "2 kings":"2KI", "1 chronicles":"1CH", "2 chronicles":"2CH", ezra:"EZR", nehemiah:"NEH", esther:"EST", job:"JOB", psalms:"PSA", psalm:"PSA", proverbs:"PRO", ecclesiastes:"ECC", "song of solomon":"SNG", isaiah:"ISA", jeremiah:"JER", lamentations:"LAM", ezekiel:"EZK", daniel:"DAN", hosea:"HOS", joel:"JOL", amos:"AMO", obadiah:"OBA", jonah:"JON", micah:"MIC", nahum:"NAM", habakkuk:"HAB", zephaniah:"ZEP", haggai:"HAG", zechariah:"ZEC", malachi:"MAL", matthew:"MAT", mark:"MRK", luke:"LUK", john:"JHN", acts:"ACT", romans:"ROM", "1 corinthians":"1CO", "2 corinthians":"2CO", galatians:"GAL", ephesians:"EPH", philippians:"PHP", colossians:"COL", "1 thessalonians":"1TH", "2 thessalonians":"2TH", "1 timothy":"1TI", "2 timothy":"2TI", titus:"TIT", philemon:"PHM", hebrews:"HEB", james:"JAS", "1 peter":"1PE", "2 peter":"2PE", "1 john":"1JN", "2 john":"2JN", "3 john":"3JN", jude:"JUD", revelation:"REV"
}

function parseReference(reference: string) {
  const match = reference.trim().match(/^((?:[1-3]\s*)?[a-zA-Z ]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/)
  if (!match) throw new Error("Bitte eine Stelle wie John 3:16 oder John 3:16-18 eingeben.")
  const book = books[match[1].replace(/\s+/g, " ").trim().toLowerCase()]
  if (!book) throw new Error("Dieses Buch wurde nicht erkannt. Bitte den englischen Buchnamen verwenden.")
  return { book, chapter: Number(match[2]), firstVerse: Number(match[3] || 1), lastVerse: Number(match[4] || match[3] || 999) }
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
      const response = await fetch(`https://bible-api.com/${encodeURIComponent(url.searchParams.get("reference") || "")}?translation=kjv`)
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
    const verses = await Promise.all(selected.map(async (verse: any, index: number) => {
      const passage = verse.passage_id ? await yv(`bibles/${translation.id}/passages/${verse.passage_id}?format=text&include_headings=false&include_notes=false`, key) : verse
      return { number: Number(verse.number || verse.verse_number || verse.verse || verse.id || verse.title || index + parsed.firstVerse), text: text(passage) }
    }))
    if (!verses.length) return Response.json({ error:"Für diese Stelle wurden keine Verse gefunden." }, { status:404 })
    return Response.json({ verses, title: `${details?.localized_title || details?.title || translation.name} · ${url.searchParams.get("reference")}`, copyright: details?.copyright || details?.copyright_text || "" }, { headers:{ "Cache-Control":"public, max-age=300" } })
  } catch (error: any) {
    return Response.json({ error:error?.message || "Die Bibelstelle konnte nicht geladen werden." }, { status:400 })
  }
}

export const config: Config = { path: "/api/bible", method:["GET"] }
