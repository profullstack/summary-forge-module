/**
 * Example: Using Summary Forge as an ESM Module
 * 
 * This demonstrates how to use Summary Forge programmatically in your Node.js application
 */

import { SummaryForge } from '../src/index.js';

async function example() {
  // Initialize with API keys (no .env needed when using as a module)
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY || 'your-openai-key',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || 'your-elevenlabs-key',
    rainforestApiKey: process.env.RAINFOREST_API_KEY || 'your-rainforest-key',
    twocaptchaApiKey: process.env.TWOCAPTCHA_API_KEY || 'your-2captcha-key',
    
    // Optional configuration
    headless: true,
    maxTokens: 16000,
    voiceId: 'nPczCjzI2devNBz1zQrb' // Brian voice for technical content
  });

  try {
    console.log('🚀 Processing book...\n');
    
    // Process a local PDF or EPUB file
    const result = await forge.processFile('./path/to/book.pdf');
    
    console.log('\n✅ Processing complete!');
    console.log('\n📁 Output directory:', result.directory);
    console.log('\n📚 Generated files:');
    result.files.forEach(file => console.log(`  - ${file}`));
    
    console.log('\n💰 Cost breakdown:');
    console.log(`  OpenAI: ${result.costs.openai}`);
    console.log(`  ElevenLabs: ${result.costs.elevenlabs}`);
    console.log(`  Rainforest: ${result.costs.rainforest}`);
    console.log(`  Total: ${result.costs.total}`);
    
    console.log('\n📦 Bundle:', result.archive);
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Alternative: Download from Anna's Archive by ASIN
async function downloadAndProcess() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    twocaptchaApiKey: process.env.TWOCAPTCHA_API_KEY
  });

  try {
    // Download book from Anna's Archive
    const downloadResult = await forge.downloadFromAnnasArchive(
      'B08XYZ1234', // ASIN
      './downloads',
      'Clean Code' // Optional: book title
    );
    
    console.log('📥 Downloaded:', downloadResult.filepath);
    
    // Process the downloaded file
    const result = await forge.processFile(downloadResult.filepath);
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Alternative: Search and download by title
async function searchAndProcess() {
  const forge = new SummaryForge({
    openaiApiKey: process.env.OPENAI_API_KEY,
    rainforestApiKey: process.env.RAINFOREST_API_KEY,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    twocaptchaApiKey: process.env.TWOCAPTCHA_API_KEY
  });

  try {
    // Search for book on Amazon
    const searchResults = await forge.searchBookByTitle('Clean Code');
    console.log('🔍 Found books:', searchResults.length);
    
    const firstResult = searchResults[0];
    console.log('📖 Selected:', firstResult.title);
    console.log('🔑 ASIN:', firstResult.asin);
    
    // Download from Anna's Archive
    const downloadResult = await forge.downloadFromAnnasArchive(
      firstResult.asin,
      './downloads',
      firstResult.title
    );
    
    // Process the book
    const result = await forge.processFile(downloadResult.filepath);
    
    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run example (uncomment the one you want to try)
// example().catch(console.error);
// downloadAndProcess().catch(console.error);
// searchAndProcess().catch(console.error);

export { example, downloadAndProcess, searchAndProcess };