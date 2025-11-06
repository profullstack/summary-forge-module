/**
 * Summary Forge - Main ESM Entry Point
 * 
 * A comprehensive tool for creating AI-powered book summaries with multiple output formats
 * 
 * @example
 * ```javascript
 * import { SummaryForge } from 'summary-forge';
 * 
 * const forge = new SummaryForge({
 *   openaiApiKey: 'your-key',
 *   elevenlabsApiKey: 'your-key',
 *   rainforestApiKey: 'your-key'
 * });
 * 
 * const result = await forge.processFile('./book.pdf');
 * console.log('Generated files:', result.files);
 * ```
 */

export { SummaryForge } from './summary-forge.js';
export { extractFlashcards, generateFlashcardsPDF } from './flashcards.js';

// Re-export as default for convenience
export { SummaryForge as default } from './summary-forge.js';