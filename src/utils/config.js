/**
 * Configuration Management Utility
 *
 * Manages user configuration stored in ~/.config/summary-forge/settings.json
 * This allows CLI users to configure API keys without needing a .env file
 * Falls back to .env file if settings.json doesn't exist
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config as dotenvConfig } from 'dotenv';

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
 * Load configuration from settings.json with .env fallback
 * @param {Object} options - Options for loading config
 * @param {boolean} options.skipEnvFallback - Skip .env fallback (for testing)
 * @returns {Promise<Object|null>} Configuration object or null if not found/invalid
 */
export async function loadConfig(options = {}) {
  const { skipEnvFallback = false } = options;
  
  try {
    const configPath = getConfigPath();
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    
    // If skipEnvFallback is true, return config as-is (for testing)
    if (skipEnvFallback) {
      return config;
    }
    
    // Load .env as fallback for missing values
    dotenvConfig();
    
    // Merge with environment variables (config file takes precedence)
    return {
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      rainforestApiKey: config.rainforestApiKey || process.env.RAINFOREST_API_KEY,
      elevenlabsApiKey: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY,
      twocaptchaApiKey: config.twocaptchaApiKey || process.env.TWOCAPTCHA_API_KEY,
      browserlessApiKey: config.browserlessApiKey || process.env.BROWSERLESS_API_KEY,
      headless: config.headless ?? (process.env.HEADLESS === 'true'),
      enableProxy: config.enableProxy ?? (process.env.ENABLE_PROXY === 'true'),
      proxyUrl: config.proxyUrl || process.env.PROXY_URL,
      proxyUsername: config.proxyUsername || process.env.PROXY_USERNAME,
      proxyPassword: config.proxyPassword || process.env.PROXY_PASSWORD,
      proxyPoolSize: config.proxyPoolSize ?? (process.env.PROXY_POOL_SIZE ? parseInt(process.env.PROXY_POOL_SIZE, 10) : 36),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist
      if (skipEnvFallback) {
        return null; // Don't try .env fallback in tests
      }
      
      // Try loading from .env only
      dotenvConfig();
      
      if (!process.env.OPENAI_API_KEY) {
        return null; // No config file and no .env
      }
      
      return {
        openaiApiKey: process.env.OPENAI_API_KEY,
        rainforestApiKey: process.env.RAINFOREST_API_KEY,
        elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
        twocaptchaApiKey: process.env.TWOCAPTCHA_API_KEY,
        browserlessApiKey: process.env.BROWSERLESS_API_KEY,
        headless: process.env.HEADLESS === 'true',
        enableProxy: process.env.ENABLE_PROXY === 'true',
        proxyUrl: process.env.PROXY_URL,
        proxyUsername: process.env.PROXY_USERNAME,
        proxyPassword: process.env.PROXY_PASSWORD,
        proxyPoolSize: process.env.PROXY_POOL_SIZE ? parseInt(process.env.PROXY_POOL_SIZE, 10) : 36,
      };
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