/**
 * Tests for SSE Logger
 * Testing Framework: Vitest
 */

import { describe, it, expect } from 'vitest';
import { SSELogger } from '../src/utils/sse-logger.js';

describe('SSELogger', () => {
  describe('constructor', () => {
    it('should create an instance without callback', () => {
      const logger = new SSELogger();
      expect(logger).to.be.instanceOf(SSELogger);
    });

    it('should create an instance with callback', () => {
      const callback = () => {};
      const logger = new SSELogger(callback);
      expect(logger).to.be.instanceOf(SSELogger);
    });
  });

  describe('log', () => {
    it('should emit log event with correct data', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.type).toBe('log');
          expect(event.level).toBe('info');
          expect(event.message).toBe('Test message');
          expect(typeof event.timestamp).toBe('number');
          resolve();
        });

        logger.log('Test message');
      });
    });

    it('should handle different log levels', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.level).toBe('error');
          resolve();
        });

        logger.log('Error message', 'error');
      });
    });

    it('should include metadata when provided', () => {
      return new Promise((resolve) => {
        const metadata = { step: 1, total: 5 };
        const logger = new SSELogger((event) => {
          expect(event.metadata).toEqual(metadata);
          resolve();
        });

        logger.log('Progress update', 'info', metadata);
      });
    });
  });

  describe('progress', () => {
    it('should emit progress event with percentage', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.type).toBe('progress');
          expect(event.percentage).toBe(50);
          expect(event.message).toBe('Half done');
          resolve();
        });

        logger.progress(50, 'Half done');
      });
    });

    it('should clamp percentage to 0-100 range', () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const logger = new SSELogger((event) => {
          callCount++;
          if (callCount === 1) {
            expect(event.percentage).toBe(0);
          } else if (callCount === 2) {
            expect(event.percentage).toBe(100);
            resolve();
          }
        });

        logger.progress(-10, 'Below zero');
        logger.progress(150, 'Above hundred');
      });
    });
  });

  describe('error', () => {
    it('should emit error event', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.type).toBe('error');
          expect(event.message).toBe('Something went wrong');
          expect(typeof event.error).toBe('object');
          resolve();
        });

        logger.error('Something went wrong', new Error('Test error'));
      });
    });

    it('should handle error without Error object', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.type).toBe('error');
          expect(event.error).toBeUndefined();
          resolve();
        });

        logger.error('Simple error message');
      });
    });
  });

  describe('complete', () => {
    it('should emit complete event', () => {
      return new Promise((resolve) => {
        const logger = new SSELogger((event) => {
          expect(event.type).toBe('complete');
          expect(event.message).toBe('Task finished');
          resolve();
        });

        logger.complete('Task finished');
      });
    });

    it('should include result data when provided', () => {
      return new Promise((resolve) => {
        const result = { success: true, files: ['file1.pdf'] };
        const logger = new SSELogger((event) => {
          expect(event.result).toEqual(result);
          resolve();
        });

        logger.complete('Done', result);
      });
    });
  });

  describe('formatForSSE', () => {
    it('should format event data for SSE protocol', () => {
      const logger = new SSELogger();
      const event = {
        type: 'log',
        level: 'info',
        message: 'Test',
        timestamp: Date.now(),
      };

      const formatted = logger.formatForSSE(event);
      expect(formatted).toContain('data: ');
      expect(formatted).toContain('"type":"log"');
      expect(formatted).toContain('\n\n');
    });

    it('should handle multiline messages', () => {
      const logger = new SSELogger();
      const event = {
        type: 'log',
        message: 'Line 1\nLine 2\nLine 3',
      };

      const formatted = logger.formatForSSE(event);
      const lines = formatted.split('\n');
      expect(lines.filter((l) => l.startsWith('data: ')).length).toBe(1);
    });
  });

  describe('silent mode', () => {
    it('should not call callback when no callback provided', () => {
      const logger = new SSELogger();
      // Should not throw
      expect(() => logger.log('Test')).not.toThrow();
      expect(() => logger.progress(50)).not.toThrow();
      expect(() => logger.error('Error')).not.toThrow();
      expect(() => logger.complete('Done')).not.toThrow();
    });
  });

  describe('event chaining', () => {
    it('should emit multiple events in sequence', () => {
      return new Promise((resolve) => {
        const events = [];
        const logger = new SSELogger((event) => {
          events.push(event.type);
          if (events.length === 4) {
            expect(events).toEqual(['log', 'progress', 'log', 'complete']);
            resolve();
          }
        });

        logger.log('Starting');
        logger.progress(50, 'Halfway');
        logger.log('Almost done');
        logger.complete('Finished');
      });
    });
  });
});