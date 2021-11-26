/**
 *
 * @typedef {Object} CfgSection
 * @property {Set<string>} values
 */

/**
 * @typedef {Map<string, CfgSection>} CfgConfigMap
 */

/**
 * @typedef {Object} CfgParsed
 * @property {CfgConfigMap} cfgConfigMap
 * @property {string[]} template
 */

/**
 * @param {string} rawCfgFile
 * @returns {CfgParsed}
 */
function parseCfg(rawCfgFile) {
  /** @type {CfgConfigMap} */
  const cfgMap = new Map();
  const template = [];

  const lines = rawCfgFile.split("\r\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const eqIdx = line.indexOf("=");
    if (eqIdx < 1) {
      i++;
      template.push(line);
      continue;
    }
    const key = line.substr(0, eqIdx);
    const value = line.substr(eqIdx + 1);
    if (!cfgMap.has(key)) {
      template.push(`[PLACEHOLDER=${key}]`);
      cfgMap.set(key, {
        values: new Set(),
      });
    }
    cfgMap.get(key).values.add(value);
    i++;
  }

  return {
    cfgConfigMap: cfgMap,
    template,
  };
}

/**
 * @param {CfgParsed} cfgParsed
 * @returns {string}
 */
function stringifyCfg(cfgParsed) {
  const lines = [];

  for (const templateItem of cfgParsed.template) {
    const matches = templateItem.match(/\[PLACEHOLDER=(.+)\]/);
    if (!matches) {
      lines.push(templateItem);
      continue;
    }

    const key = matches[1];
    for (const value of cfgParsed.cfgConfigMap.get(key).values) {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join("\r\n");
}

/**
 * @param {CfgParsed} cfg
 * @param {string} key
 * @param {function(Set<string>):Set<string>} updater
 * @returns {CfgParsed}
 */
function updateOrSetValuesForKey(cfg, key, updater) {
  if (!cfg.cfgConfigMap.has("data")) {
    cfg.cfgConfigMap.set("data", {
      values: new Set(),
    });
  }
  cfg.cfgConfigMap.get("data").values = updater(
    cfg.cfgConfigMap.get("data").values
  );

  return cfg;
}

module.exports = {
  parseCfg,
  stringifyCfg,
  updateOrSetValuesForKey,
};
