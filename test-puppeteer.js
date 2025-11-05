#!/usr/bin/env node
/**
 * test2.js - Puppeteer with 2captcha integration
 * 
 * Fetches pages using Puppeteer and automatically solves CAPTCHAs using 2captcha.com
 * 
 * Usage:
 *   node test2.js <url>
 * 
 * Environment variables:
 *   TWOCAPTCHA_API_KEY - Your 2captcha.com API key
 *   OUT_DIR - Output directory (default: current directory)
 */

import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const url = process.argv[2];
if (!url) {
  console.error("Usage: node test2.js <url>");
  console.error("Example: node test2.js https://annas-archive.org/slow_download/78d6365edb0e3b98028a73d0b117b7e8/0/4");
  process.exit(1);
}

const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;
const OUT_DIR = process.env.OUT_DIR || process.cwd();

if (!TWOCAPTCHA_API_KEY) {
  console.error("Missing TWOCAPTCHA_API_KEY in .env file.");
  console.error("Add: TWOCAPTCHA_API_KEY=your-key-here");
  process.exit(1);
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

function extractLinks(html) {
  const regex = /href=["']([^"']+\.(?:pdf|epub)(?:\?[^"']*)?)["']/gi;
  const out = new Set();
  let m;
  while ((m = regex.exec(html))) {
    let link = m[1];
    try {
      link = new URL(link, url).toString();
    } catch {}
    out.add(link);
  }
  return Array.from(out);
}

async function writeArtifacts(title, html) {
  const pagePath = path.join(OUT_DIR, "page.html");
  const titlePath = path.join(OUT_DIR, "page.title.txt");
  const previewPath = path.join(OUT_DIR, "page.preview.txt");

  await fs.writeFile(pagePath, html, "utf8");
  await fs.writeFile(titlePath, (title || "").trim() + "\n", "utf8");

  const preview = html.replace(/\s+/g, " ").slice(0, 300);
  await fs.writeFile(previewPath, preview + (html.length > 300 ? "..." : "") + "\n", "utf8");

  return { pagePath, titlePath, previewPath };
}

