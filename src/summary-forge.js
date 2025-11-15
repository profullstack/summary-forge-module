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
// Use puppeteer-core to avoid Canvas/DOMMatrix dependencies
// puppeteer-core doesn't bundle Chrome and has no browser API dependencies
import puppeteer from 'puppeteer-core';
import PDFParse from "pdf-parse";
import { extractFlashcards, generateFlashcardsPDF, generateFlashcardImages } from "./flashcards.js";
import { extractPdfPages, createChunks, getPdfStats, calculateOptimalChunkSize } from "./utils/pdf-chunker.js";
import { ensureDirectory, getDirectoryContents } from "./utils/directory-protection.js";
import { fetchWebPageAsPdf, generateCleanTitle } from "./utils/web-page.js";
import { SSELogger } from "./utils/sse-logger.js";
import { navigateWithChallengeBypass } from "./utils/browser.js";

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
    
    // Custom Puppeteer launch options (allows environment-specific overrides)
    this.puppeteerLaunchOptions = config.puppeteerLaunchOptions ?? null;
    
    // Directory overwrite protection
    this.force = config.force ?? false;
    this.promptFn = config.promptFn ?? null; // For interactive prompts
    
    // SSE Logger configuration
    // If logger is provided, use it; otherwise create console logger for CLI compatibility
    this.logger = config.logger ?? SSELogger.createConsoleLogger();
    
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
   * Returns JSON object with cost information
   */
  getCostSummary() {
    return {
      success: true,
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
   * Download with automatic rate limit handling and retry logic
   * @private
   */
  async downloadWithRetry(url, options = {}, maxRetries = 3) {
    const {
      headers = {},
      redirect = 'follow'
    } = options;
    
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await fetch(url, {
          headers,
          redirect
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Check if response is a rate limit error page
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          // Peek at the response to check for rate limiting
          const text = await response.text();
          if (text.includes('Too many requests') || text.includes('Err #ipd1')) {
            const waitMatch = text.match(/wait (\d+) seconds/i);
            const waitTime = waitMatch ? parseInt(waitMatch[1], 10) : 10;
            
            if (retryCount < maxRetries) {
              console.log(`⏰ Rate limited. Waiting ${waitTime + 2} seconds before retry ${retryCount + 1}/${maxRetries}...`);
              await new Promise(resolve => setTimeout(resolve, (waitTime + 2) * 1000));
              retryCount++;
              continue;
            } else {
              throw new Error(`Rate limited after ${maxRetries} retries. Please wait a few minutes and try again.`);
            }
          }
          // If it's HTML but not a rate limit error, it might be an error page
          throw new Error('Received HTML response instead of file download');
        }
        
        // Success - return the response
        return response;
        
      } catch (fetchError) {
        if (retryCount < maxRetries && !fetchError.message.includes('Rate limited')) {
          console.log(`⚠️  Request failed, retrying in 5 seconds... (${retryCount + 1}/${maxRetries}): ${fetchError.message}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          retryCount++;
        } else {
          throw fetchError;
        }
      }
    }
    
    throw new Error('Download failed after all retries');
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
   * Returns JSON object with conversion result
   */
  async convertEpubToPdf(epubPath) {
    const pdfPath = epubPath.replace(/\.epub$/i, '.pdf');
    console.log(`📚 Converting EPUB to PDF...`);
    
    try {
      await this.sh('ebook-convert', [epubPath, pdfPath]);
      console.log(`✅ Converted to ${pdfPath}`);
      return {
        success: true,
        pdfPath,
        originalPath: epubPath,
        message: 'Successfully converted EPUB to PDF'
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to convert EPUB to PDF. Make sure Calibre is installed. Error: ${err.message}`,
        pdfPath: null,
        originalPath: epubPath
      };
    }
  }

  /**
   * Search for book on Amazon using Rainforest API
   * Returns JSON object with search results
   */
  async searchBookByTitle(title) {
    try {
      if (!this.rainforestApiKey) {
        return {
          success: false,
          error: "Rainforest API key is required for title search",
          results: [],
          count: 0,
          query: title
        };
      }
      
      console.log(`🔍 Searching for "${title}" on Amazon...`);
      const searchUrl = `https://api.rainforestapi.com/request?api_key=${this.rainforestApiKey}&type=search&amazon_domain=amazon.com&search_term=${encodeURIComponent(title)}`;
      
      const data = await this.httpGet(searchUrl);
      
      // Track Rainforest API cost
      this.trackRainforestCost();
      
      if (!data.search_results || data.search_results.length === 0) {
        return {
          success: false,
          error: `No results found for "${title}"`,
          results: [],
          count: 0,
          query: title
        };
      }
      
      return {
        success: true,
        results: data.search_results,
        count: data.search_results.length,
        query: title,
        message: `Found ${data.search_results.length} results for "${title}"`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        results: [],
        count: 0,
        query: title
      };
    }
  }

  /**
   * Search Anna's Archive directly by title or partial match
   * Returns JSON object with search results
   */
  async searchAnnasArchive(query, options = {}) {
    const {
      maxResults = 10,
      format = 'pdf', // 'pdf', 'epub', 'pdf,epub', or 'all'
      sortBy = '', // '' (relevance) or 'date' (newest)
      language = 'en', // Language code (default: 'en' for English)
      sources = null // Data sources, comma-separated (default: null = search all sources)
    } = options;

    // Validate proxy configuration before attempting to use it
    if (!this.enableProxy || !this.proxyUrl) {
      return {
        success: false,
        error: 'Proxy configuration is required for Anna\'s Archive search',
        results: [],
        count: 0,
        query,
        options
      };
    }

    console.log(`🔍 Searching Anna's Archive for "${query}"...`);
    
    // Build search URL with all parameters matching Anna's Archive format
    const params = new URLSearchParams({
      index: '',
      page: '1',
      sort: sortBy,
      display: 'list_compact',
      q: query
    });
    
    // Add format filter (ext) - supports comma-separated values
    if (format && format !== 'all') {
      const formats = format.split(',').map(f => f.trim().toLowerCase());
      formats.forEach(fmt => {
        params.append('ext', fmt);
      });
    }
    
    // Add language filter (lang) - single value or comma-separated
    if (language) {
      const languages = language.split(',').map(l => l.trim().toLowerCase());
      languages.forEach(lang => {
        params.append('lang', lang);
      });
    }
    
    // Add source filters (src) - only if explicitly provided
    if (sources) {
      const sourceList = sources.split(',').map(s => s.trim().toLowerCase());
      sourceList.forEach(src => {
        params.append('src', src);
      });
    }
    
    const searchUrl = `https://annas-archive.org/search?${params.toString()}`;
    
    console.log(`🌐 Search URL: ${searchUrl}`);
    
    // Set up proxy for search (Anna's Archive) - only if enabled
    let proxyHost, proxyPort, proxyUsername, proxyPassword;
    let sessionId = null;
    let useProxy = false;
    
    if (this.enableProxy && this.proxyUrl) {
      useProxy = true;
      sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
      const proxyUrlObj = new URL(this.proxyUrl);
      proxyHost = proxyUrlObj.hostname;
      proxyPort = parseInt(proxyUrlObj.port) || 80;
      // Webshare sticky sessions: remove -rotate suffix and add session ID
      proxyUsername = this.proxyUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      proxyPassword = this.proxyPassword;
      
      console.log(`🔒 Using proxy session ${sessionId} (${proxyUsername}@${proxyHost}:${proxyPort})`);
    } else {
      console.log(`🌐 Direct connection (no proxy)`);
    }
    
    const userDataDir = `/tmp/puppeteer_search_${sessionId || Date.now()}_${Date.now()}`;
    
    // Default Docker-safe launch options
    const defaultLaunchOptions = {
      headless: this.headless,
      args: [
        ...(useProxy && proxyHost ? [`--proxy-server=${proxyHost}:${proxyPort}`] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-crash-reporter',
        `--user-data-dir=${userDataDir}`,
        `--data-path=${userDataDir}`,
        `--disk-cache-dir=${userDataDir}/cache`,
      ],
      defaultViewport: { width: 1200, height: 800 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    };
    
    // Merge with custom options if provided
    const launchOptions = this.puppeteerLaunchOptions
      ? { ...defaultLaunchOptions, ...this.puppeteerLaunchOptions }
      : defaultLaunchOptions;
    
    const browser = await puppeteer.launch(launchOptions);
    
    try {
      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      
      if (useProxy && proxyUsername && proxyPassword) {
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
      }
      
      // Navigate to search page with Cloudflare/DDoS-Guard bypass
      await navigateWithChallengeBypass(page, searchUrl, this.twocaptchaApiKey);
      
      // Additional DDoS-Guard handling (if needed after bypass)
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
      }

      // Wait for DDoS-Guard clearance
      console.log('⏳ Waiting for DDoS-Guard clearance...');
      const haveCookies = await this.waitForDdgCookies(page, 60000);
      if (haveCookies) {
        console.log('✅ DDoS-Guard cleared');
        try {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Wait for search results
      console.log('⏳ Waiting for search results...');
      await page.waitForSelector('.js-aarecord-list-outer', { timeout: 120000 });
      console.log('✅ Search results loaded');
      
      // Extract search results
      const results = await page.$$eval('.js-aarecord-list-outer', (containers, maxResults) => {
        return containers.slice(0, maxResults).map((container, idx) => {
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
          
          // Extract format
          const formatMatch = text.match(/\.(pdf|epub)/i);
          const format = formatMatch ? formatMatch[1].toLowerCase() : 'unknown';
          
          // Extract author if present
          const authorMatch = text.match(/by\s+([^,\n]+)/i);
          const author = authorMatch ? authorMatch[1].trim() : null;
          
          return {
            index: idx + 1,
            title: title,
            author: author,
            format: format,
            sizeInMB: sizeInMB,
            href: link ? link.getAttribute('href') : null,
            url: link ? `https://annas-archive.org${link.getAttribute('href')}` : null
          };
        });
      }, maxResults);
      
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      console.log(`✅ Found ${results.length} results`);
      
      return {
        success: true,
        results,
        count: results.length,
        query,
        options,
        message: `Found ${results.length} results for "${query}"`
      };
      
    } catch (error) {
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        error: error.message,
        results: [],
        count: 0,
        query,
        options
      };
    }
  }

  /**
   * Search 1lib.sk for books
   * 1lib.sk is a simpler alternative to Anna's Archive with no DDoS protection
   *
   * @param {string} query - Search query (title, author, ISBN, etc.)
   * @param {Object} options - Search options
   * @param {number} options.maxResults - Maximum number of results to return (default: 10)
   * @param {number} options.yearFrom - Filter by publication year from (e.g., 2020)
   * @param {number} options.yearTo - Filter by publication year to (e.g., 2024)
   * @param {string[]} options.languages - Filter by languages (e.g., ['english', 'spanish'])
   * @param {string[]} options.extensions - Filter by file extensions (e.g., ['PDF', 'EPUB'])
   * @param {string[]} options.contentTypes - Filter by content types (e.g., ['book', 'article'])
   * @param {string} options.order - Sort order: '' (relevance) or 'date' (newest first)
   * @param {string} options.view - View type: 'list' or 'grid' (default: 'list')
   * @returns {Promise<Array>} Array of search results
   */
  async search1lib(query, options = {}) {
    const {
      maxResults = 10,
      yearFrom = null,
      yearTo = null,
      languages = [],
      extensions = [],
      contentTypes = [],
      order = '',
      view = 'list'
    } = options;

    console.log(`🔍 Searching 1lib.sk for "${query}"...`);
    
    if (!this.enableProxy || !this.proxyUrl) {
      console.log(`⚠️  Warning: Proxy not configured. 1lib.sk may block direct access.`);
      console.log(`   Enable with: summary config --proxy true`);
    }
    
    // Build search URL matching 1lib.sk format
    // Note: 1lib.sk uses /s/ path for search, query params are optional filters
    const params = new URLSearchParams();
    
    // Add order and view if specified
    if (order) {
      params.append('order', order);
    }
    if (view && view !== 'list') {
      params.append('view', view);
    }
    
    // Add year filters
    if (yearFrom) {
      params.append('yearFrom', yearFrom.toString());
    }
    if (yearTo) {
      params.append('yearTo', yearTo.toString());
    }
    
    // Add language filters (array format)
    languages.forEach((lang, idx) => {
      params.append(`languages[${idx}]`, lang);
    });
    
    // Add extension filters (array format)
    extensions.forEach((ext, idx) => {
      params.append(`extensions[${idx}]`, ext);
    });
    
    // Add content type filters (array format)
    contentTypes.forEach((type, idx) => {
      params.append(`selected_content_types[${idx}]`, type);
    });
    
    // Build URL: query in path, filters in query string
    const paramString = params.toString();
    const searchUrl = paramString
      ? `https://1lib.sk/s/${encodeURIComponent(query)}?${paramString}`
      : `https://1lib.sk/s/${encodeURIComponent(query)}`;
    
    // Force console output for URLs (bypasses spinner)
    console.log(`🌐 Search URL: ${searchUrl}`);
    if (paramString) {
      console.log(`📋 Query parameters: ${paramString}`);
    }
    
    // Set up proxy for search (if enabled)
    let proxyHost, proxyPort, proxyUsername, proxyPassword;
    let sessionId = null;
    let useProxy = false;
    
    if (this.enableProxy && this.proxyUrl) {
      useProxy = true;
      sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
      const proxyUrlObj = new URL(this.proxyUrl);
      proxyHost = proxyUrlObj.hostname;
      proxyPort = parseInt(proxyUrlObj.port) || 80;
      // Webshare sticky sessions: remove -rotate suffix and add session ID
      proxyUsername = this.proxyUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      proxyPassword = this.proxyPassword;
      
      console.log(`🔒 Using proxy session ${sessionId}`);
      console.log(`   Username: ${proxyUsername}`);
      console.log(`   Password: ${proxyPassword ? '***' + proxyPassword.slice(-4) : '(not set)'}`);
      console.log(`   Server: ${proxyHost}:${proxyPort}`);
    } else {
      console.log(`🌐 Direct connection (no proxy)`);
    }
    
    const userDataDir = `/tmp/puppeteer_1lib_${sessionId || Date.now()}_${Date.now()}`;
    
    // Default Docker-safe launch options
    const defaultLaunchOptions = {
      headless: this.headless,
      args: [
        ...(useProxy && proxyHost ? [`--proxy-server=${proxyHost}:${proxyPort}`] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-crash-reporter',
        `--user-data-dir=${userDataDir}`,
        `--data-path=${userDataDir}`,
        `--disk-cache-dir=${userDataDir}/cache`,
      ],
      defaultViewport: { width: 1200, height: 800 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    };
    
    const launchOptions = this.puppeteerLaunchOptions
      ? { ...defaultLaunchOptions, ...this.puppeteerLaunchOptions }
      : defaultLaunchOptions;
    
    const browser = await puppeteer.launch(launchOptions);
    
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
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      
      if (useProxy && proxyUsername && proxyPassword) {
        console.log(`🔐 Authenticating with proxy...`);
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
        console.log(`✅ Proxy authentication set`);
      }
      
      // Navigate to search page with Cloudflare/DDoS-Guard bypass
      await navigateWithChallengeBypass(page, searchUrl, this.twocaptchaApiKey);
      
      console.log(`✅ Page loaded: ${page.url()}`);
      
      // Wait for search results (1lib.sk uses z-bookcard custom elements)
      console.log('⏳ Waiting for search results (z-bookcard elements)...');
      
      // Try to wait for results container
      try {
        await page.waitForSelector('z-bookcard', { timeout: 30000 });
        console.log('✅ Search results loaded');
      } catch (selectorError) {
        // Save debug HTML to help diagnose the issue
        const debugHtml = await page.content();
        const debugPath = './debug-1lib-search.html';
        const debugTitle = await page.title();
        await fsp.writeFile(debugPath, debugHtml, 'utf8');
        console.log(`ℹ️  No z-bookcard elements found`);
        console.log(`📄 Page title: "${debugTitle}"`);
        console.log(`🔗 Current URL: ${page.url()}`);
        console.log(`💾 Debug HTML saved to: ${debugPath}`);
        
        await browser.close();
        
        // Clean up browser profile
        try {
          await fsp.rm(userDataDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        
        return {
          success: true,
          results: [],
          count: 0,
          query,
          options,
          message: 'No results found'
        };
      }
      
      // Extract search results from z-bookcard elements
      const results = await page.evaluate((maxResults) => {
        const items = [];
        
        // Select z-bookcard elements (the actual book data containers)
        const bookcards = document.querySelectorAll('z-bookcard');
        
        for (let i = 0; i < Math.min(bookcards.length, maxResults); i++) {
          const card = bookcards[i];
          
          try {
            // Extract data from attributes
            const isbn = card.getAttribute('isbn') || null;
            const href = card.getAttribute('href') || '';
            const download = card.getAttribute('download') || '';
            const deleted = card.getAttribute('deleted') || '';
            const publisher = card.getAttribute('publisher') || null;
            const language = card.getAttribute('language') || null;
            const year = card.getAttribute('year') ? parseInt(card.getAttribute('year'), 10) : null;
            const extension = card.getAttribute('extension') || 'pdf';
            const filesize = card.getAttribute('filesize') || 'Unknown';
            
            // Extract title from slot
            const titleEl = card.querySelector('[slot="title"]');
            const title = titleEl ? titleEl.textContent.trim() : '';
            
            // Extract author from slot
            const authorEl = card.querySelector('[slot="author"]');
            const author = authorEl ? authorEl.textContent.trim() : null;
            
            // Build full URLs
            const url = href ? `https://1lib.sk${href}` : '';
            const downloadUrl = download ? `https://1lib.sk${download}` : '';
            
            // Skip deleted books (no download link)
            if (deleted === '1' || !download) {
              continue;
            }
            
            if (title && url) {
              items.push({
                index: items.length + 1,
                title,
                author,
                year,
                language,
                extension: extension.toUpperCase(),
                size: filesize,
                isbn,
                publisher,
                url,
                downloadUrl,
                href
              });
            }
          } catch (itemError) {
            console.error('Error extracting item:', itemError);
          }
        }
        
        return items;
      }, maxResults);
      
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      console.log(`✅ Found ${results.length} results`);
      
      return {
        success: true,
        results,
        count: results.length,
        query,
        options,
        message: `Found ${results.length} results for "${query}"`
      };
      
    } catch (error) {
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        error: error.message,
        results: [],
        count: 0,
        query,
        options
      };
    } finally {
      // Remove signal handlers
      process.removeListener('SIGINT', cleanup);
      process.removeListener('SIGTERM', cleanup);
    }
  }

  /**
   * Search 1lib.sk and download a book in one session
   * Keeps browser session alive to avoid download link expiration
   *
   * @param {string} query - Search query
   * @param {Object} searchOptions - Search options (same as search1lib)
   * @param {string} outputDir - Directory to save the file
   * @param {Function} selectCallback - Async function that receives results and returns selected index
   * @returns {Promise<Object>} JSON object with search results and download info
   */
  async search1libAndDownload(query, searchOptions = {}, outputDir = '.', selectCallback = null) {
    const {
      maxResults = 10,
      yearFrom = null,
      yearTo = null,
      languages = [],
      extensions = [],
      contentTypes = [],
      order = '',
      view = 'list'
    } = searchOptions;

    console.log(`🔍 Searching 1lib.sk for "${query}"...`);
    
    if (!this.enableProxy || !this.proxyUrl) {
      console.log(`⚠️  Warning: Proxy not configured. 1lib.sk may block direct access.`);
      console.log(`   Enable with: summary config --proxy true`);
    }
    
    // Build search URL
    const params = new URLSearchParams();
    
    // Add order and view if specified
    if (order) {
      params.append('order', order);
    }
    if (view && view !== 'list') {
      params.append('view', view);
    }
    
    if (yearFrom) params.append('yearFrom', yearFrom.toString());
    if (yearTo) params.append('yearTo', yearTo.toString());
    
    languages.forEach((lang, idx) => {
      params.append(`languages[${idx}]`, lang);
    });
    
    extensions.forEach((ext, idx) => {
      params.append(`extensions[${idx}]`, ext);
    });
    
    contentTypes.forEach((type, idx) => {
      params.append(`selected_content_types[${idx}]`, type);
    });
    
    // Build URL: query in path, filters in query string
    const paramString = params.toString();
    const searchUrl = paramString
      ? `https://1lib.sk/s/${encodeURIComponent(query)}?${paramString}`
      : `https://1lib.sk/s/${encodeURIComponent(query)}`;
    
    // Set up proxy (only if enabled)
    let proxyHost, proxyPort, proxyUsername, proxyPassword;
    let sessionId = null;
    let useProxy = false;
    
    if (this.enableProxy && this.proxyUrl) {
      useProxy = true;
      sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
      const proxyUrlObj = new URL(this.proxyUrl);
      proxyHost = proxyUrlObj.hostname;
      proxyPort = parseInt(proxyUrlObj.port) || 80;
      // Webshare sticky sessions: remove -rotate suffix and add session ID
      proxyUsername = this.proxyUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      proxyPassword = this.proxyPassword;
      
      console.log(`🔒 Using proxy session ${sessionId} (${proxyUsername}@${proxyHost}:${proxyPort})`);
    } else {
      console.log(`🌐 Direct connection (no proxy)`);
    }
    
    const userDataDir = `/tmp/puppeteer_1lib_combined_${sessionId || Date.now()}_${Date.now()}`;
    
    // Default Docker-safe launch options
    const defaultLaunchOptions = {
      headless: this.headless,
      args: [
        ...(useProxy && proxyHost ? [`--proxy-server=${proxyHost}:${proxyPort}`] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-crash-reporter',
        `--user-data-dir=${userDataDir}`,
        `--data-path=${userDataDir}`,
        `--disk-cache-dir=${userDataDir}/cache`,
      ],
      defaultViewport: { width: 1200, height: 800 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    };
    
    const launchOptions = this.puppeteerLaunchOptions
      ? { ...defaultLaunchOptions, ...this.puppeteerLaunchOptions }
      : defaultLaunchOptions;
    
    const browser = await puppeteer.launch(launchOptions);
    
    try {
      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      
      if (useProxy && proxyUsername && proxyPassword) {
        console.log(`🔐 Authenticating with proxy...`);
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
        console.log(`✅ Proxy authentication set`);
      }
      
      // Navigate to search page with Cloudflare/DDoS-Guard bypass
      await navigateWithChallengeBypass(page, searchUrl, this.twocaptchaApiKey);
      
      // Wait for search results
      console.log('⏳ Waiting for search results...');
      
      try {
        await page.waitForSelector('z-bookcard', { timeout: 30000 });
        console.log('✅ Search results loaded');
      } catch (selectorError) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error('No search results found');
      }
      
      // Extract search results
      const results = await page.evaluate((maxResults) => {
        const items = [];
        const bookcards = document.querySelectorAll('z-bookcard');
        
        for (let i = 0; i < Math.min(bookcards.length, maxResults); i++) {
          const card = bookcards[i];
          
          const isbn = card.getAttribute('isbn') || null;
          const href = card.getAttribute('href') || '';
          const download = card.getAttribute('download') || '';
          const deleted = card.getAttribute('deleted') || '';
          const publisher = card.getAttribute('publisher') || null;
          const language = card.getAttribute('language') || null;
          const year = card.getAttribute('year') ? parseInt(card.getAttribute('year'), 10) : null;
          const extension = card.getAttribute('extension') || 'pdf';
          const filesize = card.getAttribute('filesize') || 'Unknown';
          
          const titleEl = card.querySelector('[slot="title"]');
          const title = titleEl ? titleEl.textContent.trim() : '';
          
          const authorEl = card.querySelector('[slot="author"]');
          const author = authorEl ? authorEl.textContent.trim() : null;
          
          const url = href ? `https://1lib.sk${href}` : '';
          const downloadUrl = download ? `https://1lib.sk${download}` : '';
          
          if (deleted === '1' || !download) continue;
          
          if (title && url) {
            items.push({
              index: items.length + 1,
              title,
              author,
              year,
              language,
              extension: extension.toUpperCase(),
              size: filesize,
              isbn,
              publisher,
              url,
              downloadUrl,
              href,
              download
            });
          }
        }
        
        return items;
      }, maxResults);
      
      if (results.length === 0) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: true,
          results: [],
          download: null,
          message: 'No results found'
        };
      }
      
      console.log(`✅ Found ${results.length} results`);
      
      // Call the selection callback (keeps browser alive!)
      const selectedIndex = await selectCallback(results);
      
      if (selectedIndex === null || selectedIndex === -1 || selectedIndex === undefined) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        return {
          success: true,
          results,
          download: null,
          message: 'No book selected'
        };
      }
      
      // Get selected book
      const selectedBook = results[selectedIndex];
      if (!selectedBook) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`Invalid book index: ${selectedIndex}`);
      }
      
      console.log(`📖 Selected: ${selectedBook.title}`);
      
      // Download using the SAME browser session
      const finalTitle = selectedBook.title;
      const sanitizedTitle = this.sanitizeFilename(finalTitle);
      const identifier = selectedBook.isbn ? selectedBook.isbn.replace(/[-\s]/g, '') : `1lib_${Date.now()}`;
      
      const dirName = this.generateDirectoryName(sanitizedTitle, identifier);
      const bookDir = path.join(outputDir, 'uploads', dirName);
      
      let dirResult;
      try {
        dirResult = await ensureDirectory(bookDir, this.force, this.promptFn);
      } catch (dirError) {
        console.error(`❌ Directory creation failed: ${dirError.message}`);
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`Directory creation failed: ${dirError.message}`);
      }
      
      if (!dirResult.created) {
        console.log(`⏭️  Directory already exists and user chose not to overwrite: ${bookDir}`);
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error('Operation cancelled: Directory already exists');
      }
      
      if (dirResult.overwritten) {
        console.log(`🔄 Overwritten existing directory: ${bookDir}`);
      } else {
        console.log(`📁 Created directory: ${bookDir}`);
      }
      
      // Navigate to book page (same session!)
      console.log(`🌐 Navigating to book page...`);
      console.log(`📖 Book URL: ${selectedBook.url}`);
      console.log(`📥 Download URL from search: ${selectedBook.downloadUrl}`);
      await page.goto(selectedBook.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      console.log(`✅ On book page: ${page.url()}`);
      
      console.log(`🖱️  Looking for download button...`);
      
      // Try to find and click the download button with multiple selectors
      const clicked = await page.evaluate(() => {
        // Try multiple selectors for the download button
        const selectors = [
          'a.addDownloadedBook[href^="/dl/"]',
          'a[href^="/dl/"]',
          'a.btn-primary[href^="/dl/"]',
          'button.addDownloadedBook',
          '.download-button',
          '[data-action="download"]'
        ];
        
        for (const selector of selectors) {
          const downloadBtn = document.querySelector(selector);
          if (downloadBtn) {
            const href = downloadBtn.getAttribute('href') || downloadBtn.getAttribute('data-href');
            return { found: true, href, selector };
          }
        }
        
        // If no button found, return debug info
        const allLinks = Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent.trim().substring(0, 50),
          classes: a.className
        }));
        
        return { found: false, allLinks };
      });
      
      if (!clicked.found) {
        // Save debug HTML for inspection
        const debugHtml = await page.content();
        const debugPath = path.join(bookDir, 'debug-book-page.html');
        await fsp.writeFile(debugPath, debugHtml, 'utf8');
        
        console.error(`❌ Download button not found on book page`);
        console.error(`   Debug HTML saved to: ${debugPath}`);
        console.error(`   Found ${clicked.allLinks?.length || 0} links on page`);
        if (clicked.allLinks && clicked.allLinks.length > 0) {
          console.error(`   First 5 links:`);
          clicked.allLinks.slice(0, 5).forEach(link => {
            console.error(`   - ${link.href} (${link.text})`);
          });
        }
        
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error('Download button not found');
      }
      
      console.log(`✅ Found download button with selector: ${clicked.selector}`);
      console.log(`📎 Button href: ${clicked.href}`);
      
      // Navigate to download URL and capture the CDN redirect
      const initialDlUrl = `https://1lib.sk${clicked.href}`;
      console.log(`📥 Navigating to download URL: ${initialDlUrl}`);
      
      // Wait for the PDF response from CDN (after redirect)
      const [pdfResponse] = await Promise.all([
        page.waitForResponse(
          (resp) => {
            const ct = resp.headers()['content-type'] || '';
            return resp.status() === 200 && ct.includes('application/pdf');
          },
          { timeout: 30000 }
        ),
        page.goto(initialDlUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        }).catch(() => {
          // Navigation may abort - that's OK if we got the response
          console.log(`ℹ️  Navigation aborted (expected for downloads)`);
        })
      ]);
      
      if (!pdfResponse) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error('Failed to capture PDF response from CDN');
      }
      
      const cdnUrl = pdfResponse.url();
      const cdnContentLength = parseInt(pdfResponse.headers()['content-length'] || '0', 10);
      
      console.log(`📍 Found PDF on CDN: ${cdnUrl.substring(0, 80)}...`);
      console.log(`📊 File size: ${(cdnContentLength / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📥 Downloading from CDN...`);
      
      // Get cookies to use with fetch
      const cookies = await page.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Download from CDN with fetch and progress tracking
      const fetchResponse = await fetch(cdnUrl, {
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': initialDlUrl
        }
      });
      
      if (!fetchResponse.ok) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`CDN download failed: HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
      }
      
      // Download with progress tracking
      const chunks = [];
      let downloadedBytes = 0;
      let lastProgressPercent = 0;
      
      for await (const chunk of fetchResponse.body) {
        chunks.push(chunk);
        downloadedBytes += chunk.length;
        
        if (cdnContentLength > 0) {
          const progressPercent = Math.floor((downloadedBytes / cdnContentLength) * 100);
          if (progressPercent >= lastProgressPercent + 10) {
            console.log(`   📥 Downloaded: ${progressPercent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`);
            lastProgressPercent = progressPercent;
          }
        }
      }
      
      const buffer = Buffer.concat(chunks);
      
      if (!buffer || buffer.length < 100000) {
        await browser.close();
        await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`Downloaded file is too small (${(buffer.length / 1024).toFixed(2)} KB). Expected at least 100 KB.`);
      }
      
      console.log(`✅ Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      // Determine extension - default to PDF (1lib.sk primarily serves PDFs)
      let ext = '.pdf';
      if (cdnUrl.toLowerCase().includes('.epub')) {
        ext = '.epub';
      }
      const filename = `${sanitizedTitle}${ext}`;
      const filepath = path.join(bookDir, filename);
      
      await fsp.writeFile(filepath, buffer);
      console.log(`✅ Saved: ${filepath}`);
      
      await browser.close();
      await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
      
      return {
        success: true,
        results,
        download: {
          filepath,
          directory: bookDir,
          filename,
          title: finalTitle,
          identifier,
          format: ext.replace('.', ''),
          converted: false
        },
        message: `Successfully downloaded "${finalTitle}"`
      };
      
    } catch (error) {
      await browser.close();
      await fsp.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
      return {
        success: false,
        error: error.message,
        results: [],
        download: null
      };
    }
  }

  /**
   * Download a book from 1lib.sk
   *
   * NOTE: This method creates a new browser session. For better reliability,
   * use search1libAndDownload() which keeps the session alive.
   *
   * @param {string} bookUrl - The book page URL from search results
   * @param {string} outputDir - Directory to save the downloaded file (default: '.')
   * @param {string} bookTitle - Book title for directory naming
   * @param {string} downloadUrl - Optional: Direct download URL from search results
   * @returns {Promise<Object>} Download result with filepath, directory, etc.
   */
  async downloadFrom1lib(bookUrl, outputDir = '.', bookTitle = null, downloadUrl = null) {
    if (!this.enableProxy || !this.proxyUrl) {
      return {
        success: false,
        error: 'Proxy configuration is required for 1lib.sk downloads',
        filepath: null,
        directory: null
      };
    }

    console.log(`📚 Downloading from 1lib.sk...`);
    if (downloadUrl) {
      console.log(`🔗 Using download URL from search results`);
    } else {
      console.log(`🌐 Book URL: ${bookUrl}`);
    }
    
    // Set up proxy for download - only if enabled
    let proxyHost, proxyPort, proxyUsername, proxyPassword;
    let sessionId = null;
    let useProxy = false;
    
    if (this.enableProxy && this.proxyUrl) {
      useProxy = true;
      sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
      const proxyUrlObj = new URL(this.proxyUrl);
      proxyHost = proxyUrlObj.hostname;
      proxyPort = parseInt(proxyUrlObj.port) || 80;
      // Webshare sticky sessions: remove -rotate suffix and add session ID
      proxyUsername = this.proxyUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      proxyPassword = this.proxyPassword;
      
      console.log(`🔒 Using proxy session ${sessionId} (${proxyUsername}@${proxyHost}:${proxyPort})`);
    } else {
      console.log(`🌐 Direct connection (no proxy)`);
    }
    
    const userDataDir = `/tmp/puppeteer_1lib_download_${sessionId || Date.now()}_${Date.now()}`;
    
    // Default Docker-safe launch options
    const defaultLaunchOptions = {
      headless: this.headless,
      args: [
        ...(useProxy && proxyHost ? [`--proxy-server=${proxyHost}:${proxyPort}`] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-crash-reporter',
        `--user-data-dir=${userDataDir}`,
        `--data-path=${userDataDir}`,
        `--disk-cache-dir=${userDataDir}/cache`,
      ],
      defaultViewport: { width: 1200, height: 800 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    };
    
    const launchOptions = this.puppeteerLaunchOptions
      ? { ...defaultLaunchOptions, ...this.puppeteerLaunchOptions }
      : defaultLaunchOptions;
    
    const browser = await puppeteer.launch(launchOptions);
    
    try {
      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      
      if (useProxy && proxyUsername && proxyPassword) {
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
      }
      
      // Navigate to book page
      console.log(`🌐 Navigating to book page...`);
      await page.goto(bookUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Extract book metadata from the page
      const bookInfo = await page.evaluate(() => {
        // Try to find title
        const titleEl = document.querySelector('h1, .book-title, [itemprop="name"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        
        // Try to find author
        const authorEl = document.querySelector('.authors, .book-author, [itemprop="author"]');
        const author = authorEl ? authorEl.textContent.trim() : null;
        
        // Try to find ISBN
        const isbnEl = document.querySelector('.property_isbn, [itemprop="isbn"]');
        const isbn = isbnEl ? isbnEl.textContent.trim() : null;
        
        return { title, author, isbn };
      });
      
      console.log(`📖 Book: ${bookInfo.title}`);
      if (bookInfo.author) {
        console.log(`✍️  Author: ${bookInfo.author}`);
      }
      
      // Use provided title or extracted title
      const finalTitle = bookTitle || bookInfo.title || 'unknown_book';
      const sanitizedTitle = this.sanitizeFilename(finalTitle);
      
      // Generate unique identifier (use ISBN if available, otherwise timestamp)
      const identifier = bookInfo.isbn ? bookInfo.isbn.replace(/[-\s]/g, '') : `1lib_${Date.now()}`;
      
      // Create directory
      const dirName = this.generateDirectoryName(sanitizedTitle, identifier);
      const bookDir = path.join(outputDir, 'uploads', dirName);
      
      // Check for existing directory and handle overwrite protection
      const dirResult = await ensureDirectory(bookDir, this.force, this.promptFn);
      
      if (!dirResult.created) {
        console.log(`⏭️  Skipped: Directory already exists and user chose not to overwrite`);
        await browser.close();
        throw new Error('Operation cancelled: Directory already exists');
      }
      
      if (dirResult.overwritten) {
        console.log(`🔄 Overwritten existing directory: ${bookDir}`);
      } else {
        console.log(`📁 Created directory: ${bookDir}`);
      }
      
      // Look for download button and navigate to it with Puppeteer
      console.log(`🔍 Looking for download button...`);
      
      // Get the download link from the button
      const downloadLink = await page.evaluate(() => {
        const downloadBtn = document.querySelector('a.addDownloadedBook[href^="/dl/"]');
        return downloadBtn ? downloadBtn.getAttribute('href') : null;
      });
      
      if (!downloadLink) {
        throw new Error('Could not find download button on page');
      }
      
      const dlUrl = downloadLink.startsWith('http')
        ? downloadLink
        : `https://1lib.sk${downloadLink}`;
      
      console.log(`✅ Found download link: ${dlUrl}`);
      console.log(`🌐 Navigating to download page...`);
      
      // DEBUG: Log navigation attempt
      console.log(`🔍 DEBUG: Attempting navigation to ${dlUrl}`);
      console.log(`🔍 DEBUG: Using waitUntil: networkidle0, timeout: 60000ms`);
      
      // Navigate to download URL with Puppeteer (maintains session)
      let response;
      try {
        response = await page.goto(dlUrl, {
          waitUntil: 'networkidle0',
          timeout: 60000
        });
        console.log(`🔍 DEBUG: Navigation completed, response status: ${response?.status()}`);
        console.log(`🔍 DEBUG: Response URL: ${response?.url()}`);
        console.log(`🔍 DEBUG: Content-Type: ${response?.headers()['content-type']}`);
      } catch (navError) {
        console.log(`🔍 DEBUG: Navigation error: ${navError.message}`);
        console.log(`🔍 DEBUG: This might be expected for downloads (navigation aborts)`);
        throw navError;
      }
      
      // Check if we got redirected to an error page
      const finalUrl = page.url();
      console.log(`🔍 DEBUG: Final page URL after navigation: ${finalUrl}`);
      
      if (finalUrl.includes('wrongHash') || finalUrl === 'https://1lib.sk//') {
        console.log(`🔍 DEBUG: Detected error page redirect`);
        throw new Error('Download link expired or invalid. The book page may need to be refreshed.');
      }
      
      console.log(`✅ Download page loaded: ${finalUrl}`);
      
      // Get the response buffer
      console.log(`🔍 DEBUG: Attempting to get response buffer...`);
      console.log(`🔍 DEBUG: Response object exists: ${!!response}`);
      const buffer = await response.buffer();
      console.log(`🔍 DEBUG: Buffer received, size: ${buffer?.length || 0} bytes`);
      
      if (!buffer || buffer.length < 1000) {
        throw new Error(`Downloaded file is too small (${buffer.length} bytes). This might be an error page.`);
      }
      
      console.log(`✅ Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      // Determine file extension from content-type or URL
      const contentType = response.headers.get('content-type') || '';
      let ext = '.pdf';
      if (contentType.includes('epub')) {
        ext = '.epub';
      } else if (downloadUrl.toLowerCase().includes('.epub')) {
        ext = '.epub';
      }
      
      const filename = `${sanitizedTitle}${ext}`;
      const filepath = path.join(bookDir, filename);
      
      await fsp.writeFile(filepath, buffer);
      console.log(`✅ Saved: ${filepath}`);
      console.log(`📖 File size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
      
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      return {
        filepath,
        originalPath: filepath,
        directory: bookDir,
        filename: path.basename(filepath),
        originalFilename: filename,
        title: finalTitle,
        identifier: identifier,
        format: ext.replace('.', ''),
        converted: false
      };
      
    } catch (error) {
      await browser.close();
      
      // Clean up browser profile
      try {
        await fsp.rm(userDataDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      throw new Error(`Failed to download from 1lib.sk: ${error.message}`);
    }
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
    
    // Simple proxy setup like test-just-proxy.js - only if enabled
    let proxyHost, proxyPort, proxyUsername, proxyPassword;
    let sessionId = null;
    let useProxy = false;
    
    if (this.enableProxy && this.proxyUrl) {
      useProxy = true;
      // Session ID must be between 1-proxyPoolSize for Webshare sticky sessions
      sessionId = Math.floor(Math.random() * this.proxyPoolSize) + 1;
      const proxyUrlObj = new URL(this.proxyUrl);
      proxyHost = proxyUrlObj.hostname;
      proxyPort = parseInt(proxyUrlObj.port) || 80;
      // Webshare sticky sessions: remove -rotate suffix and add session ID
      proxyUsername = this.proxyUsername.replace(/-rotate$/, '') + `-${sessionId}`;
      proxyPassword = this.proxyPassword;
      
      console.log(`🔒 Proxy session: ${sessionId} (${proxyUsername}@${proxyHost}:${proxyPort})`);
      console.log(`ℹ️  Using proxy session ${sessionId} (sticky session from pool of ${this.proxyPoolSize})`);
    } else {
      console.log(`🌐 Direct connection (no proxy)`);
    }
    
    // Use a unique profile per session to avoid conflicts between runs
    const userDataDir = `/tmp/puppeteer_ddg_profile_${sessionId || Date.now()}_${Date.now()}`;
    
    // Default Docker-safe launch options
    const defaultLaunchOptions = {
      headless: this.headless,
      args: [
        ...(useProxy && proxyHost ? [`--proxy-server=${proxyHost}:${proxyPort}`] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-crash-reporter',
        `--user-data-dir=${userDataDir}`,
        `--data-path=${userDataDir}`,
        `--disk-cache-dir=${userDataDir}/cache`,
      ],
      defaultViewport: { width: 1200, height: 800 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    };
    
    const launchOptions = this.puppeteerLaunchOptions
      ? { ...defaultLaunchOptions, ...this.puppeteerLaunchOptions }
      : defaultLaunchOptions;
    
    const browser = await puppeteer.launch(launchOptions);
    
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
      if (useProxy && proxyUsername && proxyPassword) {
        await page.authenticate({ username: proxyUsername, password: proxyPassword });
      }
      
      // Step 1: Go to search page with Cloudflare/DDoS-Guard bypass
      await navigateWithChallengeBypass(page, searchUrl, this.twocaptchaApiKey);
      
      // Additional DDoS-Guard handling (if needed after bypass)
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
          const downloadUrl = await this.getDownloadUrlWithPuppeteer(page.url(), page, bookDir, this.twocaptchaApiKey);
          
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

    this.logger.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (pages ${startPage}-${endPage})...`);
    this.logger.progress(
      ((chunkIndex + 1) / totalChunks) * 80, // Reserve 20% for synthesis
      `Processing chunk ${chunkIndex + 1}/${totalChunks}`,
      { step: 'chunk_processing', current: chunkIndex + 1, total: totalChunks }
    );

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
      this.logger.log(
        `Chunk ${chunkIndex + 1} cost: $${cost.toFixed(4)} (${resp.usage.prompt_tokens} in, ${resp.usage.completion_tokens} out)`,
        'info',
        { step: 'cost_tracking', cost, tokens: resp.usage }
      );
    }

    const summary = resp.choices[0]?.message?.content ?? "";
    if (!summary || summary.trim().length < 50) {
      throw new Error(`Chunk ${chunkIndex + 1} returned unexpectedly short content`);
    }

    this.logger.log(`Chunk ${chunkIndex + 1} processed: ${summary.length} chars`);
    return summary;
  }

  /**
   * Synthesize multiple chunk summaries into a cohesive final summary
   * @private
   */
  async synthesizeChunkSummaries(chunkSummaries, bookTitle = "the book") {
    this.logger.log("Synthesizing chunk summaries into final comprehensive summary...");
    this.logger.progress(85, "Synthesizing final summary", { step: 'synthesis' });

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
      this.logger.log(
        `Synthesis cost: $${cost.toFixed(4)} (${resp.usage.prompt_tokens} in, ${resp.usage.completion_tokens} out)`,
        'info',
        { step: 'cost_tracking', cost, tokens: resp.usage }
      );
    }

    const finalSummary = resp.choices[0]?.message?.content ?? "";
    if (!finalSummary || finalSummary.trim().length < 200) {
      throw new Error("Synthesis returned unexpectedly short content");
    }

    this.logger.log(`Final summary synthesized: ${finalSummary.length} chars`);
    this.logger.progress(95, "Summary synthesis complete", { step: 'synthesis_complete' });
    return finalSummary;
  }

  /**
   * Generate summary using GPT-5 with PDF file upload (with fallback to chunked text extraction)
   * Returns JSON object with summary result
   */
  async generateSummary(pdfPath) {
    this.logger.log("Processing PDF...");
    this.logger.progress(5, "Starting PDF processing", { step: 'init' });
    
    // Get file stats
    const stats = await fsp.stat(pdfPath);
    const pdfSizeKB = (stats.size / 1024).toFixed(2);
    const pdfSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    this.logger.log(`PDF size: ${pdfSizeMB} MB (${pdfSizeKB} KB)`);
    
    // Try GPT-5 with file upload first
    try {
      this.logger.log("Attempting GPT-5 with PDF file upload...");
      this.logger.progress(10, "Uploading PDF to OpenAI", { step: 'upload' });
      
      // Upload PDF file to OpenAI
      const fileStream = fs.createReadStream(pdfPath);
      const file = await this.openai.files.create({
        file: fileStream,
        purpose: 'user_data'
      });
      
      this.logger.log(`PDF uploaded. File ID: ${file.id}`);
      this.logger.progress(20, "PDF uploaded successfully", { step: 'upload_complete' });
      
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

      this.logger.log("Asking GPT-5 to generate summary from PDF file...");
      this.logger.progress(30, "Generating summary with AI", { step: 'ai_generation' });
      
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
        this.logger.log(`OpenAI cost: $${cost.toFixed(4)}`, 'info', {
          step: 'cost_tracking',
          cost,
          tokens: { input: resp.usage.prompt_tokens, output: resp.usage.completion_tokens }
        });
      }

      // Clean up uploaded file
      try {
        await this.openai.files.delete(file.id);
        this.logger.log("Cleaned up uploaded file");
      } catch (cleanupError) {
        this.logger.log(`Warning: Could not delete uploaded file: ${cleanupError.message}`, 'warn');
      }

      const md = resp.choices[0]?.message?.content ?? "";
      if (!md || md.trim().length < 200) {
        throw new Error("Model returned unexpectedly short content");
      }

      this.logger.log("Successfully generated summary using GPT-5 with PDF file");
      this.logger.progress(90, "Summary generation complete", { step: 'generation_complete' });
      return {
        success: true,
        markdown: md,
        length: md.length,
        method: 'gpt5_pdf_upload',
        message: 'Successfully generated summary using GPT-5 with PDF file'
      };
      
    } catch (fileUploadError) {
      // Log the file upload error
      this.logger.log(`GPT-5 PDF file upload failed: ${fileUploadError.message}`, 'warn');
      if (fileUploadError.response) {
        this.logger.log(`API Error: ${fileUploadError.response.status}`, 'error', {
          status: fileUploadError.response.status,
          data: fileUploadError.response.data
        });
      }
      
      // Fallback to intelligent chunked text extraction
      this.logger.log("Falling back to intelligent chunked text extraction...");
      this.logger.progress(15, "Using fallback text extraction method", { step: 'fallback' });
      
      try {
        // Get PDF statistics
        const stats = await getPdfStats(pdfPath);
        this.logger.log(`PDF Stats: ${stats.totalPages} pages, ${stats.totalChars.toLocaleString()} chars, ~${stats.estimatedTokens.toLocaleString()} tokens`);
        
        // Determine if we need chunking
        const needsChunking = stats.totalChars > this.maxChars;
        
        if (!needsChunking) {
          // Small PDF - process normally without chunking
          this.logger.log("PDF is small enough to process in one request");
          this.logger.progress(25, "Processing PDF in single request", { step: 'single_request' });
          
          const pdfBuffer = await fsp.readFile(pdfPath);
          const result = await PDFParse(pdfBuffer);
          
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

          this.logger.log("Asking GPT-5 to generate summary from extracted text...");
          this.logger.progress(40, "Generating summary with AI", { step: 'ai_generation' });
          
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
            this.logger.log(`OpenAI cost: $${cost.toFixed(4)}`, 'info', {
              step: 'cost_tracking',
              cost,
              tokens: { input: resp.usage.prompt_tokens, output: resp.usage.completion_tokens }
            });
          }

          const md = resp.choices[0]?.message?.content ?? "";
          if (!md || md.trim().length < 200) {
            throw new Error("Model returned unexpectedly short content");
          }

          this.logger.log("Successfully generated summary using text extraction");
          this.logger.progress(90, "Summary generation complete", { step: 'generation_complete' });
          return {
            success: true,
            markdown: md,
            length: md.length,
            method: 'text_extraction_single',
            message: 'Successfully generated summary using text extraction'
          };
        }
        
        // Large PDF - use intelligent chunking
        this.logger.log("PDF is large - using intelligent chunking strategy");
        this.logger.log(`This will process the ENTIRE ${stats.totalPages}-page PDF without truncation`);
        this.logger.progress(20, "Preparing chunked processing", { step: 'chunking_prep' });
        
        // Extract pages
        this.logger.log("Extracting pages from PDF...");
        const pages = await extractPdfPages(pdfPath);
        this.logger.log(`Extracted ${pages.length} pages`);
        
        // Calculate optimal chunk size
        const optimalChunkSize = calculateOptimalChunkSize(stats.totalChars, 100000);
        this.logger.log(`Using chunk size: ${optimalChunkSize.toLocaleString()} chars`);
        
        // Create chunks
        const chunks = createChunks(pages, optimalChunkSize);
        this.logger.log(`Created ${chunks.length} chunks for processing`);
        
        // Display chunk information
        chunks.forEach((chunk, idx) => {
          this.logger.log(`Chunk ${idx + 1}: Pages ${chunk.startPage}-${chunk.endPage} (${chunk.charCount.toLocaleString()} chars)`, 'debug');
        });
        
        // Process each chunk
        this.logger.log("Processing chunks...");
        this.logger.progress(25, `Processing ${chunks.length} chunks`, { step: 'chunk_processing_start', total: chunks.length });
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
            this.logger.error(`Failed to process chunk ${i + 1}: ${chunkError.message}`, chunkError);
            throw new Error(`Chunk processing failed at chunk ${i + 1}: ${chunkError.message}`);
          }
        }
        
        this.logger.log(`All ${chunks.length} chunks processed successfully`);
        this.logger.progress(80, "All chunks processed", { step: 'chunks_complete' });
        
        // Synthesize chunks into final summary
        const bookTitle = pdfPath.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' ');
        const finalSummary = await this.synthesizeChunkSummaries(chunkSummaries, bookTitle);
        
        this.logger.log("Successfully generated comprehensive summary using intelligent chunking");
        this.logger.log(`Final summary: ${finalSummary.length.toLocaleString()} characters`);
        this.logger.log("Note: Images/diagrams from PDF were not included (text-only extraction)", 'info');
        this.logger.progress(95, "Summary complete", { step: 'complete' });
        
        return {
          success: true,
          markdown: finalSummary,
          length: finalSummary.length,
          method: 'text_extraction_chunked',
          chunks: chunks.length,
          message: 'Successfully generated comprehensive summary using intelligent chunking'
        };
        
      } catch (textExtractionError) {
        this.logger.error(`Text extraction fallback failed: ${textExtractionError.message}`, textExtractionError);
        return {
          success: false,
          error: textExtractionError.message,
          markdown: null,
          length: 0,
          method: 'failed'
        };
      }
    }
  }

  /**
   * Generate audio-friendly script from markdown summary
   * Converts markdown to natural, conversational narration
   * Returns JSON object with script result
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
      return {
        success: true,
        script,
        length: script.length,
        message: 'Successfully generated audio script'
      };
    } catch (error) {
      console.error(`⚠️  Failed to generate audio script: ${error.message}`);
      console.log("ℹ️  Falling back to sanitized markdown");
      const fallbackScript = this.sanitizeTextForAudio(markdown);
      return {
        success: true,
        script: fallbackScript,
        length: fallbackScript.length,
        message: 'Generated audio script using fallback sanitization'
      };
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
   * Returns JSON object with audio generation result
   */
  async generateAudio(text, outputPath) {
    if (!this.elevenlabs) {
      console.log("ℹ️  Skipping audio generation (ElevenLabs API key not provided)");
      return {
        success: false,
        error: 'ElevenLabs API key not provided',
        path: null,
        size: 0
      };
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
      
      return {
        success: true,
        path: outputPath,
        size: finalAudioBuffer.length,
        duration: Math.ceil(textToConvert.length / 1000),
        message: 'Successfully generated audio'
      };
    } catch (error) {
      console.error(`⚠️  Failed to generate audio: ${error.message}`);
      return {
        success: false,
        error: error.message,
        path: null,
        size: 0
      };
    }
  }

  /**
   * Strip markdown formatting to create plain text
   * @private
   */
  stripMarkdown(markdown) {
    let text = markdown;
    
    // Remove code blocks
    text = text.replace(/```[\s\S]*?```/g, '');
    
    // Remove inline code
    text = text.replace(/`([^`]+)`/g, '$1');
    
    // Remove images
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    
    // Remove links but keep text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // Remove headers (keep text, remove # symbols)
    text = text.replace(/^#{1,6}\s+/gm, '');
    
    // Remove bold/italic
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/___([^_]+)___/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    
    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}\s*$/gm, '');
    
    // Remove blockquotes
    text = text.replace(/^>\s+/gm, '');
    
    // Clean up excessive whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    
    return text;
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

    // Write markdown file
    await fsp.writeFile(summaryMd, markdown, "utf8");
    
    // Write plain text file (strip markdown formatting)
    const plainText = this.stripMarkdown(markdown);
    await fsp.writeFile(summaryTxt, plainText, "utf8");
    
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
      const scriptResult = await this.generateAudioScript(markdown);
      if (scriptResult.success && scriptResult.script) {
        await fsp.writeFile(audioScript, scriptResult.script, "utf8");
        audioScriptPath = audioScript;
        console.log(`✅ Wrote audio script: ${audioScript}`);
        
        // Generate audio from script
        const audioResult = await this.generateAudio(scriptResult.script, summaryMp3);
        if (audioResult.success && audioResult.path) {
          audioPath = audioResult.path;
        }
      }
    }

    // Generate flashcards MD and PDF using dedicated GPT call
    console.log("🃏 Generating flashcards with GPT...");
    let flashcardsPath = null;
    let flashcardsMdPath = null;
    try {
      const flashcardResp = await this.openai.chat.completions.create({
        model: API_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a study aid creator. Generate 20-30 flashcard Q&A pairs from the provided summary. Output ONLY the flashcards in this exact format:\n\n**Q: Question here?**\nA: Answer here\n\n**Q: Next question?**\nA: Next answer\n\n(blank line between each pair, continue for all cards)"
          },
          {
            role: "user",
            content: `Generate flashcards from this summary:\n\n${markdown.substring(0, 50000)}`
          }
        ],
        max_completion_tokens: 4000,
      });
      
      if (flashcardResp.usage) {
        this.trackOpenAICost(flashcardResp.usage);
      }
      
      const flashcardText = flashcardResp.choices[0]?.message?.content ?? "";
      if (!flashcardText || flashcardText.trim().length === 0) {
        console.log('⚠️  GPT returned empty flashcard content, skipping flashcard generation');
        console.log(`   Response status: ${flashcardResp.choices[0]?.finish_reason || 'unknown'}`);
        return {
          success: true,
          files: {
            summaryMd,
            summaryTxt,
            summaryPdf,
            summaryEpub,
            audioScript: audioScriptPath,
            summaryMp3: audioPath,
            flashcardsMd: null,
            flashcardsPdf: null
          },
          message: 'Successfully generated output files (flashcards skipped due to empty GPT response)'
        };
      }
      
      console.log(`📝 Flashcard text received: ${flashcardText.length} chars`);
      console.log(`📝 First 200 chars: ${flashcardText.substring(0, 200)}...`);
      
      const flashcards = extractFlashcards(flashcardText, { maxCards: 100 });
      
      console.log(`🔍 Extraction result: ${flashcards.count} flashcards found`);
      if (flashcards.patterns) {
        console.log(`   - QA format: ${flashcards.patterns.qaFormat}`);
        console.log(`   - Definitions: ${flashcards.patterns.definitions}`);
        console.log(`   - Headers: ${flashcards.patterns.headers}`);
      }
      
      if (flashcards.count > 0) {
        console.log(`📚 Generated ${flashcards.count} flashcards`);
        
        // Generate flashcards.md file
        const flashcardsMd = path.join(outputDir, `${basename}.flashcards.md`);
        const flashcardsContent = [
          `# ${basename.replace(/_/g, ' ')} - Study Flashcards`,
          '',
          `Generated by SummaryForge.com`,
          `Total cards: ${flashcards.count}`,
          '',
          '---',
          '',
          ...flashcards.flashcards.map((card, idx) =>
            `**Q: ${card.question}**\n\nA: ${card.answer}\n`
          )
        ].join('\n');
        
        await fsp.writeFile(flashcardsMd, flashcardsContent, 'utf8');
        flashcardsMdPath = flashcardsMd;
        console.log(`✅ Generated flashcards markdown: ${flashcardsMd}`);
        
        // Generate flashcards PDF
        await generateFlashcardsPDF(flashcards.flashcards, flashcardsPdf, {
          title: basename.replace(/_/g, ' '),
          branding: 'SummaryForge.com'
        });
        flashcardsPath = flashcardsPdf;
        console.log(`✅ Generated flashcards PDF: ${flashcardsPdf}`);
        
        // Generate flashcard images in ./flashcards subdirectory
        const flashcardsImagesDir = path.join(outputDir, 'flashcards');
        console.log(`🖼️  Generating flashcard images in ${flashcardsImagesDir}...`);
        const imagesResult = await generateFlashcardImages(flashcards.flashcards, flashcardsImagesDir, {
          title: basename.replace(/_/g, ' '),
          branding: 'SummaryForge.com'
        });
        
        if (imagesResult.success) {
          console.log(`✅ Generated ${imagesResult.count} flashcard image pairs (${imagesResult.images.length} total images)`);
        } else {
          console.log(`⚠️  Failed to generate flashcard images: ${imagesResult.error}`);
        }
      } else {
        console.log("⚠️  No flashcards extracted from GPT response");
      }
    } catch (error) {
      console.log(`⚠️  Failed to generate flashcards: ${error.message}`);
    }

    return {
      success: true,
      files: {
        summaryMd,
        summaryTxt,
        summaryPdf,
        summaryEpub,
        audioScript: audioScriptPath,
        summaryMp3: audioPath,
        flashcardsMd: flashcardsMdPath,
        flashcardsPdf: flashcardsPath
      },
      message: 'Successfully generated all output files'
    };
  }

  /**
   * Create bundle archive
   * Returns JSON object with bundle result
   */
  async createBundle(files, archiveName) {
    console.log("📦 Creating tar.gz bundle…");
    
    try {
      for (const f of files) {
        if (!(await this.fileExists(f))) {
          return {
            success: false,
            error: `Missing expected output: ${f}`,
            path: null,
            files: 0
          };
        }
      }

      // Ensure the archive name has .tgz or .tar.gz extension
      const normalizedArchiveName = archiveName.endsWith('.tgz') || archiveName.endsWith('.tar.gz')
        ? archiveName
        : `${archiveName}.tgz`;

      await this.sh("tar", ["-czf", normalizedArchiveName, ...files]);
      console.log(`\n✅ Done: ${normalizedArchiveName}\n`);
      console.log(`📚 Bundle contains: ${files.join(', ')}`);
      
      return {
        success: true,
        path: normalizedArchiveName,
        files: files.length,
        message: `Successfully created bundle with ${files.length} files`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: null,
        files: 0
      };
    }
  }

  /**
   * Generate summary with custom system prompt for web pages
   * Returns JSON object with summary result
   * @private
   */
  async generateWebPageSummary(pdfPath, pageTitle, url) {
    console.log("📖 Processing web page PDF...");
    
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
        "Source: the attached PDF containing a web page. Focus on the MAIN CONTENT only.",
        "IMPORTANT: Ignore navigation menus, headers, footers, advertisements, and sidebars.",
        "Goal: Extract and summarize the core content of the web page.",
        "Requirements:",
        `- Title: "${pageTitle}" (from: ${url})`,
        "- Organize by the actual content structure (sections, headings as they appear).",
        "- Include: Main content sections, key points, important information.",
        "- Keep all graphics as ASCII (code fences) for diagrams; preserve tables in Markdown.",
        "- No external images or links.",
        "- Write concisely but completely. Use headers, lists, and code-fenced ASCII diagrams.",
        "- IMPORTANT: Add a 'Study Flashcards' section at the end with 20-30 Q&A pairs in this exact format:",
        "  **Q: What is [concept]?**",
        "  A: [Clear, concise answer in 1-3 sentences]",
        "  ",
        "  (blank line between each Q&A pair)",
      ].join("\n");

      const userPrompt = "Read the attached PDF (web page content) and produce the full Markdown summary described above. Focus on the main content and ignore navigation/ads/footers. Output ONLY Markdown content (no JSON, no preambles).";

      console.log("🧠 Asking GPT-5 to generate summary from web page PDF...");
      
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
        await this.openai.files.delete(file.id);
        console.log(`🗑️  Cleaned up uploaded file`);
      } catch (cleanupError) {
        console.log(`⚠️  Warning: Could not delete uploaded file: ${cleanupError.message}`);
      }

      const md = resp.choices[0]?.message?.content ?? "";
      if (!md || md.trim().length < 200) {
        throw new Error("Model returned unexpectedly short content");
      }

      console.log("✅ Successfully generated summary using GPT-5 with web page PDF");
      return {
        success: true,
        markdown: md,
        length: md.length,
        message: 'Successfully generated web page summary'
      };
      
    } catch (fileUploadError) {
      console.error(`⚠️  GPT-5 PDF file upload failed: ${fileUploadError.message}`);
      return {
        success: false,
        error: fileUploadError.message,
        markdown: null,
        length: 0
      };
    }
  }

  /**
   * Process a web page URL and generate summary
   *
   * @param {string} url - URL of the web page to summarize
   * @param {string} outputDir - Directory to save outputs (default: '.')
   * @returns {Promise<Object>} JSON object with processing result
   */
  async processWebPage(url, outputDir = '.') {
    this.logger.log(`Processing web page: ${url}`);
    this.logger.progress(0, "Starting web page processing", { step: 'init', url });
    
    // Fetch web page and save as PDF
    this.logger.progress(2, "Fetching web page with Puppeteer", { step: 'fetch' });
    const webPageResult = await fetchWebPageAsPdf(url, null, {
      headless: this.headless,
      proxyUrl: this.enableProxy ? this.proxyUrl : null,
      proxyUsername: this.enableProxy ? this.proxyUsername : null,
      proxyPassword: this.enableProxy ? this.proxyPassword : null,
      proxyPoolSize: this.proxyPoolSize,
      puppeteerLaunchOptions: this.puppeteerLaunchOptions
    });
    
    const { title: rawTitle, pdfPath: tempPdfPath, url: pageUrl } = webPageResult;
    
    // Generate clean title
    const cleanTitle = generateCleanTitle(rawTitle, url);
    this.logger.log(`Clean title: ${cleanTitle}`);
    
    // Generate title using OpenAI if it's too generic
    let finalTitle = cleanTitle;
    if (cleanTitle.length < 10 || cleanTitle.toLowerCase().includes('webpage')) {
      this.logger.log("Generating better title using OpenAI...");
      this.logger.progress(5, "Improving title with AI", { step: 'title_generation' });
      try {
        const titleResp = await this.openai.chat.completions.create({
          model: API_MODEL,
          messages: [
            {
              role: "system",
              content: "Generate a concise, descriptive title (max 60 chars) for this web page based on its content. Output ONLY the title, no quotes or extra text."
            },
            {
              role: "user",
              content: `Web page URL: ${url}\nOriginal title: ${rawTitle}\n\nGenerate a better title.`
            }
          ],
          max_completion_tokens: 100,
        });
        
        const generatedTitle = titleResp.choices[0]?.message?.content?.trim();
        if (generatedTitle && generatedTitle.length > 3) {
          finalTitle = generatedTitle;
          this.logger.log(`Generated title: ${finalTitle}`);
          
          if (titleResp.usage) {
            this.trackOpenAICost(titleResp.usage);
          }
        }
      } catch (titleError) {
        this.logger.log(`Title generation failed, using: ${cleanTitle}`, 'warn');
      }
    }
    
    // Create directory structure
    const sanitizedTitle = this.sanitizeFilename(finalTitle);
    const identifier = `web_${Date.now()}`;
    const dirName = this.generateDirectoryName(sanitizedTitle, identifier);
    const webPageDir = path.join(outputDir, 'uploads', dirName);
    
    // Check for existing directory and handle overwrite protection
    const dirResult = await ensureDirectory(webPageDir, this.force, this.promptFn);
    
    if (!dirResult.created) {
      this.logger.log("Directory already exists and user chose not to overwrite", 'warn');
      throw new Error('Operation cancelled: Directory already exists');
    }
    
    if (dirResult.overwritten) {
      this.logger.log(`Overwritten existing directory: ${webPageDir}`);
    } else {
      this.logger.log(`Created directory: ${webPageDir}`);
    }
    
    // Move PDF to final location
    const pdfPath = path.join(webPageDir, `${sanitizedTitle}.pdf`);
    await fsp.rename(tempPdfPath, pdfPath);
    this.logger.log(`Saved PDF: ${pdfPath}`);
    
      // Generate summary using web page-specific prompting
      this.logger.progress(10, "Generating summary from web page PDF", { step: 'summary_generation' });
      const summaryResult = await this.generateWebPageSummary(pdfPath, finalTitle, url);
      if (!summaryResult.success) {
        this.logger.error("Summary generation failed", new Error(summaryResult.error));
        return {
          success: false,
          error: summaryResult.error,
          basename: sanitizedTitle,
          directory: webPageDir
        };
      }
      const markdown = summaryResult.markdown;
      
      // Generate output files
      this.logger.progress(96, "Generating output files", { step: 'output_generation' });
      const outputsResult = await this.generateOutputFiles(markdown, sanitizedTitle, webPageDir);
      if (!outputsResult.success) {
        this.logger.error("Output file generation failed");
        return {
          success: false,
          error: 'Failed to generate output files',
          basename: sanitizedTitle,
          directory: webPageDir
        };
      }
      const outputs = outputsResult.files;
    
    // Create file list for archive
    const files = [
      pdfPath,
      outputs.summaryMd,
      outputs.summaryTxt,
      outputs.summaryPdf,
      outputs.summaryEpub
    ];
    
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
    
    // Add flashcards directory if it exists (contains generated images)
    const flashcardsDir = path.join(webPageDir, 'flashcards');
    if (await this.fileExists(flashcardsDir)) {
      files.push('flashcards');
    }
    
    const archiveName = path.join(webPageDir, `${dirName}_bundle.tgz`);
    
    // Change to web page directory for tar to create relative paths
    this.logger.progress(98, "Creating bundle archive", { step: 'bundling' });
    const originalCwd = process.cwd();
    process.chdir(webPageDir);
    
    try {
      // Create bundle with relative paths
      const relativeFiles = files.map(f => path.basename(f));
      await this.sh("tar", ["-czf", path.basename(archiveName), ...relativeFiles]);
      this.logger.log(`Bundle created: ${archiveName}`);
      this.logger.log(`Bundle contains: ${relativeFiles.join(', ')}`);
    } finally {
      process.chdir(originalCwd);
    }
    
      // Play terminal beep to signal completion
      process.stdout.write('\x07');
      
      this.logger.progress(100, "Processing complete", { step: 'complete' });
      this.logger.complete(`Successfully processed web page: ${finalTitle}`, {
        basename: sanitizedTitle,
        dirName,
        files: files.length,
        hasAudio: !!outputs.summaryMp3,
        url: pageUrl
      });
      
      return {
        success: true,
        basename: sanitizedTitle,
        dirName,
        markdown,
        files,
        directory: webPageDir,
        archive: archiveName,
        hasAudio: !!outputs.summaryMp3,
        url: pageUrl,
        title: finalTitle,
        costs: this.getCostSummary(),
        message: `Successfully processed web page: ${finalTitle}`
      };
  }

  /**
   * Process a book file (PDF or EPUB)
   * If the file was downloaded from Anna's Archive, it's already in the correct directory
   * Returns JSON object with processing result
   */
  async processFile(filePath, asin = null) {
    try {
      this.logger.log(`Processing file: ${path.basename(filePath)}`);
      this.logger.progress(0, "Starting file processing", { step: 'init', file: path.basename(filePath) });
      
      const ext = path.extname(filePath).toLowerCase();
      let pdfPath = filePath;
      let epubPath = null;

      if (ext === '.epub') {
        this.logger.log("Input: EPUB file");
        this.logger.progress(2, "Converting EPUB to PDF", { step: 'epub_conversion' });
        epubPath = filePath;
        const conversionResult = await this.convertEpubToPdf(filePath);
        if (!conversionResult.success) {
          this.logger.error("EPUB conversion failed", new Error(conversionResult.error));
          return {
            success: false,
            error: conversionResult.error,
            basename: null,
            directory: null
          };
        }
        pdfPath = conversionResult.pdfPath;
        this.logger.log("EPUB converted to PDF successfully");
      } else if (ext === '.pdf') {
        this.logger.log("Input: PDF file");
      } else {
        const error = `Unsupported file type: ${ext}. Only .pdf and .epub are supported.`;
        this.logger.error(error);
        return {
          success: false,
          error,
          basename: null,
          directory: null
        };
      }

    // Extract title from filename for basename (without ASIN)
    const basename = this.sanitizeFilename(path.basename(filePath));
    this.logger.log(`Basename: ${basename}`);
    
    // Generate summary first (this will fail if file doesn't exist)
    this.logger.progress(3, "Generating summary from PDF", { step: 'summary_generation' });
    const summaryResult = await this.generateSummary(pdfPath);
    if (!summaryResult.success) {
      this.logger.error("Summary generation failed", new Error(summaryResult.error));
      return {
        success: false,
        error: summaryResult.error,
        basename,
        directory: null
      };
    }
    const markdown = summaryResult.markdown;
    
    // Only create directory after successful summary generation
    // Determine if file is already in an uploads directory (from downloadFromAnnasArchive)
    const isInUploadsDir = filePath.includes(path.join('uploads', path.sep));
    
    let bookDir;
    let dirName;
    
    if (isInUploadsDir) {
      // File is already in the correct directory from downloadFromAnnasArchive
      bookDir = path.dirname(filePath);
      dirName = path.basename(bookDir);
      this.logger.log(`Using existing directory: ${bookDir}`);
    } else {
      // Create new directory structure for manually provided files
      if (asin) {
        dirName = this.generateDirectoryName(basename, asin);
      } else {
        dirName = basename;
      }
      
      bookDir = path.join('uploads', dirName);
      await fsp.mkdir(bookDir, { recursive: true });
      this.logger.log(`Created directory: ${bookDir}`);
    }
    
    // Generate output files using basename WITHOUT ASIN
    this.logger.progress(96, "Generating output files", { step: 'output_generation' });
    const outputsResult = await this.generateOutputFiles(markdown, basename, bookDir);
    if (!outputsResult.success) {
      this.logger.error("Output file generation failed");
      return {
        success: false,
        error: 'Failed to generate output files',
        basename,
        directory: bookDir
      };
    }
    const outputs = outputsResult.files;
    
    // Copy original files to book directory with consistent naming (only if not already there)
    if (!isInUploadsDir) {
      const renamedPdf = path.join(bookDir, `${basename}.pdf`);
      await fsp.copyFile(pdfPath, renamedPdf);
      console.log(`✅ Saved PDF as ${renamedPdf}`);
      
      if (epubPath) {
        const renamedEpub = path.join(bookDir, `${basename}.epub`);
        await fsp.copyFile(epubPath, renamedEpub);
        console.log(`✅ Saved EPUB as ${renamedEpub}`);
      }
    }

    // Create bundle by tarring the entire directory (excluding the bundle itself)
    this.logger.progress(98, "Creating bundle archive", { step: 'bundling' });
    const originalCwd = process.cwd();
    
    // Resolve bookDir to absolute path
    const absoluteBookDir = path.resolve(originalCwd, bookDir);
    const parentDir = path.dirname(absoluteBookDir);
    const bookDirBasename = path.basename(absoluteBookDir);
    const archiveBasename = `${dirName}_bundle.tgz`;
    
    // Define paths
    const tempArchivePath = path.join(parentDir, archiveBasename);
    const finalArchivePath = path.join(absoluteBookDir, archiveBasename);
    
    this.logger.log(`Creating archive for directory: ${bookDirBasename}`);
    
    // Remove any existing archive files to avoid conflicts
    try {
      if (await this.fileExists(tempArchivePath)) {
        await fsp.unlink(tempArchivePath);
        this.logger.log(`Removed existing temp archive: ${tempArchivePath}`);
      }
      if (await this.fileExists(finalArchivePath)) {
        await fsp.unlink(finalArchivePath);
        this.logger.log(`Removed existing final archive: ${finalArchivePath}`);
      }
    } catch (cleanupErr) {
      this.logger.log(`Warning: Could not clean up old archives: ${cleanupErr.message}`, 'warn');
    }
    
    // Change to parent directory to create the tar
    process.chdir(parentDir);
    
    try {
      // Tar the entire directory - this will preserve the directory name in the archive
      // Create archive in current directory (parentDir)
      await this.sh("tar", ["-czf", archiveBasename, "--exclude", `${bookDirBasename}/${archiveBasename}`, bookDirBasename]);
      
      this.logger.log(`Archive created in parent directory`);
      
      // Move the archive into the book directory
      if (await this.fileExists(tempArchivePath)) {
        await fsp.rename(tempArchivePath, finalArchivePath);
        this.logger.log(`Bundle created: ${finalArchivePath}`);
        this.logger.log(`Bundle contains directory: ${bookDirBasename}/`);
      } else {
        // List files in current directory for debugging
        const filesInParent = await fsp.readdir(parentDir);
        const matchingFiles = filesInParent.filter(f => f.includes('bundle'));
        this.logger.log(`Looking for: ${archiveBasename}`);
        this.logger.log(`Bundle files in parent: ${matchingFiles.join(', ')}`);
        throw new Error(`Archive was not created at expected location: ${tempArchivePath}`);
      }
    } finally {
      process.chdir(originalCwd);
    }
    
    const archiveName = finalArchivePath;
    
    // Get list of files for return value
    const files = await getDirectoryContents(bookDir);

      // Play terminal beep to signal completion
      process.stdout.write('\x07');
      
      this.logger.progress(100, "Processing complete", { step: 'complete' });
      this.logger.complete(`Successfully processed file: ${basename}`, {
        basename,
        dirName,
        files: files.length,
        hasAudio: !!outputs.summaryMp3
      });
      
      return {
        success: true,
        basename,
        dirName,
        markdown,
        files,
        directory: bookDir,
        archive: archiveName,
        hasAudio: !!outputs.summaryMp3,
        asin: asin,
        costs: this.getCostSummary(),
        message: `Successfully processed file: ${basename}`
      };
    } catch (error) {
      this.logger.error(`File processing failed: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        basename: null,
        directory: null
      };
    }
  }
}

export default SummaryForge;