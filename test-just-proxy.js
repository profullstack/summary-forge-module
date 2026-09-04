// test-proxy.mjs
import puppeteer from 'puppeteer';

// The proxy is a paid, shared credential: it comes from the environment (same
// variables the module itself reads, see src/utils/config.js) and is never
// written into a source file.
const PROXY_HOST = process.env.PROXY_HOST ?? 'p.webshare.io';
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 80);
const USERNAME = process.env.PROXY_USERNAME;
const PASSWORD = process.env.PROXY_PASSWORD;

if (process.env.ENABLE_PROXY !== 'true' || !USERNAME || !PASSWORD) {
  console.error('Set ENABLE_PROXY=true, PROXY_USERNAME and PROXY_PASSWORD to run this script.');
  process.exit(1);
}

const main = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=${PROXY_HOST}:${PROXY_PORT}`],
  });

  const page = await browser.newPage();

  // Authenticate before any navigation
  await page.authenticate({
    username: USERNAME,
    password: PASSWORD,
  });

  // Go to IP check page
  await page.goto('https://annas-archive.org/slow_download/52db34d038cff82f57da95eaa512ad43/0/4', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const ip = await page.evaluate(() => document.body.innerText.trim());
  console.log('Proxy IP:', ip);

  await browser.close();
};

main().catch(console.error);
