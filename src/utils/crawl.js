const axios = require('axios');
const xml2js = require('xml2js');
const puppeteer = require('puppeteer');
const pLimit = require('p-limit');

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
    executablePath: puppeteer.executablePath(),
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
      } catch {
        
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

async function extractTextFromUrls(urls) {
  let browser;

  try {
    console.log('Launching Puppeteer browser...');
    browser = await puppeteer.launch({
      executablePath: puppeteer.executablePath(),
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    const limit = pLimit(5);

    const tasks = urls.map(url =>
      limit(async () => {
        let page;
        try {
          console.log(`Opening page for URL: ${url}`);
          page = await browser.newPage();

          await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          );

          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'font', 'media'].includes(resourceType)) {
              req.abort();
            } else {
              req.continue();
            }
          });

          console.log(`Navigating to ${url}...`);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

          await page.waitForTimeout(3000);

          try {
            await page.waitForSelector('main, article, #content, .post, .container', { timeout: 10000 });
            console.log(`Selector found on ${url}`);
          } catch (selectorErr) {
            console.warn(`Selector not found on ${url}, continuing without it.`);
          }

          await page.evaluate(() => {
            const removeTags = ['script', 'style', 'meta'];
            removeTags.forEach(tag => {
              document.querySelectorAll(tag).forEach(el => el.remove());
            });
          });

          const text = await page.evaluate(() => document.body.innerText.trim());

          console.log(`Extracted text length from ${url}: ${text.length}`);

          return { url, content: text };
        } catch (err) {
          console.error(`Failed to extract ${url}: ${err.message}`, err);
          return { url, content: null, error: err.message };
        } finally {
          if (page) {
            try {
              await page.close();
            } catch (closeErr) {
              console.warn(`Error closing page for ${url}: ${closeErr.message}`);
            }
          }
        }
      })
    );

    const results = await Promise.all(tasks);
    console.log('Extraction complete.');
    return results;
  } catch (err) {
    console.error('Unexpected error launching Puppeteer or processing URLs:', err);
    return urls.map(url => ({ url, content: null, error: err.message }));
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed.');
      } catch (closeErr) {
        console.warn(`Error closing browser: ${closeErr.message}`);
      }
    }
  }
}

module.exports = {
  crawlLinksFromPages,
  extractLinksFromSitemap,
  extractTextFromUrls
};
