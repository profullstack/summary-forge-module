/**
 * CLI Error Handling Tests
 * 
 * Tests that the CLI properly handles errors from processFile() and other operations
 * 
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';

describe('CLI Error Handling', () => {
  describe('processFile() result validation', () => {
    it('should return success=false when processing fails', async () => {
      // Create a forge instance with minimal config
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      // Try to process a non-existent file
      const result = await forge.processFile('/nonexistent/file.pdf');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    it('should return proper structure even on failure', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('/nonexistent/file.pdf');
      
      // Verify the result has the expected structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('basename');
      expect(result).toHaveProperty('directory');
      
      // On failure, these should be null
      expect(result.basename).toBeNull();
      expect(result.directory).toBeNull();
    });

    it('should handle unsupported file types gracefully', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      // Try to process an unsupported file type
      const result = await forge.processFile('test.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
      expect(result.error).toContain('.txt');
    });
  });

  describe('Cost summary structure', () => {
    it('should return properly formatted cost summary', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const costs = forge.getCostSummary();
      
      expect(costs).toBeDefined();
      expect(costs.success).toBe(true);
      expect(costs).toHaveProperty('openai');
      expect(costs).toHaveProperty('elevenlabs');
      expect(costs).toHaveProperty('rainforest');
      expect(costs).toHaveProperty('total');
      
      // All costs should be formatted as strings with $ prefix
      expect(typeof costs.openai).toBe('string');
      expect(costs.openai).toMatch(/^\$/);
      expect(typeof costs.elevenlabs).toBe('string');
      expect(costs.elevenlabs).toMatch(/^\$/);
      expect(typeof costs.rainforest).toBe('string');
      expect(costs.rainforest).toMatch(/^\$/);
      expect(typeof costs.total).toBe('string');
      expect(costs.total).toMatch(/^\$/);
    });

    it('should include breakdown with numeric values', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const costs = forge.getCostSummary();
      
      expect(costs).toHaveProperty('breakdown');
      expect(costs.breakdown).toHaveProperty('openai');
      expect(costs.breakdown).toHaveProperty('elevenlabs');
      expect(costs.breakdown).toHaveProperty('rainforest');
      expect(costs.breakdown).toHaveProperty('total');
      
      // Breakdown values should be numbers
      expect(typeof costs.breakdown.openai).toBe('number');
      expect(typeof costs.breakdown.elevenlabs).toBe('number');
      expect(typeof costs.breakdown.rainforest).toBe('number');
      expect(typeof costs.breakdown.total).toBe('number');
    });

    it('should start with zero costs', () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const costs = forge.getCostSummary();
      
      expect(costs.openai).toBe('$0.0000');
      expect(costs.elevenlabs).toBe('$0.0000');
      expect(costs.rainforest).toBe('$0.0000');
      expect(costs.total).toBe('$0.0000');
      
      expect(costs.breakdown.openai).toBe(0);
      expect(costs.breakdown.elevenlabs).toBe(0);
      expect(costs.breakdown.rainforest).toBe(0);
      expect(costs.breakdown.total).toBe(0);
    });
  });

  describe('CLI safe access patterns', () => {
    it('should safely handle undefined result', () => {
      const result = undefined;
      
      // This is how the CLI should check
      const isValid = !!(result && result.success);
      expect(isValid).toBe(false);
      
      // Safe access with optional chaining
      const error = result?.error || 'Processing failed';
      expect(error).toBe('Processing failed');
    });

    it('should safely handle result without costs', () => {
      const result = {
        success: true,
        archive: '/path/to/archive.tgz'
        // Note: no costs property
      };
      
      // This is how the CLI should access costs
      const costs = result.costs || {};
      expect(costs.openai).toBeUndefined();
      
      // With fallbacks
      const openaiCost = costs.openai || '$0.0000';
      expect(openaiCost).toBe('$0.0000');
    });

    it('should safely handle result with null costs', () => {
      const result = {
        success: true,
        archive: '/path/to/archive.tgz',
        costs: null
      };
      
      const costs = result.costs || {};
      const openaiCost = costs.openai || '$0.0000';
      const elevenlabsCost = costs.elevenlabs || '$0.0000';
      const rainforestCost = costs.rainforest || '$0.0000';
      const totalCost = costs.total || '$0.0000';
      
      expect(openaiCost).toBe('$0.0000');
      expect(elevenlabsCost).toBe('$0.0000');
      expect(rainforestCost).toBe('$0.0000');
      expect(totalCost).toBe('$0.0000');
    });

    it('should handle partial cost data', () => {
      const result = {
        success: true,
        archive: '/path/to/archive.tgz',
        costs: {
          openai: '$0.1234',
          // Missing other properties
        }
      };
      
      const costs = result.costs || {};
      expect(costs.openai || '$0.0000').toBe('$0.1234');
      expect(costs.elevenlabs || '$0.0000').toBe('$0.0000');
      expect(costs.rainforest || '$0.0000').toBe('$0.0000');
      expect(costs.total || '$0.0000').toBe('$0.0000');
    });
  });

  describe('Error message formatting', () => {
    it('should provide clear error messages for missing files', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('/path/to/nonexistent.pdf');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.length).toBeGreaterThan(0);
    });

    it('should provide clear error messages for unsupported formats', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('document.docx');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
      expect(result.error).toContain('.docx');
    });
  });

  describe('Result structure consistency', () => {
    it('should always return an object from processFile', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('/nonexistent.pdf');
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
    });

    it('should always include success property', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('/nonexistent.pdf');
      
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('should include error property when success is false', async () => {
      const forge = new SummaryForge({
        openaiApiKey: 'test-key-123'
      });
      
      const result = await forge.processFile('/nonexistent.pdf');
      
      if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });
});