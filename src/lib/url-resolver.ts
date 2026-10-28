/**
 * Resolves raw input into (cleanCourseUrl, courseId, domain).
 * Matches core/cli.py resolve_course_url and test_logic.py
 */

export interface ResolvedCourseUrl {
  cleanUrl: string;
  courseId: string;
  domain: string;
}

export function resolveCourseUrl(
  rawInput: string,
  defaultSite: string = "https://moodle.ruppin.ac.il"
): ResolvedCourseUrl {
  let input = (rawInput || '').trim();
  let baseSite = defaultSite.trim();

  if (!baseSite.startsWith('http://') && !baseSite.startsWith('https://')) {
    baseSite = `https://${baseSite}`;
  }
  baseSite = baseSite.replace(/\/+$/, '');

  // 1. Numeric ID only
  if (/^\d+$/.test(input)) {
    const courseId = input;
    const cleanUrl = `${baseSite}/course/view.php?id=${courseId}`;
    try {
      const urlObj = new URL(baseSite);
      return { cleanUrl, courseId, domain: urlObj.hostname || "moodle" };
    } catch {
      return { cleanUrl, courseId, domain: "moodle" };
    }
  }

  // 2. URL or domain
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    input = `https://${input}`;
  }

  try {
    const parsed = new URL(input);
    const domain = parsed.hostname || "moodle";
    const siteBase = `${parsed.protocol}//${domain}`;

    const match = input.match(/id=(\d+)/);
    const courseId = match ? match[1] : "";

    const cleanUrl = courseId
      ? `${siteBase}/course/view.php?id=${courseId}`
      : input;

    return { cleanUrl, courseId, domain };
  } catch {
    return {
      cleanUrl: input,
      courseId: "",
      domain: "moodle",
    };
  }
}
