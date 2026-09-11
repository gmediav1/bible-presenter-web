const { app, BrowserWindow, ipcMain, screen } = require("electron")
const path = require("node:path")

const APP_NAME = "Bible Presenter"
const APP_ID = "de.gwinnmedia.biblepresenter"
const BIBLE_SERVICE_URL = process.env.BIBLE_PRESENTER_API_ORIGIN || "https://bible-presenter-web.netlify.app"
const TRANSLATIONS = new Set(["amp", "niv", "nlt", "kjv", "asv", "web", "wmb", "bsb"])
let controlWindow
let outputWindow
let presentationState

// This intentionally differs from ChurchPresenter. Electron uses this folder
// for settings, cookies and cached Bible passages on Windows and macOS.
app.setName(APP_NAME)
app.setAppUserModelId(APP_ID)
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME))

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 1440,
    height: 920,
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
}

function getOutputDisplay() {
  const displays = screen.getAllDisplays()
  const controlDisplay = controlWindow ? screen.getDisplayMatching(controlWindow.getBounds()) : screen.getPrimaryDisplay()
  return displays.find((display) => display.id !== controlDisplay.id) || null
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

  const externalDisplay = getOutputDisplay()
  const display = externalDisplay || screen.getPrimaryDisplay()
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
    frame: !externalDisplay,
    autoHideMenuBar: true,
    fullscreen: Boolean(externalDisplay),
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

ipcMain.handle("bible:load", async (event, request) => {
  if (event.sender !== controlWindow?.webContents) throw new Error("Ungültige Bibelanfrage.")
  const reference = typeof request?.reference === "string" ? request.reference.trim() : ""
  const translation = typeof request?.translation === "string" ? request.translation : ""
  if (!reference || reference.length > 120 || !TRANSLATIONS.has(translation)) throw new Error("Ungültige Bibelanfrage.")

  const url = new URL("/api/bible", BIBLE_SERVICE_URL)
  url.searchParams.set("reference", reference)
  url.searchParams.set("translation", translation)
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({ error: "Die Bibelquelle konnte nicht antworten." }))
  return { ok: response.ok, payload }
})

app.whenReady().then(() => {
  createControlWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
