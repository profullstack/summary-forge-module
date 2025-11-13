#!/usr/bin/env node

/**
 * Debug script to test 1lib.sk search functionality
 * This will help diagnose why searches are returning no results
 */

import { SummaryForge } from './src/summary-forge.js';

const forge = new SummaryForge({
  openaiApiKey: process.env.OPENAI_API_KEY || 'test',
  enableProxy: true,
  proxyUrl: process.env.PROXY_URL,
  proxyUsername: process.env.PROXY_USERNAME,
  proxyPassword: process.env.PROXY_PASSWORD,
  proxyPoolSize: 36,
  headless: false // Set to false to see what's happening
});

console.log('🔍 Testing 1lib.sk search with query: "programming react next"');
console.log('📋 Configuration:');
console.log('  - Proxy enabled:', forge.enableProxy);
console.log('  - Proxy URL:', forge.proxyUrl ? 'configured' : 'NOT configured');
console.log('  - Headless:', forge.headless);
console.log('');

try {
  const result = await forge.search1lib('programming react next', {
    maxResults: 5
  });
  
  console.log('📊 Search Result:');
  console.log('  - Success:', result.success);
  console.log('  - Count:', result.count);
  console.log('  - Results length:', result.results?.length || 0);
  console.log('  - Query:', result.query);
  
  if (result.error) {
    console.log('  - Error:', result.error);
  }
  
  if (result.results && result.results.length > 0) {
    console.log('\n📚 First result:');
    console.log(JSON.stringify(result.results[0], null, 2));
  } else {
    console.log('\n⚠️  No results found!');
  }
  
  console.log('\n✅ Test complete');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}