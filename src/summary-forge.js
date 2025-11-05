/**
 * Summary Forge - Core Module
 * 
 * An intelligent tool that uses AI to create comprehensive summaries of technical books
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { ElevenLabsClient } from "elevenlabs";
import puppeteer from "puppeteer";
import dotenv from "dotenv";

dotenv.config();

const API_MODEL = "gpt-5";

/**
 * Summary Forge class for creating book summaries
 */
export class SummaryForge {
  constructor(options = {}) {
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.rainforestApiKey = options.rainforestApiKey || process.env.RAINFOREST_API_KEY;
    this.elevenlabsApiKey = options.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
    this.twocaptchaApiKey = options.twocaptchaApiKey || process.env.TWOCAPTCHA_API_KEY;
    
    // Browser configuration
    this.headless = options.headless !== undefined ? options.headless : (process.env.HEADLESS !== 'false');
    
    // Proxy configuration
    this.enableProxy = options.enableProxy !== undefined ? options.enableProxy : (process.env.ENABLE_PROXY === 'true');
    this.proxyUrl = options.proxyUrl || process.env.PROXY_URL;
    this.proxyUsername = options.proxyUsername || process.env.PROXY_USERNAME;
    this.proxyPassword = options.proxyPassword || process.env.PROXY_PASSWORD;
    
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }
    
    this.openai = new OpenAI({ apiKey: this.openaiApiKey });
    this.maxChars = options.maxChars || 400000;
    this.maxTokens = options.maxTokens || 16000;
    
    // Initialize ElevenLabs client if API key is provided
    if (this.elevenlabsApiKey) {
      this.elevenlabs = new ElevenLabsClient({ apiKey: this.elevenlabsApiKey });
    }
    
    // ElevenLabs voice settings
    this.voiceId = options.voiceId || "nPczCjzI2devNBz1zQrb"; // Default: Brian voice (best for technical books)
    this.voiceSettings = options.voiceSettings || {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true
    };
    
    // Cost tracking
    this.costs = {
      openai: 0,
      elevenlabs: 0,
      rainforest: 0,
      total: 0
    };
    
