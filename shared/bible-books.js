export const bibleBooks = [
  ["Genesis", "GEN", ["gen", "1mo", "1mose"]],
  ["Exodus", "EXO", ["exo", "2mo", "2mose"]],
  ["Leviticus", "LEV", ["lev", "3mo", "3mose"]],
  ["Numbers", "NUM", ["num", "4mo", "4mose"]],
  ["Deuteronomy", "DEU", ["deu", "5mo", "5mose"]],
  ["Joshua", "JOS", ["jos", "josua"]],
  ["Judges", "JDG", ["judg", "richter", "ri"]],
  ["Ruth", "RUT", ["rut"]],
  ["1 Samuel", "1SA", ["1sam"]],
  ["2 Samuel", "2SA", ["2sam"]],
  ["1 Kings", "1KI", ["1ki", "1kon", "1konige", "1könige"]],
  ["2 Kings", "2KI", ["2ki", "2kon", "2konige", "2könige"]],
  ["1 Chronicles", "1CH", ["1chr", "1chronik"]],
  ["2 Chronicles", "2CH", ["2chr", "2chronik"]],
  ["Ezra", "EZR", ["ezr", "esra"]],
  ["Nehemiah", "NEH", ["neh", "nehemia"]],
  ["Esther", "EST", ["est"]],
  ["Job", "JOB", ["hiob"]],
  ["Psalms", "PSA", ["ps", "psalm", "psamls"]],
  ["Proverbs", "PRO", ["prov", "spr", "spruche", "sprüche"]],
  ["Ecclesiastes", "ECC", ["ecc", "pred", "prediger"]],
  ["Song of Solomon", "SNG", ["song", "songs", "hohelied", "hld"]],
  ["Isaiah", "ISA", ["isa", "jes", "jesaja"]],
  ["Jeremiah", "JER", ["jer", "jeremia"]],
  ["Lamentations", "LAM", ["lam", "klg", "klagelieder"]],
  ["Ezekiel", "EZK", ["ezek", "hes", "hesekiel"]],
  ["Daniel", "DAN", ["dan"]],
  ["Hosea", "HOS", ["hos"]],
  ["Joel", "JOL", []],
  ["Amos", "AMO", []],
  ["Obadiah", "OBA", ["obad", "obadja"]],
  ["Jonah", "JON", ["jon", "jona"]],
  ["Micah", "MIC", ["mic", "micha"]],
  ["Nahum", "NAM", ["nah"]],
  ["Habakkuk", "HAB", ["hab"]],
  ["Zephaniah", "ZEP", ["zeph", "zef", "zefanja"]],
  ["Haggai", "HAG", ["hag"]],
  ["Zechariah", "ZEC", ["zech", "sach", "sacharja"]],
  ["Malachi", "MAL", ["mal", "maleachi"]],
  ["Matthew", "MAT", ["mat", "matt", "mathew", "matth", "matthaus", "matthäus", "mt"]],
  ["Mark", "MRK", ["mk", "markus"]],
  ["Luke", "LUK", ["lk", "lukas"]],
  ["John", "JHN", ["jn", "joh", "johannes"]],
  ["Acts", "ACT", ["apostelgeschichte", "apg"]],
  ["Romans", "ROM", ["rom", "romer", "römer"]],
  ["1 Corinthians", "1CO", ["1cor", "1kor", "1korinther"]],
  ["2 Corinthians", "2CO", ["2cor", "2kor", "2korinther"]],
  ["Galatians", "GAL", ["gal", "galater"]],
  ["Ephesians", "EPH", ["eph", "epheser"]],
  ["Philippians", "PHP", ["phil", "philipper"]],
  ["Colossians", "COL", ["col", "kol", "kolosser"]],
  ["1 Thessalonians", "1TH", ["1thess", "1thessalonicher"]],
  ["2 Thessalonians", "2TH", ["2thess", "2thessalonicher"]],
  ["1 Timothy", "1TI", ["1tim", "1timotheus"]],
  ["2 Timothy", "2TI", ["2tim", "2timotheus"]],
  ["Titus", "TIT", ["tit"]],
  ["Philemon", "PHM", ["phlm"]],
  ["Hebrews", "HEB", ["heb", "hebraer", "hebräer"]],
  ["James", "JAS", ["jas", "jak", "jakobus"]],
  ["1 Peter", "1PE", ["1pet", "1petrus"]],
  ["2 Peter", "2PE", ["2pet", "2petrus"]],
  ["1 John", "1JN", ["1jn", "1joh", "1johannes"]],
  ["2 John", "2JN", ["2jn", "2joh", "2johannes"]],
  ["3 John", "3JN", ["3jn", "3joh", "3johannes"]],
  ["Jude", "JUD", ["jud", "judas"]],
  ["Revelation", "REV", ["rev", "offb", "offenbarung"]]
].map(([name, code, aliases], index) => ({ number: index + 1, name, code, aliases }))

export function normalizeBibleSearch(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function parseSmartReference(value = "") {
  const normalized = String(value).trim().replace(",", ":")
  if (!normalized) return null
  const verseMatch = normalized.match(/^(.*?\D)\s*(\d+)\s*:\s*(\d*(?:\s*-\s*\d*)?)$/u)
  if (verseMatch) return { bookTerm: verseMatch[1].trim(), suffix: ` ${verseMatch[2]}:${verseMatch[3].replace(/\s/g, "")}` }
  const chapterMatch = normalized.match(/^(.*?\D)\s*(\d+)$/u)
  if (chapterMatch) return { bookTerm: chapterMatch[1].trim(), suffix: ` ${chapterMatch[2]}` }
  if (/\p{L}/u.test(normalized)) return { bookTerm: normalized, suffix: "" }
  return null
}

function terms(book) {
  return [book.name, ...book.aliases].map(normalizeBibleSearch)
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(a[i - 1] !== b[j - 1]))
      previous = old
    }
  }
  return row[b.length]
}

export function suggestBibleBooks(value, limit = 8) {
  const parsed = parseSmartReference(value)
  if (!parsed?.bookTerm) return []
  const query = normalizeBibleSearch(parsed.bookTerm)
  if (!query) return []
  const ranked = bibleBooks
    .map((book) => {
      const searchTerms = terms(book)
      const exact = searchTerms.includes(query)
      const prefix = searchTerms.some((term) => term.startsWith(query))
      const contains = query.length >= 3 && searchTerms.some((term) => term.includes(query))
      const fuzzy = query.length >= 4 && Math.min(...searchTerms.map((term) => editDistance(query, term))) <= 2
      const score = exact ? 0 : prefix ? 1 : contains ? 2 : fuzzy ? 3 : 9
      return { ...book, score, reference: `${book.name}${parsed.suffix}` }
    })
  const hasDirectMatches = ranked.some((book) => book.score < 3)
  return ranked
    .filter((book) => book.score < (hasDirectMatches ? 3 : 4))
    .sort((a, b) => a.score - b.score || a.number - b.number)
    .slice(0, limit)
}

export function resolveBibleBook(value) {
  const query = normalizeBibleSearch(value)
  return bibleBooks.find((book) => terms(book).includes(query)) || null
}
