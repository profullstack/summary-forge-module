/**
 * Summary Forge - Core Module
 *
 * An intelligent tool that uses AI to create comprehensive summaries of books in multiple formats
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import { ElevenLabsClient } from "elevenlabs";
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
import { PDFParse } from "pdf-parse";
import { extractFlashcards, generateFlashcardsPDF } from "./flashcards.js";
import { extractPdfPages, createChunks, getPdfStats, calculateOptimalChunkSize } from "./utils/pdf-chunker.js";
import { ensureDirectory, getDirectoryContents } from "./utils/directory-protection.js";

const API_MODEL = "gpt-5";

/**
 * Summary Forge class for creating book summaries
 *
 * @param {Object} config - Configuration object with all required API keys
 */
export class SummaryForge {
  constructor(config = {}) {
    // All configuration must be passed via config object
    this.openaiApiKey = config.openaiApiKey;
    this.rainforestApiKey = config.rainforestApiKey;
    this.elevenlabsApiKey = config.elevenlabsApiKey;
    this.twocaptchaApiKey = config.twocaptchaApiKey;
    this.browserlessApiKey = config.browserlessApiKey;
    
    // Browser configuration
    this.headless = config.headless ?? true;
    
    // Proxy configuration
    this.enableProxy = config.enableProxy ?? false;
    this.proxyUrl = config.proxyUrl;
    this.proxyUsername = config.proxyUsername;
    this.proxyPassword = config.proxyPassword;
    this.proxyPoolSize = config.proxyPoolSize ?? 36; // Default to 36 if not specified
    
    // Directory overwrite protection
    this.force = config.force ?? false;
    this.promptFn = config.promptFn ?? null; // For interactive prompts
    
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }
    
    // Session ID for sticky proxy sessions (maintains same IP)
    this.proxySessionId = null;
    
    this.openai = new OpenAI({ apiKey: this.openaiApiKey });
    this.maxChars = config.maxChars ?? 400000;
    this.maxTokens = config.maxTokens ?? 16000;
    
    // Initialize ElevenLabs client if API key is provided
    if (this.elevenlabsApiKey) {
      this.elevenlabs = new ElevenLabsClient({
        apiKey: this.elevenlabsApiKey,
        timeout: 300000  // 5 minutes timeout for long audio generation
      });
    }
    