async function solveCaptcha(page) {
  console.log("🔍 Checking for CAPTCHA...");
  
  // Check if there's a CAPTCHA on the page (DDoS-Guard, hCaptcha, etc.)
  const captchaInfo = await page.evaluate(() => {
    const bodyHTML = document.body.innerHTML;
    const hasDdgCaptcha = bodyHTML.includes("ddg-captcha") ||
                          bodyHTML.includes("checking your browser") ||
                          bodyHTML.includes("DDoS-Guard") ||
                          bodyHTML.includes("complete the manual check");
    
    if (!hasDdgCaptcha) {
      return { hasCaptcha: false };
    }

    // Try to find the sitekey from various possible locations
    let sitekey = null;
    
    // Method 1: data-callback attribute
    const captchaDiv = document.querySelector('[data-callback="ddgCaptchaCallback"]');
    if (captchaDiv) {
      sitekey = captchaDiv.getAttribute('data-sitekey');
    }
    
    // Method 2: Look for hCaptcha iframe
    if (!sitekey) {
      const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
      if (hcaptchaIframe) {
        const src = hcaptchaIframe.getAttribute('src');
        const match = src.match(/sitekey=([^&]+)/);
        if (match) sitekey = match[1];
      }
    }
    
    // Method 3: Look in script tags
    if (!sitekey) {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        const match = script.textContent.match(/sitekey["\s:=]+["']([^"']+)["']/i);
        if (match) {
          sitekey = match[1];
          break;
        }
      }
    }

    return {
      hasCaptcha: true,
      sitekey,
      captchaType: captchaDiv ? 'ddos-guard' : 'hcaptcha'
    };
  });

  if (!captchaInfo.hasCaptcha) {
    console.log("✅ No CAPTCHA detected");
    return false;
  }

  console.log(`🤖 ${captchaInfo.captchaType.toUpperCase()} CAPTCHA detected! Attempting to solve with 2captcha...`);

  if (!captchaInfo.sitekey) {
    console.error("❌ Could not find CAPTCHA sitekey");
    return false;
  }

  console.log("🔑 Sitekey:", captchaInfo.sitekey);

  // Submit CAPTCHA to 2captcha
  const submitUrl = `https://2captcha.com/in.php?key=${TWOCAPTCHA_API_KEY}&method=hcaptcha&sitekey=${captchaInfo.sitekey}&pageurl=${encodeURIComponent(page.url())}`;
  
  console.log("📤 Submitting CAPTCHA to 2captcha...");
  const submitResponse = await fetch(submitUrl);
  const submitText = await submitResponse.text();
  
  if (!submitText.startsWith("OK|")) {
    console.error("❌ 2captcha submission failed:", submitText);
    return false;
  }

  const captchaId = submitText.split("|")[1];
  console.log("⏳ CAPTCHA ID:", captchaId, "- waiting for solution...");

  // Poll for solution
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const resultUrl = `https://2captcha.com/res.php?key=${TWOCAPTCHA_API_KEY}&action=get&id=${captchaId}`;
    const resultResponse = await fetch(resultUrl);
    const resultText = await resultResponse.text();
    
    if (resultText === "CAPCHA_NOT_READY") {
      attempts++;
      process.stdout.write(".");
      continue;
    }
    
    if (resultText.startsWith("OK|")) {
      const solution = resultText.split("|")[1];
      console.log("\n✅ CAPTCHA solved!");
      
      // Inject the solution into the page
      await page.evaluate((token) => {
        // Find the callback function and call it
        if (window.ddgCaptchaCallback) {
          window.ddgCaptchaCallback(token);
        }
        // Also try to set the response directly
        const textarea = document.querySelector('[name="h-captcha-response"]') || 
                        document.querySelector('[name="g-recaptcha-response"]');
        if (textarea) {
          textarea.value = token;
        }
      }, solution);
      
      // Wait a bit for the page to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return true;
    }
    
    console.error("\n❌ 2captcha error:", resultText);
    return false;
  }
  
  console.error("\n❌ CAPTCHA solving timeout");
  return false;
}

(async () => {
  await ensureOutDir();

  console.log("🚀 Launching Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  
  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("🌐 Navigating to:", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait 10 seconds for DDoS-Guard page to load CAPTCHA or auto-redirect
  console.log("⏳ Waiting 10 seconds for DDoS-Guard CAPTCHA/redirect...");
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Check and solve CAPTCHA if present
  const captchaSolved = await solveCaptcha(page);
  
  if (captchaSolved) {
    console.log("⏳ Waiting for page to reload after CAPTCHA...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {
      console.log("⚠️ No navigation detected after CAPTCHA solve");
    });
    
    // Wait another 10 seconds after solving for any additional redirects
    console.log("⏳ Waiting 10 seconds for post-CAPTCHA redirect...");
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  // Get final page content
  const title = await page.title();
  const html = await page.content();

  await browser.close();

  const { pagePath, titlePath, previewPath } = await writeArtifacts(title, html);
  console.log("💾 Saved:", pagePath);
  console.log("💾 Saved:", titlePath);
  console.log("💾 Saved:", previewPath);

  // Check if we still have a CAPTCHA page
  const isCaptcha = /checking your browser/i.test(html) || 
                    /ddg-captcha/i.test(html) ||
                    /complete the manual check/i.test(html);

  if (isCaptcha) {
    console.error("\n❌ Still on CAPTCHA page after solving attempt");
    console.error("The CAPTCHA may not have been solved correctly.");
    process.exit(3);
  }

  const links = extractLinks(html);
  if (links.length) {
    console.log("\n🔎 Found candidate .pdf/.epub links:");
    for (const l of links) console.log("  -", l);
  } else {
    console.log("\n⚠️ No .pdf/.epub links found in rendered HTML.");
  }
})().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(2);
});