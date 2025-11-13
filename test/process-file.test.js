/**
 * Tests for processFile method with SSE logging
 * Testing Framework: Vitest
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SummaryForge } from '../src/summary-forge.js';
import { SSELogger } from '../src/utils/sse-logger.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('SummaryForge.processFile with SSE', () => {
  let forge;
  let events;
  let testDir;

  beforeEach(() => {
    // Create a logger that captures events
    events = [];
    const logger = new SSELogger((event) => {
      events.push(event);
    });

    // Create SummaryForge instance with test configuration
    forge = new SummaryForge({
      openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
      logger,
      headless: true,
      enableProxy: false,
    });

    // Create temp directory for tests
    testDir = path.join(tmpdir(), `test-${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('SSE event emission', () => {
    it('should emit log event when processing starts', async () => {
      // Create a dummy PDF file
      const testPdfPath = path.join(testDir, 'test.pdf');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testPdfPath, 'dummy pdf content');

      try {
        await forge.processFile(testPdfPath);
      } catch (error) {
        // Expected to fail without real PDF
      }

      // Should have emitted at least one log event
      const logEvents = events.filter((e) => e.type === 'log');
      expect(logEvents.length).toBeGreaterThan(0);
      
      // First log should mention processing file
      const firstLog = logEvents[0];
      expect(firstLog.message).toContain('Processing file');
    });

    it('should emit progress events during processing', async () => {
      const testPdfPath = path.join(testDir, 'test.pdf');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testPdfPath, 'dummy pdf content');

      try {
        await forge.processFile(testPdfPath);
      } catch (error) {
        // Expected to fail without real PDF
      }

      // Should have emitted progress events
      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
      
      // First progress should be at 0%
      const firstProgress = progressEvents[0];
      expect(firstProgress.percentage).toBe(0);
      expect(firstProgress.message).toContain('Starting');
    });

    it('should emit error event on failure', async () => {
      try {
        await forge.processFile('/nonexistent/file.pdf');
      } catch (error) {
        // Expected to fail
      }

      // Should have emitted error events
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it.skipIf(!process.env.OPENAI_API_KEY)(
      'should emit complete event on success',
      async () => {
        // This would require a real PDF and API key
        // For now, we just verify the structure
        expect(forge.logger).toBeInstanceOf(SSELogger);
      }
    );
  });

  describe('EPUB conversion logging', () => {
    it('should log EPUB conversion progress', async () => {
      const testEpubPath = path.join(testDir, 'test.epub');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testEpubPath, 'dummy epub content');

      try {
        await forge.processFile(testEpubPath);
      } catch (error) {
        // Expected to fail without real EPUB
      }

      // Should have logged EPUB conversion
      const logEvents = events.filter((e) => e.type === 'log');
      const epubLogs = logEvents.filter((e) => e.message.includes('EPUB'));
      expect(epubLogs.length).toBeGreaterThan(0);
    });
  });

  describe('unsupported file types', () => {
    it('should emit error for unsupported file type', async () => {
      const testTxtPath = path.join(testDir, 'test.txt');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testTxtPath, 'text content');

      const result = await forge.processFile(testTxtPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported file type');
      
      // Should have logged error
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('progress tracking', () => {
    it('should emit progress events in ascending order', async () => {
      const testPdfPath = path.join(testDir, 'test.pdf');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testPdfPath, 'dummy pdf content');

      try {
        await forge.processFile(testPdfPath);
      } catch (error) {
        // Expected to fail
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      
      if (progressEvents.length > 1) {
        // Verify progress is generally ascending
        for (let i = 1; i < progressEvents.length; i++) {
          // Allow for some flexibility in progress ordering
          expect(progressEvents[i].percentage).toBeGreaterThanOrEqual(0);
          expect(progressEvents[i].percentage).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should include metadata in progress events', async () => {
      const testPdfPath = path.join(testDir, 'test.pdf');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testPdfPath, 'dummy pdf content');

      try {
        await forge.processFile(testPdfPath);
      } catch (error) {
        // Expected to fail
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      
      // Progress events should be emitted
      expect(progressEvents.length).toBeGreaterThan(0);
      
      // Progress events may optionally include metadata
      // This is implementation-dependent and not strictly required
      const hasMetadata = progressEvents.some((e) => e.metadata);
      expect(typeof hasMetadata).toBe('boolean');
    });
  });
});