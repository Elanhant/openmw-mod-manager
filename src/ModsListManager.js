const path = require("path");
const fsPromises = require("fs").promises;
const { updateOrSetValuesForKey } = require("./cfg");

const MODS_LIST_MANAGER_CONFIG_PATH = path.join(
  __dirname,
  "../mods_list_manager_config.json"
);

/**
 * @typedef {Object} ModsListManagerConfig
 * @property {OpenMWMod[]} modsList
 */

/** @type {ModsListManagerConfig} */
const modsListManagerConfig = require(MODS_LIST_MANAGER_CONFIG_PATH);

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
 * @param {modsListUpdater} updater
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
 * @callback applyChangesToCfgFn
 * @param {import('./cfg').CfgParsed} cfg
 * @returns {Promise<import('./cfg').CfgParsed>}
 */

/**
 * @callback convertContentToGameFilesFn
 * @param {import('./cfg').CfgParsed} cfg
 * @returns {string}
 */

/**
 * @callback updateLoadOrderFn
 * @param {import('./cfg').CfgParsed} cfg
 * @param {string[]} updatedLoadOrder
 * @returns {Promise<import('./cfg').CfgParsed>}
 */

/**
 * @typedef {Object} ModsListManager
 * @property {getConfigFn} getConfig
 * @property {updateModsListFn} updateModsList
 * @property {toggleModFn} toggleMod
 * @property {removeModFn} removeMod
 * @property {applyChangesToCfgFn} applyChangesToCfg
 * @property {convertContentToGameFilesFn} convertContentToGameFiles
 * @property {updateLoadOrderFn} updateLoadOrder
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
      MODS_LIST_MANAGER_CONFIG_PATH,
      JSON.stringify(
        {
          ...modsConfig,
        },
        null,
        2
      )
    );
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
      return modsConfig;
    },
    async updateModsList(updater) {
      return await updateModsListConfig((currentModsConfig) => {
        currentModsConfig.modsList = updater(currentModsConfig.modsList);
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
    convertContentToGameFiles(cfg) {
      const contentItems = cfg.cfgConfigMap.get("content").values || new Set();

      return `
[Game Files]
${[...contentItems].map((item, idx) => `GameFile${idx}=${item}`).join("\r\n")}`;
    },
    async applyChangesToCfg(cfg) {
      if (modsConfig == null) {
        throw new Error("Cannot save null mods config to OpenMW config!");
      }

      /**
       * @type {Promise<{ bsaFileNames: string[], mod: OpenMWMod }>[]}
       */
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

      const fallbackArchives = modsInfo
        .map(({ bsaFileNames }) => bsaFileNames)
        .flat();

      updateOrSetValuesForKey(
        cfg,
        "fallback",
        (prevValues) => new Set([...prevValues, ...fallbackArchives])
      );

      const dataItems = modsInfo
        .filter(({ mod }) => !mod.disabled)
        .map(({ mod }) => mod.dataFolder);

      updateOrSetValuesForKey(
        cfg,
        "data",
        (prevValues) => new Set([...prevValues, ...dataItems])
      );

      return cfg;
    },
    async updateLoadOrder(cfg, updatedLoadOrder) {
      if (modsConfig == null) {
        throw new Error("Cannot save null mods config to OpenMW config!");
      }

      updateOrSetValuesForKey(
        cfg,
        "content",
        (prevValues) =>
          new Set([
            // It is important to put updatedLoadOrder first so that
            // .omwaddon files are at the bottom
            ...updatedLoadOrder,
            ...prevValues,
          ])
      );

      return cfg;
    },
  };
}

module.exports = ModsListManager;
