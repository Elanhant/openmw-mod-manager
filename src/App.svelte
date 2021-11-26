<script>
  import { flip } from "svelte/animate";
  import { dndzone } from "svelte-dnd-action";
  /** @type {Electron} */
  const electron = window.require("electron");

  const { ipcRenderer, remote } = electron;
  const { Menu, MenuItem } = remote;

  let menuModToRemoveID = null;

  const modMenuItem = new Menu();

  const menuItem = new MenuItem({
    label: "Remove mod...",
    click: () => {
      if (window.confirm("Are you sure you want to remove this mod?")) {
        ipcRenderer.send("remove-mod", menuModToRemoveID);
      }
    },
  });
  modMenuItem.append(menuItem);

  export let name;

  $: modManagerConfig = null;
  /**
   * @type {import('./index.js').OpenMWModsConfig}
   */
  $: openMWConfig = null;

  /**
   * @type {import('./index.js').OpenMWMod[]}
   */
  $: currentMods = openMWConfig != null ? openMWConfig.modsList : [];

  const flipDurationMs = 300;
  function handleDndConsider(e) {
    currentMods = e.detail.items;
  }
  function handleDndFinalize(e) {
    currentMods = e.detail.items;
    ipcRenderer.send("reorder-mods", currentMods);
  }

  /**
   *
   * @param {string} modID
   */
  function handleToggleMod(modID) {
    ipcRenderer.send("toggle-mod", modID);
  }

  function handleSaveToOpenMWConfig() {
    ipcRenderer.send("update-openmw-config");
  }

  ipcRenderer.on("configReady", (event, config) => {
    console.log(config);
    modManagerConfig = config;
  });

  ipcRenderer.on("openmw-config-ready", (event, config) => {
    console.log(config);
    openMWConfig = config;
  });

  ipcRenderer.on("select-openmw-config-file", (event, config) => {
    console.log("select-openmw-config-file", config);
    openMWConfig = config;
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

  function handleRunOpenMW(event) {
    event.preventDefault();
    console.log("handleRunOpenMW");
    window.postMessage({
      type: "run-open-mw",
    });
  }

  function handleSortContent(event) {
    event.preventDefault();
    console.log("handleSortContent");
    ipcRenderer.send("sort-content");
    // window.postMessage({
    //   type: "sort-content",
    // });
  }

  function getModName(mod) {
    const parts = mod.dataFolder.split(/[/\\]/);
    let modName = parts.pop();
    if (/^\d\d/.test(modName)) {
      const variantName = modName;
      modName = parts.pop();
      return `${modName} [${variantName}]`;
    }
    return modName;
  }

  /**
   *
   * @param {File[]} files
   */
  function addBulkMods(files) {
    ipcRenderer.send(
      "drop-dirs",
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
    addBulkMods([...e.dataTransfer.items].map((item) => item.getAsFile()));
  }} />

<main>
  {#if modManagerConfig}
    <section style="position: sticky; top: 0; background: #fff">
      <details>
        <summary>View raw</summary>
        <pre>
					{JSON.stringify(modManagerConfig, null, 2)}
					{JSON.stringify(openMWConfig, null, 2)}
				</pre>
      </details>
      <!-- {#if !openMWConfig.openMWConfigPath} -->
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
      <button type="button" on:click={handleRunOpenMW}>Run OpenMW</button>
      <button type="button" on:click={handleSortContent}>Sort content</button>
    </section>
    <!-- {/if} -->
    {#if openMWConfig}
      <section
        class="modsList"
        use:dndzone={{ items: currentMods, flipDurationMs }}
        on:consider={handleDndConsider}
        on:finalize={handleDndFinalize}
      >
        {#each currentMods as item (item.id)}
          <div
            animate:flip={{ duration: flipDurationMs }}
            class="modItem"
            data-modid={item.id}
            on:contextmenu={(e) => {
              e.preventDefault();
              /** @type {HTMLElement|null} */
              const modListItem = e.target.closest("[data-modid]");
              if (modListItem) {
                menuModToRemoveID = modListItem.dataset.modid;
                console.log({ menuModToRemoveID });
                modMenuItem.popup();
              }
            }}
          >
            <div>
              <input
                type="checkbox"
                name={`enableMod_${item.id}`}
                checked={!item.disabled}
                on:change={() => handleToggleMod(item.id)}
              />
            </div>
            <div>
              <h4>{getModName(item)}</h4>
              {#if item.disabled}
                <s>{item.dataFolder}</s>
              {:else}
                {item.dataFolder}
              {/if}
            </div>
          </div>
        {/each}
      </section>
    {/if}
  {/if}
</main>

<style>
  main {
    /* text-align: center; */
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }
  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }
  @media (min-width: 640px) {
    main {
      max-width: none;
    }
  }
  .modsList {
    border: 1px solid lightgray;
    border-radius: 2px;
  }
  .modItem {
    padding: 16px 24px;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-gap: 24px;
    align-items: center;
  }
  .modItem h4 {
    margin-top: 0;
    margin-bottom: 8px;
  }
  .modItem:nth-of-type(even) {
    background-color: #e9f7ff;
  }
</style>
