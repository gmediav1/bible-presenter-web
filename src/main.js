import "./styles.css"
import { suggestBibleBooks } from "../shared/bible-books.js"
import { cachePassage, readCachedPassage } from "./passage-cache.js"

const translations = [
  { id: "amp", short: "AMP", name: "Amplified Bible", licensed: true },
  { id: "niv", short: "NIV", name: "New International Version", licensed: true },
  { id: "nlt", short: "NLT", name: "New Living Translation", licensed: true },
  { id: "kjv", short: "KJV", name: "King James Version" },
  { id: "asv", short: "ASV", name: "American Standard Version" },
  { id: "web", short: "WEB", name: "World English Bible" },
  { id: "wmb", short: "WMB", name: "World Messianic Bible" },
  { id: "bsb", short: "BSB", name: "Berean Study Bible" }
]

const app = document.querySelector("#app")
const channel = "BroadcastChannel" in window ? new BroadcastChannel("bible-presenter-live-v1") : null
const isOutputWindow = location.pathname.startsWith("/output")
const defaultState = { reference: "John 3:16", translation: "nlt", verses: [], title: "", copyright: "", loading: false, error: "" }
const savedState = readSavedState()
let current = savedState?.translation === "niv" && !savedState.verses?.length
  ? { ...savedState, translation: "nlt" }
  : savedState || defaultState
let outputWindow = null
let referenceSuggestions = []
let activeSuggestion = -1
let outputStateSignature = ""

if (isOutputWindow) {
  document.title = "Bible Presenter - Ausgabe"
  document.body.classList.add("output-mode")
  renderOutput()
  channel?.postMessage({ type: "request-state" })
  window.addEventListener("focus", syncOutputFromStorage)
  window.addEventListener("pageshow", syncOutputFromStorage)
  setInterval(syncOutputFromStorage, 1000)
  setInterval(requestCurrentOutputState, 2500)
} else {
  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "request-state") publishState()
  })
  render()
}

window.addEventListener("storage", (event) => {
  if (!isOutputWindow || event.key !== "bible-presenter-live" || !event.newValue) return
  try { applyOutputState(JSON.parse(event.newValue)) } catch { /* Ignore incomplete cross-window writes. */ }
})

channel?.addEventListener("message", (event) => {
  if (!isOutputWindow || event.data?.type !== "state") return
  applyOutputState(event.data.state)
})

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return
  if (isOutputWindow && event.data?.type === "state") applyOutputState(event.data.state)
  if (!isOutputWindow && event.data?.type === "request-state") publishState()
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
          <div class="reference-search">
            <div class="input-row">
              <input id="reference" name="reference" value="${escapeAttr(current.reference)}" autocomplete="off" spellcheck="false" placeholder="z. B. Mat 5:3-10 oder Ps 23" role="combobox" aria-autocomplete="list" aria-controls="reference-suggestions" aria-expanded="false" />
              <button class="show-button" type="submit">Anzeigen</button>
            </div>
            <div id="reference-suggestions" class="reference-suggestions" role="listbox" hidden></div>
          </div>
          <p class="help">Kürzel funktionieren: Mat, Ps, Joh, 1 Kor …</p>
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
        <footer><span>8 Übersetzungen eingerichtet</span><span class="status ${current.verses.length ? "ready" : ""}">${current.verses.length ? "Live bereit" : "Bereit"}</span></footer>
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
  const referenceInput = document.querySelector("#reference")
  referenceInput.addEventListener("input", updateReferenceSuggestions)
  referenceInput.addEventListener("keydown", handleReferenceKeys)
  referenceInput.addEventListener("blur", () => setTimeout(closeReferenceSuggestions, 120))
  document.querySelectorAll("[data-translation]").forEach((button) => button.addEventListener("click", () => {
    current.translation = button.dataset.translation
    current.error = ""
    render()
    if (current.verses.length) loadPassage()
  }))
  document.querySelector("#fullscreen").addEventListener("click", toggleFullscreen)
  document.querySelector("#open-output").addEventListener("click", openOutput)
}

