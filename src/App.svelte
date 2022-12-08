<script>
  import { dndzone, SOURCES, TRIGGERS } from "svelte-dnd-action";
  import Log from "./components/Log.svelte";
  import { tick } from "svelte";
  /** @type {Electron} */
  const electron = window.require("electron");

  const { ipcRenderer, remote, shell } = electron;
  const { Menu, MenuItem } = remote;

  /**
   *
   * @param {import('./ModsListManager.js').OpenMWData} dataItem
   * @returns {Electron.Menu}
   */
  function createDataItemMenu(dataItem) {
    const dataItemMenu = new Menu();

    const dataItemMenuItemOpenDir = new MenuItem({
      label: "Open folder",
      click: () => {
        shell.openItem(dataItem.dataFolder);
      },
    });
    dataItemMenu.append(dataItemMenuItemOpenDir);

    let dataIDsToRemove = [dataItem.id];

    if (
      Object.keys(selectedDataItems).length > 0 &&
      selectedDataItems[dataItem.id] != null
    ) {
      dataIDsToRemove = Object.values(selectedDataItems).map(
        (selectedDataItem) => selectedDataItem.id
      );
    }

    const dataItemMenuItemRemove = new MenuItem({
      label: "Remove data files...",
      click: () => {
        if (
          window.confirm(
            `Are you sure you want to remove ${
              dataIDsToRemove.length === 1
                ? dataItem.name
                : `${dataIDsToRemove.length} mod(s)`
            }?`
          )
        ) {
          ipcRenderer.send("remove-data", dataIDsToRemove);
        }
      },
    });
    dataItemMenu.append(dataItemMenuItemRemove);

    const moveUpBy50 = new MenuItem({
      label: "Move up by 50",
      click: () => {
        const currentIdx = dataItems.indexOf(dataItem);
        const newIdx = Math.max(currentIdx - 50, 1);
        const newDataItems = [];
        for (let i = 0; i < dataItems.length; i++) {
          if (i === newIdx) {
            newDataItems.push(dataItem);
          } else if (i === currentIdx) {
            continue;
          }
          newDataItems.push(dataItems[i]);
        }
        dataItems = newDataItems;
        ipcRenderer.send("reorder-data", dataItems);
      },
    });
    dataItemMenu.append(moveUpBy50);
    return dataItemMenu;
  }

  let ready = false;

  /** @type {import('./Logger').LogMessage[]} */
  let logMessages = [];

  /**
   * @type {import('./ModsListManager.js').OpenMWData[]}
   */
  let dataItems = [];

  /**
   * @type {Map<string, import('./ModsListManager.js').OpenMWData[]>}
   */
  $: dataItemsMap = new Map(
    dataItems.map((dataItem) => [dataItem.id, dataItem])
  );

  /**
   * @type {Map<string, string>}
   */
  $: dataNames = new Map(
    dataItems.map((dataItem) => [dataItem.id, dataItem.name])
  );

  /**
   * @type {import('./ModsListManager.js').OpenMWContent[]}
   */
  let contentItems = [];

  let searchData = "";
  let searchContent = "";

  /**
   * @typedef {Object} SelectedDataItem
   * @property {string} id
   * @property {number} idx
   * @property {import('./ModsListManager.js').OpenMWData[]} data
   */

  /**
   * @type {Object.<string,SelectedDataItem>}
   */
  let selectedDataItems = {};
  let minSelectedIdx = Infinity;
  let maxSelectedIdx = -1;

  function resetSelectedDataItems() {
    selectedDataItems = {};
    minSelectedIdx = Infinity;
    maxSelectedIdx = -1;
  }

  let selectedDataID = null;
  $: selectedContentIDs =
    Object.keys(selectedDataItems).length > 0
      ? contentItems
          .filter(
            (contentItem) => selectedDataItems[contentItem.dataID] != null
          )
          .map((contentItem) => contentItem.id)
      : [];

  const flipDurationMs = 300;
  function handleDndConsiderData(e) {
    const {
      items: newDataItems,
      info: { trigger, source, id },
    } = e.detail;
    if (source !== SOURCES.KEYBOARD) {
      if (
        Object.keys(selectedDataItems).length > 0 &&
        trigger === TRIGGERS.DRAG_STARTED
      ) {
        if (selectedDataItems[id] != null) {
          selectedDataItems = { ...selectedDataItems };
          tick().then(() => {
            dataItems = newDataItems.filter(
              (item) => selectedDataItems[item.id] == null
            );
          });
        } else {
          resetSelectedDataItems();
        }
      }
    }
    if (trigger === TRIGGERS.DRAG_STOPPED) {
      resetSelectedDataItems();
    }

    dataItems = newDataItems;
  }
  function handleDndFinalizeData(e) {
    let {
      items: newDataItems,
      info: { trigger, source, id },
    } = e.detail;
    const temp = { ...selectedDataItems };

    if (Object.keys(selectedDataItems).length > 0) {
      if (trigger === TRIGGERS.DROPPED_INTO_ANOTHER) {
        dataItems = newDataItems.filter(
          (item) => selectedDataItems[item.id] == null
        );
      } else if (
        trigger === TRIGGERS.DROPPED_INTO_ZONE ||
        trigger === TRIGGERS.DROPPED_OUTSIDE_OF_ANY
      ) {
        tick().then(() => {
          const idx = newDataItems.findIndex((item) => item.id === id);
          // to support arrow up when keyboard dragging
          const sidx = Math.max(
            Object.values(selectedDataItems).findIndex(
              (item) => item.id === id
            ),
            0
          );
          newDataItems = newDataItems.filter(
            (item) => selectedDataItems[item.id] == null
          );
          newDataItems.splice(
            idx - sidx,
            0,
            ...Object.values(selectedDataItems)
              .sort((a, b) => a.idx - b.idx)
              .map((selectedDataItem) => selectedDataItem.data)
          );
          dataItems = newDataItems;

          if (source !== SOURCES.KEYBOARD) {
            resetSelectedDataItems();
          }
        });
      }
    } else {
      dataItems = newDataItems;
    }
    ipcRenderer.send("reorder-data", dataItems);
  }
  function handleDndConsiderContent(e) {
    contentItems = e.detail.items;
  }
  function handleDndFinalizeContent(e) {
    contentItems = e.detail.items;
    ipcRenderer.send("reorder-content", contentItems);
  }

  /**
   *
   * @param {string} dataID
   */
  function handleToggleData(dataID) {
    ipcRenderer.send("toggle-data", dataID);
  }

  /**
   *
   * @param {string} contentID
   */
  function handleToggleContent(contentID) {
    ipcRenderer.send("toggle-content", contentID);
  }

  function handleLaunchOpenMW() {
    ipcRenderer.send("launch-openmw");
  }

  function handleRunOMWLLF() {
    ipcRenderer.send("run-omwllf");
  }

  function handleRunDeltaPlugin() {
    ipcRenderer.send("run-delta-plugin");
  }

  ipcRenderer.on("mod-manager-ready", (event, { data, content }) => {
    dataItems = Array.from(
      new Map(data.map((dataItem) => [dataItem.id, dataItem])).values()
    );
    contentItems = content;
    ready = true;
  });

  ipcRenderer.on("log-message", (event, message) => {
    console.log(event, message);
    logMessages = logMessages.concat([message]);
  });

  /* ipcRenderer.on("check-file-overrides", (event, fileToDataMap) => {
    console.log(fileToDataMap);
    console.log(
      [...fileToDataMap.entries()].filter(
        ([key, dataIDs]) => dataIDs.length > 1
      )
    );
  }); */

  function handleSelectDirs(event) {
    event.preventDefault();
    window.postMessage({
      type: "select-dirs",
    });
  }

  function handleSortContent(event) {
    event.preventDefault();
    ipcRenderer.send("sort-content");
  }

  /**
   *
   * @param {File[]} files
   * @param {?number} insertIdx
   */
  function addBulkData(files, insertIdx) {
    ipcRenderer.send(
      "drop-data-dirs",
      files.map((file) => file.path),
      insertIdx
    );
  }

  function selectItem(idx) {
    const dataItem = dataItems[idx];
    selectedDataItems[dataItem.id] = {
      id: dataItem.id,
      idx,
      data: dataItem,
    };
    if (idx < minSelectedIdx) {
      minSelectedIdx = idx;
    }
    if (idx > maxSelectedIdx) {
      maxSelectedIdx = idx;
    }
  }

  function selectItemByID(id) {
    const idx = dataItems.findIndex((item) => item.id === id);
    selectItem(idx);
  }

  function handleMaybeSelect(id, e) {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      resetSelectedDataItems();
      return;
    }
    if (e.key && e.key !== "Shift") {
      resetSelectedDataItems();
      return;
    }

    if (selectedDataItems[id] != null) {
      delete selectedDataItems[id];
    } else {
      selectItemByID(id);
      if (e.shiftKey && Object.keys(selectedDataItems).length > 0) {
        for (let i = minSelectedIdx; i < maxSelectedIdx; i++) {
          selectItem(i);
        }
      }
    }
    selectedDataItems = { ...selectedDataItems };
  }

  /* function handleCheckFileOverrides(e) {
    if (e.target.checked) {
      ipcRenderer.send("check-file-overrides");
    }
  } */
