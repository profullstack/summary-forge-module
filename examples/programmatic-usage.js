/**
 * Example: Using Summary Forge programmatically with JSON API
 *
 * This shows how to use Summary Forge as an ESM module with the new JSON return format.
 * All methods now return { success, ...data, error?, message? } for consistent error handling.
 */

import { SummaryForge } from '@profullstack/summary-forge-module';

// Example 1: Basic usage with JSON error handling
async function example1() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY
  });
  
  const result = await forge.processFile('./my-book.pdf');
  
  if (result.success) {
    console.log('✅ Summary created:', result.archive);
    console.log('📁 Directory:', result.directory);
    console.log('💰 Costs:', result.costs);
  } else {
    console.error('❌ Processing failed:', result.error);
  }
}

// Example 2: Search with JSON response
async function example2() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    rainforestApiKey: process.env.RAINFOREST_API_KEY
  });
  
  const searchResult = await forge.searchBookByTitle('Clean Code');
  
  if (searchResult.success) {
    console.log(`✅ Found ${searchResult.count} books`);
    console.log('Books:', searchResult.results.map(b => ({
      title: b.title,
      author: b.author,
      asin: b.asin
    })));
  } else {
    console.error('❌ Search failed:', searchResult.error);
  }
}

// Example 3: Download with error handling
async function example3() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    enableProxy: true,
    proxyUrl: process.env.PROXY_URL,
    proxyUsername: process.env.PROXY_USERNAME,
    proxyPassword: process.env.PROXY_PASSWORD
  });
  
  const downloadResult = await forge.downloadFromAnnasArchive('B075HYVHWK', '.');
  
  if (downloadResult.success) {
    console.log('✅ Downloaded:', downloadResult.filepath);
    console.log('📖 Title:', downloadResult.title);
    console.log('📊 Format:', downloadResult.format);
    
    // Process the downloaded file
    const processResult = await forge.processFile(downloadResult.filepath, downloadResult.asin);
    
    if (processResult.success) {
      console.log('✅ Summary created:', processResult.archive);
      console.log('💰 Total costs:', processResult.costs.total);
    } else {
      console.error('❌ Processing failed:', processResult.error);
    }
  } else {
    console.error('❌ Download failed:', downloadResult.error);
  }
}

// Example 4: Generate summary with method detection
async function example4() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    maxChars: 500000,
    maxTokens: 20000
  });
  
  const summaryResult = await forge.generateSummary('./large-book.pdf');
  
  if (summaryResult.success) {
    console.log('✅ Summary generated');
    console.log('📝 Length:', summaryResult.length, 'characters');
    console.log('🔧 Method:', summaryResult.method);
    if (summaryResult.chunks) {
      console.log('📦 Chunks processed:', summaryResult.chunks);
    }
    console.log('Preview:', summaryResult.markdown.substring(0, 200) + '...');
  } else {
    console.error('❌ Summary generation failed:', summaryResult.error);
  }
}

// Example 5: Audio generation with fallback
async function example5() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY
  });
  
  const scriptResult = await forge.generateAudioScript('# Summary\n\nThis is a test summary.');
  
  if (scriptResult.success) {
    console.log('✅ Audio script generated:', scriptResult.length, 'characters');
    
    const audioResult = await forge.generateAudio(scriptResult.script, './output.mp3');
    
    if (audioResult.success) {
      console.log('✅ Audio generated:', audioResult.path);
      console.log('📊 Size:', (audioResult.size / 1024 / 1024).toFixed(2), 'MB');
      console.log('⏱️  Duration:', audioResult.duration, 'minutes (estimated)');
    } else {
      console.error('❌ Audio generation failed:', audioResult.error);
    }
  }
}

// Run examples
// example1().catch(console.error);
// example2().catch(console.error);
// example3().catch(console.error);
// example4().catch(console.error);
// example5().catch(console.error);