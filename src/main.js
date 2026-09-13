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
const desktop = window.biblePresenterDesktop || null
const isOutputWindow = location.pathname.startsWith("/output") || new URLSearchParams(location.search).has("output")
const defaultPresentation = { backgroundColor: "#151815", textColor: "#f9f6ed", verseNumberColor: "#c8df78", verseNumberScale: 1, backgroundImage: "" }
const defaultState = { reference: "John 3:16", translation: "nlt", verses: [], title: "", copyright: "", loading: false, error: "", presentation: defaultPresentation }
const savedState = readSavedState()
let current = savedState?.translation === "niv" && !savedState.verses?.length
  ? { ...savedState, translation: "nlt" }
  : savedState || defaultState
current.presentation = normalizePresentation(current.presentation)
let outputWindow = null
let referenceSuggestions = []
let activeSuggestion = -1
let outputStateSignature = ""
let desktopSettings = { preferredOutputDisplayId: null, displays: [] }

if (isOutputWindow) {
  document.title = "Bible Presenter - Ausgabe"
  document.body.classList.add("output-mode")
  renderOutput()
  if (desktop) desktop.getPresentationState().then(applyOutputState)
  else channel?.postMessage({ type: "request-state" })
  window.addEventListener("focus", syncOutputFromStorage)
  window.addEventListener("pageshow", syncOutputFromStorage)
  setInterval(syncOutputFromStorage, 1000)
  setInterval(requestCurrentOutputState, 2500)
} else {
  channel?.addEventListener("message", (event) => {
    if (event.data?.type === "request-state") publishState()
  })
  render()
  if (desktop) desktop.getSettings().then(applyDesktopSettings)
}

if (isOutputWindow && desktop) desktop.onPresentationState(applyOutputState)
if (isOutputWindow && desktop) desktop.onPresentationScroll(applyOutputScroll)

window.addEventListener("storage", (event) => {
  if (!isOutputWindow || event.key !== "bible-presenter-live" || !event.newValue) return
  try { applyOutputState(JSON.parse(event.newValue)) } catch { /* Ignore incomplete cross-window writes. */ }
})

channel?.addEventListener("message", (event) => {
  if (!isOutputWindow) return
  if (event.data?.type === "state") applyOutputState(event.data.state)
  if (event.data?.type === "scroll") applyOutputScroll(event.data.position)
})

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return
  if (isOutputWindow && event.data?.type === "state") applyOutputState(event.data.state)
  if (isOutputWindow && event.data?.type === "scroll") applyOutputScroll(event.data.position)
  if (!isOutputWindow && event.data?.type === "request-state") publishState()
})

