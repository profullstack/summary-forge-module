/**
 * Tests for config utility
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getConfigPath,
  loadConfig,
  saveConfig,
  hasConfig,
  deleteConfig
} from '../src/utils/config.js';

describe('Config Utility', () => {
  // Override config path for testing
  const originalHome = process.env.HOME;
  let testHome;
  
  beforeEach(async () => {
    // Create unique test directory for each test
    testHome = path.join(os.tmpdir(), `summary-forge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testHome, { recursive: true });
    
    // Set up test environment
    process.env.HOME = testHome;
  });
  
  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;
    
    // Clean up test directory
    try {
      await fs.rm(testHome, { recursive: true, force: true });
    } catch (err) {
      // Ignore if doesn't exist
    }
  });

  describe('getConfigPath()', () => {
    it('should return JSON with path in ~/.config/summary-forge/', () => {
      const result = getConfigPath();
      expect(result.success).toBe(true);
      expect(result.path).toContain('.config');
      expect(result.path).toContain('summary-forge');
      expect(result.path).toContain('settings.json');
      expect(result.directory).toContain('.config');
    });
  });

  describe('hasConfig()', () => {
    it('should return JSON with exists false when config does not exist', async () => {
      const result = await hasConfig();
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
      expect(result.path).toBeDefined();
    });

    it('should return JSON with exists true when config exists', async () => {
      const config = {
        openaiApiKey: 'test-key',
        rainforestApiKey: 'test-key'
      };
      await saveConfig(config);
      
      const result = await hasConfig();
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.path).toBeDefined();
    });
  });

  describe('saveConfig()', () => {
    it('should save config to settings.json', async () => {
      const config = {
        openaiApiKey: 'sk-test-123',
        rainforestApiKey: 'rf-test-456',
        elevenlabsApiKey: 'el-test-789'
      };
      
      const saveResult = await saveConfig(config);
      expect(saveResult.success).toBe(true);
      expect(saveResult.path).toBeDefined();
      
      const configPathResult = getConfigPath();
      const fileContent = await fs.readFile(configPathResult.path, 'utf8');
      const savedConfig = JSON.parse(fileContent);
      
      expect(savedConfig).toEqual(config);
    });

    it('should create directory if it does not exist', async () => {
      const config = { openaiApiKey: 'test' };
      
      const saveResult = await saveConfig(config);
      expect(saveResult.success).toBe(true);
      
      const existsResult = await hasConfig();
      expect(existsResult.success).toBe(true);
      expect(existsResult.exists).toBe(true);
    });

    it('should overwrite existing config', async () => {
      const config1 = { openaiApiKey: 'old-key' };
      const config2 = { openaiApiKey: 'new-key' };
      
      await saveConfig(config1);
      await saveConfig(config2);
      
      const loadResult = await loadConfig();
      expect(loadResult.success).toBe(true);
      expect(loadResult.config.openaiApiKey).toBe('new-key');
    });

    it('should handle optional fields', async () => {
      const config = {
        openaiApiKey: 'test',
        headless: true,
        enableProxy: false
      };
      
      await saveConfig(config);
      const loadResult = await loadConfig();
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.config.headless).toBe(true);
      expect(loadResult.config.enableProxy).toBe(false);
    });

    it('should save and load proxy pool size', async () => {
      const config = {
        openaiApiKey: 'test',
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass',
        proxyPoolSize: 50
      };
      
      await saveConfig(config);
      const loadResult = await loadConfig();
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.config.proxyPoolSize).toBe(50);
    });

    it('should apply default proxy pool size when not specified', async () => {
      const config = {
        openaiApiKey: 'test',
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      };
      
      await saveConfig(config);
      const loadResult = await loadConfig();
      
      expect(loadResult.success).toBe(true);
      // proxyPoolSize defaults to 36 when not specified in config
      expect(loadResult.config.proxyPoolSize).toBe(36);
    });
  });

  describe('loadConfig()', () => {
    it('should return JSON with null config when config does not exist', async () => {
      const result = await loadConfig({ skipEnvFallback: true });
      expect(result.success).toBe(false);
      expect(result.config).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should load saved config', async () => {
      const config = {
        openaiApiKey: 'sk-test-123',
        rainforestApiKey: 'rf-test-456',
        elevenlabsApiKey: 'el-test-789',
        twocaptchaApiKey: '2c-test-012'
      };
      
      await saveConfig(config);
      const loadResult = await loadConfig({ skipEnvFallback: true });
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.config).toEqual(config);
      expect(loadResult.source).toBe('file');
    });

    it('should handle malformed JSON gracefully', async () => {
      const configPathResult = getConfigPath();
      await fs.mkdir(path.dirname(configPathResult.path), { recursive: true });
      await fs.writeFile(configPathResult.path, 'invalid json{', 'utf8');
      
      const result = await loadConfig({ skipEnvFallback: true });
      expect(result.success).toBe(false);
      expect(result.config).toBeNull();
    });
  });

  describe('deleteConfig()', () => {
    it('should delete existing config', async () => {
      const config = { openaiApiKey: 'test' };
      await saveConfig(config);
      
      const existsBefore = await hasConfig();
      expect(existsBefore.success).toBe(true);
      expect(existsBefore.exists).toBe(true);
      
      const deleteResult = await deleteConfig();
      expect(deleteResult.success).toBe(true);
      
      const existsAfter = await hasConfig();
      expect(existsAfter.success).toBe(true);
      expect(existsAfter.exists).toBe(false);
    });

    it('should not throw when config does not exist', async () => {
      const deleteResult = await deleteConfig(); // Should not throw
      expect(deleteResult.success).toBe(true);
      
      const existsResult = await hasConfig();
      expect(existsResult.success).toBe(true);
      expect(existsResult.exists).toBe(false);
    });
  });
});