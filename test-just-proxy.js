// test-proxy.mjs
import puppeteer from 'puppeteer';

const PROXY_HOST = 'p.webshare.io';
const PROXY_PORT = 80;
const USERNAME = 'dmdgluqz-US-4';     // from your curl example
const PASSWORD = '8rxcagjln8n36to';

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
