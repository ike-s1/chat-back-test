const axios = require('axios');
const xml2js = require('xml2js');
const puppeteer = require('puppeteer');
const { PlaywrightCrawler } = require('crawlee');
const path = require('path')
const fs = require('fs/promises');
const MAX_PAGES = 5000;
const CONCURRENCY = 5;

async function extractLinksFromSitemap(sitemapUrl) {
  try {
    const { data } = await axios.get(sitemapUrl);
    const result = await xml2js.parseStringPromise(data);

    if (result.sitemapindex?.sitemap) {
      let urls = [];
      for (const sm of result.sitemapindex.sitemap) {
        const smUrls = await extractLinksFromSitemap(sm.loc[0]);
        urls = urls.concat(smUrls);
      }
      return urls;
    } else if (result.urlset?.url) {
      return result.urlset.url.map(u => u.loc[0]);
    }
    return [];
  } catch (err) {
    console.error(`Error extracting sitemap from ${sitemapUrl}:`, err.message);
    return [];
  }
}


async function getInternalLinks(targetUrl) {
  const browser = await puppeteer.launch({
    executablePath: puppeteer.executablePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'script'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 });

    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href], link[href], area[href]'), el => el.href)
    );

    const baseUrl = new URL(targetUrl);
    const internalLinks = new Set();
    const fileExtensionRegex = /\.(css|js|png|jpg|jpeg|svg|webp|ico|gif|pdf|json|mp4|mp3|woff|woff2|ttf|eot)$/i;

    for (const link of links) {
      try {
        const parsed = new URL(link);
        if (parsed.origin !== baseUrl.origin) continue;
        if (!parsed.protocol.startsWith('http')) continue;

        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        parsed.search = Array.from(parsed.searchParams.entries())
          .sort()
          .map(([k, v]) => `${k}=${v}`)
          .join('&');

        const cleanHref = parsed.href;
        if (!fileExtensionRegex.test(parsed.pathname)) {
          internalLinks.add(cleanHref);
        }
      } catch {}
    }

    return Array.from(internalLinks);
  } finally {
    await browser.close();
  }
}


async function crawlLinksFromPages(startUrl) {
  let allowedHostname;
  try {
    allowedHostname = new URL(startUrl).hostname;
  } catch (error) {
    console.log('Invalid start URL:', error.message);
    return [];
  }

  const visited = new Set();
  const toVisit = new Set([startUrl]);
  const allLinks = new Set();

  const sitemapUrls = [
    `https://${allowedHostname}/sitemap.xml`,
    `http://${allowedHostname}/sitemap.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    const sitemapLinks = await extractLinksFromSitemap(sitemapUrl);
    for (const link of sitemapLinks) {
      try {
        const hostname = new URL(link).hostname;
        if (hostname === allowedHostname) {
          allLinks.add(link);
          visited.add(link);
        }
      } catch {}
    }
  }

  while (toVisit.size > 0 && visited.size < MAX_PAGES) {
    const currentBatch = Array.from(toVisit).slice(0, CONCURRENCY);
    currentBatch.forEach(url => {
      toVisit.delete(url);
      visited.add(url);
      allLinks.add(url);
    });

    const results = await Promise.allSettled(currentBatch.map(url => getInternalLinks(url)));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const link of result.value) {
          try {
            const hostname = new URL(link).hostname;
            if (
              hostname === allowedHostname &&
              !visited.has(link) &&
              !toVisit.has(link)
            ) {
              toVisit.add(link);
            }
          } catch {}
        }
      }
    }
  }

  return Array.from(allLinks);
}


async function extractTextFromUrls(urls) {
  const allExtractedData = [];


  const crawler = new PlaywrightCrawler({
    launchContext: {
      launchOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
      },
    },
    persistCookiesPerSession: false,
    useSessionPool: false,
    headless: true,
    maxRequestsPerCrawl: urls.length,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ request, page }) {
      await page.waitForTimeout(5000);
      const text = await page.evaluate(() => document.body.innerText);
      allExtractedData.push({
        url: request.url,
        title: await page.title(),
        text,
      });
    },

    failedRequestHandler: async ({ request, error }) => {
      allExtractedData.push({
        url: request.url,
        title: null,
        text: null,
        error: error.message,
      });
    },
  } );

  await crawler.run(urls);

  const storagePath = path.resolve('./storage'); 
  try {
    await fs.rm(storagePath, { recursive: true, force: true });
    console.log('Storage folder deleted successfully.');
  } catch (err) {
    console.error('Error deleting storage folder:', err);
  }

  return allExtractedData;;
}

module.exports = {
  crawlLinksFromPages,
  extractLinksFromSitemap,
  extractTextFromUrls,
};
