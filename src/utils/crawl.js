const axios = require('axios');
const xml2js = require('xml2js');
const puppeteer = require('puppeteer');
const config = require('../config');

const MAX_PAGES = 5000;
const CONCURRENCY = 5;

async function extractLinksFromSitemap(sitemapUrl) {
  try {
    const { data } = await axios.get(sitemapUrl);
    const result = await xml2js.parseStringPromise(data);
    
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const sitemaps = result.sitemapindex.sitemap.map(s => s.loc[0]);
      let urls = [];
      for (const sm of sitemaps) {
        const smUrls = await extractLinksFromSitemap(sm);
        urls = urls.concat(smUrls);
      }
      return urls;
    } else if (result.urlset && result.urlset.url) {
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
    executablePath: config?.puppeteerExecutablePath || '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

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

    const links = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('a[href], link[href], area[href]'),
        el => el.href
      );
    });

    const baseUrl = new URL(targetUrl);
    const internalLinks = new Set();

    const fileExtensionRegex = /\.(css|js|png|jpg|jpeg|svg|webp|ico|gif|pdf|json|mp4|mp3|woff|woff2|ttf|eot)$/i;

    for (const link of links) {
      try {
        const parsed = new URL(link);

        if (parsed.origin !== baseUrl.origin) continue;
        if (!parsed.protocol.startsWith('http')) continue;

        // Normalize
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        parsed.search = Array.from(parsed.searchParams.entries())
          .sort()
          .map(([k, v]) => `${k}=${v}`)
          .join('&');

        const cleanHref = parsed.href;

        // ✅ Exclude static files by extension
        if (!fileExtensionRegex.test(parsed.pathname)) {
          internalLinks.add(cleanHref);
        }
      } catch {
        // Skip malformed URLs
      }
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

  // Add sitemap links directly — no crawling needed
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

    const results = await Promise.allSettled(
      currentBatch.map(url => getInternalLinks(url))
    );

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

async function extractTextFromUrl(url) {
  let browser;


  try {
    browser = await puppeteer.launch({
      executablePath: puppeteer.executablePath(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const extractPageText = async (url) => {
      let page;
      try {
        page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');


        await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.waitForSelector('main, article, #content, .post, .container', { timeout: 10000 }).catch(() => {});

        await page.evaluate(() => {
          const removeTags = ['script', 'style', 'meta']; 
          removeTags.forEach(tag => {
            document.querySelectorAll(tag).forEach(el => el.remove());
          });
        });

        const text = await page.evaluate(() => document.body.innerText.trim());

        return { url, content: text };

      } catch (err) {
        console.log(`Failed to extract ${url}: ${err.message}`);
        return null
      } finally {
        if (page) await page.close().catch(() => {});
      }
    };

    return await extractPageText(url);
  } catch (err) {
    console.log('Unexpected error launching Puppeteer or processing URLs:', err.message);
    return null
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}


module.exports = {
  crawlLinksFromPages,
  extractLinksFromSitemap,
  extractTextFromUrl
};
