/**
 * Browser utilities for DDoS-Guard bypass and web scraping
 */

// Use puppeteer-core to avoid Canvas/DOMMatrix dependencies
import puppeteer from 'puppeteer-core';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CloudflareSolver } from './cloudflare-solver.js';
import { CaptchaSolver } from './captcha-solver.js';

/**
 * Write debug artifacts
 */
async function writeArtifacts(title, html, outputDir) {
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
 * Wait for __ddg cookies to appear (DDoS-Guard clearance)
 */
export async function waitForDdgCookies(page, timeout = 60000) {
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
 * Launch browser with DDoS-Guard bypass configuration
 */
export async function launchBrowserWithProxy(proxyConfig) {
  const { host, port, username, password } = proxyConfig;
  
  // Use a persistent profile to help DDoS-Guard recognize the browser across runs
  const userDataDir = './puppeteer_ddg_profile';
  
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--proxy-server=${host}:${port}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--user-data-dir=/tmp/chrome-user-data',
      '--data-path=/tmp/chrome-user-data',
      '--disk-cache-dir=/tmp/chrome-cache',
    ],
    defaultViewport: { width: 1200, height: 800 },
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  });
  
  return browser;
}

/**
 * Configure page with stealth settings and proxy authentication
 */
export async function configurePage(page, proxyConfig) {
  const { username, password } = proxyConfig;
  
  // Set some common headers + user agent to look less botty
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });

  // If the proxy requires HTTP auth (most HTTP proxies do), page.authenticate usually works.
  await page.authenticate({ username, password });
}

/**
 * Detect if page has Cloudflare challenge
 */
export async function detectCloudflareChallenge(page) {
  return await page.evaluate(() => {
    const bodyHTML = document.body.innerHTML;
    const title = document.title.toLowerCase();
    
    // Check for Cloudflare indicators
    const hasCloudflare =
      bodyHTML.includes('cloudflare') ||
      bodyHTML.includes('cf-challenge') ||
      bodyHTML.includes('cf_chl_') ||
      title.includes('just a moment') ||
      title.includes('attention required') ||
      bodyHTML.includes('ray id');
    
    if (!hasCloudflare) {
      return { hasChallenge: false };
    }
    
    // Try to find Turnstile sitekey with multiple methods
    let sitekey = null;
    let foundMethod = null;
    
    // Method 1: Look for Turnstile div with data-sitekey
    const turnstileDiv = document.querySelector('[data-sitekey]');
    if (turnstileDiv) {
      sitekey = turnstileDiv.getAttribute('data-sitekey');
      foundMethod = 'data-sitekey attribute';
    }
    
    // Method 2: Look for cf-turnstile element
    if (!sitekey) {
      const cfTurnstile = document.querySelector('cf-turnstile, [class*="turnstile"], [id*="turnstile"]');
      if (cfTurnstile) {
        sitekey = cfTurnstile.getAttribute('data-sitekey') ||
                  cfTurnstile.getAttribute('sitekey');
        if (sitekey) foundMethod = 'cf-turnstile element';
      }
    }
    
    // Method 3: Look in iframes
    if (!sitekey) {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        const src = iframe.getAttribute('src') || '';
        if (src.includes('challenges.cloudflare.com') || src.includes('turnstile')) {
          const match = src.match(/sitekey=([^&]+)/);
          if (match) {
            sitekey = match[1];
            foundMethod = 'iframe src';
            break;
          }
        }
      }
    }
    
    // Method 4: Look in script tags
    if (!sitekey) {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const script of scripts) {
        // Try multiple patterns
        const patterns = [
          /sitekey["\s:=]+["']([^"']+)["']/i,
          /data-sitekey=["']([^"']+)["']/i,
          /'sitekey':\s*["']([^"']+)["']/i,
          /"sitekey":\s*["']([^"']+)["']/i
        ];
        
        for (const pattern of patterns) {
          const match = script.textContent.match(pattern);
          if (match) {
            sitekey = match[1];
            foundMethod = 'script tag';
            break;
          }
        }
        if (sitekey) break;
      }
    }
    
    // Method 5: Look in window object
    if (!sitekey && window.turnstile) {
      try {
        sitekey = window.turnstile.sitekey || window.turnstile._sitekey;
        if (sitekey) foundMethod = 'window.turnstile';
      } catch (e) {}
    }
    
    // Debug info
    const debugInfo = {
      title: document.title,
      hasTurnstileDiv: !!document.querySelector('[data-sitekey]'),
      hasCfTurnstile: !!document.querySelector('cf-turnstile, [class*="turnstile"], [id*="turnstile"]'),
      iframeCount: document.querySelectorAll('iframe').length,
      scriptCount: document.querySelectorAll('script').length
    };
    
    return {
      hasChallenge: true,
      sitekey,
      challengeType: 'cloudflare-turnstile',
      foundMethod,
      debugInfo
    };
  });
}

/**
 * Navigate to URL and handle Cloudflare and DDoS-Guard challenges
 * Automatically detects and solves both Cloudflare Turnstile and DDoS-Guard CAPTCHAs
 */
