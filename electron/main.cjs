const { app, BrowserWindow } = require("electron")
const path = require("node:path")

const APP_NAME = "Bible Presenter"
const APP_ID = "de.gwinnmedia.biblepresenter"
let controlWindow

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

app.whenReady().then(() => {
  createControlWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
