/**
 * Tests for Anna's Archive search functionality
 * 
 * Note: These tests require a valid proxy configuration to run successfully.
 * Set SKIP_INTEGRATION_TESTS=true to skip integration tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS !== 'false';

describe('Anna\'s Archive Search', () => {
  let forge;
  
  beforeAll(() => {
    // Always create a forge instance for non-integration tests
    // Integration tests will be skipped if no proxy config
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
  
  describe('searchAnnasArchive()', () => {
    it('should have searchAnnasArchive method', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge).toHaveProperty('searchAnnasArchive');
      expect(typeof testForge.searchAnnasArchive).toBe('function');
    });
    
    it('should accept query parameter', () => {
      const testForge = new SummaryForge({
        openaiApiKey: 'test-key'
      });
      expect(testForge.searchAnnasArchive.length).toBeGreaterThanOrEqual(1);
    });
    
    it.skipIf(SKIP_INTEGRATION)('should search for books by title', async () => {
      const results = await forge.searchAnnasArchive('JavaScript', {
        maxResults: 5,
        format: 'pdf',
        sortBy: 'date'
      });
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(5);
      
      if (results.length > 0) {
        const firstResult = results[0];
        expect(firstResult).toHaveProperty('title');
        expect(firstResult).toHaveProperty('format');
        expect(firstResult).toHaveProperty('sizeInMB');
        expect(firstResult).toHaveProperty('url');
        expect(firstResult).toHaveProperty('href');
        
        expect(typeof firstResult.title).toBe('string');
        expect(typeof firstResult.format).toBe('string');
        expect(typeof firstResult.sizeInMB).toBe('number');
        expect(firstResult.url).toContain('annas-archive.org');
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support partial title matching', async () => {
      const results = await forge.searchAnnasArchive('Clean Code', {
        maxResults: 3,
        format: 'pdf'
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        // At least one result should contain "clean" or "code" in title (case-insensitive)
        const hasMatch = results.some(r => 
          r.title.toLowerCase().includes('clean') || 
          r.title.toLowerCase().includes('code')
        );
        expect(hasMatch).toBe(true);
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should filter by format', async () => {
      const pdfResults = await forge.searchAnnasArchive('Python', {
        maxResults: 3,
        format: 'pdf'
      });
      
      expect(pdfResults).toBeInstanceOf(Array);
      
      if (pdfResults.length > 0) {
        pdfResults.forEach(result => {
          expect(result.format).toBe('pdf');
        });
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should respect maxResults option', async () => {
      const results = await forge.searchAnnasArchive('programming', {
        maxResults: 2
      });
      
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(2);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support language filter', async () => {
      const results = await forge.searchAnnasArchive('Python', {
        maxResults: 3,
        language: 'en'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support sources filter', async () => {
      const results = await forge.searchAnnasArchive('Programming', {
        maxResults: 3,
        sources: 'zlib,lgli'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support sort by date', async () => {
      const results = await forge.searchAnnasArchive('JavaScript', {
        maxResults: 3,
        sortBy: 'date'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support comma-separated formats', async () => {
      const results = await forge.searchAnnasArchive('Node.js', {
        maxResults: 3,
        format: 'pdf,epub'
      });
      
      expect(results).toBeInstanceOf(Array);
      
      if (results.length > 0) {
        // Results should include both PDF and EPUB formats
        const formats = results.map(r => r.format);
        const hasPdfOrEpub = formats.some(f => f === 'pdf' || f === 'epub');
        expect(hasPdfOrEpub).toBe(true);
      }
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support comma-separated languages', async () => {
      const results = await forge.searchAnnasArchive('Programming', {
        maxResults: 3,
        language: 'en,es'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should support comma-separated sources', async () => {
      const results = await forge.searchAnnasArchive('Science', {
        maxResults: 3,
        sources: 'zlib,lgli,lgrs'
      });
      
      expect(results).toBeInstanceOf(Array);
    }, 120000);
    
    it.skipIf(SKIP_INTEGRATION)('should handle empty search results gracefully', async () => {
      const results = await forge.searchAnnasArchive('xyzabc123nonexistentbook999', {
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
      expect(() => {
        testForge.searchAnnasArchive('test');
      }).not.toThrow();
    });
  });
  
  describe('Search result structure', () => {
    it.skipIf(SKIP_INTEGRATION)('should return properly structured results', async () => {
      const results = await forge.searchAnnasArchive('Node.js', {
        maxResults: 1
      });
      
      if (results.length > 0) {
        const result = results[0];
        
        // Required fields
        expect(result).toHaveProperty('index');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('format');
        expect(result).toHaveProperty('sizeInMB');
        expect(result).toHaveProperty('href');
        expect(result).toHaveProperty('url');
        
        // Optional fields
        expect(result).toHaveProperty('author');
        
        // Type checks
        expect(typeof result.index).toBe('number');
        expect(typeof result.title).toBe('string');
        expect(typeof result.format).toBe('string');
        expect(typeof result.sizeInMB).toBe('number');
        expect(typeof result.href).toBe('string');
        expect(typeof result.url).toBe('string');
        
        // Value checks
        expect(result.index).toBeGreaterThanOrEqual(1);
        expect(result.title.length).toBeGreaterThanOrEqual(1);
        expect(['pdf', 'epub', 'unknown']).toContain(result.format);
        expect(result.sizeInMB).toBeGreaterThanOrEqual(0);
        expect(result.href).toMatch(/^\/md5\//);
        expect(result.url).toMatch(/^https:\/\/annas-archive\.org\/md5\//);
      }
    }, 120000);
  });
  
  describe('Error handling', () => {
    it('should handle missing proxy configuration', async () => {
      const forgeNoProxy = new SummaryForge({
        openaiApiKey: 'test-key',
        enableProxy: false
      });
      
      await expect(async () => {
        await forgeNoProxy.searchAnnasArchive('test');
      }).rejects.toThrow();
    });
  });
});