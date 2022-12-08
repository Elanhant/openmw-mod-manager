/**
 * @enum {string}
 */
const LogLevel = {
  Info: "info",
  Warning: "warning",
  Error: "error",
};

/**
 * @typedef {Object} LogMessage
 * @property {string} message
 * @property {LogLevel} level
 * @property {number} timestamp
 * @property {?Error} error
 */

/**
 * @callback logMessageSubscriber
 * @param {LogMessage} logMessage
 */

function Logger() {
  /** @type {LogMessage[]} */
  const messages = [];
  /** @type {logMessageSubscriber[]} */
  let subscribers = [];

  return {
    /**
     * @param {string} message
     * @param {LogLevel} level
     * @param {?Error} [error]
     */
    log(message, level = LogLevel.Info, error = null) {
      const newMessage = {
        message,
        level,
        timestamp: new Date().getTime(),
        error,
      };
      // TODO save to file
      messages.push(newMessage);
      for (const subscriber of subscribers) {
        subscriber(newMessage);
      }
    },
    /**
     * @param {logMessageSubscriber} callback
     * @returns {function(): void}
     */
    subscribe(callback) {
      subscribers.push(callback);
      return () => {
        subscribers = subscribers.filter(
          (subscriber) => subscriber !== callback
        );
      };
    },
  };
}

module.exports = { Logger, LogLevel };
