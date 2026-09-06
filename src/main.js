import "./styles.css"

const translations = [
  { id: "amp", short: "AMP", name: "Amplified Bible", licensed: true },
  { id: "niv", short: "NIV", name: "New International Version", licensed: true },
  { id: "kjv", short: "KJV", name: "King James Version" },
  { id: "asv", short: "ASV", name: "American Standard Version" },
  { id: "web", short: "WEB", name: "World English Bible" },
  { id: "wmb", short: "WMB", name: "World Messianic Bible" },
  { id: "bsb", short: "BSB", name: "Berean Study Bible" }
]

const app = document.querySelector("#app")
const channel = "BroadcastChannel" in window ? new BroadcastChannel("bible-presenter-live-v1") : null
const isOutputWindow = location.pathname.startsWith("/output")
const defaultState = { reference: "John 3:16", translation: "niv", verses: [], title: "", copyright: "", loading: false, error: "" }
let current = readSavedState() || defaultState
let outputWindow = null

if (isOutputWindow) {
  document.title = "Bible Presenter - Ausgabe"
  document.body.classList.add("output-mode")
  renderOutput()
  channel?.postMessage({ type: "request-state" })
} else {
  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "request-state") publishState()
  })
  render()
}

window.addEventListener("storage", (event) => {
  if (!isOutputWindow || event.key !== "bible-presenter-live" || !event.newValue) return
  current = JSON.parse(event.newValue)
  renderOutput()
})

channel?.addEventListener("message", (event) => {
  if (!isOutputWindow || event.data?.type !== "state") return
  current = event.data.state
  renderOutput()
})

function render() {
  const selected = translations.find((translation) => translation.id === current.translation)
  const verseMarkup = current.loading
    ? `<div class="skeleton reference-skeleton"></div><div class="skeleton verse-skeleton"></div><div class="skeleton verse-skeleton short"></div>`
    : current.verses.length
      ? current.verses.map((verse) => `<p class="verse"><sup>${verse.number}</sup>${escapeHtml(verse.text)}</p>`).join("")
      : `<div class="empty"><p>Stelle eingeben und anzeigen.</p><span>Zum Beispiel: John 3:16-18</span></div>`

  app.innerHTML = `
    <section class="workspace" aria-label="Bible Presenter">
      <aside class="control-panel">
        <header class="brand"><span class="brand-mark" aria-hidden="true"></span><span>Bible Presenter</span></header>
        <form id="reference-form" class="reference-form">
          <label for="reference">Bibelstelle</label>
          <div class="input-row">
            <input id="reference" name="reference" value="${escapeAttr(current.reference)}" autocomplete="off" spellcheck="false" placeholder="z. B. John 3:16" />
            <button class="show-button" type="submit">Anzeigen</button>
          </div>
          <p class="help">Englische Buchnamen, Kapitel und Versbereich verwenden.</p>
        </form>
        <section class="translation-section" aria-labelledby="translation-heading">
          <h2 id="translation-heading">Übersetzung</h2>
          <div class="translation-list">
            ${translations.map((translation) => `
              <button class="translation ${translation.id === current.translation ? "selected" : ""}" data-translation="${translation.id}" type="button" aria-pressed="${translation.id === current.translation}">
                <span class="translation-code">${translation.short}</span><span>${translation.name}</span>${translation.licensed ? '<span class="license" title="Lizenzierte Übersetzung">Lizenz</span>' : ""}
              </button>`).join("")}
          </div>
        </section>
        <div class="output-controls">
          <button id="open-output" class="output-button" type="button">Ausgabefenster öffnen</button>
          <p>Danach das Fenster auf Bildschirm 2 in Vollbild setzen.</p>
        </div>
        <footer><span>7 Übersetzungen eingerichtet</span><span class="status ${current.verses.length ? "ready" : ""}">${current.verses.length ? "Live bereit" : "Bereit"}</span></footer>
      </aside>
      <section class="stage-wrap">
        <div class="stage-toolbar"><span>${selected.short} - ${selected.name}</span><button id="fullscreen" type="button">Vollbild</button></div>
        <article class="stage" aria-live="polite">
          <div class="stage-content">
            ${verseMarkup}
          </div>
          <div class="stage-footer"><span>${escapeHtml(current.title || current.reference)}</span><span>${selected.short}</span></div>
        </article>
        ${current.error ? `<div class="error" role="alert">${escapeHtml(current.error)}</div>` : ""}
        ${current.copyright ? `<p class="copyright">${escapeHtml(current.copyright)}</p>` : ""}
      </section>
    </section>`

  document.querySelector("#reference-form").addEventListener("submit", loadPassage)
  document.querySelectorAll("[data-translation]").forEach((button) => button.addEventListener("click", () => {
    current.translation = button.dataset.translation
    current.error = ""
    render()
    if (current.verses.length) loadPassage()
  }))
  document.querySelector("#fullscreen").addEventListener("click", toggleFullscreen)
  document.querySelector("#open-output").addEventListener("click", openOutput)
}

