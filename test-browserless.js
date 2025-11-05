#!/usr/bin/env node
/**
 * Test Browserless.io access to Anna's Archive
 */

import dotenv from 'dotenv';
dotenv.config();

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const TEST_URL = "https://annas-archive.org/slow_download/78d6365edb0e3b98028a73d0b117b7e8/1/5";

async function testBrowserless() {
  console.log(`🧪 Testing Browserless.io access to:`);
  console.log(`   ${TEST_URL}\n`);

  const endpoint = "https://production-sfo.browserless.io/chromium/bql";
  
  const queryPayload = {
    query: `
    mutation GetPage($url: String!) {
      goto(url: $url, waitUntil: networkIdle) {
        status
        url
        time
      }
      waitForTimeout(time: 15000) {
        time
      }
      html {
        html
        time
      }
      title {
        title
      }
    }`,
    variables: { url: TEST_URL }
  };
  
  console.log(`📤 Sending query to Browserless.io...`);
  
  const response = await fetch(`${endpoint}?token=${BROWSERLESS_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(queryPayload)
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error(`❌ GraphQL errors:`, JSON.stringify(data.errors, null, 2));
    return;
  }

  console.log(`\n✅ Success!`);
  console.log(`📖 Page title: ${data.data.title?.title}`);
  console.log(`🔗 Final URL: ${data.data.goto?.url}`);
  console.log(`⏱️  Load time: ${data.data.goto?.time}ms`);
  console.log(`📄 HTML length: ${data.data.html?.html?.length} chars`);
  console.log(`\n📄 HTML preview:`);
  console.log(data.data.html?.html?.substring(0, 1000));
  console.log(`\n🔍 Looking for download URLs...`);
  
  const html = data.data.html?.html || '';
  const urlPattern = /https?:\/\/[^\s"'<>]+\.(?:epub|pdf)/gi;
  const matches = html.match(urlPattern);
  
  if (matches) {
    console.log(`✅ Found ${matches.length} download URLs:`);
    matches.forEach((url, idx) => {
      console.log(`   ${idx + 1}. ${url}`);
    });
  } else {
    console.log(`⚠️  No .epub or .pdf URLs found`);
  }
}

testBrowserless().catch(console.error);