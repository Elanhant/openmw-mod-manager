/**
 * TODO:
 *  - JSDoc
 *  - shared typedefs file
 *  - XState
 *  - immer patches
 *  - logs
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fsPromises = require("fs").promises;
const ModsListManager = require("./ModsListManager");
const { parseCfg, stringifyCfg } = require("./cfg");
const { enableAllPlugins } = require("immer");
const util = require("util");

enableAllPlugins();

const TEMP_GAME_FILES_INI_FILENAME = "game_files.ini";

function getModManagerConfigPath() {
  return path.join(app.getPath("userData"), "mod_manager_config.json");
}

function getModsListManagerConfigPath() {
  return path.join(app.getPath("userData"), "mods_list_manager_config.json");
}

/**
 *
 * @returns {Promise<boolean>}
 */
async function doesModManagerConfigExist() {
  return await fsPromises
    .access(getModManagerConfigPath())
    .then(() => true)
    .catch(() => false);
}

/**
 *
 * @returns {Promise<ModManagerConfig>}
 */
async function readModManagerConfig() {
  const raw = await fsPromises.readFile(getModManagerConfigPath(), "utf-8");
  return JSON.parse(raw);
}

/**
 * @returns {Promise<ModManagerConfig>}
 */
async function createEmptyModManagerConfig() {
  /** @type {ModManagerConfig} */
  const emptyConfig = {
    openMWConfigPath: "",
    openMWLauncherPath: "",
    mloxPath: "",
  };

  await fsPromises.writeFile(
    getModManagerConfigPath(),
    JSON.stringify(emptyConfig, null, 2),
    "utf-8"
  );

  return emptyConfig;
}

/**
 *
 * @returns {Promise<ModManagerConfig>}
 */
async function getModManagerConfig() {
  if (!(await doesModManagerConfigExist())) {
    return await createEmptyModManagerConfig();
  }

  return readModManagerConfig();
}

/**
 * @param {ModManagerConfig} config
 * @returns {Promise<void>}
 */
