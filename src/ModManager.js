const { app } = require("electron");
const path = require("path");
const fsPromises = require("fs").promises;
const ModsListManager = require("./ModsListManager");
const { parseCfg, stringifyCfg } = require("./cfg");
const util = require("util");

const TEMP_GAME_FILES_INI_FILENAME = "game_files.ini";

/**
 * @typedef {Object} ModManagerConfig
 * @property {string} openMWConfigPath
 * @property {string} openMWLauncherPath
 * @property {string} mloxPath
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
 * @property {requestMloxPath} requestMloxPath
 * @property {function(string):void} logMessage
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
  requestMloxPath,
  logMessage,
}) {
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
    await saveModManagerConfig(modManagerConfigPath, modManagerConfig);
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
    await saveModManagerConfig(modManagerConfigPath, modManagerConfig);
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
      modManagerConfig = await getModManagerConfig(modManagerConfigPath);
      modsListManager = ModsListManager({
        configPath: modsListManagerConfigPath,
      });
      const openMWConfig = await parseOpenMWConfig();
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
      const { stdout, stderr } = await execFile(mloxExecutablePath, [
        "-f",
        iniFilePath,
      ]);

      console.log("stdout:", stdout);

      logMessage(`Parsing mlox output...`);
      const gameFiles = parseMloxOutput(stdout);
      await modsListManager.applyContentOrderFromMlox(gameFiles);

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

module.exports = ModManager;
