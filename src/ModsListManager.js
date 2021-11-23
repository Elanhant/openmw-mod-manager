const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const EventEmitter = require("events");

const PATH_TO_MODS_LIST_MANAGER_CONFIG = path.join(
  __dirname,
  "../mods_list_manager_config.json"
);

/**
 * @typedef {Object} ModsListManagerConfig
 * @property {OpenMWMod[]} modsList
 */

/** @type {ModsListManagerConfig} */
const modsListManagerConfig = require(PATH_TO_MODS_LIST_MANAGER_CONFIG);

/**
 * @typedef {Object} OpenMWMod
 * @property {string} id
 * @property {string} dataFolder
 * @property {boolean} disabled
 */

/**
 * @typedef {Object} ModsList
 * @property {OpenMWMod[]} modsList
 */

/**
 * @async
 * @callback getConfigFn
 * @returns {Promise<ModsListManagerConfig>}
 */

/**
 *
 * @callback modsListUpdater
 * @param {OpenMWMod[]} mods - current mods list
 * @returns {OpenMWMod[]} - updated mods list
 */

/**
 * @async
 * @callback updateModsListFn
 * @param {modsListUpdater}
 * @returns {Promise<ModsListManagerConfig>}
 */

/**
 * @async
 * @callback toggleModFn
 * @param {string} modID
 * @returns {Promise<ModsListManagerConfig>}
 */

/**
 * @async
 * @callback removeModFn
 * @param {string} modID
 * @returns {Promise<ModsListManagerConfig>}
 */

/**
 * @async
 * @callback saveToOpenMWConfigFn
 * @param {string} openMWConfigPath
 * @returns {Promise<void>}
 */

/**
 * @typedef {Object} ModsListManager
 * @property {getConfigFn} getConfig
 * @property {updateModsListFn} updateModsList
 * @property {toggleModFn} toggleMod
 * @property {removeModFn} removeMod
 * @property {saveToOpenMWConfigFn} saveToOpenMWConfig
 */

/**
 *
 * @returns {ModsListManager}
 */
function ModsListManager() {
  /** @type {ModsListManagerConfig}  */
  let modsConfig = {
    ...modsListManagerConfig,
  };

  // async function loadFromOpenMWConfig() {
  //   const rawOpenMWConfig = await fsPromises.readFile(openMWConfigPath, 'utf8');

  //   modsConfig = parseOpenMWConfigV2(rawOpenMWConfig);
  //   return modsConfig;
  // }

  /**
   * @callback updateModsListConfigFn
   * @param {ModsListManagerConfig} current config
   * @returns {ModsListManagerConfig}
   */

  /**
   * @async
   * @param {updateModsListConfigFn} updater
   * @returns {Promise<ModsListManagerConfig>}
   */
  async function updateModsListConfig(updater) {
    modsConfig = updater(modsConfig);
    await saveModsListConfigToFile();
    return modsConfig;
  }

  async function saveModsListConfigToFile() {
    await fsPromises.writeFile(
      PATH_TO_MODS_LIST_MANAGER_CONFIG,
      JSON.stringify(
        {
          ...modsConfig,
        },
        null,
        2
      )
    );
  }

  async function isMorrowindData(dataPath) {
    try {
      await fsPromises.access(path.join(dataPath, "Morrowind.esm"));
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    async getConfig() {
      // if (modsConfig == null) {
      //   await loadFromOpenMWConfig();
      // }
      return modsConfig;
    },
    // loadFromOpenMWConfig,
    async updateModsList(getUpdatedModsList) {
      return await updateModsListConfig((currentModsConfig) => {
        currentModsConfig.modsList = getUpdatedModsList(
          currentModsConfig.modsList
        );
        return currentModsConfig;
      });
    },
    async toggleMod(modID) {
      return await updateModsListConfig((currentModsConfig) => {
        currentModsConfig.modsList = currentModsConfig.modsList.map((mod) =>
          mod.id === modID ? { ...mod, disabled: !mod.disabled } : mod
        );
        return currentModsConfig;
      });
    },
    async removeMod(modID) {
      return await updateModsListConfig((currentModsConfig) => {
        currentModsConfig.modsList = currentModsConfig.modsList.filter(
          (mod) => mod.id !== modID
        );
        return currentModsConfig;
      });
    },
    async saveToOpenMWConfig(openMWConfigPath) {
      if (modsConfig == null) {
        throw new Error("Cannot save null mods config to OpenMW config!");
      }
      console.log("Saving to", openMWConfigPath);
      const rawOpenMWConfig = await fsPromises.readFile(
        openMWConfigPath,
        "utf8"
      );

      const modPromises = modsConfig.modsList.map(
        (mod) =>
          new Promise(async (resolve) => {
            const bsaFileNames = await collectBSAFileNames(mod.dataFolder);

            resolve({
              bsaFileNames,
              mod,
            });
          })
      );

      const modsInfo = await Promise.all(modPromises);

      /** @type {string} */
      const dataLines = modsInfo
        .map(({ mod }) => {
          const dataStr = `data="${mod.dataFolder}"`;
          return mod.disabled ? `#${dataStr}` : dataStr;
        })
        // .reverse()
        .join("\n");

      const fallbackArchiveLines = modsInfo
        .map(({ bsaFileNames }) =>
          bsaFileNames.length > 0
            ? bsaFileNames
                .map((fileName) => `fallback-archive=${fileName}`)
                .join("\n")
            : null
        )
        .filter(Boolean)
        .join("\n");

      let openMWConfigRaw = rawOpenMWConfig
        .replace(
          /((#\s*)?fallback-archive=.+(\r?\n?)?)+/,
          "====INSERT FALLBACK ARCHIVES HERE====\r\n"
        )
        .replace("====INSERT FALLBACK ARCHIVES HERE====", fallbackArchiveLines)
        .replace(/((#\s*)?data=.+(\r?\n?)?)+/, "====INSERT DATA HERE====\r\n")
        .replace("====INSERT DATA HERE====", dataLines);

      console.log({ dataLines });

      await fsPromises.writeFile(openMWConfigPath, openMWConfigRaw);
    },
  };
}

module.exports = ModsListManager;

/**
 *
 * @param {string} fileContent
 * @returns {ModsListManagerConfig}
 */
function parseOpenMWConfigV2(fileContent) {
  const lines = fileContent.split("\n");
  /** @type {OpenMWMod[]} */
  const modsList = [];

  for (const line of lines) {
    const isDisabled = line.startsWith("#");
    const [key, value] = line.replace(/^#\s*/, "").replace(/\r/, "").split("=");
    if (key === "data") {
      const dataFolder = value.slice(1, -1);
      modsList.push({
        id: dataFolder,
        dataFolder,
        disabled: isDisabled,
      });
    }
  }

  return {
    modsList,
  };
}

/**
 * @async
 * @param {string} modPath
 * @returns {Promise<string[]>}
 */
async function collectBSAFileNames(modPath) {
  const files = await fsPromises.readdir(modPath);
  return files.filter((file) => file.toLowerCase().endsWith(".bsa"));
}
