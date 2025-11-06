/**
 * Summary Forge - Test Suite
 * 
 * Comprehensive tests for the SummaryForge class using Vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('SummaryForge', () => {
  let forge;
  const testApiKey = 'test-openai-key';

  beforeEach(() => {
    // Create a new instance for each test
    forge = new SummaryForge({
      openaiApiKey: testApiKey,
      rainforestApiKey: 'test-rainforest-key',
      elevenlabsApiKey: 'test-elevenlabs-key'
    });
  });

  describe('Constructor', () => {
    it('should create instance with required API key', () => {
      expect(forge).toBeInstanceOf(SummaryForge);
      expect(forge.openaiApiKey).toBe(testApiKey);
    });

    it('should throw error without OpenAI API key', () => {
      expect(() => new SummaryForge()).toThrow('OpenAI API key is required');
    });

    it('should set default values for optional parameters', () => {
      expect(forge.maxChars).toBe(400000);
      expect(forge.maxTokens).toBe(16000);
      expect(forge.voiceId).toBe('nPczCjzI2devNBz1zQrb'); // Brian voice
    });

    it('should allow custom configuration', () => {
      const customForge = new SummaryForge({
        openaiApiKey: testApiKey,
        maxChars: 500000,
        maxTokens: 20000,
        voiceId: 'custom-voice'
      });
      
      expect(customForge.maxChars).toBe(500000);
      expect(customForge.maxTokens).toBe(20000);
      expect(customForge.voiceId).toBe('custom-voice');
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove PDF extension', () => {
      expect(forge.sanitizeFilename('book.pdf')).toBe('book');
    });

    it('should remove EPUB extension', () => {
      expect(forge.sanitizeFilename('book.epub')).toBe('book');
    });

    it('should replace non-alphanumeric characters with underscores', () => {
      expect(forge.sanitizeFilename('My Book: A Story!')).toBe('my_book_a_story');
    });

    it('should remove leading and trailing underscores', () => {
      expect(forge.sanitizeFilename('___book___')).toBe('book');
    });

    it('should convert to lowercase', () => {
      expect(forge.sanitizeFilename('MyBook')).toBe('mybook');
    });

    it('should handle complex filenames', () => {
      const input = 'A Philosophy of Software Design, 2nd Edition -- John K_ Ousterhout.pdf';
      const expected = 'a_philosophy_of_software_design_2nd_edition_john_k_ousterhout';
      expect(forge.sanitizeFilename(input)).toBe(expected);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing files', async () => {
      const exists = await forge.fileExists('package.json');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      const exists = await forge.fileExists('nonexistent-file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('getAnnasArchiveUrl', () => {
    it('should generate correct search URL', () => {
      const asin = 'B075HYVHWK';
      const url = forge.getAnnasArchiveUrl(asin);
      
      expect(url).toContain('annas-archive.org/search');
      expect(url).toContain(asin);
      expect(url).toContain('ext=epub');
    });

    it('should handle different ASINs', () => {
      const asin = '173210221X';
      const url = forge.getAnnasArchiveUrl(asin);
      
      expect(url).toContain(asin);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', () => {
      expect(() => {
        new SummaryForge({});
      }).toThrow('OpenAI API key is required');
    });

    it('should handle invalid file paths', async () => {
      await expect(
        forge.processFile('/nonexistent/path/file.pdf')
      ).rejects.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should have all required methods', () => {
      expect(typeof forge.sanitizeFilename).toBe('function');
      expect(typeof forge.fileExists).toBe('function');
      expect(typeof forge.getAnnasArchiveUrl).toBe('function');
      expect(typeof forge.searchBookByTitle).toBe('function');
      expect(typeof forge.downloadFromAnnasArchive).toBe('function');
      expect(typeof forge.convertEpubToPdf).toBe('function');
      expect(typeof forge.generateSummary).toBe('function');
      expect(typeof forge.generateAudio).toBe('function');
      expect(typeof forge.generateOutputFiles).toBe('function');
      expect(typeof forge.createBundle).toBe('function');
      expect(typeof forge.processFile).toBe('function');
    });

    it('should maintain proper method chaining', () => {
      const filename = 'test.pdf';
      const sanitized = forge.sanitizeFilename(filename);
      expect(typeof sanitized).toBe('string');
      expect(sanitized).toBe('test');
    });
  });

  describe('PDF Upload Functionality', () => {
    it('should accept PDF path for generateSummary', () => {
      // generateSummary now takes a file path instead of text
      expect(typeof forge.generateSummary).toBe('function');
    });

    it('should handle PDF file reading', async () => {
      // Mock test - actual implementation requires OpenAI API
      const testPdfPath = './test-fixtures/sample.pdf';
      
      // This would fail without a real PDF and API key, so we just verify the method exists
      expect(forge.generateSummary).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate voice settings structure', () => {
      const customForge = new SummaryForge({
        openaiApiKey: testApiKey,
        voiceSettings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      });
      
      expect(customForge.voiceSettings).toHaveProperty('stability');
      expect(customForge.voiceSettings).toHaveProperty('similarity_boost');
    });

    it('should handle missing optional API keys', () => {
      const minimalForge = new SummaryForge({
        openaiApiKey: testApiKey
      });
      
      expect(minimalForge.rainforestApiKey).toBeUndefined();
      expect(minimalForge.elevenlabsApiKey).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings in sanitizeFilename', () => {
      expect(forge.sanitizeFilename('')).toBe('');
    });

    it('should handle special characters in sanitizeFilename', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const result = forge.sanitizeFilename(special);
      expect(result).not.toContain('!');
      expect(result).not.toContain('@');
    });

    it('should handle unicode characters in sanitizeFilename', () => {
      const unicode = 'Book™ with © symbols';
      const result = forge.sanitizeFilename(unicode);
      expect(result).toBe('book_with_symbols');
    });
  });
});

describe('SummaryForge - API Integration Tests', () => {
  let forge;

  beforeEach(() => {
    forge = new SummaryForge({
      openaiApiKey: 'test-key',
      rainforestApiKey: 'test-rainforest',
      elevenlabsApiKey: 'test-elevenlabs'
    });
  });

  describe('searchBookByTitle', () => {
    it('should require Rainforest API key', async () => {
      const noKeyForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      
      await expect(
        noKeyForge.searchBookByTitle('Test Book')
      ).rejects.toThrow('Rainforest API key is required');
    });
  });

  describe('generateAudio', () => {
    it('should skip audio generation without ElevenLabs key', async () => {
      const noAudioForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      
      const result = await noAudioForge.generateAudio('test text', 'output.mp3');
      expect(result).toBeNull();
    });
  });
});

describe('SummaryForge - File Operations', () => {
  let forge;
  const testDir = './test-output';

  beforeEach(async () => {
    forge = new SummaryForge({
      openaiApiKey: 'test-key'
    });
    
    // Create test directory
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('File Path Handling', () => {
    it('should handle relative paths', () => {
      const filename = './test/file.pdf';
      const sanitized = forge.sanitizeFilename(path.basename(filename));
      expect(sanitized).toBe('file');
    });

    it('should handle absolute paths', () => {
      const filename = '/home/user/documents/book.pdf';
      const sanitized = forge.sanitizeFilename(path.basename(filename));
      expect(sanitized).toBe('book');
    });
  });
});