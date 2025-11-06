#!/usr/bin/env node

/**
 * Test Webshare proxy authentication formats
 */

import puppeteer from 'puppeteer';
import { loadConfig } from './src/utils/config.js';

async function testAuth() {
  const config = await loadConfig();
  
  if (!config || !config.enableProxy) {
    console.error('❌ Proxy not configured. Run: summary setup');
    process.exit(1);
  }
  
  console.log('\n📋 Testing Webshare Authentication Formats\n');
  console.log(`Proxy URL: ${config.proxyUrl}`);
  console.log(`Base Username: ${config.proxyUsername}`);
  console.log(`Password: ${config.proxyPassword.substring(0, 4)}...`);
  
  const sessionId = Math.round(Math.random() * 1000000);
  console.log(`Session ID: ${sessionId}\n`);
  
  // Test different username formats
  const formats = [
    { name: 'Original', username: config.proxyUsername },
    { name: 'With session appended', username: `${config.proxyUsername}-${sessionId}` },
    { name: 'Remove -rotate, add session', username: config.proxyUsername.replace(/-rotate$/, `-${sessionId}`) },
    { name: 'Base only + session', username: `dmdgluqz-US-${sessionId}` },
  ];
  
  for (const format of formats) {
    console.log(`\n🧪 Testing: ${format.name}`);
    console.log(`   Username: ${format.username}`);
    
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          `--proxy-server=${config.proxyUrl}`,
          '--disable-quic',
          '--no-sandbox'
        ]
      });
      
      const page = await browser.newPage();
      await page.authenticate({
        username: format.username,
        password: config.proxyPassword
      });
      
      await page.goto('https://ipv4.webshare.io/', { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });
      
      const ip = await page.evaluate(() => document.body.innerText.trim());
      console.log(`   ✅ SUCCESS! IP: ${ip}`);
      
      await browser.close();
      
      console.log(`\n🎉 Working format: ${format.name}`);
      console.log(`   Use username: ${format.username}`);
      break;
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message.substring(0, 100)}`);
    }
  }
}

testAuth().catch(console.error);