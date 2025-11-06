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
    it('should return path in ~/.config/summary-forge/', () => {
      const configPath = getConfigPath();
      expect(configPath).toContain('.config');
      expect(configPath).toContain('summary-forge');
      expect(configPath).toContain('settings.json');
    });
  });

  describe('hasConfig()', () => {
    it('should return false when config does not exist', async () => {
      const exists = await hasConfig();
      expect(exists).toBe(false);
    });

    it('should return true when config exists', async () => {
      const config = {
        openaiApiKey: 'test-key',
        rainforestApiKey: 'test-key'
      };
      await saveConfig(config);
      
      const exists = await hasConfig();
      expect(exists).toBe(true);
    });
  });

  describe('saveConfig()', () => {
    it('should save config to settings.json', async () => {
      const config = {
        openaiApiKey: 'sk-test-123',
        rainforestApiKey: 'rf-test-456',
        elevenlabsApiKey: 'el-test-789'
      };
      
      await saveConfig(config);
      
      const configPath = getConfigPath();
      const fileContent = await fs.readFile(configPath, 'utf8');
      const savedConfig = JSON.parse(fileContent);
      
      expect(savedConfig).toEqual(config);
    });

    it('should create directory if it does not exist', async () => {
      const config = { openaiApiKey: 'test' };
      
      await saveConfig(config);
      
      const exists = await hasConfig();
      expect(exists).toBe(true);
    });

    it('should overwrite existing config', async () => {
      const config1 = { openaiApiKey: 'old-key' };
      const config2 = { openaiApiKey: 'new-key' };
      
      await saveConfig(config1);
      await saveConfig(config2);
      
      const loaded = await loadConfig();
      expect(loaded.openaiApiKey).toBe('new-key');
    });

    it('should handle optional fields', async () => {
      const config = {
        openaiApiKey: 'test',
        headless: true,
        enableProxy: false
      };
      
      await saveConfig(config);
      const loaded = await loadConfig();
      
      expect(loaded.headless).toBe(true);
      expect(loaded.enableProxy).toBe(false);
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
      const loaded = await loadConfig();
      
      expect(loaded.proxyPoolSize).toBe(50);
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
      const loaded = await loadConfig();
      
      // proxyPoolSize defaults to 36 when not specified in config
      expect(loaded.proxyPoolSize).toBe(36);
    });
  });

  describe('loadConfig()', () => {
    it('should return null when config does not exist', async () => {
      const config = await loadConfig({ skipEnvFallback: true });
      expect(config).toBeNull();
    });

    it('should load saved config', async () => {
      const config = {
        openaiApiKey: 'sk-test-123',
        rainforestApiKey: 'rf-test-456',
        elevenlabsApiKey: 'el-test-789',
        twocaptchaApiKey: '2c-test-012'
      };
      
      await saveConfig(config);
      const loaded = await loadConfig({ skipEnvFallback: true });
      
      expect(loaded).toEqual(config);
    });

    it('should handle malformed JSON gracefully', async () => {
      const configPath = getConfigPath();
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, 'invalid json{', 'utf8');
      
      const config = await loadConfig({ skipEnvFallback: true });
      expect(config).toBeNull();
    });
  });

  describe('deleteConfig()', () => {
    it('should delete existing config', async () => {
      const config = { openaiApiKey: 'test' };
      await saveConfig(config);
      
      expect(await hasConfig()).toBe(true);
      
      await deleteConfig();
      
      expect(await hasConfig()).toBe(false);
    });

    it('should not throw when config does not exist', async () => {
      await deleteConfig(); // Should not throw
      expect(await hasConfig()).toBe(false);
    });
  });
});