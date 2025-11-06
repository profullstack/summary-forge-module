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
import puppeteer from "puppeteer";
import { extractFlashcards, generateFlashcardsPDF } from "./flashcards.js";

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
    
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }
    
    this.openai = new OpenAI({ apiKey: this.openaiApiKey });
    this.maxChars = config.maxChars ?? 400000;
    this.maxTokens = config.maxTokens ?? 16000;
    
    // Initialize ElevenLabs client if API key is provided
    if (this.elevenlabsApiKey) {
      this.elevenlabs = new ElevenLabsClient({ apiKey: this.elevenlabsApiKey });
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
   * Extract download links from HTML (same method as test-puppeteer.js)
   * Prioritizes EPUB over PDF as EPUB is an open standard
   */
  extractLinks(html, baseUrl) {
    const regex = /href=["']([^"']+\.(?:pdf|epub)(?:\?[^"']*)?)["']/gi;
    const epubLinks = new Set();
    const pdfLinks = new Set();
    let m;
    while ((m = regex.exec(html))) {
      let link = m[1];
      try {
        link = new URL(link, baseUrl).toString();
      } catch {}
      
      // Separate EPUB and PDF links
      if (link.toLowerCase().includes('.epub')) {
        epubLinks.add(link);
      } else if (link.toLowerCase().includes('.pdf')) {
        pdfLinks.add(link);
      }
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
   * Get download URL using Puppeteer with CAPTCHA solving (same flow as test-puppeteer.js)
   */
  async getDownloadUrlWithPuppeteer(url, page, outputDir) {
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait 10 seconds for DDoS-Guard page to load CAPTCHA or auto-redirect
    console.log("⏳ Waiting 10 seconds for DDoS-Guard CAPTCHA/redirect...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check and solve CAPTCHA if present
    const captchaSolved = await this.solveCaptcha(page);
    
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

    // Save debug artifacts
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
   * Get Anna's Archive search URL for ASIN
   * Searches for epub and pdf formats, prioritizing epub by listing it first
   * Filters for better quality sources (libgen, scihub, etc.)
   */
  getAnnasArchiveUrl(asin) {
    // Note: ext=epub comes before ext=pdf to prioritize EPUB results
    // content=book_nonfiction helps filter for proper books vs scanned documents
    // We'll also add sorting by file size (larger usually means better quality for technical books)
    return `https://annas-archive.org/search?index=&page=1&sort=&content=book_nonfiction&ext=epub&ext=pdf&display=list_compact&q=${asin}`;
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
      // Look for the actual file extension in the result, not just mentions of the format
      // Also check for quality indicators (file size, source)
      const results = await page.$$eval('.js-aarecord-list-outer', (containers) => {
        return containers.map((container, index) => {
          const link = container.querySelector('a[href^="/md5/"]');
          
          // Get the title from the link text, not the entire container
          const titleElement = link?.querySelector('h3') || link;
          const title = titleElement ? titleElement.textContent.trim() : '';
          
          // Get metadata from the container (format, size, etc.)
          const text = container.textContent;
          
          // Look for actual file extensions in the text
          // Anna's Archive shows format like "epub, 123 KB" or "pdf, 2.5 MB"
          const hasEpubExtension = /\.epub\b/i.test(text) || /\bepub\s*,/i.test(text);
          const hasPdfExtension = /\.pdf\b/i.test(text) || /\bpdf\s*,/i.test(text);
          
          // Extract file size to help filter quality (larger is often better for books)
          const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
          let sizeInMB = 0;
          if (sizeMatch) {
            const size = parseFloat(sizeMatch[1]);
            const unit = sizeMatch[2].toUpperCase();
            if (unit === 'KB') sizeInMB = size / 1024;
            else if (unit === 'MB') sizeInMB = size;
            else if (unit === 'GB') sizeInMB = size * 1024;
          }
          
          // Check for quality indicators
          const hasLibgen = /libgen/i.test(text);
          const hasScihub = /scihub/i.test(text);
          const hasZlib = /z-lib|zlibrary/i.test(text);
          const isScanned = /scan|camera|djvu/i.test(text);
          
          // Quality score (higher is better)
          let qualityScore = 0;
          if (hasLibgen) qualityScore += 3;
          if (hasScihub) qualityScore += 2;
          if (hasZlib) qualityScore += 2;
          if (hasEpubExtension) qualityScore += 5; // EPUB is usually better quality
          if (sizeInMB > 5) qualityScore += 2; // Larger files often indicate better quality
          if (sizeInMB > 20) qualityScore += 1; // But not too large (might be scanned)
          if (isScanned) qualityScore -= 10; // Heavily penalize scanned documents
          
          return {
            href: link ? link.getAttribute('href') : null,
            isEpub: hasEpubExtension,
            isPdf: hasPdfExtension,
            title: title.substring(0, 100), // Use actual title, not full text
            sizeInMB,
            qualityScore,
            isScanned,
            index
          };
        }).filter(r => r.href && (r.isEpub || r.isPdf) && !r.isScanned);
      });
      
      if (results.length === 0) {
        throw new Error('No epub or pdf results found on Anna\'s Archive');
      }
      
      // Sort by quality score (highest first)
      results.sort((a, b) => b.qualityScore - a.qualityScore);
      
      // Separate EPUB and PDF results
      const epubResults = results.filter(r => r.isEpub && !r.isPdf);
      const pdfResults = results.filter(r => r.isPdf && !r.isEpub);
      const bothResults = results.filter(r => r.isEpub && r.isPdf);
      
      console.log(`📖 Found ${results.length} total results (filtered, excluding scanned):`);
      console.log(`   - ${epubResults.length} EPUB-only results`);
      console.log(`   - ${pdfResults.length} PDF-only results`);
      console.log(`   - ${bothResults.length} results with both formats`);
      
      // Debug: Show first few results with quality scores
      if (results.length > 0) {
        console.log(`\n📋 Top 3 results (sorted by quality):`);
        results.slice(0, 3).forEach(r => {
          const formats = [];
          if (r.isEpub) formats.push('EPUB');
          if (r.isPdf) formats.push('PDF');
          console.log(`   ${r.index + 1}. [${formats.join('/')}] Score: ${r.qualityScore}, Size: ${r.sizeInMB.toFixed(1)}MB`);
          console.log(`      "${r.title}"`);
        });
      }
      
      // Select the highest quality result (already sorted)
      let preferredResult = results[0];
      let format;
      
      if (preferredResult.isEpub && !preferredResult.isPdf) {
        format = 'EPUB';
        console.log(`✅ Selected EPUB result (quality score: ${preferredResult.qualityScore})`);
      } else if (preferredResult.isEpub && preferredResult.isPdf) {
        format = 'EPUB/PDF';
        console.log(`✅ Selected result with both formats (quality score: ${preferredResult.qualityScore}), will prefer EPUB download`);
      } else {
        format = 'PDF';
        console.log(`✅ Selected PDF result (quality score: ${preferredResult.qualityScore})`);
      }
      
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
          const downloadUrl = await this.getDownloadUrlWithPuppeteer(slowLinks[i], page, bookDir);
          
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
   * Convert PDF pages to images using Puppeteer
   */
  async convertPdfToImages(pdfPath, outputDir) {
    console.log("📸 Converting PDF pages to images...");
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Load the PDF in the browser
      const pdfUrl = `file://${path.resolve(pdfPath)}`;
      await page.goto(pdfUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Wait for PDF to render
      await page.waitForTimeout(2000);
      
      // Get number of pages by checking the PDF viewer
      const pageCount = await page.evaluate(() => {
        // Try to get page count from PDF.js viewer if available
        if (window.PDFViewerApplication?.pdfDocument) {
          return window.PDFViewerApplication.pdfDocument.numPages;
        }
        return 1; // Fallback to single page
      });
      
      console.log(`📄 PDF has ${pageCount} page(s)`);
      
      const screenshots = [];
      
      // Take screenshot of each page
      for (let i = 1; i <= pageCount; i++) {
        console.log(`📸 Capturing page ${i}/${pageCount}...`);
        
        // Navigate to specific page if multi-page
        if (pageCount > 1) {
          await page.evaluate((pageNum) => {
            if (window.PDFViewerApplication) {
              window.PDFViewerApplication.page = pageNum;
            }
          }, i);
          await page.waitForTimeout(1000);
        }
        
        const screenshotPath = path.join(outputDir, `page_${i}.png`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
          type: 'png'
        });
        
        screenshots.push(screenshotPath);
        console.log(`✅ Saved: ${screenshotPath}`);
      }
      
      await browser.close();
      return screenshots;
      
    } catch (error) {
      await browser.close();
      throw new Error(`Failed to convert PDF to images: ${error.message}`);
    }
  }

  /**
   * Generate summary using GPT-5 vision with PDF screenshots
   */
  async generateSummary(pdfPath) {
    console.log("📖 Processing PDF for OpenAI...");
    
    // Get file stats
    const stats = await fsp.stat(pdfPath);
    const pdfSizeKB = (stats.size / 1024).toFixed(2);
    const pdfSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📊 PDF size: ${pdfSizeMB} MB (${pdfSizeKB} KB)`);
    
    // Check file size
    if (stats.size > 100 * 1024 * 1024) {
      console.log(`⚠️  Warning: Large PDF file (${pdfSizeMB} MB). This may take longer and cost more.`);
    }
    
    try {
      // Create temp directory for screenshots
      const tempDir = path.join(path.dirname(pdfPath), '.pdf_screenshots');
      await fsp.mkdir(tempDir, { recursive: true });
      
      // Convert PDF pages to images
      const screenshots = await this.convertPdfToImages(pdfPath, tempDir);
      console.log(`✅ Converted ${screenshots.length} page(s) to images`);
      
      // Read all screenshots as base64
      const imageContents = await Promise.all(
        screenshots.map(async (screenshotPath) => {
          const imageBuffer = await fsp.readFile(screenshotPath);
          const base64Image = imageBuffer.toString('base64');
          return {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: "high"
            }
          };
        })
      );
      
      const systemPrompt = [
        "You are an expert technical writer. Produce a single, self-contained Markdown file.",
        "Source: the attached PDF pages (as images). Do not hallucinate; pull claims from the PDF.",
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
        "Read the attached PDF pages and produce the full Markdown summary described above.",
        "Output ONLY Markdown content (no JSON, no preambles).",
      ].join("\n");

      console.log("🧠 Asking the model to generate the Markdown summary from PDF images...");
      
      // Create message content with text and all images
      const messageContent = [
        { type: "text", text: userPrompt },
        ...imageContents
      ];
      
      const resp = await this.openai.chat.completions.create({
        model: API_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: messageContent
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

      // Clean up screenshots
      try {
        for (const screenshot of screenshots) {
          await fsp.unlink(screenshot);
        }
        await fsp.rmdir(tempDir);
        console.log(`🗑️  Cleaned up temporary screenshots`);
      } catch (cleanupError) {
        console.log(`⚠️  Warning: Could not clean up screenshots: ${cleanupError.message}`);
      }

      const md = resp.choices[0]?.message?.content ?? "";
      if (!md || md.trim().length < 200) {
        throw new Error("Model returned unexpectedly short content");
      }

      return md;
      
    } catch (error) {
      // Provide more detailed error information
      if (error.response) {
        console.error(`❌ OpenAI API Error: ${error.response.status} - ${error.response.statusText}`);
        console.error(`Details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw new Error(`Failed to generate summary: ${error.message}`);
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

    // Generate flashcards PDF
    console.log("🃏 Generating flashcards PDF...");
    let flashcardsPath = null;
    try {
      const flashcards = extractFlashcards(markdown, { maxCards: 100 });
      
      if (flashcards.length > 0) {
        console.log(`📚 Extracted ${flashcards.length} flashcards from summary`);
        await generateFlashcardsPDF(flashcards, flashcardsPdf, {
          title: basename.replace(/_/g, ' '),
          branding: 'SummaryForge.com'
        });
        flashcardsPath = flashcardsPdf;
        console.log(`✅ Generated flashcards: ${flashcardsPdf}`);
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
    
    const markdown = await this.generateSummary(pdfPath);
    
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

    // Add audio script to list if it was generated
    if (outputs.audioScript) {
      files.push(outputs.audioScript);
    }

    // Add audio file to list if it was generated
    if (outputs.summaryMp3) {
      files.push(outputs.summaryMp3);
    }

    // Add flashcards PDF to list if it was generated
    if (outputs.flashcardsPdf) {
      files.push(outputs.flashcardsPdf);
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