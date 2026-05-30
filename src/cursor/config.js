'use strict';

const path = require('path');
const {
  homeDir,
  readJson,
  writeJson,
  binPath,
} = require('../shared/config');

function cursorConfigPath(options = {}) {
  return path.join(homeDir(options), '.cursor', 'mcp.json');
}

function installCursor(options = {}) {
  const filePath = cursorConfigPath(options);
  const existing = readJson(filePath);
  const servers = existing.mcpServers || {};
  servers.tomsindex = {
    command: process.execPath,
    args: [binPath(), 'mcp'],
    env: {
      TOMSINDEX_URL: options.url || 'https://tomsindex.com',
      ...((!options.publicOnly && options.apiKey) ? { TOMSINDEX_API_KEY: options.apiKey } : {}),
    },
  };
  existing.mcpServers = servers;
  return { filePath, content: writeJson(filePath, existing, options) };
}

function uninstallCursor(options = {}) {
  const filePath = cursorConfigPath(options);
  const existing = readJson(filePath);
  if (existing.mcpServers) {
    delete existing.mcpServers.tomsindex;
    if (Object.keys(existing.mcpServers).length === 0) delete existing.mcpServers;
  }
  return { filePath, content: writeJson(filePath, existing, options) };
}

module.exports = {
  cursorConfigPath,
  installCursor,
  uninstallCursor,
};