async function saveModManagerConfig(config) {
  await fsPromises.writeFile(
    getModManagerConfigPath(),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}

/**
 * @typedef {Object} ModManagerConfig
 * @property {string} openMWConfigPath
 * @property {string} openMWLauncherPath
 * @property {string} mloxPath
 */

/**
 * @async
 * @callback requestOpenMWConfigPath
 * @returns {Promise<string>}
 */

/**
 * @async
 * @callback requestMloxPath
 * @returns {Promise<string>}
 */

/**
 *
 * @typedef {Object} ModManagerOptions
 * @property {requestOpenMWConfigPath} requestOpenMWConfigPath
 * @property {requestMloxPath} requestMloxPath
 * @property {function(string):void} logMessage
 */

/**
 *
 * @param {ModManagerOptions} options
 */
function ModManager({ requestOpenMWConfigPath, requestMloxPath, logMessage }) {
  /** @type {ModManagerConfig | null} */
  let modManagerConfig = null;
  /** @type {import('./ModsListManager').ModsListManager | null} */
  let modsListManager = null;

  /**
   *
   * @param {string} newPath
   */
  async function updateOpenMWConfigPath(newPath) {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }
    modManagerConfig.openMWConfigPath = newPath;
    await saveModManagerConfig(modManagerConfig);
  }
  /**
   *
   * @param {string} newPath
   */
  async function updateMloxPath(newPath) {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }
    modManagerConfig.mloxPath = newPath;
    await saveModManagerConfig(modManagerConfig);
  }

  /**
   * @returns {Promise<string>}
   */
  async function getOpenMWConfigPath() {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }

    const { openMWConfigPath } = modManagerConfig;

    let configPath;

    try {
      await fsPromises.access(openMWConfigPath);
      configPath = openMWConfigPath;
    } catch (e) {
      configPath = await requestOpenMWConfigPath();
      await updateOpenMWConfigPath(configPath);
    }

    return configPath;
  }

  /**
   * @async
   * @returns {Promise<import('./cfg').CfgParsed>}
   */
  async function parseOpenMWConfig() {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }

    const configPath = await getOpenMWConfigPath();

    const rawOpenMWConfig = await fsPromises.readFile(configPath, "utf-8");

    return parseCfg(rawOpenMWConfig);
  }

  /**
   * @async
   * @param {import('./cfg').CfgParsed} cfg
   * @returns {Promise<void>}
   */
  async function saveOpenMWConfig(cfg) {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }

    const configPath = await getOpenMWConfigPath();

    await fsPromises.writeFile(configPath, stringifyCfg(cfg));
  }

  /**
   * @returns {Promise<string>}
   */
  async function getMloxExecutablePath() {
    if (modManagerConfig == null) {
      throw new Error("modManagerConfig is not initialized!");
    }

    const { mloxPath } = modManagerConfig;

    let executablePath;

    try {
      await fsPromises.access(mloxPath);
      executablePath = mloxPath;
    } catch (e) {
      executablePath = await requestMloxPath();
      await updateMloxPath(executablePath);
    }

    return executablePath;
  }

  /**
   *
   * @param {string} mloxOutput
   * @returns {string[]}
   */
  function parseMloxOutput(mloxOutput) {
    const START_LOAD_ORDER_INDICATOR = "[New Load Order]";
    const END_LOAD_ORDER_INDICATOR = "[END PROPOSED LOAD ORDER]";

    const stdoutLines = mloxOutput.split("\r\n");
    const gameFiles = [];
    let foundLoadOrder = false;

    for (const line of stdoutLines) {
      if (line.includes(START_LOAD_ORDER_INDICATOR)) {
        foundLoadOrder = true;
        continue;
      }
      if (line.includes(END_LOAD_ORDER_INDICATOR)) {
        break;
      }
      if (foundLoadOrder) {
        const separatorIndex = line.indexOf(" ");
        gameFiles.push(line.substr(separatorIndex + 1));
      }
    }

    return gameFiles;
  }

  return {
    async init() {
      modManagerConfig = await getModManagerConfig();
      modsListManager = ModsListManager({
        configPath: getModsListManagerConfigPath(),
      });
      const openMWConfig = await parseOpenMWConfig();
      await modsListManager.init(openMWConfig);
    },
    /**
     * @typedef {Object} ModManagerDataForUI
     * @property {import('./ModsListManager').OpenMWData[]} data
     * @property {import('./ModsListManager').OpenMWContent[]} content
     */
    /**
     * @returns {Promise<ModManagerDataForUI>}
     */
    async getDataForUI() {
      const [config, content] = await Promise.all([
        modsListManager.getConfig(),
        modsListManager.getContent(),
      ]);

      return {
        data: config.data,
        content,
      };
    },
    /**
     *
     * @param {import('./ModsListManager').changeEventCallback} callback
     * @returns {function():void}
     */
    addModsChangeEventListener(callback) {
      return modsListManager.addListener("change", callback);
    },
    /**
     *
     * @param {string[]} dataFolderPaths
     */
    async addData(dataFolderPaths) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }
      logMessage(`Adding ${dataFolderPaths.length} mods...`);
      await modsListManager.addData(dataFolderPaths);
      logMessage(`Successfully added ${dataFolderPaths.length} mods`);
    },
    /**
     *
     * @param {import('./ModsListManager').OpenMWData[]} data
     */
    async reorderData(data) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      await modsListManager.changeDataOrder(data);
    },
    /**
     *
     * @param {string} dataID
     */
    async toggleData(dataID) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      await modsListManager.toggleData(dataID);
      logMessage(`Successfully toggled ${dataID}`);
    },
    /**
     *
     * @param {string} dataID
     */
    async removeData(dataID) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      logMessage(`Removing ${dataID}...`);
      await modsListManager.removeData(dataID);
      logMessage(`Successfully removed ${dataID}`);
    },
    /**
     * @returns {Promise<void>}
     */
    async sortContent() {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      logMessage(`Exporting content to mlox-compatible format...`);
      const rawINI = modsListManager.convertContentToGameFiles();

      const iniFilePath = path.join(
        app.getPath("temp"),
        TEMP_GAME_FILES_INI_FILENAME
      );
      await fsPromises.writeFile(iniFilePath, rawINI);

      logMessage(`Running mlox...`);
      const execFile = util.promisify(require("child_process").execFile);
      const mloxExecutablePath = await getMloxExecutablePath();
      const { stdout, stderr } = await execFile(mloxExecutablePath, [
        "-f",
        iniFilePath,
      ]);

      console.log("stdout:", stdout);

      logMessage(`Parsing mlox output...`);
      const gameFiles = parseMloxOutput(stdout);
      await modsListManager.changeContentOrder(gameFiles);

      logMessage(`Updating content order...`);
      const cfg = await parseOpenMWConfig();
      const updatedCfg = await modsListManager.applyChangesToCfg(cfg);

      logMessage(`Saving content order to OpenMW config...`);
      await saveOpenMWConfig(updatedCfg);
      logMessage(`Successfully updated content order`);

      console.log("stderr:", stderr);
    },
    async updateOpenMWConfig() {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      logMessage(`Saving to OpenMW config...`);
      let cfg = await parseOpenMWConfig();
      cfg = await modsListManager.applyChangesToCfg(cfg);

      await saveOpenMWConfig(cfg);
      logMessage(`Successfully saved to OpenMW config`);
    },
    updateOpenMWConfigPath,
  };
}

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

const createWindow = async () => {
  const modManager = ModManager({
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
    logMessage,
  });

  await modManager.init();

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

  /**
   *
   * @param {string} message
   */
  function logMessage(message) {
    mainWindow.webContents.send("log-message", message);
  }

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

    logMessage("Mod manager initialized");

    mainWindow.webContents.send(
      "mod-manager-ready",
      await modManager.getDataForUI()
    );
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} filePath
   */
  const handleSelectOpenMWConfigFile = async (event, filePath) => {
    modManager.updateOpenMWConfigPath(filePath);
  };

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {import('./ModsListManager').OpenMWData[]} modList
   */
  async function handleReorderData(event, modList) {
    await modManager.reorderData(modList);
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

  ipcMain.on("select-openmw-config-file", handleSelectOpenMWConfigFile);

  ipcMain.on("update-openmw-config", async () => {
    await modManager.updateOpenMWConfig();
  });

  ipcMain.on("sort-content", async (event, arg) => {
    await modManager.sortContent();
  });

  ipcMain.on("select-dirs", async (event, arg) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    console.log("directories selected", result.filePaths);
    await modManager.addData(result.filePaths);
  });

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string} dataID
   */
  async function handleRemoveData(event, dataID) {
    await modManager.removeData(dataID);
  }
  ipcMain.on("remove-data", handleRemoveData);

  /**
   *
   * @param {Electron.IpcMainEvent} event
   * @param {string[]} filePaths
   */
  async function handleDropDataDirs(event, filePaths) {
    const isFolderList = (
      await Promise.all(filePaths.map((filePath) => fsPromises.lstat(filePath)))
    ).map((stat) => stat.isDirectory());

    const dataFolderPaths = filePaths
      .filter((_file, idx) => isFolderList[idx] === true)
      .sort();

    await modManager.addData(dataFolderPaths);
  }
  ipcMain.on("drop-data-dirs", handleDropDataDirs);
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
