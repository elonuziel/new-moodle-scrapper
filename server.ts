import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import { createServer as createViteServer } from 'vite';
import { sanitizeFilename, getFilenameFromContentDisposition } from './src/lib/filename-utils';

const PORT = 3000;
const ROOT_DIR = process.cwd();

function readAppVersion(): { version: string; versionCode: number } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    const version = pkg.version || '1.0.0';
    const [maj = 1, min = 0, pat = 0] = version.split('.').map((n: string) => parseInt(n, 10) || 0);
    return { version, versionCode: maj * 10000 + min * 100 + pat };
  } catch {
    return { version: '1.0.0', versionCode: 10000 };
  }
}

function buildCookieHeader(rawCookie: string): string {
  const cleaned = (rawCookie || '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  if (cleaned.includes('=')) {
    return cleaned;
  }
  return `MoodleSession=${cleaned}`;
}

function extractCleanTitleServer(rawText: string): string {
  if (!rawText) return 'Activity';
  const cleaned = rawText
    .trim()
    .replace(/(קובץ|File|תיקייה|Folder|מטלה|Assignment|דף|Page|קישור|URL|בוחן|Quiz)\s*$/i, '')
    .trim();
  return cleaned || 'Activity';
}

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // 1. Health & App Version Endpoint
  app.get('/api/health', (_req, res) => {
    const { version, versionCode } = readAppVersion();
    res.json({
      status: 'ok',
      version,
      versionCode,
      apkArtifactName: `moodle-downloader-v${version}-debug.apk`,
    });
  });

  // 2. Interactive Version Bump Endpoint
  app.post('/api/version/bump', (req, res) => {
    try {
      const bumpType = (req.body?.bumpType || 'patch').toLowerCase();
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const parts = (pkg.version || '1.0.0').split('.').map((n: string) => parseInt(n, 10) || 0);
      let [major, minor, patch] = [parts[0] || 1, parts[1] || 0, parts[2] || 0];

      if (bumpType === 'major') {
        major += 1;
        minor = 0;
        patch = 0;
      } else if (bumpType === 'minor') {
        minor += 1;
        patch = 0;
      } else {
        patch += 1;
      }

      const newVersion = `${major}.${minor}.${patch}`;
      const newVersionCode = major * 10000 + minor * 100 + patch;
      pkg.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

      res.json({
        success: true,
        version: newVersion,
        versionCode: newVersionCode,
        tag: `v${newVersion}`,
        apkArtifactName: `moodle-downloader-v${newVersion}-debug.apk`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to bump version' });
    }
  });

  // 3. Direct Moodle Form Login Handshake (for standard Moodle logins)
  app.post('/api/moodle/login', async (req, res) => {
    const { siteUrl, username, password } = req.body || {};
    if (!siteUrl || !username || !password) {
      return res.status(400).json({ error: 'Site URL, username, and password are required.' });
    }

    try {
      const base = siteUrl.trim().replace(/\/+$/, '');
      const loginUrl = `${base}/login/index.php`;

      // Step 1: Fetch login page to get initial MoodleSession cookie and logintoken
      const initResp = await fetch(loginUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
        redirect: 'manual',
      });

      const setCookies = initResp.headers.getSetCookie?.() || [];
      let sessionCookie = '';
      for (const c of setCookies) {
        const match = c.match(/MoodleSession=([^;]+)/i);
        if (match) sessionCookie = match[1];
      }

      const initHtml = await initResp.text();
      const $ = cheerio.load(initHtml);
      const loginToken = $('input[name="logintoken"]').val() || '';

      // Step 2: Submit credentials
      const formBody = new URLSearchParams();
      formBody.append('username', username);
      formBody.append('password', password);
      if (loginToken) {
        formBody.append('logintoken', String(loginToken));
      }

      const postResp = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: sessionCookie ? `MoodleSession=${sessionCookie}` : '',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      const postCookies = postResp.headers.getSetCookie?.() || [];
      for (const c of postCookies) {
        const match = c.match(/MoodleSession=([^;]+)/i);
        if (match) sessionCookie = match[1];
      }

      const location = postResp.headers.get('location') || '';
      if (sessionCookie && location && !location.includes('/login/index.php')) {
        return res.json({
          success: true,
          cookie: sessionCookie,
          redirectUrl: location,
        });
      }

      return res.status(401).json({
        error:
          'Standard form login did not complete (your institution may require Microsoft SSO or 2FA). Use the In-App WebView SSO flow or paste your MoodleSession cookie.',
      });
    } catch (err: any) {
      return res.status(502).json({
        error: `Connection failed: ${err?.message || 'Unable to reach Moodle server'}`,
      });
    }
  });

  // 4. Parse Moodle Course HTML
  app.post('/api/moodle/parse', async (req, res) => {
    const { courseUrl, cookie, includeNested = true } = req.body || {};
    if (!courseUrl || !cookie) {
      return res.status(400).json({ error: 'Course URL and MoodleSession cookie are required.' });
    }

    try {
      const cookieHeader = buildCookieHeader(cookie);
      const response = await fetch(courseUrl, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      const finalUrl = response.url || courseUrl;
      const html = await response.text();

      if (
        finalUrl.toLowerCase().includes('/login/') ||
        html.includes('id="login"') ||
        html.includes('name="logintoken"')
      ) {
        return res.status(401).json({
          error:
            'Authentication failed or MoodleSession cookie expired. Please refresh your cookie or re-authenticate.',
        });
      }

      const $ = cheerio.load(html);
      let courseTitle = $('h1').first().text().trim() || $('title').first().text().trim() || 'Moodle Course';
      courseTitle = courseTitle
        .replace(/^(Course:\s*|\s*קורס:\s*)/i, '')
        .split(' | ')[0]
        .split(' - ')[0]
        .trim() || 'Moodle Course';

      const userName =
        $('.usertext, .user-name, .avatarmenu, [data-key="user-name"]').first().text().trim() || undefined;

      const modRegex = includeNested
        ? /\/mod\/(resource|folder|assign|page|url|h5pactivity)\/view\.php\?id=\d+/i
        : /\/mod\/(resource|folder)\/view\.php\?id=\d+/i;

      const sectionsMap = new Map<string, any>();
      let totalItems = 0;

      $('a[href]').each((idx, el) => {
        const rawHref = $(el).attr('href') || '';
        if (!modRegex.test(rawHref)) return;

        let href = rawHref;
        try {
          href = new URL(rawHref, courseUrl).toString();
        } catch {
          // keep rawHref
        }

        const instanceSpan = $(el).find('.instancename').first();
        let title = '';
        if (instanceSpan.length > 0) {
          const cloned = instanceSpan.clone();
          cloned.find('.accesshide, .sr-only').remove();
          title = extractCleanTitleServer(cloned.text());
        } else {
          title = extractCleanTitleServer($(el).text());
        }

        const modMatch = href.match(/\/mod\/(\w+)\//);
        const modType = modMatch ? modMatch[1].toLowerCase() : 'resource';

        let sectionName = 'General';
        const parentSec = $(el).closest('.course-section, .section.main, .section-item, li.section');
        if (parentSec.length > 0) {
          const heading = parentSec
            .find('h2, h3, h4, h5, span.sectionname, .section-title, .sectionname')
            .first()
            .text()
            .trim();
          if (heading) {
            sectionName = heading;
          } else if (parentSec.attr('aria-label')) {
            sectionName = parentSec.attr('aria-label')!.trim();
          }
        }

        const safeSectionName = sanitizeFilename(sectionName) || 'General';
        if (!sectionsMap.has(safeSectionName)) {
          sectionsMap.set(safeSectionName, {
            id: `section-${sectionsMap.size + 1}`,
            name: sectionName,
            safeName: safeSectionName,
            selected: true,
            items: [],
          });
        }

        const section = sectionsMap.get(safeSectionName);
        if (!section.items.some((item: any) => item.href === href)) {
          section.items.push({
            id: `act-${idx + 1}`,
            href,
            title,
            modType,
            sectionName: safeSectionName,
            selected: true,
          });
          totalItems++;
        }
      });

      return res.json({
        courseTitle,
        userName,
        totalItems,
        sections: Array.from(sectionsMap.values()),
      });
    } catch (err: any) {
      return res.status(502).json({
        error: `Failed to fetch course page: ${err?.message || 'Network error'}`,
      });
    }
  });

  // 5. Inspect Activity for Nested Files (Assignments / Pages / Folders)
  app.post('/api/moodle/inspect-activity', async (req, res) => {
    const { activityUrl, modType, cookie } = req.body || {};
    if (!activityUrl || !cookie) {
      return res.status(400).json({ error: 'activityUrl and cookie are required.' });
    }

    try {
      const cookieHeader = buildCookieHeader(cookie);

      // If it's a folder, construct the Moodle folder download zip endpoint or extract files
      if (modType === 'folder') {
        const idMatch = activityUrl.match(/id=(\d+)/);
        if (idMatch) {
          const parsedUrl = new URL(activityUrl);
          const zipDownloadUrl = `${parsedUrl.origin}/mod/folder/download_folder.php?id=${idMatch[1]}`;
          return res.json({
            files: [{ name: `folder_${idMatch[1]}.zip`, url: zipDownloadUrl, isFolderZip: true }],
          });
        }
      }

      const response = await fetch(activityUrl, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
        redirect: 'follow',
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        // Direct file redirect
        const cd = response.headers.get('content-disposition');
        const resolvedName =
          getFilenameFromContentDisposition(cd) ||
          sanitizeFilename(decodeURIComponent(new URL(response.url).pathname.split('/').pop() || 'resource_file'));
        return res.json({
          files: [{ name: resolvedName, url: response.url }],
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const files: { name: string; url: string }[] = [];
      const seen = new Set<string>();

      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        if (
          href.includes('/pluginfile.php/') ||
          href.includes('/forcedownload=1') ||
          href.includes('/mod/folder/download_folder.php')
        ) {
          try {
            const fullUrl = new URL(href, activityUrl).toString();
            if (!seen.has(fullUrl)) {
              seen.add(fullUrl);
              const rawName =
                $(el).text().trim() ||
                decodeURIComponent(new URL(fullUrl).pathname.split('/').pop() || 'attachment');
              files.push({
                name: sanitizeFilename(rawName),
                url: fullUrl,
              });
            }
          } catch {
            // ignore malformed
          }
        }
      });

      return res.json({ files });
    } catch (err: any) {
      return res.status(502).json({ error: err?.message || 'Failed to inspect activity' });
    }
  });

  // 6. Stream / Fetch File Binary
  app.post('/api/moodle/fetch-file', async (req, res) => {
    const { fileUrl, cookie, fallbackTitle } = req.body || {};
    if (!fileUrl || !cookie) {
      return res.status(400).json({ error: 'fileUrl and cookie are required.' });
    }

    try {
      const cookieHeader = buildCookieHeader(cookie);
      const response = await fetch(fileUrl, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `HTTP ${response.status} fetching file` });
      }

      const cd = response.headers.get('content-disposition');
      let filename = getFilenameFromContentDisposition(cd);
      if (!filename) {
        try {
          const urlPath = decodeURIComponent(new URL(response.url).pathname);
          const basename = urlPath.split('/').pop() || '';
          if (basename && !basename.endsWith('.php')) {
            filename = sanitizeFilename(basename);
          }
        } catch {
          // fallback
        }
      }
      if (!filename) {
        filename = sanitizeFilename(fallbackTitle || 'downloaded_resource');
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('X-Resolved-Filename', encodeURIComponent(filename));
      res.setHeader('Access-Control-Expose-Headers', 'X-Resolved-Filename');
      return res.send(buffer);
    } catch (err: any) {
      return res.status(502).json({ error: err?.message || 'File download error' });
    }
  });

  // Mount Vite Dev Server or Production Static Assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Moodle Downloader Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
