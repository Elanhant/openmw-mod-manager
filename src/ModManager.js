const { app } = require("electron");
const path = require("path");
const fsPromises = require("fs").promises;
const ModsListManager = require("./ModsListManager");
const { parseCfg, stringifyCfg } = require("./cfg");
const { LogLevel } = require("./Logger");
const util = require("util");

const TEMP_GAME_FILES_INI_FILENAME = "game_files.ini";

/** @typedef {"openMWConfigPath"|"openMWLauncherPath"|"mloxPath"} ModManagerConfigKey */

/**
 * @typedef {Object.<ModManagerConfigKey, string>} ModManagerConfig
 */

/**
 * @param {string} configPath
 * @returns {Promise<boolean>}
 */
async function doesModManagerConfigExist(configPath) {
  return await fsPromises
    .access(configPath)
    .then(() => true)
    .catch(() => false);
}

/**
 * @param {string} configPath
 * @returns {Promise<ModManagerConfig>}
 */
async function readModManagerConfig(configPath) {
  const raw = await fsPromises.readFile(configPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * @param {string} configPath
 * @returns {Promise<ModManagerConfig>}
 */
async function createEmptyModManagerConfig(configPath) {
  /** @type {ModManagerConfig} */
  const emptyConfig = {
    openMWConfigPath: "",
    openMWLauncherPath: "",
    mloxPath: "",
  };

  await fsPromises.writeFile(
    configPath,
    JSON.stringify(emptyConfig, null, 2),
    "utf-8"
  );

  return emptyConfig;
}

/**
 * @param {string} configPath
 * @returns {Promise<ModManagerConfig>}
 */
async function getModManagerConfig(configPath) {
  if (!(await doesModManagerConfigExist(configPath))) {
    return await createEmptyModManagerConfig(configPath);
  }

  return readModManagerConfig(configPath);
}

/**
 * @param {string} configPath
 * @param {ModManagerConfig} config
 * @returns {Promise<void>}
 */
async function saveModManagerConfig(configPath, config) {
  await fsPromises.writeFile(
    configPath,
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}

/**
 * @async
 * @callback requestOpenMWConfigPath
 * @returns {Promise<string>}
 */

/**
 * @async
 * @callback requestOpenMWLauncherPath
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
 * @property {string} modManagerConfigPath
 * @property {string} modsListManagerConfigPath
 * @property {string} tempDirPath
 * @property {requestOpenMWConfigPath} requestOpenMWConfigPath
 * @property {requestOpenMWLauncherPath} requestOpenMWLauncherPath
 * @property {requestMloxPath} requestMloxPath
 * @property {ReturnType<import('./Logger').Logger>['log']} logMessage
 */

/**
 *
 * @param {ModManagerOptions} options
 */
function ModManager({
  modManagerConfigPath,
  modsListManagerConfigPath,
  tempDirPath,
  requestOpenMWConfigPath,
  requestOpenMWLauncherPath,
  requestMloxPath,
  logMessage,
}) {
  /** @type {ModManagerConfig | null} */
  let modManagerConfig = null;
  /** @type {import('./ModsListManager').ModsListManager | null} */
  let modsListManager = null;

  /**
   * @param {ModManagerConfigKey} key
   * @returns {string}
   */
  function getModManagerConfigValue(key) {
    try {
      const value = modManagerConfig[key];
      return value;
    } catch (e) {
      logMessage(
        "Cannot use mod manager before it is initialized!",
        LogLevel.Error
      );
      throw new Error("Cannot use mod manager before it is initialized!");
    }
  }

  /**
   * @param {ModManagerConfigKey} key
   * @param {string} value
   */
  function setModManagerConfigValue(key, value) {
    try {
      modManagerConfig[key] = value;
    } catch (e) {
      logMessage(
        "Cannot use mod manager before it is initialized!",
        LogLevel.Error
      );
      throw new Error("Cannot use mod manager before it is initialized!");
    }
  }

  /**
   *
   * @param {string} newPath
   */
  async function updateOpenMWConfigPath(newPath) {
    setModManagerConfigValue("openMWConfigPath", newPath);
    await saveModManagerConfig(modManagerConfigPath, modManagerConfig);
  }
  /**
   *
   * @param {string} newPath
   */
  async function updateOpenMWLauncherPath(newPath) {
    setModManagerConfigValue("openMWLauncherPath", newPath);
    await saveModManagerConfig(modManagerConfigPath, modManagerConfig);
  }
  /**
   *
   * @param {string} newPath
   */
  async function updateMloxPath(newPath) {
    setModManagerConfigValue("mloxPath", newPath);
    await saveModManagerConfig(modManagerConfigPath, modManagerConfig);
  }

  /**
   * @returns {Promise<string>}
   */
  async function getOpenMWConfigPath() {
    const openMWConfigPath = getModManagerConfigValue("openMWConfigPath");

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
    const configPath = await getOpenMWConfigPath();

    await fsPromises.writeFile(configPath, stringifyCfg(cfg));
  }

  /**
   * @async
   * @returns {Promise<void>}
   */
  async function backupOpenMWConfig() {
    logMessage("Saving OpenMW config to a backup file...");

    const configPath = await getOpenMWConfigPath();
    const backupPath = `${configPath}.backup`;

    await fsPromises.copyFile(configPath, backupPath);
    logMessage("OpenMW config has been saved to a backup!");
  }

  /**
   * @async
   * @returns {Promise<void>}
   */
  async function restoreOpenMWConfigFromBackup() {
    logMessage("Restoring OpenMW config from backup...");

    const configPath = await getOpenMWConfigPath();
    const backupPath = `${configPath}.backup`;

    try {
      await fsPromises.access(backupPath);
      try {
        await fsPromises.copyFile(backupPath, configPath);
        await fsPromises.unlink(backupPath);
        logMessage("OpenMW config has been restored!");
      } catch (e) {
        logMessage(`Failed to restore OpenMW config`, LogLevel.Error, e);
      }
    } catch (e) {
      logMessage("No backup file found");
      return;
    }
  }

  /**
   * @returns {Promise<string>}
   */
  async function getOpenMWLauncherPath() {
    const openMWLauncherPath = getModManagerConfigValue("openMWLauncherPath");

    let executablePath;

    try {
      await fsPromises.access(openMWLauncherPath);
      executablePath = openMWLauncherPath;
    } catch (e) {
      executablePath = await requestOpenMWLauncherPath();
      await updateOpenMWLauncherPath(executablePath);
    }

    return executablePath;
  }

  /**
   * @returns {Promise<string>}
   */
  async function getMloxExecutablePath() {
    const mloxPath = getModManagerConfigValue("mloxPath");

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
      modManagerConfig = await getModManagerConfig(modManagerConfigPath);
      modsListManager = ModsListManager({
        configPath: modsListManagerConfigPath,
        logMessage,
      });
      const openMWConfig = await parseOpenMWConfig();
      await restoreOpenMWConfigFromBackup();
      await modsListManager.init(openMWConfig);
    },
    /**
     * @typedef {Object} ModManagerDataForUI
     * @property {import('./ModsListManager').ModsListManagerState['data']} data
     * @property {import('./ModsListManager').ModsListManagerState['content']} content
     */
    /**
     * @returns {Promise<ModManagerDataForUI>}
     */
    async getDataForUI() {
      return await modsListManager.getState();
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
      await modsListManager.addData(dataFolderPaths);
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
    },
    /**
     *
     * @param {string} dataID
     */
    async removeData(dataID) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      await modsListManager.removeData(dataID);
    },
    /**
     *
     * @param {string} contentID
     */
    async toggleContent(contentID) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      await modsListManager.toggleContent(contentID);
    },
    /**
     *
     * @param {import('./ModsListManager').OpenMWContent[]} content
     */
    async reorderContent(content) {
      if (modsListManager == null) {
        throw new Error("modsListManager is not initialized!");
      }

      await modsListManager.changeContentOrder(content);
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

      const iniFilePath = path.join(tempDirPath, TEMP_GAME_FILES_INI_FILENAME);
      await fsPromises.writeFile(iniFilePath, rawINI);

      logMessage(`Running mlox...`);
      const execFile = util.promisify(require("child_process").execFile);
      const mloxExecutablePath = await getMloxExecutablePath();
      const { stdout } = await execFile(mloxExecutablePath, [
        "-f",
        iniFilePath,
      ]);

      logMessage(`Parsing mlox output...`);
      const gameFiles = parseMloxOutput(stdout);
      await modsListManager.applyContentOrderFromMlox(gameFiles);

      logMessage(`Updating content order...`);
      const cfg = await parseOpenMWConfig();
      const updatedCfg = await modsListManager.applyChangesToCfg(cfg);

      logMessage(`Saving content order to OpenMW config...`);
      await saveOpenMWConfig(updatedCfg);
      logMessage(`Successfully updated content order`);
    },
    restoreOpenMWConfig: restoreOpenMWConfigFromBackup,
    async runOpenMW() {
      await backupOpenMWConfig();
      const execFile = util.promisify(require("child_process").execFile);

      const openMWLauncherPath = await getOpenMWLauncherPath();

      const cfg = await parseOpenMWConfig();
      const updatedCfg = await modsListManager.applyChangesToCfg(cfg);
      await saveOpenMWConfig(updatedCfg);

      try {
        await execFile(openMWLauncherPath);
      } catch (e) {
        logMessage("Failed to run OpenMW", LogLevel.Error, e);
      } finally {
        await restoreOpenMWConfigFromBackup();
      }
    },
  };
}

module.exports = ModManager;