    // API pricing (approximate, in USD)
    this.pricing = {
      openai: {
        inputPerMillion: 2.50,   // GPT-5 input tokens
        outputPerMillion: 10.00  // GPT-5 output tokens
      },
      elevenlabs: {
        perCharacter: 0.00003    // Turbo v2.5 pricing
      },
      rainforest: {
        perRequest: 0.01         // Per API request
      }
    };
  }

  /**
   * Calculate and track OpenAI costs
   */
  trackOpenAICost(usage) {
    const inputCost = (usage.prompt_tokens / 1000000) * this.pricing.openai.inputPerMillion;
    const outputCost = (usage.completion_tokens / 1000000) * this.pricing.openai.outputPerMillion;
    const cost = inputCost + outputCost;
    
    this.costs.openai += cost;
    this.costs.total += cost;
    
    return cost;
  }

  /**
   * Track ElevenLabs costs
   */
  trackElevenLabsCost(characterCount) {
    const cost = characterCount * this.pricing.elevenlabs.perCharacter;
    this.costs.elevenlabs += cost;
    this.costs.total += cost;
    return cost;
  }

  /**
   * Track Rainforest API costs
   */
  trackRainforestCost() {
    const cost = this.pricing.rainforest.perRequest;
    this.costs.rainforest += cost;
    this.costs.total += cost;
    return cost;
  }

  /**
   * Get cost summary
   */
  getCostSummary() {
    return {
      openai: `$${this.costs.openai.toFixed(4)}`,
      elevenlabs: `$${this.costs.elevenlabs.toFixed(4)}`,
      rainforest: `$${this.costs.rainforest.toFixed(4)}`,
      total: `$${this.costs.total.toFixed(4)}`,
      breakdown: {
        openai: this.costs.openai,
        elevenlabs: this.costs.elevenlabs,
        rainforest: this.costs.rainforest,
        total: this.costs.total
      }
    };
  }

  /**
   * Helper to create a clean filename
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/\.pdf$/i, '')
      .replace(/\.epub$/i, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  /**
   * Execute shell command
   */
  async sh(cmd, args = [], opts = {}) {
    return new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { stdio: "inherit", ...opts });
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    });
  }

  /**
   * Check if file exists
   */
  async fileExists(p) {
    try {
      await fsp.access(p, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * HTTP GET helper using fetch
   */
  async httpGet(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * Solve CAPTCHA using 2captcha service
   */
  async solveCaptcha(page) {
    if (!this.twocaptchaApiKey) {
      console.log("⚠️  2captcha API key not configured, skipping CAPTCHA solving");
      return false;
    }

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
    const submitUrl = `https://2captcha.com/in.php?key=${this.twocaptchaApiKey}&method=hcaptcha&sitekey=${captchaInfo.sitekey}&pageurl=${encodeURIComponent(page.url())}`;
    
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
      
      const resultUrl = `https://2captcha.com/res.php?key=${this.twocaptchaApiKey}&action=get&id=${captchaId}`;
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

  /**
   * Get download URL using Puppeteer with CAPTCHA solving
   */
  async getDownloadUrlWithPuppeteer(url, page) {
    console.log(`🌐 Navigating to download page: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait 15 seconds for DDoS-Guard page to load CAPTCHA or auto-redirect
    console.log("⏳ Waiting 15 seconds for DDoS-Guard CAPTCHA/redirect...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Check and solve CAPTCHA if present
    const captchaSolved = await this.solveCaptcha(page);
    
    if (captchaSolved) {
      console.log("⏳ Waiting for page to reload after CAPTCHA...");
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {
        console.log("⚠️ No navigation detected after CAPTCHA solve");
      });
      
      // Wait another 15 seconds after solving for any additional redirects
      console.log("⏳ Waiting 15 seconds for post-CAPTCHA redirect...");
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    
    // Wait for any dynamic content to load (JavaScript execution)
    console.log("⏳ Waiting 5 seconds for dynamic content to load...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait for network to be idle again after dynamic content
    await page.waitForNetworkIdle({ timeout: 10000 }).catch(() => {
      console.log("⚠️ Network did not become idle, continuing anyway...");
    });

    // Get final page content and URL
    const html = await page.content();
    const currentUrl = page.url();
    const pageTitle = await page.title();
    
    console.log(`📄 Page title: ${pageTitle}`);
    console.log(`🔗 Current URL: ${currentUrl}`);
    console.log(`📏 HTML length: ${html.length} characters`);
    
    // Save HTML to file for debugging (this is the actual download page now)
    const debugHtmlPath = '/tmp/annas-archive-download-page.html';
    try {
      await fsp.writeFile(debugHtmlPath, html, 'utf8');
      console.log(`💾 Saved download page HTML to ${debugHtmlPath} for debugging`);
    } catch (err) {
      console.log(`⚠️  Could not save debug HTML: ${err.message}`);
    }
    
    // Check if we still have a CAPTCHA or protection page
    const isCaptcha = /checking your browser/i.test(html) ||
                      /ddg-captcha/i.test(html) ||
                      /complete the manual check/i.test(html) ||
                      /cloudflare/i.test(html) ||
                      /just a moment/i.test(html);

    if (isCaptcha) {
      console.log("⚠️ Still on protection page, could not bypass");
      console.log(`   Page title: ${pageTitle}`);
      console.log(`   Current URL: ${currentUrl}`);
      return null;
    }
    
    console.log("🔍 Attempting to extract download URL...");
    
    // Try multiple methods to extract download URL
    
    // Method 1: Look for Anna's Archive specific download URL patterns
    console.log("   Method 1: Searching for Anna's Archive download URLs in DOM...");
    const downloadUrl = await page.evaluate(() => {
      const results = { method: null, url: null, debug: [] };
      
      // Method 1a: Look for URLs in bg-gray-200 spans (Anna's Archive style)
      const graySpans = document.querySelectorAll('span.bg-gray-200');
      results.debug.push(`Found ${graySpans.length} gray spans`);
      for (const span of graySpans) {
        const text = span.textContent.trim();
        results.debug.push(`Gray span text: ${text.substring(0, 100)}...`);
        if (text.startsWith('http') && (text.includes('.pdf') || text.includes('.epub'))) {
          results.method = '1a: gray span';
          results.url = text;
          return results;
        }
      }
      
      // Method 1b: Look for URLs in onclick attributes (copy buttons)
      const copyButtons = document.querySelectorAll('button[onclick*="clipboard.writeText"]');
      results.debug.push(`Found ${copyButtons.length} copy buttons`);
      for (const button of copyButtons) {
        const onclick = button.getAttribute('onclick');
        const urlMatch = onclick.match(/writeText\(['"]([^'"]+)['"]\)/);
        if (urlMatch) {
          results.debug.push(`Copy button URL: ${urlMatch[1].substring(0, 100)}...`);
          if (urlMatch[1].includes('.pdf') || urlMatch[1].includes('.epub')) {
            results.method = '1b: copy button';
            results.url = urlMatch[1];
            return results;
          }
        }
      }
      
      // Method 1c: Look for direct download links
      const downloadLink = document.querySelector('a[href*=".epub"]') ||
                          document.querySelector('a[href*=".pdf"]') ||
                          document.querySelector('a[download]');
      
      if (downloadLink) {
        results.method = '1c: direct link';
        results.url = downloadLink.href;
        results.debug.push(`Direct link found: ${downloadLink.href}`);
        return results;
      }
      
      // Method 1d: Look for meta refresh or redirect
      const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
      if (metaRefresh) {
        const content = metaRefresh.getAttribute('content');
        const urlMatch = content.match(/url=(.+)/i);
        if (urlMatch) {
          results.method = '1d: meta refresh';
          results.url = urlMatch[1];
          return results;
        }
      }
      
      return results;
    });
    
    // Log debug information
    if (downloadUrl.debug && downloadUrl.debug.length > 0) {
      console.log("   Debug info:");
      downloadUrl.debug.forEach(msg => console.log(`      ${msg}`));
    }
    
    if (downloadUrl.url && (downloadUrl.url.includes('.epub') || downloadUrl.url.includes('.pdf'))) {
      console.log(`   ✅ Found download URL via ${downloadUrl.method}: ${downloadUrl.url}`);
      return downloadUrl.url;
    }
    console.log("   ❌ No download URL found in DOM");
    
    // Method 2: Extract from HTML using regex - search for any HTTP/HTTPS URLs with .pdf or .epub
    console.log("   Method 2: Searching entire HTML body for download URLs...");
    
    // Try multiple regex patterns to catch URLs in different formats
    const patterns = [
      /https?:\/\/[^\s"'<>]+\.(?:epub|pdf)/gi,  // Standard URLs
      /https?:\/\/[^\s"'<>)]+\.(?:epub|pdf)/gi, // URLs before closing paren
      /https?:\/\/[^"'<>\s]+\.(?:epub|pdf)/gi,  // More permissive
    ];
    
    let allMatches = [];
    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches) {
        allMatches = allMatches.concat(matches);
      }
    }
    
    // Remove duplicates
    allMatches = [...new Set(allMatches)];
    
    if (allMatches.length > 0) {
      console.log(`   Found ${allMatches.length} potential download URLs in HTML`);
      
      // Filter out annas-archive.org URLs (we want external download servers)
      const externalUrls = allMatches.filter(url => !url.includes('annas-archive.org'));
      
      if (externalUrls.length > 0) {
        console.log(`   ✅ Found ${externalUrls.length} external download URLs:`);
        externalUrls.forEach((url, idx) => {
          const decoded = decodeURIComponent(url);
          console.log(`      ${idx + 1}. ${decoded.substring(0, 150)}${decoded.length > 150 ? '...' : ''}`);
        });
        return decodeURIComponent(externalUrls[0]);
      }
      
      // If no external URLs, use any URL we found
      console.log(`   ⚠️  No external URLs found, using first match:`);
      allMatches.forEach((url, idx) => {
        const decoded = decodeURIComponent(url);
        console.log(`      ${idx + 1}. ${decoded.substring(0, 150)}${decoded.length > 150 ? '...' : ''}`);
      });
      return decodeURIComponent(allMatches[0]);
    }
    console.log("   ❌ No download URLs found via regex");
    console.log(`   💡 Check ${debugHtmlPath} to see the actual HTML content`);
    
    // Method 3: Extract all text content and search for URLs
    console.log("   Method 3: Extracting all visible text and searching for URLs...");
    const pageText = await page.evaluate(() => document.body.innerText || document.body.textContent);
    
    const textUrlPattern = /https?:\/\/[^\s]+\.(?:epub|pdf)/gi;
    const textMatches = pageText.match(textUrlPattern);
    
    if (textMatches && textMatches.length > 0) {
      console.log(`   Found ${textMatches.length} URLs in page text:`);
      const externalTextUrls = textMatches.filter(url => !url.includes('annas-archive.org'));
      
      if (externalTextUrls.length > 0) {
        console.log(`   ✅ Found ${externalTextUrls.length} external URLs in text:`);
        externalTextUrls.forEach((url, idx) => {
          console.log(`      ${idx + 1}. ${url.substring(0, 150)}${url.length > 150 ? '...' : ''}`);
        });
        return externalTextUrls[0];
      }
    }
    console.log("   ❌ No URLs found in page text");
    
    // Method 4: Check if current URL is already a download URL
    console.log("   Method 4: Checking if current URL is download URL...");
    if (currentUrl.includes('.epub') || currentUrl.includes('.pdf')) {
      console.log(`   ✅ Current URL is download URL: ${currentUrl}`);
      return currentUrl;
    }
    console.log("   ❌ Current URL is not a download URL");
    
    console.log(`\n⚠️ No download URL found after trying all methods`);
    console.log(`   Page title: ${pageTitle}`);
    console.log(`   Current URL: ${currentUrl}`);
    console.log(`   HTML length: ${html.length} characters`);
    console.log(`   💡 Check ${debugHtmlPath} to see the actual HTML content`);
    console.log(`   💡 Or use Ctrl+F in DevTools Elements tab to search for ".pdf" or ".epub"\n`);
    return null;
  }

  /**
   * Convert EPUB to PDF using ebook-convert
   */
  async convertEpubToPdf(epubPath) {
    const pdfPath = epubPath.replace(/\.epub$/i, '.pdf');
    console.log(`📚 Converting EPUB to PDF...`);
    
    try {
      await this.sh('ebook-convert', [epubPath, pdfPath]);
      console.log(`✅ Converted to ${pdfPath}`);
      return pdfPath;
    } catch (err) {
      throw new Error(`Failed to convert EPUB to PDF. Make sure Calibre is installed. Error: ${err.message}`);
    }
  }

  /**
   * Search for book on Amazon using Rainforest API
   */
  async searchBookByTitle(title) {
    if (!this.rainforestApiKey) {
      throw new Error("Rainforest API key is required for title search");
    }
    
    console.log(`🔍 Searching for "${title}" on Amazon...`);
    const searchUrl = `https://api.rainforestapi.com/request?api_key=${this.rainforestApiKey}&type=search&amazon_domain=amazon.com&search_term=${encodeURIComponent(title)}`;
    
    const data = await this.httpGet(searchUrl);
    
    // Track Rainforest API cost
    this.trackRainforestCost();
    
    if (!data.search_results || data.search_results.length === 0) {
      throw new Error(`No results found for "${title}"`);
    }
    
    return data.search_results;
  }

  /**
   * Get Anna's Archive search URL for ASIN
   * Searches for epub and pdf formats, prioritizing epub
   */
  getAnnasArchiveUrl(asin) {
    return `https://annas-archive.org/search?index=&page=1&sort=&ext=epub&ext=pdf&display=list_compact&q=${asin}`;
  }

  /**
   * Download file from Anna's Archive using Puppeteer
   */
  async downloadFromAnnasArchive(asin, outputDir = '.', bookTitle = null) {
    const searchUrl = this.getAnnasArchiveUrl(asin);
    console.log(`📚 Searching Anna's Archive for ASIN: ${asin}...`);
    if (bookTitle) {
      console.log(`📖 Book title from search: ${bookTitle}`);
    }
    console.log(`� Search URL: ${searchUrl}`);
    
    // Configure browser launch options with proxy if available
    const launchOptions = {
      headless: this.headless,
      devtools: !this.headless, // Open DevTools when browser is visible
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    };
    
    if (!this.headless) {
      console.log(`🖥️  Running browser in visible mode with DevTools (headless: false)`);
    }
    
    // Add proxy configuration if enabled and available
    if (this.enableProxy && this.proxyUrl && this.proxyUsername && this.proxyPassword) {
      console.log(`🔒 Using proxy: ${this.proxyUrl}`);
      launchOptions.args.push(`--proxy-server=${this.proxyUrl}`);
    }
    
    const browser = await puppeteer.launch(launchOptions);
    
    try {
      const page = await browser.newPage();
      
      // Authenticate with proxy if enabled and credentials are provided
      if (this.enableProxy && this.proxyUrl && this.proxyUsername && this.proxyPassword) {
        await page.authenticate({
          username: this.proxyUsername,
          password: this.proxyPassword
        });
      }
      
      // Set a realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Step 1: Go to search page with retry
      let retries = 3;
      while (retries > 0) {
        try {
          await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          });
          break;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          console.log(`⚠️  Network error, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Step 2: Find and prioritize epub over pdf
      await page.waitForSelector('.js-aarecord-list-outer', { timeout: 10000 });
      
      // Get all results with their format information
      const results = await page.$$eval('.js-aarecord-list-outer', (containers) => {
        return containers.map(container => {
          const link = container.querySelector('a[href^="/md5/"]');
          const text = container.textContent.toLowerCase();
          const isEpub = text.includes('.epub') || text.includes('epub');
          const isPdf = text.includes('.pdf') || text.includes('pdf');
          
          return {
            href: link ? link.getAttribute('href') : null,
            isEpub,
            isPdf,
            text: container.textContent.trim().substring(0, 100)
          };
        }).filter(r => r.href && (r.isEpub || r.isPdf));
      });
      
      if (results.length === 0) {
        throw new Error('No epub or pdf results found on Anna\'s Archive');
      }
      
      // Prioritize epub over pdf
      const preferredResult = results.find(r => r.isEpub) || results[0];
      const format = preferredResult.isEpub ? 'EPUB' : 'PDF';
      
      console.log(`📖 Found ${results.length} results (${results.filter(r => r.isEpub).length} epub, ${results.filter(r => r.isPdf).length} pdf)`);
      console.log(`✅ Selected ${format} format (preferred)`);
      
      const bookPageUrl = `https://annas-archive.org${preferredResult.href}`;
      console.log(`📖 Book page: ${bookPageUrl}`);
      
      // Navigate to the selected book page
      await page.goto(bookPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      console.log(`📖 Navigated to book page`);
      
      // Use provided book title or try to extract from page, fallback to ASIN
      let finalTitle = bookTitle;
      if (!finalTitle) {
        finalTitle = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
      }
      if (!finalTitle) {
        finalTitle = asin;
      }
      console.log(`📖 Using book title: ${finalTitle}`);
      
      const dirName = this.sanitizeFilename(finalTitle);
      const bookDir = path.join(outputDir, 'uploads', dirName);
      
      // Create directory
      await fsp.mkdir(bookDir, { recursive: true });
      console.log(`📁 Created directory: ${bookDir}`);
      
      // Check if we got an error page
      if (finalTitle.toLowerCase().includes('interrupt') ||
          finalTitle.toLowerCase().includes('error') ||
          finalTitle.toLowerCase().includes('banned')) {
        throw new Error(`Blocked by Anna's Archive: ${finalTitle}`);
      }
      
      // Step 3: Find slow download links (filter for "no waitlist" servers)
      const slowLinks = await page.$$eval('a[href^="/slow_download/"]', links => {
        return links
          .map((a, idx) => ({
            href: a.href,
            text: a.parentElement?.textContent || '',
            index: idx
          }))
          .filter(link => link.text.includes('no waitlist'))
          .map(link => link.href);
      });
      
      if (slowLinks.length === 0) {
        console.log('⚠️  No "no waitlist" servers found, trying all servers...');
        // Fallback to all servers if no "no waitlist" found
        const allLinks = await page.$$eval('a[href^="/slow_download/"]', links =>
          links.map(a => a.href)
        );
        slowLinks.push(...allLinks);
      }
      
      console.log(`🔗 Found ${slowLinks.length} download servers (prioritizing no-waitlist):`);
      slowLinks.forEach((url, idx) => {
        console.log(`   ${idx + 1}. ${url}`);
      });
      
      // Step 4: Try each download link
      for (let i = 0; i < slowLinks.length; i++) {
        console.log(`\n⏳ Trying server ${i + 1}/${slowLinks.length}: ${slowLinks[i]}`);
        
        try {
          // Use Puppeteer with CAPTCHA solving to get the download URL
          console.log(`🌐 Fetching download URL with Puppeteer + 2captcha...`);
          const downloadUrl = await this.getDownloadUrlWithPuppeteer(slowLinks[i], page);
          
          if (!downloadUrl) {
            console.log(`⚠️  Server ${i + 1} - no download URL found`);
            continue;
          }
          
          console.log(`📥 Downloading from server ${i + 1}...`);
          console.log(`🔗 Download URL: ${downloadUrl}`);
          
          // Verify the URL contains the book title or ASIN
          const urlLower = downloadUrl.toLowerCase();
          const titleWords = finalTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const hasMatch = titleWords.some(word => urlLower.includes(word)) || urlLower.includes(asin.toLowerCase());
          
          if (!hasMatch) {
            console.log(`⚠️  URL doesn't match book title/ASIN, trying next server...`);
            console.log(`   Expected: ${finalTitle} or ${asin}`);
            continue;
          }
          
          // Download the file using fetch
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const buffer = await response.arrayBuffer();
          
          // Determine file extension from URL
          const ext = downloadUrl.includes('.pdf') ? '.pdf' : '.epub';
          const filename = `${dirName}${ext}`;
          const filepath = path.join(bookDir, filename);
          
          await fsp.writeFile(filepath, Buffer.from(buffer));
          console.log(`✅ Downloaded: ${filepath}`);
          console.log(`📖 File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
          
          // If we downloaded epub, convert to pdf
          let finalPath = filepath;
          if (ext === '.epub') {
            console.log(`📚 Downloaded EPUB, converting to PDF...`);
            try {
              finalPath = await this.convertEpubToPdf(filepath);
              console.log(`✅ Converted to PDF: ${finalPath}`);
            } catch (err) {
              console.log(`⚠️  EPUB to PDF conversion failed: ${err.message}`);
              console.log(`   Continuing with EPUB file...`);
              finalPath = filepath;
            }
          }
          
          await browser.close();
          
          return {
            filepath: finalPath,
            originalPath: filepath,
            directory: bookDir,
            filename: path.basename(finalPath),
            originalFilename: filename,
            title: finalTitle,
            format: ext === '.epub' ? 'epub' : 'pdf',
            converted: ext === '.epub' && finalPath !== filepath
          };
          
        } catch (error) {
          console.log(`⚠️  Server ${i + 1} failed: ${error.message}`);
          if (i === slowLinks.length - 1) {
            throw new Error('All download servers failed');
          }
          continue;
        }
      }
      
      throw new Error('Could not download from any server');
      
    } catch (error) {
      await browser.close();
      throw new Error(`Failed to download from Anna's Archive: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF
   */
  async extractPdfText(pdfPath) {
    console.log("📖 Extracting text from PDF…");
    const pdfBuffer = await fsp.readFile(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text;
    
    if (!pdfText || pdfText.trim().length < 100) {
      throw new Error("PDF appears to be empty or unreadable");
    }
    
    console.log(`✅ Extracted ${pdfText.length} characters from PDF`);
    return pdfText;
  }

  /**
   * Generate summary using GPT-5
   */
  async generateSummary(pdfText) {
    const systemPrompt = [
      "You are an expert technical writer. Produce a single, self-contained Markdown file.",
      "Source: the attached PDF. Do not hallucinate; pull claims from the PDF.",
      "Goal: Let a reader skip the book but learn the principles.",
      "Requirements:",
      "- Title and author at top.",
      "- Sections: Preface; Ch1..Ch22; Quick-Reference tables of principles and red flags; Final takeaways.",
      "- Keep all graphics as ASCII (code fences) for diagrams/curves;",
      "  preserve tables in Markdown.",
      "- No external images or links.",
      "- Write concisely but completely. Use headers, lists, and code-fenced ASCII diagrams.",
    ].join("\n");

    const userPrompt = [
      "Read the attached PDF and produce the full Markdown summary described above.",
      "Output ONLY Markdown content (no JSON, no preambles).",
    ].join("\n");

    console.log("🧠 Asking the model to generate the Markdown summary…");
    
    let textToSend = pdfText;
    if (pdfText.length > this.maxChars) {
      console.log(`⚠️  PDF text is ${pdfText.length} chars, truncating to ${this.maxChars} chars`);
      textToSend = pdfText.slice(0, this.maxChars);
    }
    
    const resp = await this.openai.chat.completions.create({
      model: API_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${userPrompt}\n\n--- PDF CONTENT ---\n${textToSend}`
        },
      ],
      max_completion_tokens: this.maxTokens,
    });

    // Track OpenAI costs
    if (resp.usage) {
      const cost = this.trackOpenAICost(resp.usage);
      console.log(`💰 OpenAI cost: $${cost.toFixed(4)}`);
    }

    const md = resp.choices[0]?.message?.content ?? "";
    if (!md || md.trim().length < 200) {
      throw new Error("Model returned unexpectedly short content");
    }

    return md;
  }

  /**
   * Sanitize text for audio generation (remove ASCII art, code blocks, etc.)
   */
  sanitizeTextForAudio(text) {
    let sanitized = text;
    
    // Remove code blocks (```...```)
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '[Code example omitted]');
    
    // Remove ASCII art and diagrams (lines with lots of special chars)
    sanitized = sanitized.split('\n').filter(line => {
      // Count special characters
      const specialChars = (line.match(/[+\-|_=*#<>\/\\]/g) || []).length;
      const totalChars = line.length;
      
      // If more than 30% special chars, likely ASCII art
      if (totalChars > 10 && specialChars / totalChars > 0.3) {
        return false;
      }
      return true;
    }).join('\n');
    
    // Remove markdown headers (keep content but remove # symbols)
    sanitized = sanitized.replace(/^#{1,6}\s+/gm, '');
    
    // Remove markdown links but keep text
    sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
    
    // Remove markdown formatting
    sanitized = sanitized.replace(/[*_`]/g, '');
    
    return sanitized.trim();
  }

  /**
   * Generate audio from text using ElevenLabs TTS
   */
  async generateAudio(text, outputPath) {
    if (!this.elevenlabs) {
      console.log("ℹ️  Skipping audio generation (ElevenLabs API key not provided)");
      return null;
    }

    console.log("🎙️  Generating audio with ElevenLabs TTS...");
    
    try {
      // Sanitize text to remove ASCII art and code blocks
      const sanitized = this.sanitizeTextForAudio(text);
      console.log(`📝 Sanitized text: ${text.length} → ${sanitized.length} chars`);
      
      // ElevenLabs has a character limit, so we'll truncate if needed
      const maxAudioChars = 50000; // Adjust based on your plan
      let textToConvert = sanitized;
      
      if (sanitized.length > maxAudioChars) {
        console.log(`⚠️  Text is ${sanitized.length} chars, truncating to ${maxAudioChars} chars for audio`);
        textToConvert = sanitized.slice(0, maxAudioChars) + "\n\n[Audio summary truncated due to length]";
      }

      const audio = await this.elevenlabs.generate({
        voice: this.voiceId,
        text: textToConvert,
        model_id: "eleven_turbo_v2_5", // Best for audiobooks
        voice_settings: this.voiceSettings
        // Note: apply_text_normalization defaults to true (enabled) for better audio quality
      });

      // Write audio stream to file
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      
      await fsp.writeFile(outputPath, Buffer.concat(chunks));
      
      // Track ElevenLabs costs
      const cost = this.trackElevenLabsCost(textToConvert.length);
      console.log(`✅ Generated audio: ${outputPath}`);
      console.log(`💰 ElevenLabs cost: $${cost.toFixed(4)}`);
      
      return outputPath;
    } catch (error) {
      console.error(`⚠️  Failed to generate audio: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate output files using Pandoc
   */
  async generateOutputFiles(markdown, basename, outputDir) {
    const summaryMd = path.join(outputDir, `${basename}.summary.md`);
    const summaryTxt = path.join(outputDir, `${basename}.summary.txt`);
    const summaryPdf = path.join(outputDir, `${basename}.summary.pdf`);
    const summaryEpub = path.join(outputDir, `${basename}.summary.epub`);
    const summaryMp3 = path.join(outputDir, `${basename}.summary.mp3`);

    await fsp.writeFile(summaryMd, markdown, "utf8");
    await fsp.writeFile(summaryTxt, markdown, "utf8");
    console.log(`✅ Wrote ${summaryMd} and ${summaryTxt}`);

    console.log("🛠️ Rendering PDF via pandoc...");
    await this.sh("pandoc", [
      summaryMd,
      "-o", summaryPdf,
      "--standalone",
      "--toc",
      "--metadata", `title=${basename.replace(/_/g, ' ')} (Summary)`,
      "--metadata", `author=Summary by OpenAI GPT-5`,
      "--metadata", `date=${new Date().toISOString().slice(0, 10)}`,
      "--pdf-engine=xelatex"
    ]);

    console.log("🛠️ Rendering EPUB...");
    await this.sh("pandoc", [
      summaryMd,
      "-o", summaryEpub,
      "--standalone",
      "--toc",
    ]);

    // Generate audio if ElevenLabs is configured
    const audioPath = await this.generateAudio(markdown, summaryMp3);

    return {
      summaryMd,
      summaryTxt,
      summaryPdf,
      summaryEpub,
      summaryMp3: audioPath
    };
  }

  /**
   * Create bundle archive
   */
  async createBundle(files, archiveName) {
    console.log("📦 Creating tar.gz bundle…");
    
    for (const f of files) {
      if (!(await this.fileExists(f))) {
        throw new Error(`Missing expected output: ${f}`);
      }
    }

    await this.sh("tar", ["-czvf", archiveName, ...files]);
    console.log(`\n✅ Done: ${archiveName}\n`);
    console.log(`📚 Bundle contains: ${files.join(', ')}`);
    
    return archiveName;
  }

  /**
   * Process a book file (PDF or EPUB)
   */
  async processFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let pdfPath = filePath;
    let epubPath = null;

    if (ext === '.epub') {
      console.log(`📖 Input: EPUB file`);
      epubPath = filePath;
      pdfPath = await this.convertEpubToPdf(filePath);
    } else if (ext === '.pdf') {
      console.log(`📖 Input: PDF file`);
    } else {
      throw new Error(`Unsupported file type: ${ext}. Only .pdf and .epub are supported.`);
    }

    const basename = this.sanitizeFilename(path.basename(filePath));
    
    // Create output directory structure: ./uploads/<title>/
    const bookDir = path.join('uploads', basename);
    await fsp.mkdir(bookDir, { recursive: true });
    console.log(`📁 Created directory: ${bookDir}`);
    
    const pdfText = await this.extractPdfText(pdfPath);
    const markdown = await this.generateSummary(pdfText);
    
    // Generate output files in the book directory
    const outputs = await this.generateOutputFiles(markdown, basename, bookDir);
    
    // Copy original files to book directory with consistent naming
    const renamedPdf = path.join(bookDir, `${basename}.pdf`);
    await fsp.copyFile(pdfPath, renamedPdf);
    console.log(`✅ Saved PDF as ${renamedPdf}`);

    const files = [outputs.summaryMd, outputs.summaryTxt, outputs.summaryPdf, outputs.summaryEpub, renamedPdf];
    
    if (epubPath) {
      const renamedEpub = path.join(bookDir, `${basename}.epub`);
      await fsp.copyFile(epubPath, renamedEpub);
      console.log(`✅ Saved EPUB as ${renamedEpub}`);
      files.push(renamedEpub);
    }

    // Add audio file to list if it was generated
    if (outputs.summaryMp3) {
      files.push(outputs.summaryMp3);
    }

    const archiveName = path.join(bookDir, `${basename}_bundle.tgz`);
    
    // Change to book directory for tar to create relative paths
    const originalCwd = process.cwd();
    process.chdir(bookDir);
    
    try {
      // Create bundle with relative paths
      const relativeFiles = files.map(f => path.basename(f));
      await this.sh("tar", ["-czvf", path.basename(archiveName), ...relativeFiles]);
      console.log(`\n✅ Done: ${archiveName}\n`);
      console.log(`📚 Bundle contains: ${relativeFiles.join(', ')}`);
    } finally {
      process.chdir(originalCwd);
    }

    return {
      basename,
      markdown,
      files,
      directory: bookDir,
      archive: archiveName,
      hasAudio: !!outputs.summaryMp3,
      costs: this.getCostSummary()
    };
  }
}

export default SummaryForge;