/**
 * SSE Logger - Server-Sent Events Logger for Real-time Progress Updates
 * 
 * Provides a simple interface for emitting progress events during long-running operations.
 * Events can be consumed by SSE endpoints to provide real-time feedback to clients.
 */

/**
 * SSELogger class for emitting structured events
 * 
 * @class
 * @example
 * const logger = new SSELogger((event) => {
 *   console.log('Event:', event);
 * });
 * 
 * logger.log('Starting process...');
 * logger.progress(50, 'Halfway done');
 * logger.complete('Process finished');
 */
export class SSELogger {
  /**
   * Create a new SSE logger
   * 
   * @param {Function} [callback] - Optional callback function to receive events
   */
  constructor(callback = null) {
    this.callback = callback;
  }

  /**
   * Emit a log event
   * 
   * @param {string} message - Log message
   * @param {string} [level='info'] - Log level (info, warn, error, debug)
   * @param {Object} [metadata] - Additional metadata
   */
  log(message, level = 'info', metadata = {}) {
    const event = {
      type: 'log',
      level,
      message,
      timestamp: Date.now(),
      ...metadata,
    };

    this.emit(event);
  }

  /**
   * Emit a progress event
   * 
   * @param {number} percentage - Progress percentage (0-100)
   * @param {string} [message] - Optional progress message
   * @param {Object} [metadata] - Additional metadata
   */
  progress(percentage, message = '', metadata = {}) {
    // Clamp percentage to 0-100 range
    const clampedPercentage = Math.max(0, Math.min(100, percentage));

    const event = {
      type: 'progress',
      percentage: clampedPercentage,
      message,
      timestamp: Date.now(),
      ...metadata,
    };

    this.emit(event);
  }

  /**
   * Emit an error event
   * 
   * @param {string} message - Error message
   * @param {Error} [error] - Optional Error object
   * @param {Object} [metadata] - Additional metadata
   */
  error(message, error = null, metadata = {}) {
    const event = {
      type: 'error',
      message,
      timestamp: Date.now(),
      ...metadata,
    };

    if (error) {
      event.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.emit(event);
  }

  /**
   * Emit a completion event
   * 
   * @param {string} message - Completion message
   * @param {Object} [result] - Optional result data
   */
  complete(message, result = null) {
    const event = {
      type: 'complete',
      message,
      timestamp: Date.now(),
    };

    if (result) {
      event.result = result;
    }

    this.emit(event);
  }

  /**
   * Emit an event to the callback
   * 
   * @private
   * @param {Object} event - Event object
   */
  emit(event) {
    if (this.callback && typeof this.callback === 'function') {
      this.callback(event);
    }
  }

  /**
   * Format event data for SSE protocol
   * 
   * @param {Object} event - Event object
   * @returns {string} Formatted SSE message
   */
  formatForSSE(event) {
    // SSE format: data: <json>\n\n
    const jsonData = JSON.stringify(event);
    return `data: ${jsonData}\n\n`;
  }

  /**
   * Create a console logger (logs to stdout)
   * 
   * @static
   * @returns {SSELogger} Logger instance that logs to console
   */
  static createConsoleLogger() {
    return new SSELogger((event) => {
      const timestamp = new Date(event.timestamp).toISOString();
      const prefix = `[${timestamp}] [${event.type.toUpperCase()}]`;

      switch (event.type) {
        case 'log':
          console.log(`${prefix} [${event.level.toUpperCase()}]`, event.message);
          break;
        case 'progress':
          console.log(`${prefix} ${event.percentage}% - ${event.message}`);
          break;
        case 'error':
          console.error(`${prefix}`, event.message, event.error || '');
          break;
        case 'complete':
          console.log(`${prefix}`, event.message);
          break;
        default:
          console.log(`${prefix}`, event);
      }
    });
  }

  /**
   * Create a silent logger (no output)
   * 
   * @static
   * @returns {SSELogger} Logger instance that produces no output
   */
  static createSilentLogger() {
    return new SSELogger(null);
  }
}

export default SSELogger;