</script>

<svelte:body
  on:dragover={(evt) => {
    evt.preventDefault();
  }}
  on:drop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    const dataItemEl = e.target.closest("[data-dataitemid]");
    let insertIdx = null;
    if (dataItemEl) {
      insertIdx = dataItems.findIndex(
        (dataItem) => dataItem.id === dataItemEl.dataset["dataitemid"]
      );
    }
    addBulkData(
      [...e.dataTransfer.items].map((item) => item.getAsFile()),
      insertIdx
    );
  }}
/>

<main class="content">
  {#if ready}
    <div class="mainToolbar">
      <button type="button" on:click={handleRunOMWLLF}>Run OMWLLF</button>
      <button type="button" on:click={handleRunDeltaPlugin}
        >Run DeltaPlugin</button
      >
      <button type="button" on:click={handleLaunchOpenMW}>Launch OpenMW</button>
    </div>
    <section class="dataSection">
      <div class="sectionHeading">
        <h3>Data ({dataItems.length})</h3>
        <div>
          <!-- <label for="show_file_overrides" style="display: inline-block;">
            <input type="checkbox" name="show_file_overrides" disabled /> Show file
            overrides (WIP)
          </label> -->
          <input type="text" placeholder="Search..." bind:value={searchData} />
          <button type="button" on:click={handleSelectDirs}
            >Add data folder</button
          >
        </div>
      </div>
      <div
        class="dataList"
        use:dndzone={{
          items: dataItems,
          flipDurationMs,
          type: "data",
          dragDisabled: searchData !== "",
        }}
        on:consider={handleDndConsiderData}
        on:finalize={handleDndFinalizeData}
      >
        {#each dataItems.filter((dataItem) => dataItem.name
            .toLowerCase()
            .includes(searchData.toLowerCase())) as dataItem, dataItemIdx (dataItem.id)}
          <div
            class="dataItem"
            aria-selected={selectedDataItems[dataItem.id] != null}
            data-dataitemid={dataItem.id}
            on:click={(e) => {
              if (e.target.tagName !== "INPUT") {
                handleMaybeSelect(dataItem.id, e);
              }
            }}
            on:contextmenu={(e) => {
              e.preventDefault();
              createDataItemMenu(dataItem).popup();
            }}
          >
            <div>
              <small>{dataItems.indexOf(dataItem) + 1}</small>
            </div>
            <div>
              <input
                type="checkbox"
                name={`enableData_${dataItem.id}`}
                checked={!dataItem.disabled}
                on:change={() => handleToggleData(dataItem.id)}
              />
            </div>
            <div>
              <span>{dataItem.name}</span>
            </div>
          </div>
        {/each}
      </div>
    </section>
    <section class="contentSection">
      {#if ready}
        <div class="sectionHeading">
          <h3>Content</h3>
          <div>
            <input
              type="text"
              placeholder="Search..."
              bind:value={searchContent}
            />
            <button type="button" on:click={handleSortContent}
              >Sort content</button
            >
          </div>
        </div>
        <div
          class="contentItemList"
          use:dndzone={{ items: contentItems, flipDurationMs, type: "content" }}
          on:consider={handleDndConsiderContent}
          on:finalize={handleDndFinalizeContent}
        >
          {#each contentItems.filter((contentItem) => contentItem.name
              .toLowerCase()
              .includes(searchContent.toLowerCase())) as contentItem (contentItem.id)}
            <div
              class="contentItem"
              aria-selected={selectedContentIDs.includes(contentItem.id)}
              on:click={(e) => {
                if (e.target.tagName !== "INPUT") {
                  selectItemByID(contentItem.dataID);
                  selectedContentIDs = [contentItem.id];
                }
              }}
            >
              <div>
                <input
                  type="checkbox"
                  name={`enableContent_${contentItem.id}`}
                  checked={!contentItem.disabled}
                  on:change={() => handleToggleContent(contentItem.id)}
                />
              </div>
              <div>
                <span>{contentItem.name}</span>
                <br />
                <small>{dataNames.get(contentItem.dataID)}</small>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
  <section class="logsSection">
    <h3>Logs</h3>
    <Log {logMessages} />
  </section>
