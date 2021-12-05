const path = require("path");
const fsPromises = require("fs").promises;
const { produce } = require("immer");
const { updateOrSetValuesForKey } = require("./cfg");

const OPENMW_DATA_CONTENT_KEY = "data";
const OPENMW_CFG_FALLBACK_KEY = "fallback-archive";
const OPENMW_CFG_CONTENT_KEY = "content";

/**
 * @typedef {Object} ModsListManagerConfig
 * @property {OpenMWData[]} data
 * @property {OpenMWContent[]} content
 */

/**
 * @typedef {Object} ModsListManagerState
 * @property {OpenMWData[]} data
 * @property {OpenMWContent[]} content
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
 * @callback getStateFn
 * @returns {Promise<ModsListManagerState>}
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
 * @param {string} dataID
 * @returns {Promise<void>}
 */

/**
 * @async
 * @callback removeDataFn
 * @param {string} dataID
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
 * @async
 * @callback toggleContentFn
 * @param {string} contentID
 * @returns {Promise<void>}
 */

/**
 * @callback changeContentOrderFn
 * @param {OpenMWContent[]} updatedLoadOrder
 * @returns {Promise<void>}
 */

/**
 * @callback applyContentOrderFromMloxFn
 * @param {string[]} updatedLoadOrder
 * @returns {Promise<void>}
 */

/**
 * @callback checkFileOverridesFn
 * @returns {Promise<Map<string, string[]>>}
 */

/**
 * @typedef {Object} ModsListManager
 * @property {initFn} init
 * @property {changeEventListener} addListener
 * @property {getStateFn} getState
 * @property {addDataFn} addData
 * @property {toggleDataFn} toggleData
 * @property {removeDataFn} removeData
 * @property {changeDataOrderFn} changeDataOrder
 * @property {applyChangesToCfgFn} applyChangesToCfg
 * @property {convertContentToGameFilesFn} convertContentToGameFiles
 * @property {toggleContentFn} toggleContent
 * @property {changeContentOrderFn} changeContentOrder
 * @property {applyContentOrderFromMloxFn} applyContentOrderFromMlox
 * @property {checkFileOverridesFn} checkFileOverrides
 */

/**
 * @typedef {Object} ModsListManagerOptions
 * @property {string} configPath
 * @property {ReturnType<import('./Logger').Logger>['log']} logMessage
 */

/**
 *
 * @param {ModsListManagerOptions} options
 * @returns {ModsListManager}
 */