function render() {
  const selected = translations.find((translation) => translation.id === current.translation)
  const verseMarkup = current.loading
    ? `<div class="skeleton reference-skeleton"></div><div class="skeleton verse-skeleton"></div><div class="skeleton verse-skeleton short"></div>`
    : current.verses.length
      ? current.verses.map((verse) => verseMarkup(verse)).join("")
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
            <div class="chapter-navigation" aria-label="Kapitel wechseln"><button id="previous-chapter" type="button" title="Vorheriges Kapitel" aria-label="Vorheriges Kapitel">←</button><button id="next-chapter" type="button" title="Nächstes Kapitel" aria-label="Nächstes Kapitel">→</button></div>
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
        <details class="appearance-settings">
          <summary>Darstellung der Ausgabe</summary>
          <div class="appearance-fields">
            <label>Hintergrundfarbe <input id="background-color" type="color" value="${escapeAttr(current.presentation.backgroundColor)}" /></label>
            <label>Schriftfarbe <input id="text-color" type="color" value="${escapeAttr(current.presentation.textColor)}" /></label>
            <label>Versnummern <input id="verse-number-color" type="color" value="${escapeAttr(current.presentation.verseNumberColor)}" /></label>
            <label>Größe Versnummern <span class="range-row"><input id="verse-number-scale" type="range" min="0.7" max="2.4" step="0.1" value="${current.presentation.verseNumberScale}" /><output id="verse-number-scale-value">${Math.round(current.presentation.verseNumberScale * 100)}%</output></span></label>
            <label class="image-picker">Hintergrundbild <input id="background-image" type="file" accept="image/png,image/jpeg,image/webp" /></label>
            <button id="remove-background-image" class="secondary-button" type="button" ${current.presentation.backgroundImage ? "" : "disabled"}>Hintergrundbild entfernen</button>
            <p id="background-image-status" class="appearance-note">${current.presentation.backgroundImage ? "Eigenes Hintergrundbild aktiv." : "PNG, JPG oder WebP · wird lokal gespeichert."}</p>
          </div>
        </details>
        <div class="output-controls">
          <button id="open-output" class="output-button" type="button">${desktop ? "Ausgabe auf Bildschirm 2 öffnen" : "Ausgabefenster öffnen"}</button>
          <p>${desktop ? "Der zweite Bildschirm wird automatisch erkannt und im Vollbild verwendet." : "Danach das Fenster auf Bildschirm 2 in Vollbild setzen."}</p>
          ${!desktop ? '<a class="download-button" href="https://github.com/gmediav1/bible-presenter-web/releases/download/v1.0.1/Bible-Presenter-Setup-1.0.1.exe" target="_blank" rel="noopener">Windows-App herunterladen</a><p class="download-note">Windows 10/11 · eigener Installer · ca. 90 MB</p><a class="repair-link" href="https://github.com/gmediav1/bible-presenter-web/releases/download/v1.0.1/Repariere-Bible-Presenter.ps1" target="_blank" rel="noopener">Alte Installation reparieren</a>' : ""}
          ${desktop ? `<label class="display-label" for="output-display">Ausgabebildschirm</label><select id="output-display"><option value="">Automatisch: zweiter Bildschirm</option>${desktopSettings.displays.map((display) => `<option value="${escapeAttr(display.id)}" ${display.id === desktopSettings.preferredOutputDisplayId ? "selected" : ""}>${escapeHtml(display.label)}</option>`).join("")}</select>` : ""}
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
        <form id="quick-reference-form" class="quick-reference-bar" aria-label="Schnelle Bibelstelleneingabe">
          <div class="quick-reference-row">
            <input id="quick-reference" value="${escapeAttr(current.reference)}" autocomplete="off" spellcheck="false" placeholder="Bibelstelle" aria-label="Bibelstelle schnell eingeben" />
            <button class="show-button" type="submit">Anzeigen</button>
          </div>
          <div class="reference-keypad" aria-label="Zahlen und Zeichen einfügen">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ":", "0", "-"].map((key) => `<button type="button" data-reference-key="${key}" aria-label="${key} einfügen">${key}</button>`).join("")}
            <button class="keypad-delete" type="button" data-reference-key="backspace" aria-label="Letztes Zeichen löschen">⌫</button>
          </div>
        </form>
        ${current.error ? `<div class="error" role="alert">${escapeHtml(current.error)}</div>` : ""}
        ${current.copyright ? `<p class="copyright">${escapeHtml(current.copyright)}</p>` : ""}
      </section>
    </section>`

  document.querySelector("#reference-form").addEventListener("submit", loadPassage)
  document.querySelector("#quick-reference-form").addEventListener("submit", loadPassage)
  const referenceInput = document.querySelector("#reference")
  referenceInput.addEventListener("input", updateReferenceSuggestions)
  referenceInput.addEventListener("keydown", handleReferenceKeys)
  referenceInput.addEventListener("blur", () => setTimeout(closeReferenceSuggestions, 120))
  document.querySelector("#quick-reference").addEventListener("input", updateQuickReference)
  document.querySelectorAll("[data-reference-key]").forEach((button) => button.addEventListener("click", () => insertReferenceKey(button.dataset.referenceKey)))
  document.querySelectorAll("[data-translation]").forEach((button) => button.addEventListener("click", () => {
    current.translation = button.dataset.translation
    current.error = ""
    render()
    if (current.verses.length) loadPassage()
  }))
  document.querySelector("#fullscreen").addEventListener("click", toggleFullscreen)
  document.querySelector("#open-output").addEventListener("click", openOutput)
  document.querySelector("#previous-chapter").addEventListener("click", () => shiftChapter(-1))
  document.querySelector("#next-chapter").addEventListener("click", () => shiftChapter(1))
  document.querySelector(".stage").addEventListener("scroll", syncOutputScroll, { passive: true })
  wirePresentationSettings()
  applyPresentationStyle(document.querySelector(".stage"), current.presentation)
  document.querySelector("#output-display")?.addEventListener("change", async (event) => {
    desktopSettings.preferredOutputDisplayId = await desktop.setOutputDisplay(event.currentTarget.value)
    render()
  })
}

function applyDesktopSettings(settings) {
  if (!settings) return
  desktopSettings = { preferredOutputDisplayId: settings.preferredOutputDisplayId || null, displays: settings.displays || [] }
  if (!savedState && settings.lastReference) {
    current.reference = settings.lastReference
    if (translations.some((translation) => translation.id === settings.lastTranslation)) current.translation = settings.lastTranslation
  }
  render()
}

function updateReferenceSuggestions(event) {
  current.reference = event.currentTarget.value
  syncReferenceFields(current.reference, "reference")
  referenceSuggestions = suggestBibleBooks(current.reference)
  activeSuggestion = referenceSuggestions.length ? 0 : -1
  paintReferenceSuggestions()
}

function updateQuickReference(event) {
  current.reference = event.currentTarget.value
  syncReferenceFields(current.reference, "quick-reference")
}

function syncReferenceFields(value, sourceId) {
  document.querySelectorAll("#reference, #quick-reference").forEach((field) => {
    if (field.id !== sourceId) field.value = value
  })
}

function insertReferenceKey(key) {
  const field = document.querySelector("#quick-reference")
  if (!field) return
  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? field.value.length
  const replacement = key === "backspace" ? "" : key
  const nextStart = key === "backspace" && start === end ? Math.max(0, start - 1) : start
  const nextEnd = end
  field.setRangeText(replacement, nextStart, nextEnd, "end")
  current.reference = field.value
  syncReferenceFields(current.reference, "quick-reference")
  field.focus()
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
  syncReferenceFields(current.reference, "reference")
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
    ? current.verses.map((verse) => verseMarkup(verse)).join("")
    : `<div class="empty"><p>Ausgabe verbunden.</p><span>Wähle im Bedienfenster eine Bibelstelle.</span></div>`

  app.innerHTML = `
    <main class="output-stage" aria-live="polite">
      <button id="output-fullscreen" class="output-fullscreen" type="button">Vollbild starten</button>
      <div class="stage-content">${verseMarkup}</div>
      <div class="stage-footer"><span>${escapeHtml(current.title || current.reference)}</span><span>${selected.short}</span></div>
    </main>`
  document.querySelector("#output-fullscreen").addEventListener("click", toggleOutputFullscreen)
  applyPresentationStyle(document.querySelector(".output-stage"), current.presentation)
}

function verseMarkup(verse) {
  return `<p class="verse"><sup>${verse.number}</sup>${escapeHtml(displayVerseText(verse))}</p>`
}

function displayVerseText(verse) {
  const value = String(verse.text || "")
  if (current.translation !== "nlt") return value
  return value.replace(new RegExp(`^\\s*${escapeRegExp(String(verse.number))}(?=[\\s“”"'])\\s*`), "")
}

function shiftChapter(direction) {
  const field = document.querySelector("#reference")
  const reference = field?.value.trim() || current.reference
  const match = reference.match(/^(.+?\s+)(\d+)(.*)$/)
  if (!match) {
    current.error = "Gib zuerst eine Bibelstelle wie John 3:16 ein."
    render()
    return
  }
  const chapter = Math.max(1, Number(match[2]) + direction)
  const nextReference = `${match[1]}${chapter}${match[3]}`
  current.reference = nextReference
  field.value = nextReference
  syncReferenceFields(nextReference, "reference")
  loadPassage()
}

function normalizePresentation(value) {
  const input = value && typeof value === "object" ? value : {}
  const color = (candidate, fallback) => /^#[0-9a-f]{6}$/i.test(candidate || "") ? candidate : fallback
  const scale = Number(input.verseNumberScale)
  return {
    backgroundColor: color(input.backgroundColor, defaultPresentation.backgroundColor),
    textColor: color(input.textColor, defaultPresentation.textColor),
    verseNumberColor: color(input.verseNumberColor, defaultPresentation.verseNumberColor),
    verseNumberScale: Number.isFinite(scale) ? Math.min(2.4, Math.max(0.7, scale)) : defaultPresentation.verseNumberScale,
    backgroundImage: typeof input.backgroundImage === "string" && input.backgroundImage.startsWith("data:image/") ? input.backgroundImage : ""
  }
}

function wirePresentationSettings() {
  const update = () => {
    current.presentation = normalizePresentation({
      backgroundColor: document.querySelector("#background-color").value,
      textColor: document.querySelector("#text-color").value,
      verseNumberColor: document.querySelector("#verse-number-color").value,
      verseNumberScale: document.querySelector("#verse-number-scale").value,
      backgroundImage: current.presentation.backgroundImage
    })
    document.querySelector("#verse-number-scale-value").value = `${Math.round(current.presentation.verseNumberScale * 100)}%`
    applyPresentationStyle(document.querySelector(".stage"), current.presentation)
    publishState()
  }
  document.querySelectorAll("#background-color, #text-color, #verse-number-color, #verse-number-scale").forEach((input) => input.addEventListener("input", update))
  document.querySelector("#background-image").addEventListener("change", loadBackgroundImage)
  document.querySelector("#remove-background-image").addEventListener("click", () => {
    current.presentation.backgroundImage = ""
    applyPresentationStyle(document.querySelector(".stage"), current.presentation)
    publishState()
    render()
  })
}

async function loadBackgroundImage(event) {
  const file = event.currentTarget.files?.[0]
  if (!file) return
  const status = document.querySelector("#background-image-status")
  try {
    status.textContent = "Bild wird vorbereitet …"
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => { const loaded = new Image(); loaded.onload = () => resolve(loaded); loaded.onerror = reject; loaded.src = reader.result }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const ratio = Math.min(1, 1600 / image.naturalWidth)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(image.naturalWidth * ratio)
    canvas.height = Math.round(image.naturalHeight * ratio)
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78)
    if (dataUrl.length > 2_500_000) throw new Error("Das Bild ist nach der Optimierung noch zu groß. Bitte ein kleineres Bild wählen.")
    current.presentation.backgroundImage = dataUrl
    applyPresentationStyle(document.querySelector(".stage"), current.presentation)
    publishState()
    status.textContent = "Eigenes Hintergrundbild aktiv."
    document.querySelector("#remove-background-image").disabled = false
  } catch (error) {
    status.textContent = error.message || "Das Bild konnte nicht geladen werden."
  }
}

