// test-proxy-ddg-bypass.mjs
import puppeteer from 'puppeteer-extra';

const PROXY_HOST = 'p.webshare.io';
const PROXY_PORT = 80;
const USERNAME = 'dmdgluqz-US-4';
const PASSWORD = '8rxcagjln8n36to';

// target URL
const URL = 'https://annas-archive.org/slow_download/52db34d038cff82f57da95eaa512ad43/0/4';

// utility: wait for __ddg cookie or timeout
async function waitForDdgCookies(page, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // get cookies from page context (document.cookie) first (fast)
    const docCookie = await page.evaluate(() => document.cookie).catch(() => '');
    if (docCookie && /__ddg/.test(docCookie)) return true;

    // fallback to puppeteer page.cookies()
    const cookies = await page.cookies().catch(() => []);
    if (cookies.some(c => c.name && c.name.startsWith('__ddg'))) return true;

    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

const main = async () => {
  // Use a persistent profile to help DDoS-Guard recognize the browser across runs
  const userDataDir = './puppeteer_ddg_profile';

  const args = [
    `--proxy-server=${PROXY_HOST}:${PROXY_PORT}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ];

  const browser = await puppeteer.launch({
    headless: false,
    args,
    userDataDir,
    defaultViewport: { width: 1200, height: 800 },
  });

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
    await page.authenticate({ username: USERNAME, password: PASSWORD });

    // A tiny timeout increase for slow interstitials
    const navOptions = { waitUntil: 'domcontentloaded', timeout: 90000 };

    console.log('Navigating to target URL via proxy...');
    await page.goto(URL, navOptions);

    // If an obvious "verify / continue" button appears, try to click it.
    // This tries multiple heuristics to find a visible button with appropriate text.
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
      console.log('Clicked challenge button:', clicked.text);
    } else {
      console.log('No obvious challenge button clicked — will wait for cookies or manual action.');
    }

    // Wait until __ddg* cookies appear (DDoS-Guard clearance)
    const haveCookies = await waitForDdgCookies(page, 60000);
    if (!haveCookies) {
      console.warn('Timed out waiting for __ddg cookies. You may need to interact with the page manually in the opened browser window.');
    } else {
      console.log('Detected __ddg cookie(s) — challenge likely passed.');
    }

    // Grab cookies (puppeteer)
    const allCookies = await page.cookies();
    const ddgCookies = allCookies.filter(c => c.name && c.name.startsWith('__ddg'));

    console.log('DDG cookies extracted:');
    ddgCookies.forEach(c => console.log(`${c.name} = ${c.value}`));

    // Build cookie header for curl/requests
    const cookieHeader = ddgCookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('\nUse this curl command to replay the cleared session:');
    console.log(`curl -L -H "Cookie: ${cookieHeader}" "${URL}" -o out.file\n`);

    // Optionally: do the download from inside puppeteer (uncomment if you want)
    // const download = await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    // const buffer = await download.buffer();
    // require('fs').writeFileSync('out.file', buffer);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    // Don't close immediately if you want to interact manually — comment out if needed.
    // await browser.close();
  }
};

main().catch(console.error);
