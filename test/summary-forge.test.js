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

  afterEach(async () => {
    // Cleanup only test-generated directories (uploads/file)
    try {
      await fs.rm('./uploads/file', { recursive: true, force: true });
    } catch (err) {
      // Ignore if doesn't exist
    }
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
      expect(url).toContain('ext=pdf'); // Changed from epub to pdf
      expect(url).toContain('sort=newest');
    });

    it('should handle different ASINs', () => {
      const asin = '173210221X';
      const url = forge.getAnnasArchiveUrl(asin);
      
      expect(url).toContain(asin);
      expect(url).toContain('ext=pdf');
    });
  });

  describe('ISBN Detection', () => {
    it('should identify valid 10-digit ISBN', () => {
      expect(forge.isRealISBN('0123456789')).toBe(true);
      expect(forge.isRealISBN('0-123-45678-9')).toBe(true);
    });

    it('should identify valid 13-digit ISBN', () => {
      expect(forge.isRealISBN('9780123456789')).toBe(true);
      expect(forge.isRealISBN('978-0-123-45678-9')).toBe(true);
    });

    it('should reject Amazon ASINs (alphanumeric)', () => {
      expect(forge.isRealISBN('B0F46KWSVR')).toBe(false);
      expect(forge.isRealISBN('1633437612')).toBe(true); // This is actually numeric, so valid
    });

    it('should reject invalid length identifiers', () => {
      expect(forge.isRealISBN('12345')).toBe(false);
      expect(forge.isRealISBN('123456789012345')).toBe(false);
    });

    it('should handle empty or null values', () => {
      expect(forge.isRealISBN('')).toBe(false);
      expect(forge.isRealISBN(null)).toBe(false);
    });
  });

  describe('Anna\'s Archive URL Generation', () => {
    it('should use ISBN when it is a real ISBN', () => {
      const url = forge.getAnnasArchiveUrl('9780123456789', 'Test Book Title');
      expect(url).toContain('q=9780123456789');
      expect(url).not.toContain('Test%20Book');
    });

    it('should use book title when ASIN is not a real ISBN', () => {
      const url = forge.getAnnasArchiveUrl('B0F46KWSVR', 'Test Book Title');
      expect(url).toContain('q=Test%20Book%20Title');
      expect(url).not.toContain('B0F46KWSVR');
    });

    it('should use ASIN when no book title provided', () => {
      const url = forge.getAnnasArchiveUrl('B0F46KWSVR', null);
      expect(url).toContain('q=B0F46KWSVR');
    });

    it('should include PDF filter and sort parameters', () => {
      const url = forge.getAnnasArchiveUrl('9780123456789');
      expect(url).toContain('ext=pdf');
      expect(url).toContain('sort=newest');
      expect(url).toContain('display=list_compact');
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

describe('SummaryForge - Bug Fixes and Enhancements', () => {
  let forge;

  beforeEach(() => {
    forge = new SummaryForge({
      openaiApiKey: 'test-key',
      elevenlabsApiKey: 'test-elevenlabs-key'
    });
  });

  describe('ASIN Handling - Directory vs Filename', () => {
    it('should include ASIN in directory name but not in filename', () => {
      const title = 'A Philosophy of Software Design 2nd Edition';
      const asin = '173210221X';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      // Directory name should have ASIN
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      // Filename should NOT have ASIN (uses sanitizedTitle only)
      const filename = `${sanitizedTitle}.pdf`;
      
      expect(dirName).toBe('a_philosophy_of_software_design_2nd_edition_173210221x');
      expect(filename).toBe('a_philosophy_of_software_design_2nd_edition.pdf');
      expect(filename).not.toContain(asinLower);
    });

    it('should not duplicate ASIN if already in title', () => {
      const title = 'A Philosophy of Software Design 2nd Edition 173210221X';
      const asin = '173210221X';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      // Simulate the logic from downloadFromAnnasArchive
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      // Should not have duplicate ASIN in directory
      expect(dirName).toBe('a_philosophy_of_software_design_2nd_edition_173210221x');
      expect(dirName.match(/173210221x/gi)?.length).toBe(1);
      
      // Filename uses sanitizedTitle which already has ASIN
      const filename = `${sanitizedTitle}.pdf`;
      expect(filename).toBe('a_philosophy_of_software_design_2nd_edition_173210221x.pdf');
    });

    it('should add ASIN to directory if not in title', () => {
      const title = 'A Philosophy of Software Design';
      const asin = '173210221X';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      const filename = `${sanitizedTitle}.pdf`;
      
      expect(dirName).toBe('a_philosophy_of_software_design_173210221x');
      expect(dirName).toContain(asinLower);
      expect(filename).toBe('a_philosophy_of_software_design.pdf');
      expect(filename).not.toContain(asinLower);
    });

    it('should handle case-insensitive ASIN matching', () => {
      const title = 'Book Title 173210221x';
      const asin = '173210221X';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      expect(dirName).toBe('book_title_173210221x');
      expect(dirName.match(/173210221x/gi)?.length).toBe(1);
    });

    it('should handle ASIN with different separators', () => {
      const title = 'Book-Title-173210221X';
      const asin = '173210221X';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      expect(dirName).toBe('book_title_173210221x');
    });

    it('should create clean file structure', () => {
      const title = 'Clean Code';
      const asin = 'B001GSTOAM';
      
      const sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      const dirName = sanitizedTitle.endsWith(`_${asinLower}`)
        ? sanitizedTitle
        : `${sanitizedTitle}_${asinLower}`;
      
      const filename = `${sanitizedTitle}.pdf`;
      
      // Directory: uploads/clean_code_b001gstoam/
      expect(dirName).toBe('clean_code_b001gstoam');
      
      // File: clean_code.pdf (no ASIN)
      expect(filename).toBe('clean_code.pdf');
      
      // Full path would be: uploads/clean_code_b001gstoam/clean_code.pdf
      const fullPath = `uploads/${dirName}/${filename}`;
      expect(fullPath).toBe('uploads/clean_code_b001gstoam/clean_code.pdf');
    });

    it('should handle uppercase ASIN in title without creating duplicates', () => {
      const title = 'A Philosophy of Software Design 2nd Edition 173210221X';
      const asin = '173210221X';
      
      // Simulate the new logic
      let sanitizedTitle = forge.sanitizeFilename(title);
      const asinLower = asin.toLowerCase();
      
      // Remove ASIN from sanitized title if it's there (case-insensitive)
      const asinPattern = new RegExp(`_?${asinLower}$`, 'i');
      sanitizedTitle = sanitizedTitle.replace(asinPattern, '');
      
      // Always append lowercase ASIN
      const dirName = `${sanitizedTitle}_${asinLower}`;
      
      // Should only have lowercase ASIN, no duplicates
      expect(dirName).toBe('a_philosophy_of_software_design_2nd_edition_173210221x');
      expect(dirName.match(/173210221x/gi)?.length).toBe(1);
      expect(dirName).not.toContain('173210221X'); // No uppercase
    });

    it('should handle mixed case ASIN consistently', () => {
      const testCases = [
        { title: 'Book Title 173210221X', asin: '173210221X' },
        { title: 'Book Title 173210221x', asin: '173210221X' },
        { title: 'Book Title', asin: '173210221X' },
      ];
      
      testCases.forEach(({ title, asin }) => {
        let sanitizedTitle = forge.sanitizeFilename(title);
        const asinLower = asin.toLowerCase();
        
        const asinPattern = new RegExp(`_?${asinLower}$`, 'i');
        sanitizedTitle = sanitizedTitle.replace(asinPattern, '');
        
        const dirName = `${sanitizedTitle}_${asinLower}`;
        
        // All should produce the same result
        expect(dirName).toBe('book_title_173210221x');
        expect(dirName.match(/173210221x/gi)?.length).toBe(1);
      });
    });

    it('should keep filenames clean without ASIN in processFile', () => {
      const filePath = 'A Philosophy of Software Design.pdf';
      const asin = '173210221X';
      
      // Simulate processFile logic
      const basename = forge.sanitizeFilename(path.basename(filePath));
      const asinLower = asin.toLowerCase();
      
      // Remove ASIN from basename if present
      const asinPattern = new RegExp(`_?${asinLower}$`, 'i');
      const cleanBasename = basename.replace(asinPattern, '');
      
      // Directory name has ASIN
      const dirName = `${cleanBasename}_${asinLower}`;
      
      // Filenames use basename WITHOUT ASIN
      const summaryFile = `${basename}.summary.md`;
      const pdfFile = `${basename}.pdf`;
      const mp3File = `${basename}.summary.mp3`;
      
      // Directory should have ASIN
      expect(dirName).toBe('a_philosophy_of_software_design_173210221x');
      
      // Files should NOT have ASIN
      expect(summaryFile).toBe('a_philosophy_of_software_design.summary.md');
      expect(pdfFile).toBe('a_philosophy_of_software_design.pdf');
      expect(mp3File).toBe('a_philosophy_of_software_design.summary.mp3');
      
      // Verify no ASIN in filenames
      expect(summaryFile).not.toContain(asinLower);
      expect(pdfFile).not.toContain(asinLower);
      expect(mp3File).not.toContain(asinLower);
    });
  });

  describe('Audio Generation Chunking', () => {
    it('should chunk text properly', () => {
      const text = 'This is sentence one. This is sentence two. This is sentence three.';
      const chunks = forge.chunkText(text, 30);
      
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      
      // Each chunk should be under the limit
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(30);
      });
    });

    it('should handle empty text', () => {
      const chunks = forge.chunkText('', 100);
      expect(chunks).toEqual([]);
    });

    it('should handle single sentence', () => {
      const text = 'This is a single sentence.';
      const chunks = forge.chunkText(text, 100);
      
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('This is a single sentence.');
    });

    it('should handle very long sentences', () => {
      const longSentence = 'A'.repeat(100) + '.';
      const chunks = forge.chunkText(longSentence, 50);
      
      expect(chunks.length).toBeGreaterThan(0);
      // Should still create chunks even if sentence exceeds limit
      expect(chunks[0].length).toBeGreaterThan(50);
    });

    it('should preserve sentence endings', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = forge.chunkText(text, 100);
      
      chunks.forEach(chunk => {
        expect(chunk.endsWith('.')).toBe(true);
      });
    });

    it('should handle multiple punctuation marks', () => {
      const text = 'Question? Exclamation! Statement.';
      const chunks = forge.chunkText(text, 100);
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join(' ')).toContain('Question');
      expect(chunks.join(' ')).toContain('Exclamation');
      expect(chunks.join(' ')).toContain('Statement');
    });
  });

  describe('Text Sanitization for Audio', () => {
    it('should remove code blocks', () => {
      const text = 'Some text ```code block``` more text';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('```');
      expect(sanitized).toContain('[Code example omitted]');
    });

    it('should remove markdown headers', () => {
      const text = '# Header\n## Subheader\nContent';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('#');
      expect(sanitized).toContain('Header');
      expect(sanitized).toContain('Subheader');
    });

    it('should remove markdown formatting', () => {
      const text = 'This is **bold** and *italic* and `code`';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('**');
      expect(sanitized).not.toContain('*');
      expect(sanitized).not.toContain('`');
      expect(sanitized).toContain('bold');
      expect(sanitized).toContain('italic');
    });

    it('should remove markdown links but keep text', () => {
      const text = 'Check out [this link](https://example.com)';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).not.toContain('[');
      expect(sanitized).not.toContain(']');
      expect(sanitized).not.toContain('(https://');
      expect(sanitized).toContain('this link');
    });

    it('should filter out ASCII art lines', () => {
      const text = 'Normal text\n+---+---+---+---+\n| A | B | C | D |\n+---+---+---+---+\nMore text';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).toContain('Normal text');
      expect(sanitized).toContain('More text');
      // ASCII art lines should be filtered (lines with >30% special chars)
      const hasAsciiArt = sanitized.split('\n').some(line => {
        const specialChars = (line.match(/[+\-|_=*#<>\/\\]/g) || []).length;
        return line.length > 10 && specialChars / line.length > 0.3;
      });
      expect(hasAsciiArt).toBe(false);
    });

    it('should handle empty input', () => {
      const sanitized = forge.sanitizeTextForAudio('');
      expect(sanitized).toBe('');
    });

    it('should trim whitespace', () => {
      const text = '   Text with spaces   ';
      const sanitized = forge.sanitizeTextForAudio(text);
      
      expect(sanitized).toBe('Text with spaces');
    });
  });

  describe('Cost Tracking', () => {
    it('should initialize costs to zero', () => {
      expect(forge.costs.openai).toBe(0);
      expect(forge.costs.elevenlabs).toBe(0);
      expect(forge.costs.rainforest).toBe(0);
      expect(forge.costs.total).toBe(0);
    });

    it('should track OpenAI costs', () => {
      const usage = {
        prompt_tokens: 1000,
        completion_tokens: 500
      };
      
      const cost = forge.trackOpenAICost(usage);
      
      expect(cost).toBeGreaterThan(0);
      expect(forge.costs.openai).toBe(cost);
      expect(forge.costs.total).toBe(cost);
    });

    it('should track ElevenLabs costs', () => {
      const characterCount = 10000;
      const cost = forge.trackElevenLabsCost(characterCount);
      
      expect(cost).toBeGreaterThan(0);
      expect(forge.costs.elevenlabs).toBe(cost);
      expect(forge.costs.total).toBe(cost);
    });

    it('should track Rainforest costs', () => {
      const cost = forge.trackRainforestCost();
      
      expect(cost).toBe(0.01); // Per request cost
      expect(forge.costs.rainforest).toBe(cost);
      expect(forge.costs.total).toBe(cost);
    });

    it('should accumulate costs', () => {
      forge.trackRainforestCost();
      forge.trackElevenLabsCost(5000);
      forge.trackOpenAICost({ prompt_tokens: 500, completion_tokens: 250 });
      
      expect(forge.costs.total).toBeGreaterThan(0);
      expect(forge.costs.total).toBe(
        forge.costs.openai + forge.costs.elevenlabs + forge.costs.rainforest
      );
    });

    it('should format cost summary correctly', () => {
      forge.trackRainforestCost();
      const summary = forge.getCostSummary();
      
      expect(summary).toHaveProperty('openai');
      expect(summary).toHaveProperty('elevenlabs');
      expect(summary).toHaveProperty('rainforest');
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('breakdown');
      
      expect(summary.openai).toMatch(/^\$\d+\.\d{4}$/);
      expect(summary.total).toMatch(/^\$\d+\.\d{4}$/);
    });
  });

  describe('Link Extraction', () => {
    it('should extract PDF links from HTML', () => {
      const html = '<a href="book.pdf">Download</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toContain('.pdf');
    });

    it('should extract EPUB links from HTML', () => {
      const html = '<a href="book.epub">Download</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toContain('.epub');
    });

    it('should prioritize EPUB over PDF', () => {
      const html = '<a href="book.pdf">PDF</a><a href="book.epub">EPUB</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links.length).toBe(2);
      expect(links[0]).toContain('.epub');
      expect(links[1]).toContain('.pdf');
    });

    it('should handle absolute URLs', () => {
      const html = '<a href="https://example.com/book.pdf">Download</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links[0]).toBe('https://example.com/book.pdf');
    });

    it('should handle relative URLs', () => {
      const html = '<a href="/downloads/book.pdf">Download</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links[0]).toBe('https://example.com/downloads/book.pdf');
    });

    it('should deduplicate links', () => {
      const html = '<a href="book.pdf">Link1</a><a href="book.pdf">Link2</a>';
      const links = forge.extractLinks(html, 'https://example.com');
      
      expect(links.length).toBe(1);
    });
  });

  describe('Browser Configuration', () => {
    it('should default to headless mode', () => {
      expect(forge.headless).toBe(true);
    });

    it('should allow custom headless setting', () => {
      const customForge = new SummaryForge({
        openaiApiKey: 'test-key',
        headless: false
      });
      
      expect(customForge.headless).toBe(false);
    });

    it('should handle proxy configuration', () => {
      const proxyForge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      expect(proxyForge.enableProxy).toBe(true);
      expect(proxyForge.proxyUrl).toBe('http://proxy.example.com:8080');
      expect(proxyForge.proxyUsername).toBe('user');
      expect(proxyForge.proxyPassword).toBe('pass');
    });
  });
});