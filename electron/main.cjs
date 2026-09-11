const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron")
const { autoUpdater } = require("electron-updater")
const path = require("node:path")
const { createPersistence } = require("./persistence.cjs")

const APP_NAME = "Bible Presenter"
const APP_ID = "de.gwinnmedia.biblepresenter"
const BIBLE_SERVICE_URL = process.env.BIBLE_PRESENTER_API_ORIGIN || "https://bible-presenter-web.netlify.app"
const TRANSLATIONS = new Set(["amp", "niv", "nlt", "kjv", "asv", "web", "wmb", "bsb"])
let controlWindow
let outputWindow
let presentationState
let updatePromptOpen = false

// This intentionally differs from ChurchPresenter. Electron uses this folder
// for settings, cookies and cached Bible passages on Windows and macOS.
app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME))
const persistence = createPersistence({ directory: app.getPath("userData") })
let settings = persistence.readSettings()

function createControlWindow() {
  controlWindow = new BrowserWindow({
    ...(settings.controlWindowBounds || { width: 1440, height: 920 }),
    minWidth: 980,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  controlWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"))
  controlWindow.on("closed", () => {
    controlWindow = null
  })
  controlWindow.on("close", () => {
    settings.controlWindowBounds = controlWindow.getBounds()
    persistence.saveSettings(settings)
  })
}

function getOutputDisplay() {
  const displays = screen.getAllDisplays()
  const controlDisplay = controlWindow ? screen.getDisplayMatching(controlWindow.getBounds()) : screen.getPrimaryDisplay()
  if (settings.preferredOutputDisplayId) {
    const preferred = displays.find((display) => String(display.id) === settings.preferredOutputDisplayId)
    if (preferred) return preferred
  }
  return displays.find((display) => display.id !== controlDisplay.id) || null
}

function getDisplayOptions() {
  const controlDisplay = controlWindow ? screen.getDisplayMatching(controlWindow.getBounds()) : screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: `Bildschirm ${index + 1}${display.id === controlDisplay.id ? " (Steuerung)" : ""}${display.id === screen.getPrimaryDisplay().id ? " (Hauptbildschirm)" : ""}`,
    isControlDisplay: display.id === controlDisplay.id
  }))
}

function sendPresentationState() {
  if (!outputWindow || outputWindow.isDestroyed() || !presentationState) return
  outputWindow.webContents.send("presentation:state", presentationState)
}

function createOrFocusOutputWindow() {
  if (outputWindow && !outputWindow.isDestroyed()) {
    outputWindow.show()
    outputWindow.focus()
    sendPresentationState()
    return
  }

  const selectedDisplay = getOutputDisplay()
  const controlDisplay = controlWindow ? screen.getDisplayMatching(controlWindow.getBounds()) : screen.getPrimaryDisplay()
  const display = selectedDisplay || screen.getPrimaryDisplay()
  const isExternalDisplay = display.id !== controlDisplay.id
  const bounds = display.workArea
  outputWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 500,
    title: `${APP_NAME} – Ausgabe`,
    backgroundColor: "#151815",
    frame: !isExternalDisplay,
    autoHideMenuBar: true,
    fullscreen: isExternalDisplay,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  outputWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { output: "1" } })
  outputWindow.once("ready-to-show", () => {
    outputWindow.show()
    sendPresentationState()
  })
  outputWindow.on("closed", () => {
    outputWindow = null
  })
}

ipcMain.handle("presentation:open-output", (event) => {
  if (event.sender !== controlWindow?.webContents) return false
  createOrFocusOutputWindow()
  return true
})

ipcMain.handle("presentation:get-state", (event) => {
  if (event.sender !== outputWindow?.webContents) return null
  return presentationState || null
})

ipcMain.on("presentation:state", (event, state) => {
  if (event.sender !== controlWindow?.webContents || !state || typeof state !== "object") return
  presentationState = { ...state, loading: false }
  sendPresentationState()
})

ipcMain.handle("presentation:toggle-output-fullscreen", (event) => {
  if (event.sender !== outputWindow?.webContents || !outputWindow) return false
  outputWindow.setFullScreen(!outputWindow.isFullScreen())
  return outputWindow.isFullScreen()
})

ipcMain.handle("settings:get", (event) => {
  if (event.sender !== controlWindow?.webContents) return null
  return { ...settings, displays: getDisplayOptions() }
})

ipcMain.handle("settings:set-output-display", (event, displayId) => {
  if (event.sender !== controlWindow?.webContents) return null
  const selected = typeof displayId === "string" && screen.getAllDisplays().some((display) => String(display.id) === displayId)
  settings.preferredOutputDisplayId = selected ? displayId : null
  persistence.saveSettings(settings)
  return settings.preferredOutputDisplayId
})

ipcMain.on("settings:save-control-preferences", (event, preferences) => {
  if (event.sender !== controlWindow?.webContents) return
  const reference = typeof preferences?.reference === "string" ? preferences.reference.trim() : ""
  const translation = typeof preferences?.translation === "string" ? preferences.translation : ""
  if (reference.length <= 120) settings.lastReference = reference
  if (TRANSLATIONS.has(translation)) settings.lastTranslation = translation
  persistence.saveSettings(settings)
})

ipcMain.handle("bible:load", async (event, request) => {
  if (event.sender !== controlWindow?.webContents) throw new Error("Ungültige Bibelanfrage.")
  const reference = typeof request?.reference === "string" ? request.reference.trim() : ""
  const translation = typeof request?.translation === "string" ? request.translation : ""
  if (!reference || reference.length > 120 || !TRANSLATIONS.has(translation)) throw new Error("Ungültige Bibelanfrage.")

  const cachedPayload = persistence.readPassage(translation, reference)
  if (cachedPayload) return { ok: true, payload: cachedPayload, cached: true }

  const url = new URL("/api/bible", BIBLE_SERVICE_URL)
  url.searchParams.set("reference", reference)
  url.searchParams.set("translation", translation)
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({ error: "Die Bibelquelle konnte nicht antworten." }))
  if (response.ok) persistence.savePassage(translation, reference, payload)
  return { ok: response.ok, payload }
})

function configureUpdates() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on("update-available", async (info) => {
    if (updatePromptOpen || !controlWindow) return
    updatePromptOpen = true
    const result = await dialog.showMessageBox(controlWindow, {
      type: "info",
      title: "Update verfügbar",
      message: `Bible Presenter ${info.version} ist verfügbar.`,
      detail: "Das Update wird nur heruntergeladen, wenn du zustimmst.",
      buttons: ["Herunterladen", "Später"],
      defaultId: 0,
      cancelId: 1
    })
    updatePromptOpen = false
    if (result.response === 0) autoUpdater.downloadUpdate().catch(() => {})
  })
  autoUpdater.on("update-downloaded", async (info) => {
    if (!controlWindow) return
    const result = await dialog.showMessageBox(controlWindow, {
      type: "info",
      title: "Update bereit",
      message: `Bible Presenter ${info.version} wurde heruntergeladen.`,
      detail: "Die Präsentation bleibt geöffnet, bis du den Neustart bestätigst.",
      buttons: ["Neu starten und installieren", "Später"],
      defaultId: 0,
      cancelId: 1
    })
    if (result.response === 0) autoUpdater.quitAndInstall()
  })
  autoUpdater.on("error", (error) => {
    // An unreachable update server must never interrupt a presentation.
    console.warn("Update check failed:", error.message)
  })
  autoUpdater.checkForUpdates().catch(() => {})
}

app.whenReady().then(() => {
  createControlWindow()
  configureUpdates()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
