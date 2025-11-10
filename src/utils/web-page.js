/**
 * Web Page Processing Utilities
 * 
 * Utilities for fetching, sanitizing, and converting web pages to PDF
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * Extract main content from HTML by removing navigation, ads, footers, etc.
 * Uses a combination of heuristics to identify and extract the main content
 * 
 * @param {string} html - Raw HTML content
 * @returns {string} Sanitized HTML with only main content
 */
export function sanitizeHtmlContent(html) {
  // Remove script tags
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove common navigation/header/footer patterns
  const removePatterns = [
    /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
    /<header\b[^>]*>[\s\S]*?<\/header>/gi,
    /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
    /<aside\b[^>]*>[\s\S]*?<\/aside>/gi,
    /<div[^>]*class="[^"]*(?:nav|menu|sidebar|ad|advertisement|banner|cookie|popup)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<div[^>]*id="[^"]*(?:nav|menu|sidebar|ad|advertisement|banner|cookie|popup)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  ];
  
  for (const pattern of removePatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  return sanitized;
}

/**
 * Extract text content from HTML
 * 
 * @param {string} html - HTML content
 * @returns {string} Plain text content
 */
export function extractTextFromHtml(html) {
  // Remove all HTML tags
  let text = html.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Fetch web page and save as PDF using Puppeteer
 *
 * @param {string} url - URL to fetch
 * @param {string} outputPath - Path to save PDF (if null, creates temp file)
 * @param {Object} options - Options for browser and PDF generation
 * @param {boolean} options.headless - Run browser in headless mode (default: true)
 * @param {string} options.proxyUrl - Proxy URL (optional)
 * @param {string} options.proxyUsername - Proxy username (optional)
 * @param {string} options.proxyPassword - Proxy password (optional)
 * @returns {Promise<Object>} Result with title, html, and pdf path
 */
export async function fetchWebPageAsPdf(url, outputPath = null, options = {}) {
  const {
    headless = true,
    proxyUrl = null,
    proxyUsername = null,
    proxyPassword = null
  } = options;
  
  console.log(`🌐 Fetching web page: ${url}`);
  
  // Browser launch options with Docker-safe arguments
  const launchOptions = {
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-crash-reporter',
      '--disable-breakpad',
    ],
    defaultViewport: { width: 1200, height: 800 },
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  };
  
  // Add proxy if provided
  if (proxyUrl) {
    const proxyUrlObj = new URL(proxyUrl);
    const proxyHost = proxyUrlObj.hostname;
    const proxyPort = parseInt(proxyUrlObj.port) || 80;
    launchOptions.args.push(`--proxy-server=${proxyHost}:${proxyPort}`);
    console.log(`🔒 Using proxy: ${proxyHost}:${proxyPort}`);
  }
  
  const browser = await puppeteer.launch(launchOptions);
  
  try {
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    // Set proxy authentication if provided
    if (proxyUrl && proxyUsername && proxyPassword) {
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
    }
    
    // Navigate to URL
    console.log(`⏳ Loading page...`);
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    // Extract title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Get HTML content
    const html = await page.content();
    
    // Sanitize HTML to remove navigation, ads, etc.
    const sanitizedHtml = sanitizeHtmlContent(html);
    
    // Generate output path if not provided
    if (!outputPath) {
      const { default: os } = await import('node:os');
      const { default: crypto } = await import('node:crypto');
      const tempDir = os.tmpdir();
      const randomName = crypto.randomBytes(16).toString('hex');
      outputPath = `${tempDir}/webpage_${randomName}.pdf`;
    }
    
    // Save as PDF with print-friendly settings
    console.log(`📄 Generating PDF...`);
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: false,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    console.log(`✅ PDF saved: ${outputPath}`);
    
    await browser.close();
    
    return {
      title,
      html: sanitizedHtml,
      pdfPath: outputPath,
      url
    };
    
  } catch (error) {
    await browser.close();
    throw new Error(`Failed to fetch web page: ${error.message}`);
  }
}

/**
 * Generate a clean title from web page title or URL
 * Removes common suffixes and cleans up the title
 * 
 * @param {string} title - Original page title
 * @param {string} url - Page URL (fallback)
 * @returns {string} Clean title
 */
export function generateCleanTitle(title, url) {
  if (!title || title.trim().length === 0) {
    // Extract from URL if no title
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const lastSegment = pathname.split('/').filter(s => s).pop() || 'webpage';
      return lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.(html?|php|asp|jsp)$/i, '')
        .trim();
    } catch {
      return 'webpage';
    }
  }
  
  // Remove common suffixes
  let cleanTitle = title
    .replace(/\s*[-|–—]\s*[^-|–—]*$/i, '') // Remove " - Site Name" suffix
    .replace(/\s*\|\s*[^|]*$/i, '')         // Remove " | Site Name" suffix
    .trim();
  
  // If title is too short after cleaning, use original
  if (cleanTitle.length < 3) {
    cleanTitle = title;
  }
  
  return cleanTitle;
}