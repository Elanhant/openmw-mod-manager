const path = require("path");
const fsPromises = require("fs").promises;
const { produce } = require("immer");
const { updateOrSetValuesForKey } = require("./cfg");

/**
 * @typedef {Object} ModsListManagerConfig
 * @property {OpenMWData[]} data
 * @property {string[]} content
 */

/**
 * @typedef {Object} ModsListManagerState
 * @property {OpenMWData[]} data
 * @property {Set<string>} content
 */

/**
 * @typedef {Object} OpenMWData
 * @property {string} id
 * @property {string} name
 * @property {string} dataFolder
 * @property {boolean} disabled
 */

/**
 * @typedef {Object} OpenMWContent
 * @property {string} id
 * @property {string} dataID
 * @property {string} name
 * @property {boolean} disabled
 */

/**
 * @typedef {"change"} ModsListEvent
 */

/**
 * @callback changeEventCallback
 * @param {ModsListManagerState} currentState
 * @returns {void}
 */

/**
 * @callback changeEventListener
 * @param {"change"} eventName
 * @param {changeEventCallback} callback
 * @returns {function():void}
 */

/**
 * @async
 * @callback getConfigFn
 * @returns {Promise<ModsListManagerState>}
 */

/**
 * @async
 * @callback getContentFn
 * @returns {Promise<OpenMWContent[]>}
 */

/**
 * @async
 * @callback initFn
 * @param {import('./cfg').CfgParsed} cfg
 * @returns {Promise<void>}
 */

/**
 * @async
 * @callback addDataFn
 * @param {string[]} dataFolderPaths
 * @returns {Promise<void>}
 */

/**
 * @async
 * @callback toggleDataFn
 * @param {string} modID
 * @returns {Promise<void>}
 */

/**
 * @async
 * @callback removeDataFn
 * @param {string} modID
 * @returns {Promise<void>}

/**
 * @async
 * @callback changeDataOrderFn
 * @param {OpenMWData[]} updatedData
 * @returns {Promise<void>}
 */

/**
 * @async
 * @callback applyChangesToCfgFn
 * @param {import('./cfg').CfgParsed} cfg
 * @returns {Promise<import('./cfg').CfgParsed>}
 */

/**
 * @callback convertContentToGameFilesFn
 * @returns {string}
 */

/**
 * @callback changeContentOrderFn
 * @param {string[]} updatedLoadOrder
 * @returns {Promise<void>}
 */

/**
 * @typedef {Object} ModsListManager
 * @property {initFn} init
 * @property {changeEventListener} addListener
 * @property {getConfigFn} getConfig
 * @property {getContentFn} getContent
 * @property {addDataFn} addData
 * @property {toggleDataFn} toggleData
 * @property {removeDataFn} removeData
 * @property {changeDataOrderFn} changeDataOrder
 * @property {applyChangesToCfgFn} applyChangesToCfg
 * @property {convertContentToGameFilesFn} convertContentToGameFiles
 * @property {changeContentOrderFn} changeContentOrder
 */

/**
 * @typedef {Object} ModsListManagerOptions
 * @property {string} configPath
 */

/**
 *
 * @param {ModsListManagerOptions} options
 * @returns {ModsListManager}
 */