function updateReferenceSuggestions(event) {
  current.reference = event.currentTarget.value
  referenceSuggestions = suggestBibleBooks(current.reference)
  activeSuggestion = referenceSuggestions.length ? 0 : -1
  paintReferenceSuggestions()
}

function paintReferenceSuggestions() {
  const list = document.querySelector("#reference-suggestions")
  const field = document.querySelector("#reference")
  if (!list || !field) return
  list.hidden = !referenceSuggestions.length
  field.setAttribute("aria-expanded", String(Boolean(referenceSuggestions.length)))
  field.setAttribute("aria-activedescendant", activeSuggestion >= 0 ? `reference-option-${activeSuggestion}` : "")
  list.innerHTML = referenceSuggestions.map((book, index) => `
    <button id="reference-option-${index}" class="reference-suggestion ${index === activeSuggestion ? "active" : ""}" type="button" role="option" aria-selected="${index === activeSuggestion}" data-suggestion="${index}">
      <span><strong>${escapeHtml(book.name)}</strong><small>${escapeHtml(book.aliases.slice(0, 3).join(" · "))}</small></span>
      <span class="suggested-reference">${escapeHtml(book.reference)}</span>
    </button>`).join("")
  list.querySelectorAll("[data-suggestion]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", () => selectReferenceSuggestion(Number(button.dataset.suggestion)))
  })
}

function selectReferenceSuggestion(index) {
  const suggestion = referenceSuggestions[index]
  const field = document.querySelector("#reference")
  if (!suggestion || !field) return
  current.reference = suggestion.reference
  field.value = suggestion.reference
  closeReferenceSuggestions()
  field.focus()
}

function closeReferenceSuggestions() {
  referenceSuggestions = []
  activeSuggestion = -1
  paintReferenceSuggestions()
}

function handleReferenceKeys(event) {
  if (!referenceSuggestions.length) return
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    const direction = event.key === "ArrowDown" ? 1 : -1
    activeSuggestion = (activeSuggestion + direction + referenceSuggestions.length) % referenceSuggestions.length
    paintReferenceSuggestions()
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault()
    const completeReference = referenceSuggestions[activeSuggestion]?.reference || ""
    selectReferenceSuggestion(activeSuggestion)
    if (/\s\d+:\d+(?:-\d+)?$/.test(completeReference)) loadPassage()
  } else if (event.key === "Escape") {
    event.preventDefault()
    closeReferenceSuggestions()
  }
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
  const cached = readCachedPassage(localStorage, current.translation, current.reference)
  if (cached) {
    current = { ...current, ...cached, loading: false, error: "" }
    render()
    publishState()
    return
  }
  current.loading = true
  current.error = ""
  render()
  try {
    const params = new URLSearchParams({ reference: current.reference, translation: current.translation })
    const response = await fetch(`/api/bible?${params}`)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || "Die Bibelstelle konnte nicht geladen werden.")
    cachePassage(localStorage, current.translation, current.reference, payload)
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
  if (outputWindow && !outputWindow.closed) outputWindow.postMessage({ type: "state", state }, location.origin)
}

function applyOutputState(state) {
  if (!state) return
  const signature = JSON.stringify(state)
  if (signature === outputStateSignature) return
  outputStateSignature = signature
  current = state
  renderOutput()
}

function syncOutputFromStorage() {
  if (!isOutputWindow) return
  try {
    const saved = localStorage.getItem("bible-presenter-live")
    if (saved && saved !== outputStateSignature) applyOutputState(JSON.parse(saved))
  } catch {
    // BroadcastChannel remains the primary synchronization path.
  }
}

function requestCurrentOutputState() {
  channel?.postMessage({ type: "request-state" })
  if (window.opener && !window.opener.closed) window.opener.postMessage({ type: "request-state" }, location.origin)
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
