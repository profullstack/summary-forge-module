/**
 * Module Interface Tests
 * 
 * Tests for the main module entry point (src/index.js)
 * Ensures all exports are available and work correctly
 */

import { describe, it, expect } from 'vitest';
import * as SummaryForgeModule from '../src/index.js';
import {
  SummaryForge,
  SSELogger,
  extractFlashcards,
  generateFlashcardsPDF,
  loadConfig,
  saveConfig,
  hasConfig,
  getConfigPath,
  deleteConfig
} from '../src/index.js';

describe('Module Interface (src/index.js)', () => {
  describe('Named Exports', () => {
    it('should export SummaryForge class', () => {
      expect(SummaryForge).toBeDefined();
      expect(typeof SummaryForge).toBe('function');
      expect(SummaryForge.name).toBe('SummaryForge');
    });

    it('should export extractFlashcards function', () => {
      expect(extractFlashcards).toBeDefined();
      expect(typeof extractFlashcards).toBe('function');
    });

    it('should export generateFlashcardsPDF function', () => {
      expect(generateFlashcardsPDF).toBeDefined();
      expect(typeof generateFlashcardsPDF).toBe('function');
    });

    it('should export loadConfig function', () => {
      expect(loadConfig).toBeDefined();
      expect(typeof loadConfig).toBe('function');
    });

    it('should export saveConfig function', () => {
      expect(saveConfig).toBeDefined();
      expect(typeof saveConfig).toBe('function');
    });

    it('should export hasConfig function', () => {
      expect(hasConfig).toBeDefined();
      expect(typeof hasConfig).toBe('function');
    });

    it('should export getConfigPath function', () => {
      expect(getConfigPath).toBeDefined();
      expect(typeof getConfigPath).toBe('function');
    });

    it('should export deleteConfig function', () => {
      expect(deleteConfig).toBeDefined();
      expect(typeof deleteConfig).toBe('function');
    });

    it('should export SSELogger class', () => {
      expect(SSELogger).toBeDefined();
      expect(typeof SSELogger).toBe('function');
      expect(SSELogger.name).toBe('SSELogger');
    });
  });

  describe('Default Export', () => {
    it('should export SummaryForge as default', () => {
      expect(SummaryForgeModule.default).toBeDefined();
      expect(SummaryForgeModule.default).toBe(SummaryForge);
      expect(typeof SummaryForgeModule.default).toBe('function');
    });

    it('should allow default import to create instances', () => {
      const DefaultSummaryForge = SummaryForgeModule.default;
      const instance = new DefaultSummaryForge({
        openaiApiKey: 'test-key'
      });
      
      expect(instance).toBeInstanceOf(SummaryForge);
      expect(instance.openaiApiKey).toBe('test-key');
    });
  });

  describe('Module Namespace', () => {
    it('should have all expected exports in namespace', () => {
      const exports = Object.keys(SummaryForgeModule);
      
      expect(exports).toContain('SummaryForge');
      expect(exports).toContain('SSELogger');
      expect(exports).toContain('extractFlashcards');
      expect(exports).toContain('generateFlashcardsPDF');
      expect(exports).toContain('loadConfig');
      expect(exports).toContain('saveConfig');
      expect(exports).toContain('hasConfig');
      expect(exports).toContain('getConfigPath');
      expect(exports).toContain('deleteConfig');
      expect(exports).toContain('default');
    });

    it('should have exactly 10 exports', () => {
      const exports = Object.keys(SummaryForgeModule);
      expect(exports.length).toBe(10);
    });
  });

  describe('SummaryForge Class Instantiation', () => {
    it('should create instance with named export', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      
      expect(forge).toBeInstanceOf(SummaryForge);
      expect(forge.openaiApiKey).toBe('test-key');
    });

    it('should create instance with default export', () => {
      const forge = new SummaryForgeModule.default({
        openaiApiKey: 'test-key'
      });
      
      expect(forge).toBeInstanceOf(SummaryForge);
      expect(forge.openaiApiKey).toBe('test-key');
    });

    it('should throw error without API key', () => {
      expect(() => new SummaryForge()).toThrow('OpenAI API key is required');
    });

    it('should accept all configuration options', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-openai-key',
        elevenlabsApiKey: 'test-elevenlabs-key',
        rainforestApiKey: 'test-rainforest-key',
        maxChars: 500000,
        maxTokens: 20000,
        voiceId: 'custom-voice',
        headless: false,
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com:8080'
      });
      
      expect(forge.openaiApiKey).toBe('test-openai-key');
      expect(forge.elevenlabsApiKey).toBe('test-elevenlabs-key');
      expect(forge.rainforestApiKey).toBe('test-rainforest-key');
      expect(forge.maxChars).toBe(500000);
      expect(forge.maxTokens).toBe(20000);
      expect(forge.voiceId).toBe('custom-voice');
      expect(forge.headless).toBe(false);
      expect(forge.enableProxy).toBe(true);
      expect(forge.proxyUrl).toBe('http://proxy.example.com:8080');
    });
  });

  describe('Flashcard Functions', () => {
    it('should have extractFlashcards with correct signature', () => {
      expect(extractFlashcards.length).toBe(1); // Takes 1 parameter (text)
    });

    it('should have generateFlashcardsPDF with correct signature', () => {
      expect(generateFlashcardsPDF.length).toBe(2); // Takes 2 parameters (flashcards, outputPath)
    });

    it('should extract flashcards from markdown text', () => {
      const markdown = `
# Flashcards

**Q: What is Node.js?**
A: A JavaScript runtime built on Chrome's V8 engine.

**Q: What is ESM?**
A: ECMAScript Modules, the standard module system for JavaScript.
      `.trim();
      
      const result = extractFlashcards(markdown);
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.flashcards)).toBe(true);
      expect(result.count).toBe(2);
      expect(result.flashcards[0]).toHaveProperty('question');
      expect(result.flashcards[0]).toHaveProperty('answer');
      expect(result.flashcards[0].question).toContain('Node.js');
      expect(result.flashcards[1].question).toContain('ESM');
    });
  });

  describe('Config Functions', () => {
    it('should have getConfigPath function', () => {
      const result = getConfigPath();
      expect(typeof result).toBe('object');
      expect(result.success).toBe(true);
      expect(result.path).toContain('summary-forge');
    });

    it('should check if config exists', async () => {
      const result = await hasConfig();
      expect(typeof result).toBe('object');
      expect(result.success).toBe(true);
      expect(typeof result.exists).toBe('boolean');
    });

    it('should handle config operations', async () => {
      // Test that functions exist and have correct signatures
      expect(loadConfig.length).toBe(0);
      expect(saveConfig.length).toBe(1);
      expect(hasConfig.length).toBe(0);
      expect(deleteConfig.length).toBe(0);
    });
  });

  describe('Import Patterns', () => {
    it('should support named imports', async () => {
      // This test verifies the import statement at the top works
      expect(SummaryForge).toBeDefined();
      expect(extractFlashcards).toBeDefined();
      expect(loadConfig).toBeDefined();
    });

    it('should support namespace import', () => {
      // This test verifies the namespace import works
      expect(SummaryForgeModule).toBeDefined();
      expect(SummaryForgeModule.SummaryForge).toBeDefined();
      expect(SummaryForgeModule.extractFlashcards).toBeDefined();
    });

    it('should support default import pattern', () => {
      const DefaultExport = SummaryForgeModule.default;
      expect(DefaultExport).toBe(SummaryForge);
    });
  });

  describe('Type Consistency', () => {
    it('should export same SummaryForge class from all import methods', () => {
      const NamedExport = SummaryForge;
      const DefaultExport = SummaryForgeModule.default;
      const NamespaceExport = SummaryForgeModule.SummaryForge;
      
      expect(NamedExport).toBe(DefaultExport);
      expect(NamedExport).toBe(NamespaceExport);
      expect(DefaultExport).toBe(NamespaceExport);
    });

    it('should create compatible instances from different import methods', () => {
      const instance1 = new SummaryForge({ openaiApiKey: 'test' });
      const instance2 = new SummaryForgeModule.default({ openaiApiKey: 'test' });
      const instance3 = new SummaryForgeModule.SummaryForge({ openaiApiKey: 'test' });
      
      expect(instance1.constructor).toBe(instance2.constructor);
      expect(instance2.constructor).toBe(instance3.constructor);
      expect(instance1).toBeInstanceOf(SummaryForge);
      expect(instance2).toBeInstanceOf(SummaryForge);
      expect(instance3).toBeInstanceOf(SummaryForge);
    });
  });

  describe('Documentation Examples', () => {
    it('should work with example from README', () => {
      // Example from src/index.js documentation
      const forge = new SummaryForge({
        openaiApiKey: 'your-key',
        elevenlabsApiKey: 'your-key',
        rainforestApiKey: 'your-key'
      });
      
      expect(forge).toBeInstanceOf(SummaryForge);
      expect(forge.openaiApiKey).toBe('your-key');
      expect(forge.elevenlabsApiKey).toBe('your-key');
      expect(forge.rainforestApiKey).toBe('your-key');
    });

    it('should support minimal configuration', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      
      expect(forge).toBeInstanceOf(SummaryForge);
      expect(forge.openaiApiKey).toBe('test-key');
      // Should have defaults
      expect(forge.maxChars).toBe(400000);
      expect(forge.maxTokens).toBe(16000);
    });
  });
});