function applyPresentationStyle(element, presentation) {
  if (!element) return
  const settings = normalizePresentation(presentation)
  element.style.setProperty("--presentation-background", settings.backgroundColor)
  element.style.setProperty("--presentation-text", settings.textColor)
  element.style.setProperty("--presentation-number", settings.verseNumberColor)
  element.style.setProperty("--presentation-number-scale", settings.verseNumberScale)
  element.style.backgroundImage = settings.backgroundImage ? `linear-gradient(rgb(0 0 0 / 24%), rgb(0 0 0 / 24%)), url(${settings.backgroundImage})` : "none"
}

function syncOutputScroll(event) {
  const source = event.currentTarget
  document.querySelector("#quick-reference-form")?.classList.toggle("visible", source.scrollTop > 72)
  const maximum = source.scrollHeight - source.clientHeight
  if (maximum <= 0) return
  const position = source.scrollTop / maximum
  desktop?.sendPresentationScroll(position)
  channel?.postMessage({ type: "scroll", position })
  if (outputWindow && !outputWindow.closed) outputWindow.postMessage({ type: "scroll", position }, location.origin)
}

function applyOutputScroll(position) {
  const ratio = Number(position)
  if (!Number.isFinite(ratio)) return
  const output = document.querySelector(".output-stage")
  if (!output) return
  requestAnimationFrame(() => { output.scrollTop = Math.max(0, Math.min(1, ratio)) * (output.scrollHeight - output.clientHeight) })
}

async function loadPassage(event) {
  event?.preventDefault()
  const field = event?.currentTarget?.querySelector("input") || document.querySelector("#reference")
  current.reference = field?.value.trim() || current.reference
  syncReferenceFields(current.reference, field?.id)
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
    const result = desktop
      ? await desktop.loadPassage({ reference: current.reference, translation: current.translation })
      : await fetch(`/api/bible?${params}`).then(async (response) => ({ ok: response.ok, payload: await response.json() }))
    const payload = result.payload
    if (!result.ok) throw new Error(payload.error || "Die Bibelstelle konnte nicht geladen werden.")
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
  if (desktop) {
    await desktop.toggleOutputFullscreen()
    return
  }
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}

async function openOutput() {
  if (desktop) {
    await desktop.openOutput()
    publishState()
    return
  }
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
  desktop?.sendPresentationState(state)
  desktop?.saveControlPreferences({ reference: state.reference, translation: state.translation })
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
function escapeRegExp(value = "") { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }
