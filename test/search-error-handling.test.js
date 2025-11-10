/**
 * Search Command Error Handling Tests
 * 
 * Tests that the search commands properly handle proxy configuration
 * and provide clear error messages when requirements are not met.
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

describe('Search Command Error Handling', () => {
  describe('search1libAndDownload() proxy validation', () => {
    it('should return error when proxy is not enabled', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      const result = await forge.search1libAndDownload('test query', {}, '.', async () => null);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
      expect(result.results).toEqual([]);
      expect(result.download).toBeNull();
    });

    it('should return error when proxy URL is missing', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: true,
        // Missing proxyUrl
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      const result = await forge.search1libAndDownload('test query', {}, '.', async () => null);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
    });

    it('should return error when enableProxy is false even with credentials', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false, // Explicitly disabled
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      const result = await forge.search1libAndDownload('test query', {}, '.', async () => null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Proxy configuration is required for 1lib.sk');
    });
  });

  describe('search1lib() proxy validation', () => {
    it('should return error when proxy is not configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.search1lib('test query');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
      expect(result.results).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should include query and options in error response', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const options = {
        maxResults: 5,
        extensions: ['PDF']
      };
      
      const result = await forge.search1lib('AI Programming', options);
      
      expect(result.query).toBe('AI Programming');
      expect(result.options).toEqual(options);
    });
  });

  describe('searchAnnasArchive() proxy validation', () => {
    it('should return error when proxy is not configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.searchAnnasArchive('test query');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
      expect(result.results).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should validate proxy URL is provided', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: true,
        // Missing proxyUrl
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      
      const result = await forge.searchAnnasArchive('test query');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
    });
  });

  describe('Error message structure', () => {
    it('should return consistent error structure across all search methods', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const search1libResult = await forge.search1lib('query');
      const annasResult = await forge.searchAnnasArchive('query');
      const combinedResult = await forge.search1libAndDownload('query', {}, '.', async () => null);
      
      // All should have the same base structure
      [search1libResult, annasResult, combinedResult].forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('results');
        expect(result.success).toBe(false);
        expect(result.results).toEqual([]);
      });
    });

    it('should provide actionable error messages', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.search1lib('query');
      
      expect(result.error).toBeDefined();
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error).toContain('Proxy');
      expect(result.error).toContain('required');
    });
  });

  describe('Proxy configuration detection', () => {
    it('should detect when proxy is disabled but credentials exist', () => {
      const config = {
        openaiApiKey: 'test-key',
        enableProxy: false,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      };
      
      // This is how the CLI should detect the situation
      const hasProxyCredentials = !!(config.proxyUrl && config.proxyUsername && config.proxyPassword);
      const proxyEnabled = config.enableProxy === true;
      
      expect(hasProxyCredentials).toBe(true);
      expect(proxyEnabled).toBe(false);
      
      // User needs to enable proxy
      const needsToEnableProxy = hasProxyCredentials && !proxyEnabled;
      expect(needsToEnableProxy).toBe(true);
    });

    it('should detect when proxy is enabled but credentials are missing', () => {
      const config = {
        openaiApiKey: 'test-key',
        enableProxy: true,
        // Missing credentials
      };
      
      const hasProxyCredentials = !!(config.proxyUrl && config.proxyUsername && config.proxyPassword);
      const proxyEnabled = config.enableProxy === true;
      
      expect(hasProxyCredentials).toBe(false);
      expect(proxyEnabled).toBe(true);
      
      // User needs to configure proxy credentials
      const needsProxySetup = proxyEnabled && !hasProxyCredentials;
      expect(needsProxySetup).toBe(true);
    });

    it('should detect when proxy is fully configured', () => {
      const config = {
        openaiApiKey: 'test-key',
        enableProxy: true,
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      };
      
      const hasProxyCredentials = !!(config.proxyUrl && config.proxyUsername && config.proxyPassword);
      const proxyEnabled = config.enableProxy === true;
      
      expect(hasProxyCredentials).toBe(true);
      expect(proxyEnabled).toBe(true);
      
      // Proxy is ready to use
      const proxyReady = proxyEnabled && hasProxyCredentials;
      expect(proxyReady).toBe(true);
    });
  });

  describe('downloadFrom1lib() proxy validation', () => {
    it('should return error when proxy is not configured', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.downloadFrom1lib('https://1lib.sk/book/123', '.');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Proxy configuration is required');
      expect(result.filepath).toBeNull();
      expect(result.directory).toBeNull();
    });
  });

  describe('CLI error message patterns', () => {
    it('should match the pattern used in CLI for proxy errors', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.search1libAndDownload('query', {}, '.', async () => null);
      
      // This is the pattern the CLI checks for
      const isProxyError = result?.error?.includes('Proxy configuration');
      expect(isProxyError).toBe(true);
    });

    it('should provide error structure that CLI can safely access', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123',
        enableProxy: false
      });
      
      const result = await forge.search1libAndDownload('query', {}, '.', async () => null);
      
      // CLI should be able to safely access these
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.error).toBeDefined();
      
      // Safe access pattern
      const errorMessage = result?.error || 'Unknown error';
      expect(errorMessage).toBe('Proxy configuration is required for 1lib.sk');
    });
  });
});