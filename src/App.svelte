<script>
  import { afterUpdate } from "svelte";
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  /** @type {Electron} */
  const electron = window.require("electron");

  const { ipcRenderer, remote } = electron;
  const { Menu, MenuItem } = remote;

  let menuDataToRemoveID = null;

  const dataItemMenu = new Menu();

  const dataItemMenuItemRemove = new MenuItem({
    label: "Remove mod...",
    click: () => {
      if (window.confirm("Are you sure you want to remove this mod?")) {
        ipcRenderer.send("remove-data", menuDataToRemoveID);
      }
    },
  });
  dataItemMenu.append(dataItemMenuItemRemove);

  let ready = false;

  /** @type {string[]} */
  let logMessages = [];

  /** @type {HTMLDivElement} */
  let logMessagesContainer;

  afterUpdate(() => {
    if (logMessagesContainer) {
      logMessagesContainer.scrollTo(0, logMessagesContainer.scrollHeight);
    }
  });

  /**
   * @type {import('./ModsListManager.js').OpenMWData[]}
   */
  let dataItems = [];
  /**
   * @type {Map<string, string>}
   */
  $: dataNames = new Map(
    dataItems.map((dataEntry) => [dataEntry.id, dataEntry.name])
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
    // contentItems = e.detail.items;
  }
  function handleDndFinalizeContent(e) {
    // contentItems = e.detail.items;
    // ipcRenderer.send("reorder-content", contentItems);
  }

  /**
   *
   * @param {string} dataID
   */
  function handleToggleData(dataID) {
    ipcRenderer.send("toggle-data", dataID);
  }

  function handleSaveToOpenMWConfig() {
    ipcRenderer.send("update-openmw-config");
  }

  ipcRenderer.on("mod-manager-ready", (event, { data, content }) => {
    dataItems = data;
    contentItems = content;
    ready = true;
    console.log({ dataItems, contentItems });
  });

  ipcRenderer.on("select-openmw-config-file", (event, config) => {
    console.log("select-openmw-config-file", config);
  });

  ipcRenderer.on("log-message", (event, message) => {
    console.log(event, message);
    logMessages = logMessages.concat([message]);
  });

  function selectOpenMWConfig(event) {
    /** @type {File} */
    const file = event.target.files[0];
    ipcRenderer.send("select-openmw-config-file", file.path);
  }

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
    <div class="dataToolbar">
      <label for="openMWConfig">OpenMW config file</label>
      <input
        type="file"
        id="openMWConfig"
        multiple={false}
        accept=".cfg"
        on:change={selectOpenMWConfig}
      />
      <button type="button" on:click={handleSelectDirs}>Add mod</button>
      <button type="button" on:click={handleSaveToOpenMWConfig}
        >Update OpenMW config</button
      >
    </div>
    <section class="dataSection">
      <div
        class="dataList"
        use:dndzone={{ items: dataItems, flipDurationMs, type: "data" }}
        on:consider={handleDndConsiderData}
        on:finalize={handleDndFinalizeData}
      >
        {#each dataItems as dataItem (dataItem.id)}
          <div
            animate:flip={{ duration: flipDurationMs }}
            class="dataItem"
            on:contextmenu={(e) => {
              e.preventDefault();
              menuDataToRemoveID = dataItem.id;
              console.log({ menuDataToRemoveID });
              dataItemMenu.popup();
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
              <h4>{dataItem.name}</h4>
              {#if dataItem.disabled}
                <s>{dataItem.dataFolder}</s>
              {:else}
                {dataItem.dataFolder}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
    <div class="contentToolbar">
      <button type="button" on:click={handleSortContent}>Sort content</button>
    </div>
    <section class="contentSection">
      {#if ready}
        <div
          class="contentItemList"
          use:dndzone={{ items: contentItems, flipDurationMs, type: "content" }}
          on:consider={handleDndConsiderContent}
          on:finalize={handleDndFinalizeContent}
        >
          {#each contentItems as contentItem (contentItem.id)}
            <div
              class="contentItem"
              animate:flip={{ duration: flipDurationMs }}
            >
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
    <ol style="list-style: none;" bind:this={logMessagesContainer}>
      {#each logMessages as logMessage}
        <li>{logMessage}</li>
      {/each}
    </ol>
  </section>
</main>

<style>
  .content {
    display: grid;
    grid-template-areas:
      "data-toolbar content-toolbar"
      "data content"
      "data logs";
    grid-template-columns: 3fr 2fr;
    grid-template-rows: 1fr 8fr 3fr;
    grid-gap: 24px;
    height: 100vh;
  }
  .dataToolbar {
    grid-area: data-toolbar;
  }
  .contentToolbar {
    grid-area: content-toolbar;
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
  .logsSection ol {
    margin: 0;
    padding: 0;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
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
  .dataItem h4 {
    margin-top: 0;
    margin-bottom: 8px;
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
