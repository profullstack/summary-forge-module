/**
 * Tests for SSE Logger
 * Testing Framework: Mocha with Chai
 */

import { expect } from 'chai';
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
    it('should emit log event with correct data', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.type).to.equal('log');
        expect(event.level).to.equal('info');
        expect(event.message).to.equal('Test message');
        expect(event.timestamp).to.be.a('number');
        done();
      });

      logger.log('Test message');
    });

    it('should handle different log levels', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.level).to.equal('error');
        done();
      });

      logger.log('Error message', 'error');
    });

    it('should include metadata when provided', (done) => {
      const metadata = { step: 1, total: 5 };
      const logger = new SSELogger((event) => {
        expect(event.metadata).to.deep.equal(metadata);
        done();
      });

      logger.log('Progress update', 'info', metadata);
    });
  });

  describe('progress', () => {
    it('should emit progress event with percentage', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.type).to.equal('progress');
        expect(event.percentage).to.equal(50);
        expect(event.message).to.equal('Half done');
        done();
      });

      logger.progress(50, 'Half done');
    });

    it('should clamp percentage to 0-100 range', (done) => {
      let callCount = 0;
      const logger = new SSELogger((event) => {
        callCount++;
        if (callCount === 1) {
          expect(event.percentage).to.equal(0);
        } else if (callCount === 2) {
          expect(event.percentage).to.equal(100);
          done();
        }
      });

      logger.progress(-10, 'Below zero');
      logger.progress(150, 'Above hundred');
    });
  });

  describe('error', () => {
    it('should emit error event', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.type).to.equal('error');
        expect(event.message).to.equal('Something went wrong');
        expect(event.error).to.be.an('object');
        done();
      });

      logger.error('Something went wrong', new Error('Test error'));
    });

    it('should handle error without Error object', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.type).to.equal('error');
        expect(event.error).to.be.undefined;
        done();
      });

      logger.error('Simple error message');
    });
  });

  describe('complete', () => {
    it('should emit complete event', (done) => {
      const logger = new SSELogger((event) => {
        expect(event.type).to.equal('complete');
        expect(event.message).to.equal('Task finished');
        done();
      });

      logger.complete('Task finished');
    });

    it('should include result data when provided', (done) => {
      const result = { success: true, files: ['file1.pdf'] };
      const logger = new SSELogger((event) => {
        expect(event.result).to.deep.equal(result);
        done();
      });

      logger.complete('Done', result);
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
      expect(formatted).to.include('data: ');
      expect(formatted).to.include('"type":"log"');
      expect(formatted).to.include('\n\n');
    });

    it('should handle multiline messages', () => {
      const logger = new SSELogger();
      const event = {
        type: 'log',
        message: 'Line 1\nLine 2\nLine 3',
      };

      const formatted = logger.formatForSSE(event);
      const lines = formatted.split('\n');
      expect(lines.filter((l) => l.startsWith('data: '))).to.have.lengthOf(1);
    });
  });

  describe('silent mode', () => {
    it('should not call callback when no callback provided', () => {
      const logger = new SSELogger();
      // Should not throw
      expect(() => logger.log('Test')).to.not.throw();
      expect(() => logger.progress(50)).to.not.throw();
      expect(() => logger.error('Error')).to.not.throw();
      expect(() => logger.complete('Done')).to.not.throw();
    });
  });

  describe('event chaining', () => {
    it('should emit multiple events in sequence', (done) => {
      const events = [];
      const logger = new SSELogger((event) => {
        events.push(event.type);
        if (events.length === 4) {
          expect(events).to.deep.equal(['log', 'progress', 'log', 'complete']);
          done();
        }
      });

      logger.log('Starting');
      logger.progress(50, 'Halfway');
      logger.log('Almost done');
      logger.complete('Finished');
    });
  });
});