export async function navigateWithChallengeBypass(page, url, twocaptchaApiKey = null) {
  console.log(`🌐 Navigating to: ${url}`);
  
  // If we have a 2captcha API key, set up Turnstile interception BEFORE navigation
  if (twocaptchaApiKey) {
    const cloudflareSolver = new CloudflareSolver(twocaptchaApiKey);
    await cloudflareSolver.interceptTurnstileRender(page);
    console.log('🔧 Turnstile interception script injected');
  }
  
  const navOptions = { waitUntil: 'domcontentloaded', timeout: 90000 };
  await page.goto(url, navOptions);

  // Check for Cloudflare challenge first
  console.log('🔍 Checking for Cloudflare challenge...');
  let cloudflareInfo = await detectCloudflareChallenge(page);
  
  if (cloudflareInfo.hasChallenge) {
    console.log('🛡️  Cloudflare challenge detected!');
    
    if (twocaptchaApiKey) {
      // Cloudflare may show multiple challenges in sequence
      // Try up to 3 times to handle chained challenges
      // Use same solver instance to preserve cached sitekey
      const cloudflareSolver = new CloudflareSolver(twocaptchaApiKey);
      let solveAttempts = 0;
      const maxSolveAttempts = 3;
      
      while (solveAttempts < maxSolveAttempts) {
        solveAttempts++;
        console.log(`🔑 Solving attempt ${solveAttempts}/${maxSolveAttempts}...`);
        
        const solved = await cloudflareSolver.solve(page);
        
        if (!solved) {
          console.log('⚠️  Failed to solve Cloudflare challenge with 2captcha');
          break;
        }
        
        console.log('✅ Cloudflare challenge solved!');
        // Wait for page to process the solution and redirect
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if we're still on challenge page
        const stillOnChallenge = await detectCloudflareChallenge(page);
        if (!stillOnChallenge.hasChallenge) {
          console.log('✅ Successfully bypassed all Cloudflare challenges');
          return; // Exit early - don't try DDoS-Guard logic
        } else {
          console.log(`⚠️  Another Cloudflare challenge appeared (attempt ${solveAttempts}/${maxSolveAttempts})`);
          if (solveAttempts < maxSolveAttempts) {
            console.log('🔄 Solving next challenge...');
            // Re-inject interception directly into the current page (not evaluateOnNewDocument)
            await page.evaluate(() => {
              window.turnstileParams = null;
              window.tsCallback = null;
              
              console.log('[CloudflareSolver] Re-injecting interception for new challenge');
              
              const checkInterval = setInterval(() => {
                if (window.turnstile) {
                  console.log('[CloudflareSolver] Found window.turnstile object');
                  clearInterval(checkInterval);
                  
                  const originalRender = window.turnstile.render;
                  window.turnstile.render = (container, params) => {
                    console.log('[CloudflareSolver] turnstile.render() called!');
                    window.turnstileParams = {
                      sitekey: params.sitekey,
                      action: params.action,
                      cData: params.cData,
                      chlPageData: params.chlPageData
                    };
                    window.tsCallback = params.callback;
                    console.log('[CloudflareSolver] Intercepted params:', JSON.stringify(window.turnstileParams));
                    return originalRender(container, params);
                  };
                  console.log('[CloudflareSolver] Render function intercepted');
                }
              }, 10);
              
              setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.turnstile) {
                  console.log('[CloudflareSolver] Timeout: window.turnstile never appeared');
                }
              }, 30000);
            });
          }
        }
      }
      
      console.log('⚠️  Max solve attempts reached, challenges may be chained indefinitely');
    } else {
      console.log('⚠️  2captcha API key not provided - cannot solve Cloudflare challenge');
      console.log('   Set TWOCAPTCHA_API_KEY environment variable to enable automatic solving');
    }
    
    // If we detected Cloudflare but couldn't solve it, don't try DDoS-Guard logic
    console.log('⚠️  Cloudflare challenge present but not solved - skipping DDoS-Guard logic');
    return;
  }

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
  const haveCookies = await waitForDdgCookies(page, 60000);
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
}

/**
 * Get download URL using Puppeteer with challenge bypass (Cloudflare + DDoS-Guard)
 */
export async function getDownloadUrlWithPuppeteer(url, page, outputDir, twocaptchaApiKey = null) {
  await navigateWithChallengeBypass(page, url, twocaptchaApiKey);

  // Get final page content
  const title = await page.title();
  const html = await page.content();

  // Save debug artifacts
  const { pagePath, titlePath, previewPath } = await writeArtifacts(title, html, outputDir);
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

  // Extract links
  const links = extractLinks(html, url);
  
  if (links.length > 0) {
    const epubCount = links.filter(l => l.toLowerCase().includes('.epub')).length;
    const pdfCount = links.filter(l => l.toLowerCase().includes('.pdf')).length;
    
    console.log(`\n🔎 Found ${links.length} candidate links (${epubCount} epub, ${pdfCount} pdf):`);
    for (const l of links) {
      const format = l.toLowerCase().includes('.epub') ? '[EPUB]' : '[PDF]';
      console.log(`  - ${format} ${l}`);
    }
    
    const selectedFormat = links[0].toLowerCase().includes('.epub') ? 'EPUB' : 'PDF';
    console.log(`✅ Selected ${selectedFormat} link (EPUB preferred)`);
    return links[0];
  }
  
  console.log("\n⚠️ No .pdf/.epub links found in rendered HTML.");
  return null;
}

/**
 * Extract download links from HTML
 */
export function extractLinks(html, baseUrl) {
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