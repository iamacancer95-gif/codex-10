const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const DOMAIN = 'https://git.pageaura.xyz';
const HOST = 'git.pageaura.xyz';
const INDEXNOW_KEY = 'dd5dc9a82ae9487e912c9d3c7cbf4c71';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const URLS_FILE = path.join(ROOT, 'urls.txt');
const TEMPLATE_FILE = path.join(ROOT, 'indexing.html');

// Helper: Generate random alphanumeric string
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper: XML Escape
function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Function to send URLs to IndexNow
function pingIndexNow(urlsList) {
  if (!urlsList || urlsList.length === 0) return;

  const payload = JSON.stringify({
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `${DOMAIN}/${INDEXNOW_KEY}.txt`,
    urlList: urlsList
  });

  const options = {
    hostname: 'api.indexnow.org',
    port: 443,
    path: '/indexnow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`IndexNow API Response Status: ${res.statusCode}`);
  });

  req.on('error', (error) => {
    console.error('IndexNow Error:', error.message);
  });

  req.write(payload);
  req.end();
}

function run() {
  console.log('--- Starting Automated Page, Sitemap & IndexNow Generation ---');

  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error('ERROR: indexing.html template file is missing in root!');
    process.exit(1);
  }

  if (!fs.existsSync(URLS_FILE)) {
    console.error('ERROR: urls.txt file is missing in root!');
    process.exit(1);
  }

  // Ensure IndexNow key file exists in public folder
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const keyFilePath = path.join(PUBLIC_DIR, `${INDEXNOW_KEY}.txt`);
  fs.writeFileSync(keyFilePath, INDEXNOW_KEY, 'utf8');

  const templateContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');

  // Read all URLs from urls.txt
  const rawUrls = fs.readFileSync(URLS_FILE, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (rawUrls.length === 0) {
    console.log('No URLs found in urls.txt');
    return;
  }

  // Get current UTC date & time hierarchy
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');

  // Chunk URLs into groups of 10
  const CHUNK_SIZE = 10;
  const urlChunks = [];
  for (let i = 0; i < rawUrls.length; i += CHUNK_SIZE) {
    urlChunks.push(rawUrls.slice(i, i + CHUNK_SIZE));
  }

  const generatedPages = [];
  const newlyGeneratedUrls = [];

  // Loop through each chunk to create a separate file
  for (const chunk of urlChunks) {
    const pageSlug = generateRandomString(7);
    const titleText = generateRandomString(10).toUpperCase();
    const headingText = generateRandomString(10).toUpperCase();

    let linksHtml = '<ul>\n';
    for (const targetUrl of chunk) {
      const randomSlug5 = generateRandomString(5);
      const displaySlugText = `Link-${randomSlug5}`;
      linksHtml += `    <li><a href="${escapeXml(targetUrl)}" rel="nofollow">${displaySlugText}</a></li>\n`;
    }
    linksHtml += '</ul>';

    let pageHtml = templateContent
      .replace('[[TITLE]]', titleText)
      .replace('[[HEADING]]', headingText)
      .replace('[[URLS]]', linksHtml);

    const relPath = `${year}/${month}/${day}/${hour}/${pageSlug}`;
    const fullPageUrl = `${DOMAIN}/${relPath}/`;
    const targetFolder = path.join(PUBLIC_DIR, year, month, day, hour, pageSlug);

    fs.mkdirSync(targetFolder, { recursive: true });
    fs.writeFileSync(path.join(targetFolder, 'index.html'), pageHtml, 'utf8');

    generatedPages.push({
      url: fullPageUrl,
      lastmod: now.toISOString()
    });
    newlyGeneratedUrls.push(fullPageUrl);
  }

  console.log(`Successfully generated ${generatedPages.length} HTML page copies.`);

  // Sitemap generation
  const sitemapsDir = path.join(PUBLIC_DIR, 'sitemaps');
  fs.mkdirSync(sitemapsDir, { recursive: true });

  let hourlyXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  hourlyXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const page of generatedPages) {
    hourlyXml += `  <url>\n`;
    hourlyXml += `    <loc>${escapeXml(page.url)}</loc>\n`;
    hourlyXml += `    <lastmod>${page.lastmod}</lastmod>\n`;
    hourlyXml += `    <changefreq>hourly</changefreq>\n`;
    hourlyXml += `    <priority>0.8</priority>\n`;
    hourlyXml += `  </url>\n`;
  }
  hourlyXml += '</urlset>\n';

  const hourlySitemapFilename = `sitemap-${year}-${month}-${day}-${hour}.xml`;
  fs.writeFileSync(path.join(sitemapsDir, hourlySitemapFilename), hourlyXml, 'utf8');

  const allSitemapFiles = fs.readdirSync(sitemapsDir).filter(f => f.endsWith('.xml') && f !== 'master-sitemap.xml');

  let masterXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  masterXml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const sFile of allSitemapFiles) {
    masterXml += `  <sitemap>\n`;
    masterXml += `    <loc>${DOMAIN}/sitemaps/${sFile}</loc>\n`;
    masterXml += `    <lastmod>${now.toISOString()}</lastmod>\n`;
    masterXml += `  </sitemap>\n`;
  }
  masterXml += '</sitemapindex>\n';

  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), masterXml, 'utf8');
  console.log('Master sitemap and hourly sitemap generated successfully.');

  // Ping IndexNow
  console.log('Pinging IndexNow API...');
  pingIndexNow(newlyGeneratedUrls);

  // Git Commit and Push
  try {
    console.log('Committing updates to GitHub...');
    execSync('git config --global user.name "github-actions[bot]"');
    execSync('git config --global user.email "github-actions[bot]@users.noreply.github.com"');
    execSync('git add public/');
    
    const status = execSync('git status --porcelain').toString();
    if (status.trim().length > 0) {
      execSync('git commit -m "chore: automated hourly pages, sitemaps & indexnow ping [skip ci]"');
      execSync('git push');
      console.log('Pushed changes successfully.');
    } else {
      console.log('No new changes to commit.');
    }
  } catch (err) {
    console.error('Git execution error:', err.message);
  }
}

run();
