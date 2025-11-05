/**
 * Example: Using Summary Forge programmatically
 * 
 * This shows how to use Summary Forge as an ESM module in your own code
 */

import { SummaryForge } from 'summary-forge';

// Example 1: Basic usage with environment variables
async function example1() {
  // API keys will be read from environment variables
  const forge = new SummaryForge();
  
  const result = await forge.processFile('./my-book.pdf');
  console.log('Summary created:', result.archive);
}

// Example 2: Passing API keys directly
async function example2() {
  const forge = new SummaryForge({
    openaiApiKey: 'sk-...',
    rainforestApiKey: 'your-key-here'
  });
  
  const result = await forge.processFile('./my-book.epub');
  console.log('Files created:', result.files);
}

// Example 3: Search for a book
async function example3() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    rainforestApiKey: process.env.RAINFOREST_API_KEY
  });
  
  const results = await forge.searchBookByTitle('Clean Code');
  console.log('Found books:', results.map(b => ({
    title: b.title,
    author: b.author,
    asin: b.asin
  })));
  
  // Get Anna's Archive URL for first result
  const url = forge.getAnnasArchiveUrl(results[0].asin);
  console.log('Download from:', url);
}

// Example 4: Custom options
async function example4() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    maxChars: 500000,  // Process more text
    maxTokens: 20000   // Generate longer summaries
  });
  
  const result = await forge.processFile('./large-book.pdf');
  console.log('Summary:', result.markdown.substring(0, 200) + '...');
}

// Run examples
// example1().catch(console.error);
// example2().catch(console.error);
// example3().catch(console.error);
// example4().catch(console.error);