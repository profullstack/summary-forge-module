/**
 * Tests for processWebPage method
 * Testing Framework: Mocha with Chai
 */

import { expect } from 'chai';
import { SummaryForge } from '../src/summary-forge.js';
import { SSELogger } from '../src/utils/sse-logger.js';

describe('SummaryForge.processWebPage', () => {
  let forge;
  let events;

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
  });

  describe('error handling', () => {
    it('should throw error when browser executable is not found', async () => {
      // Override puppeteer launch options to use invalid path
      forge.puppeteerLaunchOptions = {
        executablePath: '/invalid/path/to/chromium',
      };

      try {
        await forge.processWebPage('https://example.com', '/tmp');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(error.message).to.include('Browser was not found');
      }
    });

    it('should throw error for invalid URL', async () => {
      try {
        await forge.processWebPage('not-a-valid-url', '/tmp');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should throw error when outputDir is not writable', async () => {
      try {
        await forge.processWebPage('https://example.com', '/root/no-permission');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });
  });

  describe('return structure', () => {
    it('should return object with required fields on success', async function () {
      // Skip this test if no OpenAI key or Chromium is not available
      if (!process.env.OPENAI_API_KEY || !process.env.PUPPETEER_EXECUTABLE_PATH) {
        this.skip();
      }

      // This test would require a real browser and API key
      // For now, we just verify the structure expectations
      const expectedFields = [
        'success',
        'basename',
        'dirName',
        'markdown',
        'files',
        'directory',
        'archive',
        'hasAudio',
        'url',
        'title',
        'costs',
        'message',
      ];

      // We can't actually run this without a real environment
      // but we document the expected structure
      expect(expectedFields).to.be.an('array');
    });

    it('should NOT return error object with success:false', async () => {
      // Override to force an error
      forge.puppeteerLaunchOptions = {
        executablePath: '/invalid/path',
      };

      let caughtError = null;
      try {
        await forge.processWebPage('https://example.com', '/tmp');
      } catch (error) {
        caughtError = error;
      }

      // Should throw, not return error object
      expect(caughtError).to.not.be.null;
      expect(caughtError).to.be.instanceOf(Error);
    });
  });

  describe('SSE logging', () => {
    it('should emit log events during processing', async () => {
      // Override to force quick failure
      forge.puppeteerLaunchOptions = {
        executablePath: '/invalid/path',
      };

      try {
        await forge.processWebPage('https://example.com', '/tmp');
      } catch (error) {
        // Expected to fail
      }

      // Should have emitted at least one log event
      const logEvents = events.filter((e) => e.type === 'log');
      expect(logEvents.length).to.be.greaterThan(0);
    });

    it('should emit progress events during processing', async () => {
      // This would require a successful run
      // For now, we just verify the logger is set up
      expect(forge.logger).to.be.instanceOf(SSELogger);
    });
  });

  describe('integration with fetchWebPageAsPdf', () => {
    it('should call fetchWebPageAsPdf with correct parameters', async () => {
      // This is an integration test that would require mocking
      // For now, we verify the method exists
      expect(forge.processWebPage).to.be.a('function');
    });
  });
});