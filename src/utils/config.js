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
 * @returns {Object} JSON object with success status and config path
 */
export function getConfigPath() {
  const configDir = path.join(os.homedir(), '.config', 'summary-forge');
  const configPath = path.join(configDir, 'settings.json');
  
  return {
    success: true,
    path: configPath,
    directory: configDir
  };
}

/**
 * Check if config file exists
 * @returns {Promise<Object>} JSON object with success status and existence flag
 */
export async function hasConfig() {
  try {
    const { path: configPath } = getConfigPath();
    await fs.access(configPath);
    return {
      success: true,
      exists: true,
      path: configPath
    };
  } catch (error) {
    const { path: configPath } = getConfigPath();
    return {
      success: true,
      exists: false,
      path: configPath,
      error: error.code
    };
  }
}

/**
 * Load configuration from settings.json with .env fallback
 * @param {Object} options - Options for loading config
 * @param {boolean} options.skipEnvFallback - Skip .env fallback (for testing)
 * @returns {Promise<Object>} JSON object with success status and configuration data
 */
export async function loadConfig(options = {}) {
  const { skipEnvFallback = false } = options;
  const { path: configPath } = getConfigPath();
  
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);
    
    // If skipEnvFallback is true, return config as-is (for testing)
    if (skipEnvFallback) {
      return {
        success: true,
        source: 'file',
        path: configPath,
        config
      };
    }
    
    // Load .env as fallback for missing values
    dotenvConfig();
    
    // Merge with environment variables (config file takes precedence)
    const mergedConfig = {
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
    
    return {
      success: true,
      source: 'file_with_env_fallback',
      path: configPath,
      config: mergedConfig
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist
      if (skipEnvFallback) {
        return {
          success: false,
          source: 'none',
          path: configPath,
          error: 'Config file not found',
          config: null
        };
      }
      
      // Try loading from .env only
      dotenvConfig();
      
      if (!process.env.OPENAI_API_KEY) {
        return {
          success: false,
          source: 'none',
          path: configPath,
          error: 'No config file and no .env found',
          config: null
        };
      }
      
      const envConfig = {
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
      
      return {
        success: true,
        source: 'env',
        path: null,
        config: envConfig
      };
    }
    
    // Invalid JSON or other error
    console.error(`Warning: Failed to load config from ${configPath}: ${error.message}`);
    return {
      success: false,
      source: 'error',
      path: configPath,
      error: error.message,
      config: null
    };
  }
}

/**
 * Save configuration to settings.json
 * @param {Object} config - Configuration object to save
 * @returns {Promise<Object>} JSON object with success status and saved path
 */
export async function saveConfig(config) {
  const { path: configPath, directory: configDir } = getConfigPath();
  
  try {
    // Create directory if it doesn't exist
    await fs.mkdir(configDir, { recursive: true });
    
    // Write config with pretty formatting
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf8'
    );
    
    return {
      success: true,
      path: configPath,
      message: 'Configuration saved successfully'
    };
  } catch (error) {
    return {
      success: false,
      path: configPath,
      error: error.message,
      message: 'Failed to save configuration'
    };
  }
}

/**
 * Delete configuration file
 * @returns {Promise<Object>} JSON object with success status and deletion result
 */
export async function deleteConfig() {
  const { path: configPath } = getConfigPath();
  
  try {
    await fs.unlink(configPath);
    return {
      success: true,
      path: configPath,
      message: 'Configuration deleted successfully',
      wasDeleted: true
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: true,
        path: configPath,
        message: 'Configuration file did not exist',
        wasDeleted: false
      };
    }
    
    return {
      success: false,
      path: configPath,
      error: error.message,
      message: 'Failed to delete configuration'
    };
  }
}