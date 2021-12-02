<script>
  import { afterUpdate } from "svelte";
  import { LogLevel } from "../Logger";

  /** @type {import('../Logger').LogMessage[]} */
  export let logMessages = [];

  /** @type {HTMLDivElement} */
  let logMessagesContainer;

  afterUpdate(() => {
    if (logMessagesContainer) {
      logMessagesContainer.scrollTo(0, logMessagesContainer.scrollHeight);
    }
  });

  /**
   * @param {LogLevel} level
   * @returns {string}
   */
  function getMessageColor(level) {
    switch (level) {
      case LogLevel.Error:
        return "firebrick";
      case LogLevel.Warning:
        return "sienna";
      default:
        return "inherit";
    }
  }
</script>

<ol bind:this={logMessagesContainer}>
  {#each logMessages as logMessage}
    <li style={`color: ${getMessageColor(logMessage.level)}`}>
      <span>{logMessage.message}</span>
      <time>{new Date(logMessage.timestamp).toLocaleTimeString()}</time>
    </li>
  {/each}
</ol>

<style>
  ol {
    margin: 0;
    padding: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
    list-style: none;
    border: 1px solid lightgray;
    border-radius: 2px;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
</style>
