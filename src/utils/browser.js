/**
 * Browser utilities for DDoS-Guard bypass and web scraping
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fsp from 'node:fs/promises';
import path from 'node:path';

puppeteer.use(StealthPlugin());

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
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-networking',
    ],
    userDataDir,
    defaultViewport: { width: 1200, height: 800 },
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
 * Navigate to URL and handle DDoS-Guard challenge
 */
export async function navigateWithDdgBypass(page, url) {
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
 * Get download URL using Puppeteer with DDoS-Guard bypass
 */
export async function getDownloadUrlWithPuppeteer(url, page, outputDir) {
  await navigateWithDdgBypass(page, url);

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