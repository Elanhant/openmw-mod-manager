<script>
  import { dndzone } from "svelte-dnd-action";
  import Log from "./components/Log.svelte";
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

    const dataItemMenuItemRemove = new MenuItem({
      label: "Remove data files...",
      click: () => {
        if (
          window.confirm(`Are you sure you want to remove ${dataItem.name}?`)
        ) {
          ipcRenderer.send("remove-data", dataItem.id);
        }
      },
    });
    dataItemMenu.append(dataItemMenuItemRemove);
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
   * @type {Map<string, string>}
   */
  $: dataNames = new Map(
    dataItems.map((dataItem) => [dataItem.id, dataItem.name])
  );

  /**
   * @type {import('./ModsListManager.js').OpenMWContent[]}
   */
  let contentItems = [];

  const flipDurationMs = 300;
  function handleDndConsiderData(e) {
    dataItems = e.detail.items;
  }
  function handleDndFinalizeData(e) {
    dataItems = e.detail.items;
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

  function handleLaunchOpenMW() {
    ipcRenderer.send("launch-openmw");
  }

  ipcRenderer.on("mod-manager-ready", (event, { data, content }) => {
    dataItems = data;
    contentItems = content;
    ready = true;
  });

  ipcRenderer.on("log-message", (event, message) => {
    console.log(event, message);
    logMessages = logMessages.concat([message]);
  });

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
   */
  function addBulkData(files) {
    ipcRenderer.send(
      "drop-data-dirs",
      files.map((file) => file.path)
    );
  }
</script>

<svelte:body
  on:dragover={(evt) => {
    evt.preventDefault();
  }}
  on:drop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    addBulkData([...e.dataTransfer.items].map((item) => item.getAsFile()));
  }} />

<main class="content">
  {#if ready}
    <div class="mainToolbar">
      <button type="button" on:click={handleLaunchOpenMW}>Launch OpenMW</button>
    </div>
    <section class="dataSection">
      <div class="sectionHeading">
        <h3>Data</h3>
        <button type="button" on:click={handleSelectDirs}
          >Add data folder</button
        >
      </div>
      <div
        class="dataList"
        use:dndzone={{ items: dataItems, flipDurationMs, type: "data" }}
        on:consider={handleDndConsiderData}
        on:finalize={handleDndFinalizeData}
      >
        {#each dataItems as dataItem (dataItem.id)}
          <div
            class="dataItem"
            on:contextmenu={(e) => {
              e.preventDefault();
              createDataItemMenu(dataItem).popup();
            }}
          >
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
          <button type="button" on:click={handleSortContent}
            >Sort content</button
          >
        </div>
        <div
          class="contentItemList"
          use:dndzone={{ items: contentItems, flipDurationMs, type: "content" }}
          on:consider={handleDndConsiderContent}
          on:finalize={handleDndFinalizeContent}
        >
          {#each contentItems as contentItem (contentItem.id)}
            <div class="contentItem">
              <div>
                <input
                  type="checkbox"
                  name={`enableContent_${contentItem.id}`}
                  checked={!contentItem.disabled}
                  disabled
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
    grid-template-columns: auto 1fr;
    grid-gap: 24px;
    align-items: center;
  }
  .dataItem:nth-of-type(even) {
    background-color: #ecf8ff;
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
</style>
