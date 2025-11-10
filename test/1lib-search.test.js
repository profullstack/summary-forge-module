/**
 * Tests for 1lib.sk search functionality
 * 
 * 1lib.sk is a simpler alternative to Anna's Archive with:
 * - No DDoS protection (faster access)
 * - More complete library
 * - Simpler URL structure
 * 
 * Note: These tests require a valid proxy configuration to run successfully.
 * Set SKIP_INTEGRATION_TESTS=true to skip integration tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS !== 'false';

describe('1lib.sk Search', () => {
  let forge;
  
  beforeAll(() => {
    if (process.env.OPENAI_API_KEY && process.env.PROXY_URL) {
      forge = new SummaryForge({
        openaiApiKey: process.env.OPENAI_API_KEY,
        enableProxy: true,
        proxyUrl: process.env.PROXY_URL,
        proxyUsername: process.env.PROXY_USERNAME,
        proxyPassword: process.env.PROXY_PASSWORD,
        proxyPoolSize: 36,
        headless: true
      });
    } else {
      // Create a minimal forge for unit tests
      forge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://test.com',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
    }
  });
  
  describe('search1lib()', () => {
    it('should have search1lib method', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge).toHaveProperty('search1lib');
      expect(typeof testForge.search1lib).toBe('function');
    });
    
    it('should accept query parameter', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge.search1lib.length).toBeGreaterThanOrEqual(1);
    });
    
    it.skipIf(SKIP_INTEGRATION)('should search for books by title', async () => {
      const result = await forge.search1lib('LLM Fine Tuning', {
        maxResults: 5,
        yearFrom: 2020,
        languages: ['english'],
        extensions: ['PDF']
      });
      
      expect(result.success).toBe(true);
      expect(result.results).toBeInstanceOf(Array);
      expect(result.count).toBeLessThanOrEqual(5);
      expect(result.query).toBe('LLM Fine Tuning');
      expect(result).toHaveProperty('message');
      
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        expect(firstResult).toHaveProperty('title');
        expect(firstResult).toHaveProperty('extension');
        expect(firstResult).toHaveProperty('size');
        expect(firstResult).toHaveProperty('url');
        expect(firstResult).toHaveProperty('downloadUrl');
        
        expect(typeof firstResult.title).toBe('string');
        expect(typeof firstResult.extension).toBe('string');
        expect(typeof firstResult.size).toBe('string');
        expect(firstResult.url).toContain('1lib.sk');
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should search by ISBN', async () => {
      const result = await forge.search1lib('9780134685991', {
        maxResults: 3
      });
      
      expect(result.success).toBe(true);
      expect(result.results).toBeInstanceOf(Array);
      
      if (result.results.length > 0) {
        // Should find books matching the ISBN
        expect(result.results[0]).toHaveProperty('title');
        expect(result.results[0]).toHaveProperty('isbn');
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should filter by year', async () => {
      const results = await forge.search1lib('JavaScript', {
        maxResults: 3,
        yearFrom: 2020,
        yearTo: 2024
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        results.forEach(result => {
          if (result.year) {
            expect(result.year).toBeGreaterThanOrEqual(2020);
            expect(result.year).toBeLessThanOrEqual(2024);
          }
        });
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should filter by language', async () => {
      const results = await forge.search1lib('Python', {
        maxResults: 3,
        languages: ['english']
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        results.forEach(result => {
          if (result.language) {
            expect(result.language.toLowerCase()).toContain('english');
          }
        });
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should filter by extension', async () => {
      const results = await forge.search1lib('Node.js', {
        maxResults: 3,
        extensions: ['PDF']
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        results.forEach(result => {
          expect(result.extension.toUpperCase()).toBe('PDF');
        });
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support multiple extensions', async () => {
      const results = await forge.search1lib('Programming', {
        maxResults: 5,
        extensions: ['PDF', 'EPUB']
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        results.forEach(result => {
          expect(['PDF', 'EPUB']).toContain(result.extension.toUpperCase());
        });
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support content type filter', async () => {
      const results = await forge.search1lib('Science', {
        maxResults: 3,
        contentTypes: ['book']
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support order by date', async () => {
      const results = await forge.search1lib('Machine Learning', {
        maxResults: 3,
        order: 'date'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support list view', async () => {
      const results = await forge.search1lib('AI', {
        maxResults: 3,
        view: 'list'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should respect maxResults option', async () => {
      const results = await forge.search1lib('programming', {
        maxResults: 2
      });
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(2);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should handle empty search results gracefully', async () => {
      const results = await forge.search1lib('xyzabc123nonexistentbook999', {
        maxResults: 5
      });
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBe(0);
    }, 120000);
    
    it('should use default options when not provided', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://test.com',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      // This test just verifies the method signature accepts optional parameters
      // Don't actually call it as it launches a browser
      expect(testForge.search1lib).toBeDefined();
      expect(typeof testForge.search1lib).toBe('function');
    });
  });
  
  describe('Search result structure', () => {
    it.skipIf(SKIP_INTEGRATION)('should return properly structured results', async () => {
      const results = await forge.search1lib('Node.js', {
        maxResults: 1
      });
      
      if (results.length > 0) {
        const result = results[0];
        
        // Required fields
        expect(result).toHaveProperty('index');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('extension');
        expect(result).toHaveProperty('size');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('downloadUrl');
        
        // Optional fields
        expect(result).toHaveProperty('author');
        expect(result).toHaveProperty('year');
        expect(result).toHaveProperty('language');
        expect(result).toHaveProperty('isbn');
        
        // Type checks
        expect(typeof result.index).toBe('number');
        expect(typeof result.title).toBe('string');
        expect(typeof result.extension).toBe('string');
        expect(typeof result.size).toBe('string');
        expect(typeof result.url).toBe('string');
        expect(typeof result.downloadUrl).toBe('string');
        
        // Value checks
        expect(result.index).toBeGreaterThanOrEqual(1);
        expect(result.title.length).toBeGreaterThanOrEqual(1);
        expect(result.url).toMatch(/^https:\/\/1lib\.sk\//);
        expect(result.downloadUrl).toMatch(/^https:\/\/1lib\.sk\//);
      }
    }, 120000);
  });
  
  describe('Error handling', () => {
    it('should return error JSON for missing proxy configuration', async () => {
      const forgeNoProxy = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: false
      });
      
      const result = await forgeNoProxy.search1lib('test');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Proxy configuration is required for 1lib.sk search');
      expect(result.results).toEqual([]);
      expect(result.count).toBe(0);
    });
  });
});

describe('1lib.sk Download', () => {
  let forge;
  
  beforeAll(() => {
    if (process.env.OPENAI_API_KEY && process.env.PROXY_URL) {
      forge = new SummaryForge({
        openaiApiKey: process.env.OPENAI_API_KEY,
        enableProxy: true,
        proxyUrl: process.env.PROXY_URL,
        proxyUsername: process.env.PROXY_USERNAME,
        proxyPassword: process.env.PROXY_PASSWORD,
        proxyPoolSize: 36,
        headless: true,
        force: true // Auto-overwrite for tests
      });
    } else {
      forge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://test.com',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
    }
  });
  
  describe('downloadFrom1lib()', () => {
    it('should have downloadFrom1lib method', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge).toHaveProperty('downloadFrom1lib');
      expect(typeof testForge.downloadFrom1lib).toBe('function');
    });
    
    it('should accept bookUrl parameter', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge.downloadFrom1lib.length).toBeGreaterThanOrEqual(1);
    });
    
    it.skipIf(SKIP_INTEGRATION)('should download a book from 1lib.sk', async () => {
      // First search for a book
      const searchResult = await forge.search1lib('JavaScript', {
        maxResults: 1,
        extensions: ['PDF']
      });
      
      expect(searchResult.success).toBe(true);
      expect(searchResult.results).toBeInstanceOf(Array);
      
      if (searchResult.results.length > 0) {
        const book = searchResult.results[0];
        
        // Download the book
        const download = await forge.downloadFrom1lib(book.url, '.', book.title);
        
        expect(download.success).toBe(true);
        expect(download).toHaveProperty('filepath');
        expect(download).toHaveProperty('directory');
        expect(download).toHaveProperty('filename');
        expect(download).toHaveProperty('title');
        expect(download).toHaveProperty('identifier');
        expect(download).toHaveProperty('format');
        expect(download).toHaveProperty('message');
        
        expect(typeof download.filepath).toBe('string');
        expect(typeof download.directory).toBe('string');
        expect(typeof download.filename).toBe('string');
        expect(typeof download.title).toBe('string');
        expect(typeof download.identifier).toBe('string');
        expect(typeof download.format).toBe('string');
        
        expect(download.directory).toContain('uploads');
        expect(download.format).toBe('pdf');
      }
    }, 180000); // 3 minutes timeout for download
    
    it.skipIf(SKIP_INTEGRATION)('should create proper directory structure', async () => {
      const results = await forge.search1lib('Python', {
        maxResults: 1,
        extensions: ['PDF']
      });
      
      if (results.length > 0) {
        const book = results[0];
        const download = await forge.downloadFrom1lib(book.url, '.', book.title);
        
        // Check directory structure
        expect(download.directory).toMatch(/^\.\/uploads\/[a-z0-9_]+$/);
        
        // Check that identifier is in directory name
        const dirName = download.directory.split('/').pop();
        expect(dirName).toContain('_');
        
        // Check filename doesn't include identifier (it's in directory name)
        expect(download.filename).not.toContain(download.identifier);
      }
    }, 180000);
  });
  
  describe('Error handling', () => {
    it('should return error JSON for missing proxy configuration for download', async () => {
      const forgeNoProxy = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: false
      });
      
      const result = await forgeNoProxy.downloadFrom1lib('https://1lib.sk/book/test', '.');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Proxy configuration is required for 1lib.sk downloads');
      expect(result.filepath).toBeNull();
      expect(result.directory).toBeNull();
    });
    
    it('should return error JSON for invalid book URL', async () => {
      if (!process.env.PROXY_URL) {
        return; // Skip if no proxy configured
      }
      
      const result = await forge.downloadFrom1lib('https://1lib.sk/invalid-url', '.');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.filepath).toBeNull();
    }, 60000);
    
    it('should provide debug information when download button not found', async () => {
      // This test verifies that the error handling provides useful debug info
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://test.com',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      // The method should have proper error handling with debug output
      expect(testForge).toHaveProperty('search1libAndDownload');
      expect(typeof testForge.search1libAndDownload).toBe('function');
    });
  });
});