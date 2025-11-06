/**
 * Tests for config utility
 * 
 * Testing Framework: Mocha
 * Assertions: Chai
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
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
  const testConfigDir = path.join(os.tmpdir(), 'summary-forge-test');
  const testConfigPath = path.join(testConfigDir, 'settings.json');
  
  // Override config path for testing
  const originalHome = process.env.HOME;
  
  beforeEach(async () => {
    // Set up test environment
    process.env.HOME = os.tmpdir();
    
    // Clean up any existing test config
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore if doesn't exist
    }
  });
  
  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;
    
    // Clean up test config
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore if doesn't exist
    }
  });

  describe('getConfigPath()', () => {
    it('should return path in ~/.config/summary-forge/', () => {
      const configPath = getConfigPath();
      expect(configPath).to.include('.config');
      expect(configPath).to.include('summary-forge');
      expect(configPath).to.include('settings.json');
    });
  });

  describe('hasConfig()', () => {
    it('should return false when config does not exist', async () => {
      const exists = await hasConfig();
      expect(exists).to.be.false;
    });

    it('should return true when config exists', async () => {
      const config = {
        openaiApiKey: 'test-key',
        rainforestApiKey: 'test-key'
      };
      await saveConfig(config);
      
      const exists = await hasConfig();
      expect(exists).to.be.true;
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
      
      expect(savedConfig).to.deep.equal(config);
    });

    it('should create directory if it does not exist', async () => {
      const config = { openaiApiKey: 'test' };
      
      await saveConfig(config);
      
      const exists = await hasConfig();
      expect(exists).to.be.true;
    });

    it('should overwrite existing config', async () => {
      const config1 = { openaiApiKey: 'old-key' };
      const config2 = { openaiApiKey: 'new-key' };
      
      await saveConfig(config1);
      await saveConfig(config2);
      
      const loaded = await loadConfig();
      expect(loaded.openaiApiKey).to.equal('new-key');
    });

    it('should handle optional fields', async () => {
      const config = {
        openaiApiKey: 'test',
        headless: true,
        enableProxy: false
      };
      
      await saveConfig(config);
      const loaded = await loadConfig();
      
      expect(loaded.headless).to.be.true;
      expect(loaded.enableProxy).to.be.false;
    });
  });

  describe('loadConfig()', () => {
    it('should return null when config does not exist', async () => {
      const config = await loadConfig();
      expect(config).to.be.null;
    });

    it('should load saved config', async () => {
      const config = {
        openaiApiKey: 'sk-test-123',
        rainforestApiKey: 'rf-test-456',
        elevenlabsApiKey: 'el-test-789',
        twocaptchaApiKey: '2c-test-012'
      };
      
      await saveConfig(config);
      const loaded = await loadConfig();
      
      expect(loaded).to.deep.equal(config);
    });

    it('should handle malformed JSON gracefully', async () => {
      const configPath = getConfigPath();
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, 'invalid json{', 'utf8');
      
      const config = await loadConfig();
      expect(config).to.be.null;
    });
  });

  describe('deleteConfig()', () => {
    it('should delete existing config', async () => {
      const config = { openaiApiKey: 'test' };
      await saveConfig(config);
      
      expect(await hasConfig()).to.be.true;
      
      await deleteConfig();
      
      expect(await hasConfig()).to.be.false;
    });

    it('should not throw when config does not exist', async () => {
      await deleteConfig(); // Should not throw
      expect(await hasConfig()).to.be.false;
    });
  });
});