</main>

<style>
  .content {
    display: grid;
    grid-template-areas:
      "main-toolbar main-toolbar"
      "data content"
      "data logs";
    grid-template-columns: 3fr 2fr;
    grid-template-rows: auto 8fr 3fr;
    grid-gap: 24px;
    height: 100vh;
    box-sizing: border-box;
  }
  .mainToolbar {
    grid-area: main-toolbar;
    text-align: end;
  }
  .sectionHeading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dataSection {
    grid-area: data;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .contentSection {
    grid-area: content;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .logsSection {
    grid-area: logs;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  main {
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }
  @media (min-width: 640px) {
    main {
      max-width: none;
    }
  }
  .dataList {
    border: 1px solid lightgray;
    border-radius: 2px;
    overflow-y: auto;
  }
  .dataItem {
    padding: 16px 24px;
    display: grid;
    grid-template-columns: 40px auto 1fr;
    grid-gap: 24px;
    align-items: center;
  }
  .dataItem:nth-of-type(even) {
    background-color: #ecf8ff;
  }
  .dataItem[aria-selected="true"] {
    background-color: #87cefa;
  }
  .contentItemList {
    border: 1px solid lightgray;
    border-radius: 2px;
    overflow-y: auto;
  }
  .contentItem {
    padding: 16px 24px;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-gap: 12px;
    align-items: center;
  }
  .contentItem input {
    margin: 0;
  }
  .contentItem:nth-of-type(even) {
    background-color: #ecf8ff;
  }
  .contentItem[aria-selected="true"] {
    background-color: #87cefa;
  }
</style>
