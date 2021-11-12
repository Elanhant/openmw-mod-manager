const { ipcRenderer } = require("electron");

process.once("loaded", () => {
  window.addEventListener("message", (evt) => {
    if (evt.data.type === "select-dirs") {
      ipcRenderer.send("select-dirs");
    }
    if (evt.data.type === "run-open-mw") {
      ipcRenderer.send("run-open-mw");
    }
  });
});
