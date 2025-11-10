/**
 * CLI Configuration Loading Tests
 *
 * Tests that the CLI properly handles the JSON response format from loadConfig()
 * and correctly validates the OpenAI API key requirement.
 *
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, saveConfig, deleteConfig, getConfigPath } from '../src/utils/config.js';

describe('CLI Config Loading', () => {
  let testConfigDir;
  let originalConfigPath;
  let originalEnvVars;

  beforeEach(async () => {
    // Create a temporary test config directory
    testConfigDir = path.join(os.tmpdir(), `summary-forge-test-${Date.now()}`);
    await fs.mkdir(testConfigDir, { recursive: true });
    
    // Store original config path for restoration
    const { path: configPath } = getConfigPath();
    originalConfigPath = configPath;
    
    // Store and clear environment variables to isolate tests
    originalEnvVars = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      RAINFOREST_API_KEY: process.env.RAINFOREST_API_KEY,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
      TWOCAPTCHA_API_KEY: process.env.TWOCAPTCHA_API_KEY,
      BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
    };
    
    // Clear env vars for isolated testing
    delete process.env.OPENAI_API_KEY;
    delete process.env.RAINFOREST_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.TWOCAPTCHA_API_KEY;
    delete process.env.BROWSERLESS_API_KEY;
  });

  afterEach(async () => {
    // Restore environment variables
    for (const [key, value] of Object.entries(originalEnvVars)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    
    // Clean up test config directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig() return format', () => {
    it('should return a JSON object with success and config properties', async () => {
      const result = await loadConfig();
      
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
      expect(result.success).to.be.a('boolean');
    });

    it('should return config property when successful', async () => {
      // Save a test config first
      const testConfig = {
        openaiApiKey: 'test-key-123',
        headless: true
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.true;
      expect(result).to.have.property('config');
      expect(result.config).to.be.an('object');
      expect(result.config.openaiApiKey).to.equal('test-key-123');
    });

    it('should return null config when no configuration exists', async () => {
      // Ensure no config exists
      await deleteConfig();
      
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.false;
      expect(result.config).to.be.null;
    });

    it('should include source property indicating where config came from', async () => {
      const testConfig = {
        openaiApiKey: 'test-key-456'
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result).to.have.property('source');
      expect(result.source).to.be.a('string');
      expect(['file', 'file_with_env_fallback', 'env', 'none']).to.include(result.source);
    });
  });

  describe('OpenAI API key validation', () => {
    it('should detect missing OpenAI API key in config', async () => {
      const testConfig = {
        headless: true,
        enableProxy: false
        // Note: no openaiApiKey
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.true;
      expect(result.config).to.be.an('object');
      expect(result.config.openaiApiKey).to.be.undefined;
    });

    it('should successfully load config with OpenAI API key', async () => {
      const testConfig = {
        openaiApiKey: 'sk-test-key-789',
        headless: true
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.true;
      expect(result.config).to.be.an('object');
      expect(result.config.openaiApiKey).to.equal('sk-test-key-789');
    });

    it('should handle empty string as missing API key', async () => {
      const testConfig = {
        openaiApiKey: '',
        headless: true
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.true;
      expect(result.config).to.be.an('object');
      // Empty string should be falsy
      expect(result.config.openaiApiKey).to.equal('');
      expect(!result.config.openaiApiKey).to.be.true;
    });
  });

  describe('Config merging with environment variables', () => {
    it('should merge config file with environment variables', async () => {
      // Set an environment variable
      const originalEnv = process.env.ELEVENLABS_API_KEY;
      process.env.ELEVENLABS_API_KEY = 'env-elevenlabs-key';
      
      try {
        const testConfig = {
          openaiApiKey: 'file-openai-key'
          // Note: no elevenlabsApiKey in file
        };
        
        await saveConfig(testConfig);
        const result = await loadConfig();
        
        expect(result.success).to.be.true;
        expect(result.config.openaiApiKey).to.equal('file-openai-key');
        expect(result.config.elevenlabsApiKey).to.equal('env-elevenlabs-key');
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.ELEVENLABS_API_KEY = originalEnv;
        } else {
          delete process.env.ELEVENLABS_API_KEY;
        }
      }
    });

    it('should prioritize config file over environment variables', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'env-key';
      
      try {
        const testConfig = {
          openaiApiKey: 'file-key'
        };
        
        await saveConfig(testConfig);
        const result = await loadConfig();
        
        expect(result.success).to.be.true;
        expect(result.config.openaiApiKey).to.equal('file-key');
      } finally {
        if (originalEnv) {
          process.env.OPENAI_API_KEY = originalEnv;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      }
    });
  });

  describe('Error handling', () => {
    it('should handle corrupted JSON config file gracefully', async () => {
      const { path: configPath } = getConfigPath();
      const { directory: configDir } = getConfigPath();
      
      // Create directory and write invalid JSON
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, '{ invalid json }', 'utf8');
      
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result.success).to.be.false;
      expect(result).to.have.property('error');
    });

    it('should return proper error structure when config loading fails', async () => {
      await deleteConfig();
      
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result).to.be.an('object');
      expect(result.success).to.be.false;
      expect(result).to.have.property('error');
      expect(result.error).to.be.a('string');
      expect(result.config).to.be.null;
    });
  });

  describe('CLI integration scenarios', () => {
    it('should provide all necessary data for CLI error messages', async () => {
      await deleteConfig();
      
      const result = await loadConfig({ skipEnvFallback: true });
      
      // CLI needs to check result.success and result.config
      expect(result.success).to.be.false;
      expect(result.config).to.be.null;
      
      // This is how the CLI should check for missing config
      const hasValidConfig = result.success && result.config;
      expect(hasValidConfig).to.be.false;
    });

    it('should provide all necessary data for API key validation', async () => {
      const testConfig = {
        headless: true
        // Missing openaiApiKey
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      // CLI needs to check both result.success and result.config.openaiApiKey
      expect(result.success).to.be.true;
      expect(result.config).to.be.an('object');
      
      // This is how the CLI should check for missing API key
      const hasApiKey = !!(result.success && result.config && result.config.openaiApiKey);
      expect(hasApiKey).to.be.false;
    });

    it('should provide path information for user feedback', async () => {
      const testConfig = {
        openaiApiKey: 'test-key'
      };
      
      await saveConfig(testConfig);
      const result = await loadConfig({ skipEnvFallback: true });
      
      expect(result).to.have.property('path');
      expect(result.path).to.be.a('string');
      expect(result.path.length).to.be.greaterThan(0);
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain consistent return structure across all scenarios', async () => {
      // Test with valid config
      await saveConfig({ openaiApiKey: 'test' });
      const validResult = await loadConfig({ skipEnvFallback: true });
      
      expect(validResult).to.have.property('success');
      expect(validResult).to.have.property('config');
      expect(validResult).to.have.property('source');
      
      // Test with no config
      await deleteConfig();
      const noConfigResult = await loadConfig({ skipEnvFallback: true });
      
      expect(noConfigResult).to.have.property('success');
      expect(noConfigResult).to.have.property('config');
      expect(noConfigResult).to.have.property('source');
      
      // Both should have the same base properties (error is optional)
      const validKeys = Object.keys(validResult).filter(k => k !== 'error').sort();
      const noConfigKeys = Object.keys(noConfigResult).filter(k => k !== 'error').sort();
      expect(validKeys).to.deep.equal(noConfigKeys);
    });
  });
});