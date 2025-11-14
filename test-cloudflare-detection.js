#!/usr/bin/env node

/**
 * Test script for Cloudflare detection and 2captcha solving
 */

import { SummaryForge } from './src/summary-forge.js';
import { loadConfig } from './src/utils/config.js';

async function test() {
  console.log('🧪 Testing Cloudflare Detection and 2captcha Integration\n');
  
  // Load config
  const result = await loadConfig();
  
  if (!result.success || !result.config) {
    console.error('❌ No configuration found. Run "summary setup" first.');
    process.exit(1);
  }
  
  const config = result.config;
  
  console.log('📋 Configuration:');
  console.log(`   OpenAI API Key: ${config.openaiApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   2Captcha API Key: ${config.twocaptchaApiKey ? '✅ Set (' + config.twocaptchaApiKey.slice(0, 8) + '...)' : '❌ Missing'}`);
  console.log(`   Proxy Enabled: ${config.enableProxy ? '✅ Yes' : '❌ No'}`);
  if (config.enableProxy) {
    console.log(`   Proxy URL: ${config.proxyUrl}`);
    console.log(`   Proxy Username: ${config.proxyUsername}`);
  }
  console.log('');
  
  if (!config.twocaptchaApiKey) {
    console.error('❌ 2Captcha API key not configured!');
    console.log('   Run: summary setup');
    console.log('   And enter your 2Captcha API key when prompted.');
    process.exit(1);
  }
  
  if (!config.enableProxy) {
    console.warn('⚠️  Proxy not enabled. 1lib.sk may block direct access.');
    console.log('   Run: summary config --proxy true');
  }
  
  console.log('🔍 Testing search on 1lib.sk...\n');
  
  const forge = new SummaryForge(config);
  
  try {
    const results = await forge.search1lib('JavaScript', {
      maxResults: 3,
      extensions: ['PDF']
    });
    
    console.log('\n✅ Search completed!');
    console.log(`📚 Found ${results.results?.length || 0} results`);
    
    if (results.results && results.results.length > 0) {
      console.log('\nFirst result:');
      console.log(`   Title: ${results.results[0].title}`);
      console.log(`   Format: ${results.results[0].extension}`);
      console.log(`   Size: ${results.results[0].size}`);
    }
    
  } catch (error) {
    console.error('\n❌ Search failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

test().catch(console.error);