    // ElevenLabs voice settings
    this.voiceId = config.voiceId ?? "nPczCjzI2devNBz1zQrb"; // Default: Brian voice (best for books)
    this.voiceSettings = config.voiceSettings ?? {
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
   * Generate directory name from title and ASIN
   * Ensures consistent naming across all download methods
   */
  generateDirectoryName(title, asin) {
    const sanitizedTitle = this.sanitizeFilename(title);
    const asinLower = asin.toLowerCase();
    
    // Remove ASIN from sanitized title if it's there (case-insensitive)
    const asinPattern = new RegExp(`_?${asinLower}$`, 'i');
    const cleanTitle = sanitizedTitle.replace(asinPattern, '');
    
    // Always append lowercase ASIN to create directory name
    return `${cleanTitle}_${asinLower}`;
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
   * Wait for __ddg cookies to appear (DDoS-Guard clearance)
   */
  async waitForDdgCookies(page, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      // Get cookies from page context (document.cookie) first (fast)
      const docCookie = await page.evaluate(() => document.cookie).catch(() => '');
      if (docCookie && /__ddg/.test(docCookie)) return true;

      // Fallback to puppeteer page.cookies()
      const cookies = await page.cookies().catch(() => []);
      if (cookies.some(c => c.name && c.name.startsWith('__ddg'))) return true;

      await new Promise(r => setTimeout(r, 500));
    }
    return false;
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
      
      // Method 2: Look for any element with data-sitekey
      if (!sitekey) {
        const sitekeyEl = document.querySelector('[data-sitekey]');
        if (sitekeyEl) {
          sitekey = sitekeyEl.getAttribute('data-sitekey');
        }
      }
      
      // Method 3: Look for hCaptcha iframe
      if (!sitekey) {
        const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha.com"]');
        if (hcaptchaIframe) {
          const src = hcaptchaIframe.getAttribute('src');
          const match = src.match(/sitekey=([^&]+)/);
          if (match) sitekey = match[1];
        }
      }
      
      // Method 4: Look in script tags for various patterns
      if (!sitekey) {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          // Try multiple regex patterns
          const patterns = [
            /sitekey["\s:=]+["']([^"']+)["']/i,
            /"sitekey"\s*:\s*"([^"]+)"/i,
            /data-sitekey=["']([^"']+)["']/i,
            /hcaptcha\.com\/1\/api\.js\?.*sitekey=([^&"']+)/i
          ];
          
          for (const pattern of patterns) {
            const match = script.textContent.match(pattern);
            if (match) {
              sitekey = match[1];
              break;
            }
          }
          if (sitekey) break;
        }
      }
      
      // Method 5: Look in page HTML source
      if (!sitekey) {
        const htmlMatch = document.documentElement.outerHTML.match(/data-sitekey=["']([^"']+)["']/i);
        if (htmlMatch) {
          sitekey = htmlMatch[1];
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
   * Extract download links from HTML
   * Prioritizes EPUB over PDF as EPUB is an open standard
   * Enhanced to handle various link formats
   */
  extractLinks(html, baseUrl) {
    const epubLinks = new Set();
    const pdfLinks = new Set();
    
    // Method 1: Standard href attributes
    const hrefRegex = /href=["']([^"']+\.(?:pdf|epub)(?:\?[^"']*)?)["']/gi;
    let m;
    while ((m = hrefRegex.exec(html))) {
      let link = m[1];
      try {
        link = new URL(link, baseUrl).toString();
        if (link.toLowerCase().includes('.epub')) {
          epubLinks.add(link);
        } else if (link.toLowerCase().includes('.pdf')) {
          pdfLinks.add(link);
        }
      } catch {}
    }
    
    // Method 2: Look for direct download URLs in the HTML
    const urlRegex = /https?:\/\/[^\s"'<>]+\.(?:pdf|epub)(?:\?[^\s"'<>]*)?/gi;
    while ((m = urlRegex.exec(html))) {
      let link = m[0];
      if (link.toLowerCase().includes('.epub')) {
        epubLinks.add(link);
      } else if (link.toLowerCase().includes('.pdf')) {
        pdfLinks.add(link);
      }
    }
    
    // Method 3: Look for data attributes that might contain download URLs
    const dataRegex = /data-[^=]*=["']([^"']+\.(?:pdf|epub)(?:\?[^"']*)?)["']/gi;
    while ((m = dataRegex.exec(html))) {
      let link = m[1];
      try {
        link = new URL(link, baseUrl).toString();
        if (link.toLowerCase().includes('.epub')) {
          epubLinks.add(link);
        } else if (link.toLowerCase().includes('.pdf')) {
          pdfLinks.add(link);
        }
      } catch {}
    }
    
    // Return EPUB links first, then PDF links
    return [...Array.from(epubLinks), ...Array.from(pdfLinks)];
  }

  /**
   * Write debug artifacts (same as test-puppeteer.js)
   */
  async writeArtifacts(title, html, outputDir) {
    const pagePath = path.join(outputDir, "page.html");
    const titlePath = path.join(outputDir, "page.title.txt");
    const previewPath = path.join(outputDir, "page.preview.txt");

    await fsp.writeFile(pagePath, html, "utf8");
    await fsp.writeFile(titlePath, (title || "").trim() + "\n", "utf8");

    const preview = html.replace(/\s+/g, " ").slice(0, 300);
    await fsp.writeFile(previewPath, preview + (html.length > 300 ? "..." : "") + "\n", "utf8");

    return { pagePath, titlePath, previewPath };
  }

  /**
   * Get download URL using Puppeteer with DDoS-Guard bypass
   */
  async getDownloadUrlWithPuppeteer(url, page, outputDir) {
    console.log(`🌐 Navigating to: ${url}`);
    
    const navOptions = { waitUntil: 'domcontentloaded', timeout: 90000 };
    await page.goto(url, navOptions);

    // Try to click any "verify/continue" button that appears
    const clicked = await page.evaluate(async () => {
      function matchesText(el, re) {
        try {
          return el && el.innerText && re.test(el.innerText.trim());
        } catch (e) {
          return false;
        }
      }
      const RE = /(verify|continue|i am not a robot|i'm not a robot|check your browser|proceed|allow)/i;
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
      for (const b of buttons) {
        if (matchesText(b, RE)) {
          try {
            b.click();
            return { clicked: true, text: b.innerText || b.value || 'button' };
          } catch (e) {
            // ignore
          }
        }
      }
      return { clicked: false };
    });

    if (clicked && clicked.clicked) {
      console.log('✅ Clicked challenge button:', clicked.text);
    } else {
      console.log('ℹ️  No obvious challenge button found — waiting for cookies or manual action.');
    }

    // Wait until __ddg* cookies appear (DDoS-Guard clearance)
    console.log('⏳ Waiting for DDoS-Guard clearance cookies...');
    const haveCookies = await this.waitForDdgCookies(page, 60000);
    if (!haveCookies) {
      console.warn('⚠️  Timed out waiting for __ddg cookies. You may need to interact with the page manually.');
    } else {
      console.log('✅ Detected __ddg cookie(s) — challenge likely passed.');
      
      // Wait for the redirect to complete after cookies are set
      console.log('⏳ Waiting for redirect after DDoS-Guard clearance...');
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('✅ Redirect completed');
      } catch (navError) {
        console.log('ℹ️  No navigation detected, page may have already loaded');
      }
      
      // Give it a moment to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Get final page content
    const title = await page.title();
    const html = await page.content();

    // Save debug artifacts (directory will be created by caller)
    const { pagePath, titlePath, previewPath } = await this.writeArtifacts(title, html, outputDir);
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
      return null;
    }

    // Extract links using the same method as test-puppeteer.js
    const links = this.extractLinks(html, url);
    
    if (links.length > 0) {
      const epubCount = links.filter(l => l.toLowerCase().includes('.epub')).length;
      const pdfCount = links.filter(l => l.toLowerCase().includes('.pdf')).length;
      
      console.log(`\n🔎 Found ${links.length} candidate links (${epubCount} epub, ${pdfCount} pdf):`);
      for (const l of links) {
        const format = l.toLowerCase().includes('.epub') ? '[EPUB]' : '[PDF]';
        console.log(`  - ${format} ${l}`);
      }
      
      // Return the first link found (EPUB is prioritized)
      const selectedFormat = links[0].toLowerCase().includes('.epub') ? 'EPUB' : 'PDF';
      console.log(`✅ Selected ${selectedFormat} link (EPUB preferred)`);
      return links[0];
    }
    
    console.log("\n⚠️ No .pdf/.epub links found in rendered HTML.");
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
   * Check if a string is a real ISBN (10 or 13 digits) vs Amazon ASIN
   * Real ISBNs are numeric and 10 or 13 digits long
   * Amazon ASINs are alphanumeric and typically 10 characters
   */
  isRealISBN(identifier) {
    // Handle null, undefined, or non-string values
    if (!identifier || typeof identifier !== 'string') {
      return false;
    }
    
    // Remove hyphens and spaces
    const cleaned = identifier.replace(/[-\s]/g, '');
    
    // Check if it's all numeric and either 10 or 13 digits
    return /^\d{10}$/.test(cleaned) || /^\d{13}$/.test(cleaned);
  }

  /**
   * Get Anna's Archive search URL for ASIN or book title
   * Searches for PDF only, sorted by newest (highest quality)
   * If ASIN is not a real ISBN, uses book title instead
   */
  getAnnasArchiveUrl(asin, bookTitle = null) {
    // Determine search query: use title if ASIN is not a real ISBN
    const searchQuery = (bookTitle && !this.isRealISBN(asin))
      ? encodeURIComponent(bookTitle)
      : asin;
    
    // Only search for PDF, sort by newest to get highest quality versions
    return `https://annas-archive.org/search?index=&page=1&sort=newest&ext=pdf&display=list_compact&q=${searchQuery}`;
  }

  /**
   * Download file from Anna's Archive using Puppeteer
   */
  async downloadFromAnnasArchive(asin, outputDir = '.', bookTitle = null) {
    const searchUrl = this.getAnnasArchiveUrl(asin, bookTitle);
    
    // Log what we're searching for
    if (bookTitle && !this.isRealISBN(asin)) {
      console.log(`📚 Searching Anna's Archive by title (ASIN ${asin} is not a real ISBN)...`);
      console.log(`📖 Book title: ${bookTitle}`);
    } else {
      console.log(`📚 Searching Anna's Archive for ISBN: ${asin}...`);
    }
    if (bookTitle) {
      console.log(`📖 Book title from search: ${bookTitle}`);
    }
    console.log(`🔍 Search URL: ${searchUrl}`);
    
    // Simple proxy setup like test-just-proxy.js
    // Session ID must be between 1-proxyPoolSize for Webshare sticky sessions
    const sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
    const proxyUrlObj = new URL(this.proxyUrl);
    const proxyHost = proxyUrlObj.hostname;
    const proxyPort = parseInt(proxyUrlObj.port) || 80;
    const proxyUsername = `${this.proxyUsername}-${sessionId}`;
    const proxyPassword = this.proxyPassword;
    
    console.log(`🔒 Proxy session: ${sessionId} (${proxyUsername}@${proxyHost}:${proxyPort})`);
    
    console.log(`ℹ️  Using proxy session ${sessionId} (sticky session from pool of ${this.proxyPoolSize})`);
    
    // Use a unique profile per session to avoid conflicts between runs
    const userDataDir = `./puppeteer_ddg_profile_${sessionId}_${Date.now()}`;
    
    const browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        `--proxy-server=${proxyHost}:${proxyPort}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      userDataDir,
      defaultViewport: { width: 1200, height: 800 },
    });
    
    // Handle Ctrl-C to close browser gracefully
    const cleanup = async () => {
      console.log('\n🛑 Interrupted - closing browser...');
      try {
        await browser.close();
      } catch (e) {
        // Browser might already be closed
      }
      process.exit(0);
    };
    
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    
    try {
      const page = await browser.newPage();
      
      // Set some common headers + user agent to look less botty
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      // If the proxy requires HTTP auth (most HTTP proxies do), page.authenticate usually works.
      // This provides credentials for basic auth challenges (including many proxies).
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
      
      // Step 1: Go to search page with DDoS-Guard bypass
      console.log(`🌐 Navigating to search page...`);
      const navOptions = { waitUntil: 'domcontentloaded', timeout: 90000 };
      await page.goto(searchUrl, navOptions);
      
      // Handle DDoS-Guard on search page
      const clicked = await page.evaluate(async () => {
        function matchesText(el, re) {
          try {
            return el && el.innerText && re.test(el.innerText.trim());
          } catch (e) {
            return false;
          }
        }
        const RE = /(verify|continue|i am not a robot|i'm not a robot|check your browser|proceed|allow)/i;
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
        for (const b of buttons) {
          if (matchesText(b, RE)) {
            try {
              b.click();
              return { clicked: true, text: b.innerText || b.value || 'button' };
            } catch (e) {
              // ignore
            }
          }
        }
        return { clicked: false };
      });

      if (clicked && clicked.clicked) {
        console.log('✅ Clicked challenge button on search page:', clicked.text);
      }

      // Wait for DDoS-Guard clearance on search page
      console.log('⏳ Waiting for DDoS-Guard clearance on search page...');
      const haveCookies = await this.waitForDdgCookies(page, 60000);
      if (haveCookies) {
        console.log('✅ DDoS-Guard cleared on search page');
        // Wait for redirect
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
          console.log('✅ Search page redirect completed');
        } catch (e) {
          console.log('ℹ️  No redirect on search page, reloading...');
          // Sometimes we need to reload after getting cookies
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Step 2: Get the first PDF result (Anna's Archive sorts by best match)
      console.log('🔍 Looking for search results...');
      
      // Check if we're still on a challenge page
      const pageContent = await page.content();
      if (pageContent.includes('checking your browser') || pageContent.includes('DDoS-Guard')) {
        console.log('⚠️  Still on DDoS-Guard page, waiting longer...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try reloading one more time
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Increased timeout to 120 seconds (2 minutes) to handle slow DDoS-Guard responses
      // This is the final wait after all DDoS-Guard bypass attempts
      console.log('⏳ Waiting for search results to load (up to 2 minutes)...');
      try {
        await page.waitForSelector('.js-aarecord-list-outer', { timeout: 120000 });
        console.log('✅ Search results loaded');
      } catch (selectorError) {
        // Save debug info before throwing
        const debugHtml = await page.content();
        const debugPath = path.join(outputDir, 'debug-search-page.html');
        await fsp.writeFile(debugPath, debugHtml, 'utf8');
        console.error(`❌ Search results failed to load. Debug HTML saved to: ${debugPath}`);
        console.error(`   Current URL: ${page.url()}`);
        throw new Error(`Search results selector '.js-aarecord-list-outer' not found after 120 seconds. Page may still be on DDoS-Guard challenge or search returned no results.`);
      }
      
      // Get the first result only
      const firstResult = await page.$eval('.js-aarecord-list-outer', (container) => {
        const link = container.querySelector('a[href^="/md5/"]');
        const titleElement = link?.querySelector('h3') || link;
        const title = titleElement ? titleElement.textContent.trim() : '';
        const text = container.textContent;
        
        // Extract file size
        const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
        let sizeInMB = 0;
        if (sizeMatch) {
          const size = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2].toUpperCase();
          if (unit === 'KB') sizeInMB = size / 1024;
          else if (unit === 'MB') sizeInMB = size;
          else if (unit === 'GB') sizeInMB = size * 1024;
        }
        
        return {
          href: link ? link.getAttribute('href') : null,
          title: title,  // Keep full title, don't truncate
          titlePreview: title.substring(0, 100),  // For display only
          sizeInMB
        };
      });
      
      if (!firstResult || !firstResult.href) {
        throw new Error('No PDF result found on Anna\'s Archive');
      }
      
      console.log(`📖 Found first result (best match):`);
      console.log(`   Title: "${firstResult.titlePreview}"`);
      console.log(`   Size: ${firstResult.sizeInMB.toFixed(1)}MB`);
      console.log(`✅ Using first result (Anna's Archive sorts by relevance)`);
      
      const preferredResult = firstResult;
      
      const bookPageUrl = `https://annas-archive.org${preferredResult.href}`;
      console.log(`📖 Book page: ${bookPageUrl}`);
      
      // Navigate to the selected book page
      await page.goto(bookPageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      console.log(`📖 Navigated to book page`);
      
      // Use provided book title, or search result title, or extract from page, fallback to ASIN
      let finalTitle = bookTitle;
      if (!finalTitle) {
        // Use the title from search results first (more reliable than page h1)
        finalTitle = firstResult.title;
      }
      if (!finalTitle || finalTitle.toLowerCase().includes("anna's archive")) {
        // Fallback to page h1 if search result title is not good
        finalTitle = await page.$eval('h1', el => el.textContent.trim()).catch(() => null);
      }
      if (!finalTitle || finalTitle.toLowerCase().includes("anna's archive")) {
        // Final fallback to ASIN
        finalTitle = asin;
      }
      console.log(`📖 Using book title: ${finalTitle}`);
      
      // Use centralized directory name generation
      const dirName = this.generateDirectoryName(finalTitle, asin);
      const sanitizedTitle = this.sanitizeFilename(finalTitle);
      
      const bookDir = path.join(outputDir, 'uploads', dirName);
      
      // Check for existing directory and handle overwrite protection
      const dirResult = await ensureDirectory(bookDir, this.force, this.promptFn);
      
      if (!dirResult.created) {
        console.log(`⏭️  Skipped: Directory already exists and user chose not to overwrite`);
        throw new Error('Operation cancelled: Directory already exists');
      }
      
      if (dirResult.overwritten) {
        console.log(`🔄 Overwritten existing directory: ${bookDir}`);
      } else {
        console.log(`📁 Created directory: ${bookDir}`);
      }
      
      // Check if we got an error page
      if (finalTitle.toLowerCase().includes('interrupt') ||
          finalTitle.toLowerCase().includes('error') ||
          finalTitle.toLowerCase().includes('banned')) {
        throw new Error(`Blocked by Anna's Archive: ${finalTitle}`);
      }
      
      // Step 3: Find slow download links (try all servers, prioritize no-waitlist)
      const slowLinks = await page.$$eval('a[href^="/slow_download/"]', links => {
        return links.map((a, idx) => ({
          href: a.href,
          text: a.parentElement?.textContent || '',
          index: idx,
          hasWaitlist: a.parentElement?.textContent?.includes('waitlist') || false
        }));
      });
      
      // Sort: no-waitlist servers first, then waitlist servers
      slowLinks.sort((a, b) => {
        if (a.hasWaitlist === b.hasWaitlist) return 0;
        return a.hasWaitlist ? 1 : -1;
      });
      
      console.log(`🔗 Found ${slowLinks.length} download servers:`);
      slowLinks.forEach((link, idx) => {
        const waitlistStatus = link.hasWaitlist ? '(with waitlist)' : '(no waitlist)';
        console.log(`   ${idx + 1}. ${waitlistStatus} ${link.href}`);
      });
      
      // Step 4: Try each download link
      for (let i = 0; i < slowLinks.length; i++) {
        const serverInfo = slowLinks[i];
        const waitlistStatus = serverInfo.hasWaitlist ? 'with waitlist' : 'no waitlist';
        console.log(`\n⏳ Trying server ${i + 1}/${slowLinks.length} (${waitlistStatus}): ${serverInfo.href}`);
        
        try {
          // Navigate to the slow download page
          console.log(`🌐 Navigating to download page...`);
          await page.goto(serverInfo.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
          
          // Check for countdown timer and wait if present
          const waitTime = await page.evaluate(() => {
            const bodyText = document.body.textContent;
            const match = bodyText.match(/Please wait (\d+) seconds/i);
            return match ? parseInt(match[1], 10) : 0;
          });
          
          if (waitTime > 0) {
            console.log(`⏰ Server has ${waitTime} second countdown, waiting...`);
            // Wait for the countdown plus a small buffer
            // The page will update dynamically via JavaScript when countdown expires
            await new Promise(resolve => setTimeout(resolve, (waitTime + 3) * 1000));
            console.log(`✅ Countdown complete, download links should now be available`);
          }
          
          // Now get the download URL using the existing method
          console.log(`🌐 Fetching download URL with Puppeteer + 2captcha...`);
          const downloadUrl = await this.getDownloadUrlWithPuppeteer(page.url(), page, bookDir);
          
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
          
          // Download using fetch with the authenticated session cookies
          console.log(`📥 Downloading file...`);
          
          // Get cookies from the page to use in fetch
          const cookies = await page.cookies();
          const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          
          // Use fetch to download the file (more reliable than CDP for large files)
          const response = await fetch(downloadUrl, {
            headers: {
              'Cookie': cookieString,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              'Referer': page.url()
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Get content length for progress tracking
          const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
          const contentLengthMB = (contentLength / 1024 / 1024).toFixed(2);
          console.log(`📊 File size: ${contentLengthMB} MB`);
          
          // Download with progress tracking
          const chunks = [];
          let downloadedBytes = 0;
          let lastProgressPercent = 0;
          
          for await (const chunk of response.body) {
            chunks.push(chunk);
            downloadedBytes += chunk.length;
            
            if (contentLength > 0) {
              const progressPercent = Math.floor((downloadedBytes / contentLength) * 100);
              if (progressPercent >= lastProgressPercent + 10) {
                console.log(`   📥 Downloaded: ${progressPercent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
                lastProgressPercent = progressPercent;
              }
            }
          }
          
          const buffer = Buffer.concat(chunks);
          console.log(`✅ Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
          
          // Should always be PDF now
          const ext = '.pdf';
          // Use sanitized title without ASIN for filename (ASIN is already in directory name)
          const filename = `${sanitizedTitle}${ext}`;
          const filepath = path.join(bookDir, filename);
          
          await fsp.writeFile(filepath, Buffer.from(buffer));
          console.log(`✅ Downloaded: ${filepath}`);
          console.log(`📖 File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
          
          await browser.close();
          
          return {
            filepath,
            originalPath: filepath,
            directory: bookDir,
            filename: path.basename(filepath),
            originalFilename: filename,
            title: finalTitle,
            asin: asin,  // Include ASIN in return value
            format: 'pdf',
            converted: false
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
    } finally {
      // Remove signal handlers
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
      
      // Clean up browser profile directory
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
        console.log(`🗑️  Cleaned up browser profile`);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      // Clear session ID after download completes
      this.proxySessionId = null;
    }
  }

  /**
   * Process a single chunk and generate a partial summary
   * @private
   */
  async processSingleChunk(chunkText, chunkIndex, totalChunks, startPage, endPage) {
    const systemPrompt = [
      "You are an expert technical writer creating a detailed summary of a book section.",
      `This is chunk ${chunkIndex + 1} of ${totalChunks} (pages ${startPage}-${endPage}).`,
      "Extract and summarize ALL key information from this section:",
      "- Main concepts and principles",
      "- Important examples and case studies",
      "- Key takeaways and actionable insights",
      "- Technical details and methodologies",
      "- Any diagrams, tables, or visual content (describe in text)",
      "",
      "Format your response as structured Markdown with:",
      "- Clear section headers",
      "- Bullet points for key concepts",
      "- Numbered lists for sequential information",
      "- Code blocks for technical content",
      "",
      "Be comprehensive - this will be combined with other chunks to form the complete summary.",
      "Do NOT add introductory or concluding remarks about this being a partial summary."
    ].join("\n");

    const userPrompt = `Summarize this section of the book (pages ${startPage}-${endPage}):\n\n${chunkText}`;

    console.log(`   🧠 Processing chunk ${chunkIndex + 1}/${totalChunks} (pages ${startPage}-${endPage})...`);

    const resp = await this.openai.chat.completions.create({
      model: API_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: this.maxTokens,
    });

    if (resp.usage) {
      const cost = this.trackOpenAICost(resp.usage);
      console.log(`   💰 Chunk ${chunkIndex + 1} cost: $${cost.toFixed(4)} (${resp.usage.prompt_tokens} in, ${resp.usage.completion_tokens} out)`);
    }

    const summary = resp.choices[0]?.message?.content ?? "";
    if (!summary || summary.trim().length < 50) {
      throw new Error(`Chunk ${chunkIndex + 1} returned unexpectedly short content`);
    }

    console.log(`   ✅ Chunk ${chunkIndex + 1} processed: ${summary.length} chars`);
    return summary;
  }

  /**
   * Synthesize multiple chunk summaries into a cohesive final summary
   * @private
   */
  async synthesizeChunkSummaries(chunkSummaries, bookTitle = "the book") {
    console.log("🔄 Synthesizing chunk summaries into final comprehensive summary...");

    const combinedText = chunkSummaries
      .map((summary, idx) => `## Section ${idx + 1}\n\n${summary}`)
      .join("\n\n---\n\n");

    const systemPrompt = [
      "You are an expert technical writer. You will receive summaries of different sections of a book.",
      "Your task is to synthesize these into ONE cohesive, comprehensive Markdown summary.",
      "",
      "Requirements:",
      "- Title and author at top (extract from content)",
      "- Organize content by the book's ACTUAL structure as found in the section summaries",
      "- DO NOT invent or assume chapter numbers - use only what's in the provided content",
      "- Merge overlapping information intelligently",
      "- Maintain ALL key concepts, principles, and details from all sections",
      "- Create a unified narrative flow",
      "- Include: Preface/Introduction (if present), all chapters/sections found in content, Quick-Reference tables, Final takeaways",
      "- Use headers, lists, and code-fenced ASCII diagrams",
      "- No external images or links",
      "- IMPORTANT: Add a 'Study Flashcards' section at the end with 20-30 Q&A pairs:",
      "  **Q: What is [concept]?**",
      "  A: [Clear, concise answer in 1-3 sentences]",
      "  ",
      "  (blank line between each Q&A pair)",
      "",
      "CRITICAL: Only summarize content that was actually provided. Do not mention missing chapters or sections.",
      "Output ONLY the final Markdown summary (no meta-commentary)."
    ].join("\n");

    const userPrompt = [
      `Synthesize these section summaries of "${bookTitle}" into one comprehensive, well-organized summary:`,
      "",
      combinedText
    ].join("\n");

    const resp = await this.openai.chat.completions.create({
      model: API_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: this.maxTokens,
    });

    if (resp.usage) {
      const cost = this.trackOpenAICost(resp.usage);
      console.log(`💰 Synthesis cost: $${cost.toFixed(4)} (${resp.usage.prompt_tokens} in, ${resp.usage.completion_tokens} out)`);
    }

    const finalSummary = resp.choices[0]?.message?.content ?? "";
    if (!finalSummary || finalSummary.trim().length < 200) {
      throw new Error("Synthesis returned unexpectedly short content");
    }

    console.log(`✅ Final summary synthesized: ${finalSummary.length} chars`);
    return finalSummary;
  }

  /**
   * Generate summary using GPT-5 with PDF file upload (with fallback to chunked text extraction)
   */
  async generateSummary(pdfPath) {
    console.log("📖 Processing PDF...");
    
    // Get file stats
    const stats = await fsp.stat(pdfPath);
    const pdfSizeKB = (stats.size / 1024).toFixed(2);
    const pdfSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📊 PDF size: ${pdfSizeMB} MB (${pdfSizeKB} KB)`);
    
    // Try GPT-5 with file upload first
    try {
      console.log("🔄 Attempting GPT-5 with PDF file upload...");
      
      // Upload PDF file to OpenAI
      const fileStream = fs.createReadStream(pdfPath);
      const file = await this.openai.files.create({
        file: fileStream,
        purpose: 'user_data'
      });
      
      console.log(`✅ PDF uploaded. File ID: ${file.id}`);
      
      const systemPrompt = [
        "You are an expert technical writer. Produce a single, self-contained Markdown file.",
        "Source: the attached PDF. Do not hallucinate; pull claims from the PDF.",
        "Goal: Let a reader skip the book but learn the principles.",
        "Requirements:",
        "- Title and author at top.",
        "- Organize by the book's actual structure (chapters, parts, sections as they appear in the PDF).",
        "- Include: Preface/Introduction, all chapters/sections found in the book, Quick-Reference tables, Final takeaways.",
        "- Keep all graphics as ASCII (code fences) for diagrams/curves; preserve tables in Markdown.",
        "- No external images or links.",
        "- Write concisely but completely. Use headers, lists, and code-fenced ASCII diagrams.",
        "- IMPORTANT: Add a 'Study Flashcards' section at the end with 20-30 Q&A pairs in this exact format:",
        "  **Q: What is [concept]?**",
        "  A: [Clear, concise answer in 1-3 sentences]",
        "  ",
        "  (blank line between each Q&A pair)",
      ].join("\n");

      const userPrompt = "Read the attached PDF and produce the full Markdown summary described above. Output ONLY Markdown content (no JSON, no preambles).";

      console.log("🧠 Asking GPT-5 to generate summary from PDF file...");
      
      const resp = await this.openai.chat.completions.create({
        model: API_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "file", file: { file_id: file.id } },
              { type: "text", text: userPrompt }
            ]
          }
        ],
        max_completion_tokens: this.maxTokens,
      });

      // Track OpenAI costs
      if (resp.usage) {
        const cost = this.trackOpenAICost(resp.usage);
        console.log(`💰 OpenAI cost: $${cost.toFixed(4)}`);
        console.log(`📊 Tokens used: ${resp.usage.prompt_tokens} input, ${resp.usage.completion_tokens} output`);
      }

      // Clean up uploaded file
      try {
        await this.openai.files.del(file.id);
        console.log(`🗑️  Cleaned up uploaded file`);
      } catch (cleanupError) {
        console.log(`⚠️  Warning: Could not delete uploaded file: ${cleanupError.message}`);
      }

      const md = resp.choices[0]?.message?.content ?? "";
      if (!md || md.trim().length < 200) {
        throw new Error("Model returned unexpectedly short content");
      }

      console.log("✅ Successfully generated summary using GPT-5 with PDF file");
      return md;
      
    } catch (fileUploadError) {
      // Log the file upload error
      console.error(`⚠️  GPT-5 PDF file upload failed: ${fileUploadError.message}`);
      if (fileUploadError.response) {
        console.error(`   API Error: ${fileUploadError.response.status} - ${JSON.stringify(fileUploadError.response.data)}`);
      }
      
      // Fallback to intelligent chunked text extraction
      console.log("🔄 Falling back to intelligent chunked text extraction...");
      
      try {
        // Get PDF statistics
        const stats = await getPdfStats(pdfPath);
        console.log(`📊 PDF Stats: ${stats.totalPages} pages, ${stats.totalChars.toLocaleString()} chars, ~${stats.estimatedTokens.toLocaleString()} tokens`);
        
        // Determine if we need chunking
        const needsChunking = stats.totalChars > this.maxChars;
        
        if (!needsChunking) {
          // Small PDF - process normally without chunking
          console.log("📄 PDF is small enough to process in one request");
          
          const pdfBuffer = await fsp.readFile(pdfPath);
          const parser = new PDFParse({ data: pdfBuffer });
          const result = await parser.getText();
          await parser.destroy();
          
          const extractedText = result.text;
          
          if (!extractedText || extractedText.trim().length < 100) {
            throw new Error("PDF appears to be empty or contains only images (scanned document)");
          }
          
          const systemPrompt = [
            "You are an expert technical writer. Produce a single, self-contained Markdown file.",
            "Source: the provided book text. Do not hallucinate; pull claims from the text.",
            "Goal: Let a reader skip the book but learn the principles.",
            "Requirements:",
            "- Title and author at top.",
            "- Organize by the book's actual structure (chapters, parts, sections as they appear in the text).",
            "- Include: Preface/Introduction, all chapters/sections found in the book, Quick-Reference tables, Final takeaways.",
            "- Keep all graphics as ASCII (code fences) for diagrams/curves; preserve tables in Markdown.",
            "- No external images or links.",
            "- Write concisely but completely. Use headers, lists, and code-fenced ASCII diagrams.",
            "- IMPORTANT: Add a 'Study Flashcards' section at the end with 20-30 Q&A pairs in this exact format:",
            "  **Q: What is [concept]?**",
            "  A: [Clear, concise answer in 1-3 sentences]",
            "  ",
            "  (blank line between each Q&A pair)",
          ].join("\n");

          const userPrompt = `Read the following book text and produce the full Markdown summary described above. Output ONLY Markdown content (no JSON, no preambles).\n\n${extractedText}`;

          console.log("🧠 Asking GPT-5 to generate summary from extracted text...");
          
          const resp = await this.openai.chat.completions.create({
            model: API_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_completion_tokens: this.maxTokens,
          });

          if (resp.usage) {
            const cost = this.trackOpenAICost(resp.usage);
            console.log(`💰 OpenAI cost: $${cost.toFixed(4)}`);
            console.log(`📊 Tokens used: ${resp.usage.prompt_tokens} input, ${resp.usage.completion_tokens} output`);
          }

          const md = resp.choices[0]?.message?.content ?? "";
          if (!md || md.trim().length < 200) {
            throw new Error("Model returned unexpectedly short content");
          }

          console.log("✅ Successfully generated summary using text extraction");
          return md;
        }
        
        // Large PDF - use intelligent chunking
        console.log("📚 PDF is large - using intelligent chunking strategy");
        console.log(`   This will process the ENTIRE ${stats.totalPages}-page PDF without truncation`);
        
        // Extract pages
        console.log("📄 Extracting pages from PDF...");
        const pages = await extractPdfPages(pdfPath);
        console.log(`✅ Extracted ${pages.length} pages`);
        
        // Calculate optimal chunk size
        const optimalChunkSize = calculateOptimalChunkSize(stats.totalChars, 100000);
        console.log(`📐 Using chunk size: ${optimalChunkSize.toLocaleString()} chars`);
        
        // Create chunks
        const chunks = createChunks(pages, optimalChunkSize);
        console.log(`📦 Created ${chunks.length} chunks for processing`);
        
        // Display chunk information
        chunks.forEach((chunk, idx) => {
          console.log(`   Chunk ${idx + 1}: Pages ${chunk.startPage}-${chunk.endPage} (${chunk.charCount.toLocaleString()} chars)`);
        });
        
        // Process each chunk
        console.log("\n🔄 Processing chunks...");
        const chunkSummaries = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          try {
            const summary = await this.processSingleChunk(
              chunk.text,
              i,
              chunks.length,
              chunk.startPage,
              chunk.endPage
            );
            chunkSummaries.push(summary);
          } catch (chunkError) {
            console.error(`   ❌ Failed to process chunk ${i + 1}: ${chunkError.message}`);
            throw new Error(`Chunk processing failed at chunk ${i + 1}: ${chunkError.message}`);
          }
        }
        
        console.log(`\n✅ All ${chunks.length} chunks processed successfully`);
        
        // Synthesize chunks into final summary
        const bookTitle = pdfPath.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' ');
        const finalSummary = await this.synthesizeChunkSummaries(chunkSummaries, bookTitle);
        
        console.log("✅ Successfully generated comprehensive summary using intelligent chunking");
        console.log(`📊 Final summary: ${finalSummary.length.toLocaleString()} characters`);
        console.log("⚠️  Note: Images/diagrams from PDF were not included (text-only extraction)");
        
        return finalSummary;
        
      } catch (textExtractionError) {
        console.error(`❌ Text extraction fallback failed: ${textExtractionError.message}`);
        throw new Error(`Failed to generate summary: ${textExtractionError.message}`);
      }
    }
  }

  /**
   * Generate audio-friendly script from markdown summary
   * Converts markdown to natural, conversational narration
   */
  async generateAudioScript(markdown) {
    console.log("🎙️  Generating audio-friendly narration script...");
    
    const systemPrompt = [
      "You are an expert audiobook narrator and script writer.",
      "Convert the provided markdown summary into a natural, conversational script suitable for text-to-speech narration.",
      "Requirements:",
      "- Write in a warm, engaging, conversational tone",
      "- Convert bullet points into flowing sentences",
      "- Replace markdown formatting with natural speech patterns",
      "- Add smooth transitions between sections",
      "- Use phrases like 'Let's explore...', 'Now, moving on to...', 'It's important to note that...'",
      "- Spell out acronyms on first use, then use the acronym",
      "- Convert lists into narrative form",
      "- Remove or describe any code examples, ASCII art, or diagrams",
      "- Keep the content informative but make it sound like a human narrator speaking",
      "- Maintain all key information and concepts from the original",
      "Output ONLY the narration script, no meta-commentary."
    ].join("\n");

    const userPrompt = [
      "Convert this markdown summary into a natural audiobook narration script:",
      "",
      markdown
    ].join("\n");

    try {
      const resp = await this.openai.chat.completions.create({
        model: API_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: this.maxTokens,
      });

      // Track OpenAI costs
      if (resp.usage) {
        const cost = this.trackOpenAICost(resp.usage);
        console.log(`💰 OpenAI cost for audio script: $${cost.toFixed(4)}`);
        console.log(`📊 Tokens used: ${resp.usage.prompt_tokens} input, ${resp.usage.completion_tokens} output`);
      }

      const script = resp.choices[0]?.message?.content ?? "";
      if (!script || script.trim().length < 100) {
        throw new Error("Model returned unexpectedly short audio script");
      }

      console.log(`✅ Generated audio script: ${script.length} characters`);
      return script;
    } catch (error) {
      console.error(`⚠️  Failed to generate audio script: ${error.message}`);
      console.log("ℹ️  Falling back to sanitized markdown");
      return this.sanitizeTextForAudio(markdown);
    }
  }

  /**
   * Sanitize text for audio generation (remove ASCII art, code blocks, etc.)
   * This is a fallback method if AI script generation fails
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
   * Chunk text into smaller pieces for ElevenLabs processing
   */
  chunkText(text, maxCharsPerChunk = 8000) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (currentChunk.length + trimmedSentence.length + 1 <= maxCharsPerChunk) {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
          currentChunk = trimmedSentence;
        } else {
          // Handle case where single sentence exceeds limit
          chunks.push(trimmedSentence + '.');
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }
    
    return chunks;
  }

  /**
   * Generate audio from text using ElevenLabs TTS with chunking and streaming
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
      
      // ElevenLabs Turbo v2.5 supports up to 40,000 characters per request
      // But we'll chunk at 8,000 for better reliability and streaming
      const maxAudioChars = 40000;
      let textToConvert = sanitized;
      
      if (sanitized.length > maxAudioChars) {
        console.log(`⚠️  Text is ${sanitized.length} chars, exceeds ${maxAudioChars} char limit`);
        console.log(`   Truncating to ${maxAudioChars} chars for audio generation...`);
        textToConvert = sanitized.slice(0, maxAudioChars) + "\n\n[Audio summary truncated due to length. Full summary available in text/PDF formats.]";
      }
      
      // Chunk the text for processing
      const chunks = this.chunkText(textToConvert, 8000);
      console.log(`🎵 Generating audio in ${chunks.length} chunks (${textToConvert.length} total chars, ~${Math.ceil(textToConvert.length / 1000)} minutes)...`);

      const audioBuffers = [];
      const requestIds = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`   Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);
        
        try {
          // Use textToSpeech.convert with request stitching
          const audioStream = await this.elevenlabs.textToSpeech.convert(this.voiceId, {
            text: chunk,
            model_id: "eleven_turbo_v2_5",
            output_format: "mp3_44100_128",
            previous_request_ids: requestIds.length > 0 ? requestIds : undefined,
            voice_settings: this.voiceSettings
          });
          
          // Collect audio chunks into buffer
          const chunkBuffers = [];
          for await (const audioChunk of audioStream) {
            chunkBuffers.push(audioChunk);
          }
          
          const chunkBuffer = Buffer.concat(chunkBuffers);
          audioBuffers.push(chunkBuffer);
          
          // Store request ID for stitching (if available from headers)
          // Note: Request ID tracking may not be available in all SDK versions
          requestIds.push(`chunk_${i}`);
          if (requestIds.length > 3) {
            requestIds.shift();
          }
          
          console.log(`   ✅ Chunk ${i + 1} completed (${chunkBuffer.length} bytes)`);
          
        } catch (chunkError) {
          console.error(`   ⚠️  Chunk ${i + 1} failed: ${chunkError.message}`);
          throw chunkError;
        }
      }
      
      // Combine all audio buffers and write to file
      const finalAudioBuffer = Buffer.concat(audioBuffers);
      await fsp.writeFile(outputPath, finalAudioBuffer);
      
      console.log(`📊 Total audio size: ${(finalAudioBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      
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
    const audioScript = path.join(outputDir, `${basename}.audio-script.txt`);
    const summaryMp3 = path.join(outputDir, `${basename}.summary.mp3`);
    const flashcardsPdf = path.join(outputDir, `${basename}.flashcards.pdf`);

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

    // Generate audio-friendly script and audio if ElevenLabs is configured
    let audioPath = null;
    let audioScriptPath = null;
    
    if (this.elevenlabs) {
      // Generate audio script
      const script = await this.generateAudioScript(markdown);
      await fsp.writeFile(audioScript, script, "utf8");
      audioScriptPath = audioScript;
      console.log(`✅ Wrote audio script: ${audioScript}`);
      
      // Generate audio from script
      audioPath = await this.generateAudio(script, summaryMp3);
    }

    // Generate flashcards MD and PDF
    console.log("🃏 Generating flashcards...");
    let flashcardsPath = null;
    let flashcardsMdPath = null;
    try {
      const flashcards = extractFlashcards(markdown, { maxCards: 100 });
      
      if (flashcards.length > 0) {
        console.log(`📚 Extracted ${flashcards.length} flashcards from summary`);
        
        // Generate flashcards.md file
        const flashcardsMd = path.join(outputDir, `${basename}.flashcards.md`);
        const flashcardsContent = [
          `# ${basename.replace(/_/g, ' ')} - Study Flashcards`,
          '',
          `Generated by SummaryForge.com`,
          `Total cards: ${flashcards.length}`,
          '',
          '---',
          '',
          ...flashcards.map((card, idx) =>
            `**Q: ${card.question}**\n\nA: ${card.answer}\n`
          )
        ].join('\n');
        
        await fsp.writeFile(flashcardsMd, flashcardsContent, 'utf8');
        flashcardsMdPath = flashcardsMd;
        console.log(`✅ Generated flashcards markdown: ${flashcardsMd}`);
        
        // Generate flashcards PDF
        await generateFlashcardsPDF(flashcards, flashcardsPdf, {
          title: basename.replace(/_/g, ' '),
          branding: 'SummaryForge.com'
        });
        flashcardsPath = flashcardsPdf;
        console.log(`✅ Generated flashcards PDF: ${flashcardsPdf}`);
      } else {
        console.log("ℹ️  No flashcards found in summary (no Q&A patterns detected)");
      }
    } catch (error) {
      console.log(`⚠️  Failed to generate flashcards: ${error.message}`);
    }

    return {
      summaryMd,
      summaryTxt,
      summaryPdf,
      summaryEpub,
      audioScript: audioScriptPath,
      summaryMp3: audioPath,
      flashcardsMd: flashcardsMdPath,
      flashcardsPdf: flashcardsPath
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
   * If the file was downloaded from Anna's Archive, it's already in the correct directory
   */
  async processFile(filePath, asin = null) {
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

    // Extract title from filename for basename (without ASIN)
    const basename = this.sanitizeFilename(path.basename(filePath));
    
    // Determine if file is already in an uploads directory (from downloadFromAnnasArchive)
    const isInUploadsDir = filePath.includes(path.join('uploads', path.sep));
    
    let bookDir;
    let dirName;
    
    if (isInUploadsDir) {
      // File is already in the correct directory from downloadFromAnnasArchive
      bookDir = path.dirname(filePath);
      dirName = path.basename(bookDir);
      console.log(`📁 Using existing directory: ${bookDir}`);
    } else {
      // Create new directory structure for manually provided files
      if (asin) {
        dirName = this.generateDirectoryName(basename, asin);
      } else {
        dirName = basename;
      }
      
      bookDir = path.join('uploads', dirName);
      await fsp.mkdir(bookDir, { recursive: true });
      console.log(`📁 Created directory: ${bookDir}`);
    }
    
    const markdown = await this.generateSummary(pdfPath);
    
    // Generate output files using basename WITHOUT ASIN
    const outputs = await this.generateOutputFiles(markdown, basename, bookDir);
    
    // Copy original files to book directory with consistent naming (only if not already there)
    const files = [outputs.summaryMd, outputs.summaryTxt, outputs.summaryPdf, outputs.summaryEpub];
    
    if (!isInUploadsDir) {
      const renamedPdf = path.join(bookDir, `${basename}.pdf`);
      await fsp.copyFile(pdfPath, renamedPdf);
      console.log(`✅ Saved PDF as ${renamedPdf}`);
      files.push(renamedPdf);
      
      if (epubPath) {
        const renamedEpub = path.join(bookDir, `${basename}.epub`);
        await fsp.copyFile(epubPath, renamedEpub);
        console.log(`✅ Saved EPUB as ${renamedEpub}`);
        files.push(renamedEpub);
      }
    } else {
      // File is already in the correct location, just add it to the list
      files.push(pdfPath);
      if (epubPath) {
        files.push(epubPath);
      }
    }

    // Add audio script to list if it was generated
    if (outputs.audioScript) {
      files.push(outputs.audioScript);
    }

    // Add audio file to list if it was generated
    if (outputs.summaryMp3) {
      files.push(outputs.summaryMp3);
    }

    // Add flashcards files to list if they were generated
    if (outputs.flashcardsMd) {
      files.push(outputs.flashcardsMd);
    }
    if (outputs.flashcardsPdf) {
      files.push(outputs.flashcardsPdf);
    }

    const archiveName = path.join(bookDir, `${dirName}_bundle.tgz`);
    
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

    // Play terminal beep to signal completion
    process.stdout.write('\x07');
    
    return {
      basename,
      dirName,
      markdown,
      files,
      directory: bookDir,
      archive: archiveName,
      hasAudio: !!outputs.summaryMp3,
      asin: asin,  // Include ASIN in return value
      costs: this.getCostSummary()
    };
  }
}

export default SummaryForge;