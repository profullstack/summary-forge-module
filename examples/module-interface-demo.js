/**
 * Module Interface Demo
 * 
 * Demonstrates different ways to import and use the summary-forge module
 */

// Method 1: Named imports (recommended for most use cases)
import { 
  SummaryForge, 
  extractFlashcards, 
  generateFlashcardsPDF,
  loadConfig,
  saveConfig,
  hasConfig,
  getConfigPath
} from '../src/index.js';

// Method 2: Default import
import SummaryForgeDefault from '../src/index.js';

// Method 3: Namespace import
import * as SummaryForgeModule from '../src/index.js';

console.log('=== Summary Forge Module Interface Demo ===\n');

// Demonstrate that all import methods work
console.log('1. Named Import:');
console.log('   - SummaryForge class:', typeof SummaryForge);
console.log('   - extractFlashcards:', typeof extractFlashcards);
console.log('   - loadConfig:', typeof loadConfig);

console.log('\n2. Default Import:');
console.log('   - SummaryForge (default):', typeof SummaryForgeDefault);
console.log('   - Same as named?', SummaryForgeDefault === SummaryForge);

console.log('\n3. Namespace Import:');
console.log('   - SummaryForge:', typeof SummaryForgeModule.SummaryForge);
console.log('   - extractFlashcards:', typeof SummaryForgeModule.extractFlashcards);
console.log('   - Same as named?', SummaryForgeModule.SummaryForge === SummaryForge);

// Create an instance using named import
console.log('\n=== Creating Instance ===\n');

const forge = new SummaryForge({
  openaiApiKey: process.env.OPENAI_API_KEY || 'demo-key',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  rainforestApiKey: process.env.RAINFOREST_API_KEY,
  maxChars: 400000,
  maxTokens: 16000
});

console.log('✓ Instance created successfully');
console.log('  - OpenAI API Key:', forge.openaiApiKey ? '✓ Set' : '✗ Not set');
console.log('  - ElevenLabs API Key:', forge.elevenlabsApiKey ? '✓ Set' : '✗ Not set');
console.log('  - Rainforest API Key:', forge.rainforestApiKey ? '✓ Set' : '✗ Not set');
console.log('  - Max Characters:', forge.maxChars);
console.log('  - Max Tokens:', forge.maxTokens);

// Demonstrate utility functions
console.log('\n=== Utility Functions ===\n');

// Config path
const configPath = getConfigPath();
console.log('Config Path:', configPath);

// Check if config exists
const configExists = await hasConfig();
console.log('Config Exists:', configExists);

// Demonstrate flashcard extraction
console.log('\n=== Flashcard Extraction ===\n');

const sampleMarkdown = `
# Sample Flashcards

**Q: What is Node.js?**
A: Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine.

**Q: What is ESM?**
A: ESM (ECMAScript Modules) is the official standard format for JavaScript modules.

**Q: What is Vitest?**
A: Vitest is a blazing fast unit test framework powered by Vite.
`;

const flashcards = extractFlashcards(sampleMarkdown);
console.log(`Extracted ${flashcards.length} flashcards:`);
flashcards.forEach((card, index) => {
  console.log(`\n${index + 1}. Q: ${card.question}`);
  console.log(`   A: ${card.answer}`);
});

// Demonstrate filename sanitization
console.log('\n=== Filename Sanitization ===\n');

const testFilenames = [
  'A Philosophy of Software Design, 2nd Edition.pdf',
  'Clean Code: A Handbook of Agile Software Craftsmanship.epub',
  'The Pragmatic Programmer (2nd Edition) -- David Thomas.pdf'
];

testFilenames.forEach(filename => {
  const sanitized = forge.sanitizeFilename(filename);
  console.log(`Original: ${filename}`);
  console.log(`Sanitized: ${sanitized}\n`);
});

// Show available methods
console.log('=== Available Methods ===\n');

const methods = [
  'sanitizeFilename',
  'fileExists',
  'getAnnasArchiveUrl',
  'searchBookByTitle',
  'downloadFromAnnasArchive',
  'convertEpubToPdf',
  'generateSummary',
  'generateAudio',
  'generateOutputFiles',
  'createBundle',
  'processFile'
];

methods.forEach(method => {
  const exists = typeof forge[method] === 'function';
  console.log(`  ${exists ? '✓' : '✗'} ${method}`);
});

console.log('\n=== Demo Complete ===\n');
console.log('To use this module in your project:');
console.log('  1. Install: pnpm add @profullstack/summary-forge-module');
console.log('  2. Import: import { SummaryForge } from "@profullstack/summary-forge-module"');
console.log('  3. Create instance with your API keys');
console.log('  4. Call processFile() or other methods\n');