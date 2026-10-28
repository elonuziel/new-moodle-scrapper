import { ActivityItem, ActivityType, CourseSection } from '../types';
import { sanitizeFilename } from './filename-utils';

/**
 * Extracts the clean activity title without Moodle accessibility tags (e.g. 'קובץ' or 'Assignment').
 */
export function extractCleanTitle(rawText: string): string {
  if (!rawText) return "Activity";
  let title = rawText.trim();
  // Strip common trailing type badges found in Moodle accessibility tags
  title = title.replace(/(קובץ|File|תיקייה|Folder|מטלה|Assignment|דף|Page|קישור|URL|בוחן|Quiz)\s*$/i, '').trim();
  return title || "Activity";
}

/**
 * Parses course activities from HTML markup (browser DOM or cheerio node).
 */
export function parseCourseActivitiesFromHtml(
  html: string,
  courseUrl: string,
  includeNested: boolean = true
): { sections: CourseSection[]; totalItems: number; courseTitle: string; userName?: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract Course title
  let courseTitle = "Moodle Course";
  const h1 = doc.querySelector('h1') || doc.querySelector('title');
  if (h1 && h1.textContent) {
    const raw = h1.textContent.trim();
    const cleaned = raw.replace(/^(Course:\s*|\s*קורס:\s*)/i, '');
    courseTitle = cleaned.split(' | ')[0].split(' - ')[0].trim() || "Moodle Course";
  }

  // Extract User name
  let userName: string | undefined;
  const userElem = doc.querySelector('.usertext, .user-name, .avatarmenu, [data-key="user-name"]');
  if (userElem && userElem.textContent) {
    userName = userElem.textContent.trim();
  }

  const modRegex = includeNested
    ? /\/mod\/(resource|folder|assign|page|url|h5pactivity)\/view\.php\?id=\d+/i
    : /\/mod\/(resource|folder)\/view\.php\?id=\d+/i;

  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const sectionsMap = new Map<string, CourseSection>();
  let totalItems = 0;

  anchors.forEach((a, index) => {
    const rawHref = a.getAttribute('href') || '';
    if (!modRegex.test(rawHref)) return;

    let href = rawHref;
    try {
      href = new URL(rawHref, courseUrl).toString();
    } catch {
      // Keep rawHref
    }

    // Extract clean title
    const instanceSpan = a.querySelector('.instancename');
    let title = '';
    if (instanceSpan) {
      // Clone to remove sr-only / accesshide elements
      const clone = instanceSpan.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.accesshide, .sr-only').forEach(el => el.remove());
      title = extractCleanTitle(clone.textContent || '');
    } else {
      title = extractCleanTitle(a.textContent || '');
    }

    const modMatch = href.match(/\/mod\/(\w+)\//);
    const modType = (modMatch ? modMatch[1].toLowerCase() : 'resource') as ActivityType;

    // Determine section name
    let sectionName = "General";
    const parentSection = a.closest('.course-section, .section.main, .section-item, li.section');
    if (parentSection) {
      const heading = parentSection.querySelector('h2, h3, h4, h5, span.sectionname, .section-title, .sectionname');
      if (heading && heading.textContent) {
        sectionName = heading.textContent.trim();
      } else {
        const ariaLabel = parentSection.getAttribute('aria-label');
        if (ariaLabel) {
          sectionName = ariaLabel.trim();
        }
      }
    }

    const safeSectionName = sanitizeFilename(sectionName) || "General";

    if (!sectionsMap.has(safeSectionName)) {
      sectionsMap.set(safeSectionName, {
        id: `section-${sectionsMap.size + 1}`,
        name: sectionName,
        safeName: safeSectionName,
        items: [],
        selected: true,
      });
    }

    const section = sectionsMap.get(safeSectionName)!;
    if (!section.items.some(item => item.href === href)) {
      section.items.push({
        id: `act-${index + 1}`,
        href,
        title,
        modType,
        sectionName: safeSectionName,
        selected: true,
      });
      totalItems++;
    }
  });

  return {
    sections: Array.from(sectionsMap.values()),
    totalItems,
    courseTitle,
    userName,
  };
}
