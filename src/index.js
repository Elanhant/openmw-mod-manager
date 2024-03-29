/**
 * TODO:
 *  - JSDoc
 *  - shared typedefs file
 *  - XState
 *  - immer patches
 *  - logs
 *  - dump logs to file
 *  - prisma + sqlite?
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fsPromises = require("fs").promises;
const ModManager = require("./ModManager");
const { Logger } = require("./Logger");
const { enableAllPlugins } = require("immer");

enableAllPlugins();

// Live Reload
require("electron-reload")(__dirname, {
  electron: path.join(__dirname, "../node_modules", ".bin", "electron"),
  awaitWriteFinish: true,
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  // eslint-disable-line global-require
  app.quit();
}

const logger = Logger();

const logFilePath = path.join(
  app.getPath("userData"),
  "openmw-mod-manager.log"
);

async function setupLogFile() {
  try {
    // Clear logs from previous run before subscribing
    await fsPromises.unlink(logFilePath);
  } catch {}

  const logStream = require("fs").createWriteStream(logFilePath, {
    flags: "a",
  });

  logger.subscribe(async (logMessage) => {
    logStream.write(
      `[${new Date(logMessage.timestamp).toISOString()}] ${logMessage.level}: ${
        logMessage.message
      }\n`
    );
    if (logMessage.error) {
      logStream.write(`${logMessage.error.message}\n`);
    }
  });
}

setupLogFile();

/** @type {ReturnType<import('./ModManager')>} */
let modManager;

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // width: 800,
    // height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      enableRemoteModule: true,
    },
  });

  logger.subscribe((logMessage) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("log-message", logMessage);
    }
  });

  modManager = ModManager({
    modManagerConfigPath: path.join(
      app.getPath("userData"),
      "mod_manager_config.json"
    ),
    modsListManagerConfigPath: path.join(
      app.getPath("userData"),
      "mods_list_manager_config.json"
    ),
    tempDirPath: app.getPath("temp"),
    appDataPath: app.getPath("userData"),
    requestOpenMWConfigPath: async () => {
      const { response: buttonIndex } = await dialog.showMessageBox(
        mainWindow,
        {
          type: "question",
          message: "Cannot find openmw.cfg. Would you like to configure it?",
          buttons: ["Cancel", "OK"],
        }
      );
      if (buttonIndex === 1) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          filters: [{ name: "openmw", extensions: ["cfg"] }],
        });
        const filePath = result.filePaths[0];
        return filePath;
      }
      throw new Error("Cannot find openmw.cfg");
    },
    requestOpenMWLauncherPath: async () => {
      const { response: buttonIndex } = await dialog.showMessageBox(
        mainWindow,
        {
          type: "question",
          message:
            "Cannot find openmw-launcher.exe. Would you like to configure it?",
          buttons: ["Cancel", "OK"],
        }
      );
      if (buttonIndex === 1) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          filters: [{ name: "openmw-launcher", extensions: ["exe"] }],
        });
        const filePath = result.filePaths[0];
        return filePath;
      }
      throw new Error("Cannot find openmw-launcher.exe");
    },
    requestMloxPath: async () => {
      const { response: buttonIndex } = await dialog.showMessageBox(
        mainWindow,
        {
          type: "question",
          message:
            "Cannot find Mlox executable. Would you like to configure it?",
          buttons: ["Cancel", "OK"],
        }
      );
      if (buttonIndex === 1) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          filters: [{ name: "mlox", extensions: ["exe", "py"] }],
        });
        const filePath = result.filePaths[0];
        return filePath;
      }
      throw new Error("Cannot find mlox.exe or mlox.py");
    },
    requestOMWLLFPath: async () => {
      const { response: buttonIndex } = await dialog.showMessageBox(
        mainWindow,
        {
          type: "question",
          message: "Cannot find OMWLLF. Would you like to configure it?",
          buttons: ["Cancel", "OK"],
        }
      );
      if (buttonIndex === 1) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          filters: [{ name: "omwllf", extensions: ["py"] }],
        });
        const filePath = result.filePaths[0];
        return filePath;
      }
      throw new Error("Cannot find omwllf.py");
    },
    requestDeltaPluginPath: async () => {
      const { response: buttonIndex } = await dialog.showMessageBox(
        mainWindow,
        {
          type: "question",
          message: "Cannot find DeltaPlugin. Would you like to configure it?",
          buttons: ["Cancel", "OK"],
        }
      );
      if (buttonIndex === 1) {
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ["openFile"],
          filters: [{ name: "delta-plugin", extensions: ["exe"] }],
        });
        const filePath = result.filePaths[0];
        return filePath;
      }
      throw new Error("Cannot find delta-plugin.exe");
    },
    logMessage: logger.log,
  });

  logger.log("Initializing mod manager...");
  await modManager.init();

  mainWindow.maximize();

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on("did-finish-load", async () => {
    modManager.addModsChangeEventListener(async (modsConfig) => {
      mainWindow.webContents.send(
        "mod-manager-ready",
        await modManager.getDataForUI()
      );
    });

    logger.log("Mod manager initialized");

    mainWindow.webContents.send(
      "mod-manager-ready",
      await modManager.getDataForUI()
    );
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {import('./ModsListManager').OpenMWData[]} data
   */
  async function handleReorderData(event, data) {
    await modManager.reorderData(data);
  }
  ipcMain.on("reorder-data", handleReorderData);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} dataID
   */
  async function handleToggleData(event, dataID) {
    await modManager.toggleData(dataID);
  }
  ipcMain.on("toggle-data", handleToggleData);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} contentID
   */
  async function handleToggleContent(event, contentID) {
    await modManager.toggleContent(contentID);
  }
  ipcMain.on("toggle-content", handleToggleContent);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {import('./ModsListManager').OpenMWContent[]} content
   */
  async function handleReorderContent(event, content) {
    await modManager.reorderContent(content);
  }
  ipcMain.on("reorder-content", handleReorderContent);

  ipcMain.on("sort-content", async (event, arg) => {
    await modManager.sortContent();
  });

  ipcMain.on("select-dirs", async (event, arg) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    await modManager.addData(result.filePaths, null);
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string[]} dataIDs
   */
  async function handleRemoveData(event, dataIDs) {
    await modManager.removeData(dataIDs);
  }
  ipcMain.on("remove-data", handleRemoveData);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string[]} filePaths
   * @param {?number} insertIdx
   */
  async function handleDropDataDirs(event, filePaths, insertIdx) {
    const isFolderList = (
      await Promise.all(filePaths.map((filePath) => fsPromises.lstat(filePath)))
    ).map((stat) => stat.isDirectory());

    const dataFolderPaths = filePaths
      .filter((_file, idx) => isFolderList[idx] === true)
      .sort();

    await modManager.addData(dataFolderPaths, insertIdx);
  }
  ipcMain.on("drop-data-dirs", handleDropDataDirs);
  ipcMain.on("check-file-overrides", async () => {
    const result = await modManager.checkFileOverrides();
    mainWindow.webContents.send("check-file-overrides", result);
  });

  ipcMain.on("run-omwllf", async function () {
    await modManager.runOMWLLF();
  });

  ipcMain.on("run-delta-plugin", async function () {
    await modManager.runDeltaPlugin();
  });

  ipcMain.on("launch-openmw", async function () {
    await modManager.runOpenMW();
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("will-quit", async () => {
  if (modManager != null) {
    await modManager.restoreOpenMWConfig();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
