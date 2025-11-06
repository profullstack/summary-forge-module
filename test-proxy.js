#!/usr/bin/env node

/**
 * Test script to verify proxy configuration for Anna's Archive downloads
 * 
 * Usage:
 *   node test-proxy.js <ASIN>
 * 
 * Example:
 *   node test-proxy.js B0BCTMXNVN
 */

import { SummaryForge } from './src/summary-forge.js';
import { loadConfig } from './src/utils/config.js';

async function testProxy() {
  const asin = process.argv[2];
  
  if (!asin) {
    console.error('❌ Error: Please provide an ASIN');
    console.log('Usage: node test-proxy.js <ASIN>');
    console.log('Example: node test-proxy.js B0BCTMXNVN');
    process.exit(1);
  }
  
  console.log('🔧 Loading configuration...');
  const config = await loadConfig();
  
  if (!config) {
    console.error('❌ Error: No configuration found. Please run "summary setup" first.');
    process.exit(1);
  }
  
  console.log('\n📋 Configuration Status:');
  console.log(`   OpenAI API Key: ${config.openaiApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Proxy Enabled: ${config.enableProxy ? '✅ Yes' : '❌ No'}`);
  
  if (config.enableProxy) {
    console.log(`   Proxy URL: ${config.proxyUrl || '❌ Missing'}`);
    console.log(`   Proxy Username: ${config.proxyUsername ? '✅ Set' : '❌ Missing'}`);
    console.log(`   Proxy Password: ${config.proxyPassword ? '✅ Set' : '❌ Missing'}`);
  }
  
  console.log(`   Headless Mode: ${config.headless ? 'Yes' : 'No'}`);
  
  if (!config.enableProxy) {
    console.log('\n⚠️  Warning: Proxy is not enabled. This test will use direct connection.');
    console.log('   To enable proxy, run: summary setup');
  }
  
  console.log(`\n🚀 Testing download for ASIN: ${asin}`);
  console.log('   This will attempt to download from Anna\'s Archive...\n');
  
  try {
    const forge = new SummaryForge(config);
    
    console.log('📚 Starting download test...');
    const result = await forge.downloadFromAnnasArchive(asin, '.', 'Test Book');
    
    console.log('\n✅ Download test successful!');
    console.log(`   File: ${result.filepath}`);
    console.log(`   Format: ${result.format}`);
    console.log(`   Size: ${(await import('fs').then(fs => fs.promises.stat(result.filepath))).size / 1024 / 1024} MB`);
    
    if (config.enableProxy) {
      console.log('\n🎉 Proxy configuration is working correctly!');
    }
    
  } catch (error) {
    console.error('\n❌ Download test failed:', error.message);
    
    if (config.enableProxy) {
      console.log('\n🔍 Troubleshooting tips:');
      console.log('   1. Verify proxy URL format: http://proxy.example.com:8080');
      console.log('   2. Check proxy credentials are correct');
      console.log('   3. Ensure proxy server is accessible');
      console.log('   4. Try with headless: false to see browser behavior');
    } else {
      console.log('\n💡 Tip: Enable proxy to avoid IP bans from Anna\'s Archive');
      console.log('   Run: summary setup');
    }
    
    process.exit(1);
  }
}

testProxy().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});