function ModsListManager({ configPath, logMessage }) {
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
      content: config.content,
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
   * @returns {Promise<{bsaFiles: string[], contentFiles: string[]}>}
   */
  async function collectDataFilesInfo(dataFolderPath) {
    const files = await fsPromises.readdir(dataFolderPath);
    return {
      bsaFiles: files.filter((file) => ARCHIVE_FILE_REGEX.test(file)),
      contentFiles: files.filter((file) => CONTENT_FILE_REGEX.test(file)),
    };
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

  const ARCHIVE_FILE_REGEX = /\.(bsa)$/i;
  const CONTENT_FILE_REGEX = /\.(esp|esm|omwaddon)$/i;
  const OMWADDON_FILE_REGEX = /\.omwaddon$/i;

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
            disabled: true,
          })),
      ];
    });

    const prevDataCount = currentState.data.length;
    const nextDataCount = nextState.data.length;

    await applyStateChanges(nextState);

    logMessage(`Added ${nextDataCount - prevDataCount} data folders`);
  }

  /**
   *
   * @param {OpenMWData[]} data
   * @returns {Promise<{ dataItem: OpenMWData, contentFileNames: string[]}[]>}
   */
  async function getContentFilesFromData(data) {
    const dataPromises = data
      .filter((dataItem) => !dataItem.disabled)
      .map(
        (dataItem) =>
          new Promise((resolve) => {
            fsPromises
              .readdir(dataItem.dataFolder)
              .then((fileNames) => resolve({ dataItem, fileNames }));
          })
      );

    return (await Promise.all(dataPromises)).map(({ dataItem, fileNames }) => ({
      dataItem,
      contentFileNames: fileNames.filter((fileName) =>
        CONTENT_FILE_REGEX.test(fileName)
      ),
    }));
  }

  return {
    async init(cfg) {
      currentState = await initializeModsListManagerState();
      if (currentState.data.length === 0) {
        const dataFromCfg = cfg.cfgConfigMap.get("data").values || new Set();
        await addData([...dataFromCfg]);

        const contentFromCfg =
          cfg.cfgConfigMap.get(OPENMW_CFG_CONTENT_KEY).values || new Set();

        const contentFiles = (await getContentFilesFromData(currentState.data))
          .map(({ dataItem, contentFileNames }) =>
            contentFileNames.map((fileName) => ({
              id: fileName,
              dataID: dataItem.id,
              name: fileName,
              disabled: !contentFromCfg.has(fileName),
            }))
          )
          .flat();

        const currentOrder = [...contentFromCfg].reduce(
          (memo, fileName, idx) => ({ ...memo, [fileName]: idx }),
          {}
        );

        contentFiles.sort(({ id: fileA }, { id: fileB }) => {
          const currentOrderPositionA = currentOrder[fileA] || 0;
          const currentOrderPositionB = currentOrder[fileB] || 0;

          return currentOrderPositionA - currentOrderPositionB;
        });

        const contentMap = new Map(
          // Content files from later data items will override files from earlier ones
          contentFiles.map((contentItem) => [contentItem.id, contentItem])
        );
        currentState.content = [...contentMap.values()];
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
    async getState() {
      const contentMap = new Map(
        // Content files from later data items will override files from earlier ones
        currentState.content.map((contentItem) => [contentItem.id, contentItem])
      );

      return {
        ...currentState,
        content: [...contentMap.values()],
      };
    },
    async changeDataOrder(nextData) {
      const nextState = produce(currentState, (draft) => {
        draft.data = nextData;
      });

      await applyStateChanges(nextState);
    },
    addData,
    async toggleData(dataID) {
      const nextState = await produce(currentState, async (draft) => {
        const dataItemIndex = draft.data.findIndex(
          (dataItem) => dataItem.id === dataID
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
            (contentItem) => !dataContentFiles.includes(contentItem.id)
          );
        } else {
          newContent = newContent.concat(
            dataContentFiles
              .map((fileName) => ({
                id: fileName,
                dataID: dataID,
                name: fileName,
                disabled: false,
              }))
              .flat()
          );
        }
        draft.content = newContent;
      });

      await applyStateChanges(nextState);

      const updatedDataItem = nextState.data.find(
        (dataItem) => dataItem.id === dataID
      );
      logMessage(
        updatedDataItem.disabled
          ? `Disabled ${updatedDataItem.name}`
          : `Enabled ${updatedDataItem.name}`
      );
    },
    async removeData(dataID) {
      const nextState = produce(currentState, (draft) => {
        draft.data = draft.data.filter((dataItem) => dataItem.id !== dataID);
      });

      const removedDataItem = currentState.data.find(
        (dataItem) => dataItem.id === dataID
      );

      await applyStateChanges(nextState);

      logMessage(`Removed ${removedDataItem.name}`);
    },
    convertContentToGameFiles() {
      return `
[Game Files]
${currentState.content
  .filter((contentItem) => !contentItem.disabled)
  .map((contentItem, idx) => `GameFile${idx}=${contentItem.id}`)
  .join("\r\n")}`;
    },
    async applyChangesToCfg(cfg) {
      if (currentState == null) {
        throw new Error("No state to apply to OpenMW config!");
      }

      /**
       * @type {Promise<{ bsaFiles: string[], contentFiles: string[], data: OpenMWData }>[]}
       */
      const dataPromises = currentState.data.map(
        (dataItem) =>
          new Promise(async (resolve) => {
            const { bsaFiles, contentFiles } = await collectDataFilesInfo(
              dataItem.dataFolder
            );

            resolve({
              bsaFiles,
              contentFiles,
              data: dataItem,
            });
          })
      );

      const dataInfo = await Promise.all(dataPromises);

      const fallbackArchives = dataInfo
        .map(({ bsaFiles, data }) =>
          bsaFiles.map((fileName) => ({
            fileName,
            disabled: data.disabled,
          }))
        )
        .flat();

      const dataItems = dataInfo.map(({ data }) => data);

      return produce(cfg, (draft) => {
        updateOrSetValuesForKey(
          draft,
          OPENMW_CFG_FALLBACK_KEY,
          (prevValues) => {
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
          }
        );

        updateOrSetValuesForKey(
          draft,
          OPENMW_DATA_CONTENT_KEY,
          (prevValues) => {
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
          }
        );

        updateOrSetValuesForKey(
          draft,
          OPENMW_CFG_CONTENT_KEY,
          () =>
            new Set(
              currentState.content
                .filter((contentItem) => !contentItem.disabled)
                .map((contentItem) => contentItem.id)
            )
        );
      });
    },
    async toggleContent(contentID) {
      const nextState = await produce(currentState, async (draft) => {
        const contentItemIndex = draft.content.findIndex(
          (contentItem) => contentItem.id === contentID
        );
        draft.content[contentItemIndex].disabled =
          !draft.content[contentItemIndex].disabled;
      });

      await applyStateChanges(nextState);

      const updatedContentItem = nextState.content.find(
        (contentItem) => contentItem.id === contentID
      );
      logMessage(
        updatedContentItem.disabled
          ? `Disabled ${updatedContentItem.name}`
          : `Enabled ${updatedContentItem.name}`
      );
    },
    async changeContentOrder(updatedLoadOrder) {
      const nextState = produce(currentState, (draft) => {
        draft.content = updatedLoadOrder;
      });

      await applyStateChanges(nextState);
    },
    async applyContentOrderFromMlox(updatedLoadOrder) {
      const nextState = produce(currentState, (draft) => {
        const updatedOrderMap = updatedLoadOrder.reduce(
          (memo, fileName, idx) => ({ ...memo, [fileName]: idx }),
          {}
        );

        draft.content.sort(({ id: fileA }, { id: fileB }) => {
          if (OMWADDON_FILE_REGEX.test(fileA)) {
            if (OMWADDON_FILE_REGEX.test(fileB)) {
              return 0;
            } else {
              return 1;
            }
          } else if (OMWADDON_FILE_REGEX.test(fileB)) {
            return -1;
          }

          const updatedOrderPositionA = updatedOrderMap[fileA] || 0;
          const updatedOrderPositionB = updatedOrderMap[fileB] || 0;

          return updatedOrderPositionA - updatedOrderPositionB;
        });
      });

      await applyStateChanges(nextState);
    },
    async checkFileOverrides() {
      const dataWithFiles = await Promise.all(
        currentState.data.map((dataItem) => getFiles(dataItem.dataFolder))
      );
      /** @type {Map<string, string[]>} */
      const dataFilesMap = new Map();
      /** @type {Map<string, string[]>} */
      const fileToDataMap = new Map();
      for (const [dataIdx, dataFiles] of dataWithFiles.entries()) {
        const dataID = currentState.data[dataIdx].id;
        const dataFolder = currentState.data[dataIdx].dataFolder;
        dataFilesMap.set(dataID, dataFiles);
        for (const fileName of dataFiles) {
          const relativeFilePath = path.relative(dataFolder, fileName);
          if (!fileToDataMap.has(relativeFilePath)) {
            fileToDataMap.set(relativeFilePath, []);
          }
          fileToDataMap.get(relativeFilePath).push(dataID);
        }
      }
      return fileToDataMap;
    },
  };
}

/**
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function getFiles(dir) {
  const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : [res];
    })
  );
  return files.flat();
}

module.exports = ModsListManager;
