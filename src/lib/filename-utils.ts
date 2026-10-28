/**
 * Filename sanitization and header parsing utilities matching core/utils.py
 */

export function sanitizeFilename(name: string, maxLength: number = 200): string {
  if (!name) return "unnamed_file";

  let sanitized = name.trim();
  // Prevent path traversal
  sanitized = sanitized.replace(/^[./\\]+/, '');
  // Replace directory separators and forbidden characters (\ / * ? : " < > |)
  sanitized = sanitized.replace(/[\\/*?:"<>|]/g, '_');
  // Remove control characters (0x00-0x1F, 0x7F)
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  // Clean trailing spaces and dots
  sanitized = sanitized.replace(/[. ]+$/, '').trim();

  if (!sanitized) return "unnamed_file";
  return sanitized.slice(0, maxLength);
}

export function formatSize(bytesNum: number): string {
  if (!bytesNum || isNaN(bytesNum) || bytesNum <= 0) return "0 B";
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytesNum;
  for (let i = 0; i < units.length; i++) {
    if (val < 1024.0 || i === units.length - 1) {
      return i === 0 ? `${Math.round(val)} B` : `${val.toFixed(1)} ${units[i]}`;
    }
    val /= 1024.0;
  }
  return `${val.toFixed(1)} TB`;
}

/**
 * Extracts and decodes filename from Content-Disposition header.
 * Prioritizes RFC 5987 / RFC 6266 (filename*=UTF-8''...) over ASCII fallback.
 */
export function getFilenameFromContentDisposition(cd: string | null | undefined): string | null {
  if (!cd) return null;

  // 1. RFC 5987 / 6266 filename*=UTF-8''... (highest priority for international characters)
  const matchStar = cd.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i);
  if (matchStar && matchStar[1]) {
    try {
      const rawVal = matchStar[1].trim().replace(/^['"]|['"]$/g, '');
      return sanitizeFilename(decodeURIComponent(rawVal));
    } catch {
      // Fallback
    }
  }

  // 2. filename="..."
  const matchQuoted = cd.match(/filename\s*=\s*"([^"]+)"/i);
  if (matchQuoted && matchQuoted[1]) {
    try {
      const decoded = decodeURIComponent(escape(matchQuoted[1]));
      return sanitizeFilename(decoded);
    } catch {
      return sanitizeFilename(matchQuoted[1]);
    }
  }

  // 3. filename=unquoted
  const matchUnquoted = cd.match(/filename\s*=\s*([^; ]+)/i);
  if (matchUnquoted && matchUnquoted[1]) {
    const rawVal = matchUnquoted[1].trim().replace(/^['"]|['"]$/g, '');
    try {
      const decoded = decodeURIComponent(escape(rawVal));
      return sanitizeFilename(decoded);
    } catch {
      return sanitizeFilename(rawVal);
    }
  }

  return null;
}
