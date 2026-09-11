const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("biblePresenterDesktop", {
  openOutput: () => ipcRenderer.invoke("presentation:open-output"),
  getPresentationState: () => ipcRenderer.invoke("presentation:get-state"),
  sendPresentationState: (state) => ipcRenderer.send("presentation:state", state),
  onPresentationState: (listener) => {
    const wrapped = (_event, state) => listener(state)
    ipcRenderer.on("presentation:state", wrapped)
    return () => ipcRenderer.removeListener("presentation:state", wrapped)
  },
  toggleOutputFullscreen: () => ipcRenderer.invoke("presentation:toggle-output-fullscreen"),
  loadPassage: (request) => ipcRenderer.invoke("bible:load", request)
})
