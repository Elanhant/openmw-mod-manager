<script>
	import { flip } from "svelte/animate";
	import { dndzone } from "svelte-dnd-action";
	/** @type {Electron} */
	const electron = window.require("electron");

	const { ipcRenderer } = electron;

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
		ipcRenderer.send("reorderMods", currentMods);
	}

	/**
	 *
	 * @param {string} modID
	 */
	function handleToggleMod(modID) {
		ipcRenderer.send("toggleMod", modID);
	}

	function handleSaveToOpenMWConfig() {
		ipcRenderer.send("saveToOpenMWConfig");
	}

	ipcRenderer.on("configReady", (event, config) => {
		console.log(config);
		modManagerConfig = config;
	});

	ipcRenderer.on("openMWConfigReady", (event, config) => {
		console.log(config);
		openMWConfig = config;
	});

	ipcRenderer.on("selectOpenMWConfigFile", (event, config) => {
		console.log("selectOpenMWConfigFile", config);
		openMWConfig = config;
	});

	function selectOpenMWConfig(event) {
		/** @type {File} */
		const file = event.target.files[0];
		ipcRenderer.send("selectOpenMWConfigFile", file.path);
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
</script>

<main>
	<h1>Hello {name}!</h1>
	<p>
		Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn
		how to build Svelte apps.
	</p>
	{#if modManagerConfig}
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
			>Save OpenMW config</button
		>
		<button type="button" on:click={handleRunOpenMW}>Run OpenMW</button>

		<!-- {/if} -->
		{#if openMWConfig}
			<section
				class="modsList"
				use:dndzone={{ items: currentMods, flipDurationMs }}
				on:consider={handleDndConsider}
				on:finalize={handleDndFinalize}
			>
				{#each currentMods as item (item.id)}
					<div animate:flip={{ duration: flipDurationMs }} class="modItem">
						<input
							type="checkbox"
							name={`enableMod_${item.id}`}
							checked={!item.disabled}
							on:change={() => handleToggleMod(item.id)}
						/>
						{#if item.disabled}
							<s>{item.dataFolder}</s>
						{:else}
							{item.dataFolder}
						{/if}
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
	}
	.modItem:nth-of-type(even) {
		background-color: #e9f7ff;
	}
</style>
