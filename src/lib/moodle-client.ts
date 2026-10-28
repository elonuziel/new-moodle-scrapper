import JSZip from 'jszip';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ActivityItem, CourseInfo, DownloadOptions, LogMessage } from '../types';
import { parseCourseActivitiesFromHtml } from './moodle-parser';
import { sanitizeFilename, getFilenameFromContentDisposition, formatSize } from './filename-utils';
import { resolveCourseUrl } from './url-resolver';

export const MOBILE_COOKIE_BOOKMARKLET = `javascript:(function(){var m=document.cookie.match(/MoodleSession=([^;]+)/);if(m){prompt('Copy your MoodleSession cookie:',m[1]);}else{alert('MoodleSession cookie not found. Please log in to Moodle first!');}})();`;

const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function formatCookieHeader(rawCookie: string): string {
  const cleaned = (rawCookie || '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  return cleaned.includes('=') ? cleaned : `MoodleSession=${cleaned}`;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleaned);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function loginToMoodleDirect(
  siteUrl: string,
  username: string,
  password: string
): Promise<{ cookie: string }> {
  const base = siteUrl.trim().replace(/\/+$/, '');
  if (isNativeAndroid()) {
    const loginUrl = `${base}/login/index.php`;
    const initResp = await CapacitorHttp.get({
      url: loginUrl,
      headers: {
        'User-Agent': ANDROID_USER_AGENT,
      },
    });
    const html = typeof initResp.data === 'string' ? initResp.data : '';
    const tokenMatch = html.match(/name="logintoken"\s+value="([^"]+)"/i);
    const loginToken = tokenMatch ? tokenMatch[1] : '';

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    if (loginToken) formData.append('logintoken', loginToken);

    const postResp = await CapacitorHttp.post({
      url: loginUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ANDROID_USER_AGENT,
      },
      data: formData.toString(),
    });

    const cookieHeader = postResp.headers?.['Set-Cookie'] || postResp.headers?.['set-cookie'] || '';
    const match = String(cookieHeader).match(/MoodleSession=([^;]+)/i);
    if (match && match[1]) {
      return { cookie: match[1] };
    }
    throw new Error(
      'Standard login did not return a session cookie. Use the In-App WebView SSO tab for Microsoft 365 / 2FA login or paste your MoodleSession cookie.'
    );
  }

  const resp = await fetch('/api/moodle/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl: base, username, password }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.cookie) {
    throw new Error(data.error || 'Authentication failed');
  }
  return { cookie: data.cookie };
}