function ModsListManager({ configPath }) {
  /** @type {ModsListManagerState | null}  */
  let currentState = null;

  /**
   *
   * @returns {Promise<boolean>}
   */
  async function doesModsListManagerConfigExist() {
    return await fsPromises
      .access(configPath)
      .then(() => true)
      .catch(() => false);
  }

  /**
   *
   * @returns {Promise<ModsListManagerConfig>}
   */
  async function readModsListManagerConfig() {
    const raw = await fsPromises.readFile(configPath, "utf-8");
    return JSON.parse(raw);
  }

  /**
   * @returns {Promise<ModsListManagerConfig>}
   */
  async function createEmptyModsListManagerConfig() {
    /** @type {ModsListManagerConfig} */
    const emptyConfig = {
      data: [],
      content: [],
    };

    await fsPromises.writeFile(
      configPath,
      JSON.stringify(emptyConfig, null, 2),
      "utf-8"
    );

    return emptyConfig;
  }

  /**
   *
   * @param {ModsListManagerConfig} config
   * @returns {ModsListManagerState}
   */
  function configToState(config) {
    return {
      data: config.data,
      content: new Set(config.content),
    };
  }

  /**
   *
   * @param {ModsListManagerState} state
   * @returns {ModsListManagerConfig}
   */
  function stateToConfig(state) {
    return {
      data: state.data,
      content: [...state.content],
    };
  }

  /**
   *
   * @returns {Promise<ModsListManagerState>}
   */
  async function initializeModsListManagerState() {
    let config;
    if (!(await doesModsListManagerConfigExist())) {
      config = await createEmptyModsListManagerConfig();
    } else {
      config = await readModsListManagerConfig();
    }

    return configToState(config);
  }

  /**
   * @typedef {Object} ModsListListeners
   * @property {changeEventCallback[]} change
   */

  /**
   * @type {ModsListListeners}
   */
  let listeners = {
    change: [],
  };

  /**
   * @async
   * @param {ModsListManagerState} nextState
   * @returns {Promise<void>}
   */
  async function applyStateChanges(nextState) {
    if (nextState !== currentState) {
      currentState = nextState;
      for (const changeListener of listeners.change) {
        changeListener(currentState);
      }
    }
    await saveModsListConfigToFile();
  }

  async function saveModsListConfigToFile() {
    await fsPromises.writeFile(
      configPath,
      JSON.stringify(stateToConfig(currentState), null, 2)
    );
  }

  /**
   * @async
   * @param {string} dataFolderPath
   * @returns {Promise<string[]>}
   */
  async function collectBSAFileNames(dataFolderPath) {
    const files = await fsPromises.readdir(dataFolderPath);
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

  /**
   *
   * @param {string} dataFolder
   * @returns {string}
   */
  function getModName(dataFolder) {
    const parts = dataFolder.split(/[/\\]/);
    let modName = parts.pop();
    if (/^\d\d/.test(modName)) {
      const variantName = modName;
      modName = parts.pop();
      return `${modName} [${variantName}]`;
    }
    return modName;
  }

  const CONTENT_FILE_REGEX = /\.(esp|esm|omwaddon)$/i;

  /**
   *
   * @returns {Promise<OpenMWContent[]>}
   */
  async function getContent() {
    /** @type {Map<string, OpenMWContent>} */
    const contentFilesMap = new Map();

    /**
     * @type {Promise<OpenMWContent[]>[]}
     */
    const dataPromises = currentState.data
      .filter((dataItem) => !dataItem.disabled)
      .map(
        (dataItem) =>
          new Promise(async (resolve) => {
            const files = await fsPromises.readdir(dataItem.dataFolder);

            resolve(
              files
                .filter((fileName) => CONTENT_FILE_REGEX.test(fileName))
                .map((fileName) => {
                  return {
                    id: fileName,
                    dataID: dataItem.id,
                    name: fileName,
                    disabled: !currentState.content.has(fileName),
                  };
                })
            );
          })
      );
    const allContentFiles = (await Promise.all(dataPromises)).flat();

    // We need to go through each content again to make sure that
    // the content from the latest data folders overrides the same content
    // from the previous folders
    for (const content of allContentFiles) {
      contentFilesMap.set(content.id, content);
    }

    const sortOrderEntries = [...currentState.content].reduce(
      (memo, content, idx) => ({ ...memo, [content]: idx }),
      {}
    );

    return [...contentFilesMap.values()]
      .filter((content) => !content.disabled)
      .sort(
        (contentA, contentB) =>
          sortOrderEntries[contentA.id] - sortOrderEntries[contentB.id]
      )
      .concat(
        [...contentFilesMap.values()].filter((content) => content.disabled)
      );
  }

  /** @type {addDataFn} */
  async function addData(dataFolderPaths) {
    const nextState = produce(currentState, (draft) => {
      draft.data = [
        ...draft.data,
        ...dataFolderPaths
          .filter(
            (dataFolderPath) =>
              !draft.data.some(
                (currentMod) => currentMod.dataFolder === dataFolderPath
              )
          )
          .map((dataFolder) => ({
            id: dataFolder,
            dataFolder,
            name: getModName(dataFolder),
            disabled: false,
          })),
      ];
    });

    await applyStateChanges(nextState);
  }

  return {
    async init(cfg) {
      currentState = await initializeModsListManagerState();
      if (currentState.data.length === 0) {
        const dataFromCfg = cfg.cfgConfigMap.get("data").values || new Set();
        await addData([...dataFromCfg]);

        const contentFromCfg =
          cfg.cfgConfigMap.get("content").values || new Set();
        currentState.content = contentFromCfg;
      }
    },
    addListener(eventName, callback) {
      listeners[eventName].push(callback);

      return () => {
        listeners[eventName] = listeners[eventName].filter(
          (listener) => listener !== callback
        );
      };
    },
    async getConfig() {
      return currentState;
    },
    getContent,
    async changeDataOrder(nextData) {
      const nextState = produce(currentState, (draft) => {
        draft.data = nextData;
      });

      await applyStateChanges(nextState);
    },
    addData,
    async toggleData(dataItemID) {
      const nextState = await produce(currentState, async (draft) => {
        const dataItemIndex = draft.data.findIndex(
          (dataItem) => dataItem.id === dataItemID
        );
        const dataItem = draft.data[dataItemIndex];
        const dataContentFiles = (
          await fsPromises.readdir(dataItem.dataFolder)
        ).filter((fileName) => CONTENT_FILE_REGEX.test(fileName));

        draft.data[dataItemIndex].disabled =
          !draft.data[dataItemIndex].disabled;

        let newContent = [...draft.content];
        if (draft.data[dataItemIndex].disabled) {
          newContent = newContent.filter(
            (contentFile) => !dataContentFiles.includes(contentFile)
          );
        } else {
          newContent.push(...dataContentFiles);
        }
        draft.content = new Set(newContent);
      });

      await applyStateChanges(nextState);
    },
    async removeData(dataItemID) {
      const nextState = produce(currentState, (draft) => {
        draft.data = draft.data.filter(
          (dataItem) => dataItem.id !== dataItemID
        );
      });

      await applyStateChanges(nextState);
    },
    convertContentToGameFiles() {
      return `
[Game Files]
${[...currentState.content]
  .map((item, idx) => `GameFile${idx}=${item}`)
  .join("\r\n")}`;
    },
    async applyChangesToCfg(cfg) {
      if (currentState == null) {
        throw new Error("No state to apply to OpenMW config!");
      }

      /**
       * @type {Promise<{ bsaFileNames: string[], data: OpenMWData }>[]}
       */
      const dataPromises = currentState.data.map(
        (dataItem) =>
          new Promise(async (resolve) => {
            const bsaFileNames = await collectBSAFileNames(dataItem.dataFolder);

            resolve({
              bsaFileNames,
              data: dataItem,
            });
          })
      );

      const dataInfo = await Promise.all(dataPromises);

      const fallbackArchives = dataInfo
        .map(({ bsaFileNames, data }) =>
          bsaFileNames.map((fileName) => ({
            fileName,
            disabled: data.disabled,
          }))
        )
        .flat();

      const dataItems = dataInfo.map(({ data }) => data);

      return produce(cfg, (draft) => {
        updateOrSetValuesForKey(draft, "fallback", (prevValues) => {
          const nextValues = new Set(prevValues);
          for (const fallbackItem of fallbackArchives) {
            if (fallbackItem.disabled) {
              if (prevValues.has(fallbackItem.fileName)) {
                nextValues.delete(fallbackItem.fileName);
              }
              continue;
            }
            nextValues.add(fallbackItem.fileName);
          }
          return nextValues;
        });

        updateOrSetValuesForKey(draft, "data", (prevValues) => {
          const nextValues = new Set(prevValues);
          for (const dataItem of dataItems) {
            if (dataItem.disabled) {
              if (prevValues.has(dataItem.dataFolder)) {
                nextValues.delete(dataItem.dataFolder);
              }
              continue;
            }
            nextValues.add(dataItem.dataFolder);
          }
          return nextValues;
        });

        updateOrSetValuesForKey(
          draft,
          "content",
          () => new Set(currentState.content)
        );
      });
    },
    async changeContentOrder(updatedLoadOrder) {
      const nextState = produce(currentState, (draft) => {
        draft.content = new Set([
          // It is important to put updatedLoadOrder first so that
          // .omwaddon files are at the bottom
          ...updatedLoadOrder,
          ...draft.content,
        ]);
      });

      await applyStateChanges(nextState);
    },
  };
}

module.exports = ModsListManager;
