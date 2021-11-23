/**
 * TODO:
 *  - consistent event names
 *  - JSDoc
 *  - shared typedefs file
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fsPromises = require("fs").promises;
const ModsListManager = require("./ModsListManager");

const PATH_TO_MOD_MANAGER_CONFIG = path.join(
  __dirname,
  "../mod_manager_config.json"
);

/**
 * @typedef {Object} ModManagerConfig
 * @property {string} openMWConfigPath
 * @property {string} openMWLauncherPath
 */

/** @type {ModManagerConfig} */
const modManagerConfig = require(PATH_TO_MOD_MANAGER_CONFIG);

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

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      enableRemoteModule: true,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, "../public/index.html"));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  const modsListManager = ModsListManager();

  mainWindow.webContents.on("did-finish-load", async () => {
    mainWindow.webContents.send("configReady", modManagerConfig);

    if (modManagerConfig.openMWConfigPath != null) {
      const modsConfig = await modsListManager.getConfig();
      console.log(modsConfig);
      mainWindow.webContents.send("openMWConfigReady", modsConfig);
    }
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} filePath
   */
  const handleSelectOpenMWConfigFile = async (event, filePath) => {
    console.log(filePath);

    modManagerConfig.openMWConfigPath = filePath;

    /** @type {ModManagerConfig} */
    const newModManagerConfig = { ...modManagerConfig };

    await fsPromises.writeFile(
      PATH_TO_MOD_MANAGER_CONFIG,
      JSON.stringify(newModManagerConfig, null, 2)
    );

    // modsConfigController = OpenMWModsConfigController(filePath);
    // const modsConfig = await modsConfigController.getConfig();
    // mainWindow.webContents.send('openMWConfigReady', modsConfig)
  };

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} filePath
   */
  const handleSelectOpenMWLauncherFile = async (event, filePath) => {
    console.log(filePath);

    modManagerConfig.openMWLauncherPath = filePath;

    /** @type {ModManagerConfig} */
    const newModManagerConfig = { ...modManagerConfig };

    await fsPromises.writeFile(
      PATH_TO_MOD_MANAGER_CONFIG,
      JSON.stringify(newModManagerConfig, null, 2)
    );
  };

  /**
   * @async
   * @param {Electron.IpcMainEvent} event
   * @param {string[]} dataFolderPaths
   */
  const handleAddDataFolders = async (event, dataFolderPaths) => {
    console.log({ dataFolderPaths });
    if (modsListManager == null) {
      throw new Error("Not initialized!");
    }
    const updatedConfig = await modsListManager.updateModsList(
      (currentModsList) => {
        const alreadyAdded = currentModsList.some((currentMod) =>
          dataFolderPaths.includes(currentMod.dataFolder)
        );
        if (alreadyAdded) {
          throw new Error("Mod already added");
        }
        return [
          ...currentModsList,
          ...dataFolderPaths.map((dataFolder) => ({
            id: dataFolder,
            dataFolder,
            disabled: false,
          })),
        ];
      }
    );

    mainWindow.webContents.send("openMWConfigReady", updatedConfig);
  };

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {import('./ModsListManager').OpenMWMod[]} modList
   */
  async function handleReorderMods(event, modList) {
    if (modsListManager == null) {
      throw new Error("Not initialized!");
    }
    const updatedConfig = await modsListManager.updateModsList(() => modList);

    mainWindow.webContents.send("openMWConfigReady", updatedConfig);
  }

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} modID
   */
  async function handleToggleMod(event, modID) {
    if (modsListManager == null) {
      throw new Error("Not initialized!");
    }
    const updatedConfig = await modsListManager.toggleMod(modID);

    mainWindow.webContents.send("openMWConfigReady", updatedConfig);
  }

  /**
   *
   * @param {Electron.IpcMainEvent} event
   */
  async function handleSaveToOpenMWConfig(event) {
    if (modsListManager == null) {
      throw new Error("Not initialized!");
    }
    await modsListManager.saveToOpenMWConfig(modManagerConfig.openMWConfigPath);
  }

  ipcMain.on("selectOpenMWConfigFile", handleSelectOpenMWConfigFile);
  ipcMain.on("selectOpenMWLauncherFile", handleSelectOpenMWLauncherFile);
  ipcMain.on("reorderMods", handleReorderMods);
  ipcMain.on("toggleMod", handleToggleMod);
  ipcMain.on("saveToOpenMWConfig", handleSaveToOpenMWConfig);

  ipcMain.on("select-dirs", async (event, arg) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    console.log("directories selected", result.filePaths);
    handleAddDataFolders(event, result.filePaths);
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} modID
   */
  async function handleRemoveMod(event, modID) {
    if (modsListManager == null) {
      throw new Error("Not initialized!");
    }
    const updatedConfig = await modsListManager.removeMod(modID);
    mainWindow.webContents.send("openMWConfigReady", updatedConfig);
  }
  ipcMain.on("remove-mod", handleRemoveMod);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string[]} filePaths
   */
  async function handleDropDirs(event, filePaths) {
    console.log(filePaths);
    const isFolderList = (
      await Promise.all(filePaths.map((filePath) => fsPromises.lstat(filePath)))
    ).map((stat) => stat.isDirectory());

    const dataFolderPaths = filePaths
      .filter((_file, idx) => isFolderList[idx] === true)
      .sort();
    console.log(dataFolderPaths);
    handleAddDataFolders(event, dataFolderPaths);
  }
  ipcMain.on("drop-dirs", handleDropDirs);
  ipcMain.on("run-open-mw", async (event) => {
    console.log("run-open-mw");
    if (modManagerConfig.openMWLauncherPath == null) {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: [{ name: "openmw-launcher", extensions: ["exe"] }],
      });
      console.log("directories selected", result.filePaths);
      const filePath = result.filePaths[0];
      modManagerConfig.openMWLauncherPath = filePath;

      /** @type {ModManagerConfig} */
      const newModManagerConfig = { ...modManagerConfig };

      await fsPromises.writeFile(
        PATH_TO_MOD_MANAGER_CONFIG,
        JSON.stringify(newModManagerConfig, null, 2)
      );
    }
    const util = require("util");
    const execFile = util.promisify(require("child_process").execFile);

    const backupPath = `${modManagerConfig.openMWConfigPath}.backup`;

    await fsPromises.copyFile(modManagerConfig.openMWConfigPath, backupPath);
    await modsListManager.saveToOpenMWConfig(modManagerConfig.openMWConfigPath);
    console.log({ backupPath });

    try {
      const { stdout, stderr } = await execFile(
        modManagerConfig.openMWLauncherPath
      );
      console.log("stdout:", stdout);
      console.log("stderr:", stderr);
    } catch (e) {
      console.error(e);
    } finally {
      await fsPromises.copyFile(backupPath, modManagerConfig.openMWConfigPath);
      await fsPromises.unlink(backupPath);
    }

    // child(result.filePaths[0], function (err, data) {
    //   if (err) {
    //     console.error(err);
    //     return;
    //   }

    //   console.log(data.toString());
    // });
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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