export async function fetchAndParseCourse(
  rawCourseInput: string,
  siteUrl: string,
  cookie: string,
  includeNested: boolean
): Promise<CourseInfo> {
  const { cleanUrl, courseId, domain } = resolveCourseUrl(rawCourseInput, siteUrl);

  if (isNativeAndroid()) {
    const cookieHeader = formatCookieHeader(cookie);
    const response = await CapacitorHttp.get({
      url: cleanUrl,
      headers: {
        Cookie: cookieHeader,
        'User-Agent': ANDROID_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (
      html.includes('name="logintoken"') ||
      html.includes('id="login"') ||
      (response.url && response.url.toLowerCase().includes('/login/'))
    ) {
      throw new Error('MoodleSession cookie expired or invalid. Please re-authenticate.');
    }

    const parsed = parseCourseActivitiesFromHtml(html, cleanUrl, includeNested);
    return {
      url: cleanUrl,
      courseId: courseId || 'course',
      domain,
      title: parsed.courseTitle,
      userName: parsed.userName,
      sections: parsed.sections,
      totalItems: parsed.totalItems,
    };
  }

  const resp = await fetch('/api/moodle/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseUrl: cleanUrl,
      cookie,
      includeNested,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || 'Failed to parse Moodle course');
  }

  return {
    url: cleanUrl,
    courseId: courseId || 'course',
    domain,
    title: data.courseTitle,
    userName: data.userName,
    sections: data.sections,
    totalItems: data.totalItems,
  };
}

async function inspectActivityTargets(
  item: ActivityItem,
  cookie: string
): Promise<{ name: string; url: string; isFolderZip?: boolean }[]> {
  if (item.modType === 'resource') {
    return [{ name: sanitizeFilename(item.title), url: item.href }];
  }

  if (isNativeAndroid()) {
    const cookieHeader = formatCookieHeader(cookie);
    if (item.modType === 'folder') {
      const idMatch = item.href.match(/id=(\d+)/);
      if (idMatch) {
        const parsedUrl = new URL(item.href);
        const zipDownloadUrl = `${parsedUrl.origin}/mod/folder/download_folder.php?id=${idMatch[1]}`;
        return [{ name: `folder_${idMatch[1]}.zip`, url: zipDownloadUrl, isFolderZip: true }];
      }
    }

    const response = await CapacitorHttp.get({
      url: item.href,
      headers: {
        Cookie: cookieHeader,
        'User-Agent': ANDROID_USER_AGENT,
      },
    });

    const contentType =
      response.headers?.['Content-Type'] || response.headers?.['content-type'] || '';
    if (!String(contentType).includes('text/html')) {
      const cd =
        response.headers?.['Content-Disposition'] || response.headers?.['content-disposition'];
      const resolvedName =
        getFilenameFromContentDisposition(cd) ||
        sanitizeFilename(
          decodeURIComponent(new URL(response.url || item.href).pathname.split('/').pop() || item.title)
        );
      return [{ name: resolvedName, url: response.url || item.href }];
    }

    const html = typeof response.data === 'string' ? response.data : '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const files: { name: string; url: string }[] = [];
    const seen = new Set<string>();

    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (
        href.includes('/pluginfile.php/') ||
        href.includes('/forcedownload=1') ||
        href.includes('/mod/folder/download_folder.php')
      ) {
        try {
          const fullUrl = new URL(href, item.href).toString();
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            const rawName =
              (a.textContent || '').trim() ||
              decodeURIComponent(new URL(fullUrl).pathname.split('/').pop() || 'attachment');
            files.push({
              name: sanitizeFilename(rawName),
              url: fullUrl,
            });
          }
        } catch {
          // ignore malformed URL
        }
      }
    }
    return files;
  }

  // Web proxy mode
  const inspectResp = await fetch('/api/moodle/inspect-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activityUrl: item.href,
      modType: item.modType,
      cookie,
    }),
  });
  if (!inspectResp.ok) {
    return [];
  }
  const inspectData = await inspectResp.json();
  return inspectData.files || [];
}

async function fetchBinaryFileFromMoodle(
  targetUrl: string,
  cookie: string,
  fallbackTitle: string
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  if (isNativeAndroid()) {
    const cookieHeader = formatCookieHeader(cookie);
    const response = await CapacitorHttp.get({
      url: targetUrl,
      responseType: 'blob',
      headers: {
        Cookie: cookieHeader,
        'User-Agent': ANDROID_USER_AGENT,
      },
    });

    if (response.status < 200 || response.status >= 300) {
      return null;
    }

    const cd =
      response.headers?.['Content-Disposition'] || response.headers?.['content-disposition'];
    let filename = getFilenameFromContentDisposition(cd);
    if (!filename) {
      try {
        const urlPath = decodeURIComponent(new URL(response.url || targetUrl).pathname);
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

    const bytes =
      typeof response.data === 'string'
        ? base64ToUint8Array(response.data)
        : new Uint8Array(response.data);

    return { bytes, filename };
  }

  // Web proxy mode
  const fileResp = await fetch('/api/moodle/fetch-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileUrl: targetUrl,
      cookie,
      fallbackTitle,
    }),
  });

  if (!fileResp.ok) {
    return null;
  }

  const resolvedHeader = fileResp.headers.get('X-Resolved-Filename');
  const filename = resolvedHeader
    ? sanitizeFilename(decodeURIComponent(resolvedHeader))
    : sanitizeFilename(fallbackTitle);

  const arrayBuf = await fileResp.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuf), filename };
}