function renderOutput() {
  const selected = translations.find((translation) => translation.id === current.translation) || translations[0]
  const verseMarkup = current.verses.length
    ? current.verses.map((verse) => `<p class="verse"><sup>${verse.number}</sup>${escapeHtml(verse.text)}</p>`).join("")
    : `<div class="empty"><p>Ausgabe verbunden.</p><span>Wähle im Bedienfenster eine Bibelstelle.</span></div>`

  app.innerHTML = `
    <main class="output-stage" aria-live="polite">
      <button id="output-fullscreen" class="output-fullscreen" type="button">Vollbild starten</button>
      <div class="stage-content">${verseMarkup}</div>
      <div class="stage-footer"><span>${escapeHtml(current.title || current.reference)}</span><span>${selected.short}</span></div>
    </main>`
  document.querySelector("#output-fullscreen").addEventListener("click", toggleOutputFullscreen)
}

async function loadPassage(event) {
  event?.preventDefault()
  const field = document.querySelector("#reference")
  current.reference = field?.value.trim() || current.reference
  current.loading = true
  current.error = ""
  render()
  try {
    const params = new URLSearchParams({ reference: current.reference, translation: current.translation })
    const response = await fetch(`/api/bible?${params}`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Die Bibelstelle konnte nicht geladen werden.")
    current = { ...current, ...payload, loading: false, error: "" }
  } catch (error) {
    current.loading = false
    current.verses = []
    current.error = error.message || "Die Verbindung zur Bibelquelle ist fehlgeschlagen."
  }
  render()
  publishState()
}

async function toggleFullscreen() {
  const stage = document.querySelector(".stage")
  if (document.fullscreenElement) await document.exitFullscreen()
  else await stage.requestFullscreen()
}

async function toggleOutputFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}

async function openOutput() {
  outputWindow = window.open("/output", "BiblePresenterOutput", "popup=yes,width=1280,height=720")
  if (!outputWindow) {
    current.error = "Das Ausgabefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben."
    render()
    return
  }

  outputWindow.focus()
  publishState()

  try {
    if ("getScreenDetails" in window && window.screen.isExtended) {
      const details = await window.getScreenDetails()
      const secondScreen = details.screens.find((candidate) => candidate !== details.currentScreen && !candidate.isPrimary) || details.screens.find((candidate) => candidate !== details.currentScreen)
      if (secondScreen) {
        outputWindow.moveTo(secondScreen.availLeft, secondScreen.availTop)
        outputWindow.resizeTo(secondScreen.availWidth, secondScreen.availHeight)
      }
    }
  } catch {
    // The output still works when the browser does not grant window-placement permission.
  }
}

function publishState() {
  const state = { ...current, loading: false }
  localStorage.setItem("bible-presenter-live", JSON.stringify(state))
  channel?.postMessage({ type: "state", state })
}

function readSavedState() {
  try {
    const value = localStorage.getItem("bible-presenter-live")
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char])) }
function escapeAttr(value = "") { return escapeHtml(value) }
