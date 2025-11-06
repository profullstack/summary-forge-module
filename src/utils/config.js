/**
 * Configuration Management Utility
 * 
 * Manages user configuration stored in ~/.config/summary-forge/settings.json
 * This allows CLI users to configure API keys without needing a .env file
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Get the path to the config file
 * @returns {string} Path to settings.json
 */
export function getConfigPath() {
  const configDir = path.join(os.homedir(), '.config', 'summary-forge');
  return path.join(configDir, 'settings.json');
}

/**
 * Check if config file exists
 * @returns {Promise<boolean>} True if config exists
 */
export async function hasConfig() {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Load configuration from settings.json
 * @returns {Promise<Object|null>} Configuration object or null if not found/invalid
 */
export async function loadConfig() {
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    // Invalid JSON or other error
    console.error(`Warning: Failed to load config from ${getConfigPath()}: ${error.message}`);
    return null;
  }
}

/**
 * Save configuration to settings.json
 * @param {Object} config - Configuration object to save
 * @returns {Promise<void>}
 */
export async function saveConfig(config) {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  
  // Create directory if it doesn't exist
  await fs.mkdir(configDir, { recursive: true });
  
  // Write config with pretty formatting
  await fs.writeFile(
    configPath,
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  );
}

/**
 * Delete configuration file
 * @returns {Promise<void>}
 */
export async function deleteConfig() {
  try {
    await fs.unlink(getConfigPath());
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // Ignore if file doesn't exist
  }
}