export async function executeCourseDownload(
  course: CourseInfo,
  cookie: string,
  options: DownloadOptions,
  onProgress: (update: {
    downloadedFiles: number;
    totalFiles: number;
    totalBytes: number;
    currentActivity?: string;
    currentSection?: string;
    log?: Omit<LogMessage, 'id' | 'timestamp'>;
  }) => void
): Promise<{ zipBlob: Blob; zipFileName: string; savedNativePath?: string }> {
  if (!cookie.trim()) {
    throw new Error('MoodleSession cookie is required to download course files.');
  }

  const zip = new JSZip();
  const selectedActivities: { sectionSafeName: string; item: ActivityItem }[] = [];

  for (const sec of course.sections) {
    for (const item of sec.items) {
      if (item.selected) {
        if (!options.includeNested && (item.modType === 'assign' || item.modType === 'page')) {
          continue;
        }
        selectedActivities.push({
          sectionSafeName: sanitizeFilename(sec.safeName || sec.name),
          item,
        });
      }
    }
  }

  const totalActivities = selectedActivities.length;
  if (totalActivities === 0) {
    throw new Error('No activities selected for download.');
  }

  let completedCount = 0;
  let totalBytes = 0;

  onProgress({
    downloadedFiles: 0,
    totalFiles: totalActivities,
    totalBytes: 0,
    log: {
      type: 'header',
      text: `Starting download of ${totalActivities} selected items (${options.threads} concurrent workers)...`,
    },
  });

  const concurrency = Math.max(1, Math.min(10, options.threads || 5));
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < selectedActivities.length) {
      const idx = currentIndex++;
      const { sectionSafeName, item } = selectedActivities[idx];

      onProgress({
        downloadedFiles: completedCount,
        totalFiles: totalActivities,
        totalBytes,
        currentSection: sectionSafeName,
        currentActivity: item.title,
      });

      try {
        const fileTargets = await inspectActivityTargets(item, cookie);

        if (fileTargets.length === 0) {
          onProgress({
            downloadedFiles: completedCount,
            totalFiles: totalActivities,
            totalBytes,
            log: {
              type: 'warning',
              text: `No downloadable files found in ${item.title}`,
            },
          });
        }

        for (const target of fileTargets) {
          const fetched = await fetchBinaryFileFromMoodle(
            target.url,
            cookie,
            target.name || item.title
          );

          if (!fetched) {
            onProgress({
              downloadedFiles: completedCount,
              totalFiles: totalActivities,
              totalBytes,
              log: {
                type: 'warning',
                text: `Skipped ${item.title} (unable to fetch file)`,
              },
            });
            continue;
          }

          const { bytes, filename: finalName } = fetched;
          totalBytes += bytes.byteLength;

          // Auto-unpack folder ZIP archives if enabled
          if (
            options.autoUnpack &&
            (target.isFolderZip || finalName.toLowerCase().endsWith('.zip'))
          ) {
            try {
              const nestedZip = await JSZip.loadAsync(bytes);
              const folderSubdir = `${sectionSafeName}/${sanitizeFilename(item.title)}`;
              let extractedCount = 0;
              for (const [relPath, zipEntry] of Object.entries(nestedZip.files)) {
                if (!zipEntry.dir) {
                  const entryData = await zipEntry.async('uint8array');
                  zip.file(`${folderSubdir}/${relPath}`, entryData);
                  extractedCount++;
                }
              }
              onProgress({
                downloadedFiles: completedCount,
                totalFiles: totalActivities,
                totalBytes,
                log: {
                  type: 'success',
                  text: `Unpacked ${extractedCount} files into ${folderSubdir}/`,
                },
              });
              continue;
            } catch {
              // If not a valid zip, store as regular file
            }
          }

          const targetPath = `${sectionSafeName}/${finalName}`;
          zip.file(targetPath, bytes);

          onProgress({
            downloadedFiles: completedCount,
            totalFiles: totalActivities,
            totalBytes,
            log: {
              type: 'success',
              text: `Downloaded ${targetPath} (${formatSize(bytes.byteLength)})`,
            },
          });
        }
      } catch (err: any) {
        onProgress({
          downloadedFiles: completedCount,
          totalFiles: totalActivities,
          totalBytes,
          log: {
            type: 'error',
            text: `Error on ${item.title}: ${err?.message || 'Download failed'}`,
          },
        });
      } finally {
        completedCount++;
        onProgress({
          downloadedFiles: completedCount,
          totalFiles: totalActivities,
          totalBytes,
          currentSection: sectionSafeName,
          currentActivity: item.title,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const baseOutputName = sanitizeFilename(
    options.outputName || `moodle_course_${course.courseId || 'archive'}`
  );
  const zipFileName = baseOutputName.endsWith('.zip') ? baseOutputName : `${baseOutputName}.zip`;

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  let savedNativePath: string | undefined;
  if (isNativeAndroid()) {
    try {
      const base64Data = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
      const writeResult = await Filesystem.writeFile({
        path: `Download/${zipFileName}`,
        data: base64Data,
        directory: Directory.ExternalStorage,
        recursive: true,
      });
      savedNativePath = writeResult.uri;
    } catch {
      try {
        const base64Data = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
        const docResult = await Filesystem.writeFile({
          path: zipFileName,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true,
        });
        savedNativePath = docResult.uri;
      } catch {
        // Fallback to browser blob trigger
      }
    }
  }

  return { zipBlob, zipFileName, savedNativePath };
}
