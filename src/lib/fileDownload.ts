export type FileKind = 'text' | 'image' | 'binary';

export function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 120) || 'downloaded_file';
}

export function extractFilename(
  urlStr: string,
  contentDisposition?: string | null,
  contentType?: string | null
): string {
  if (contentDisposition) {
    // filename*=UTF-8''example.pdf or filename="example.pdf"
    const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;\r\n]+)/i);
    if (utf8Match) {
      try {
        return sanitizeFilename(decodeURIComponent(utf8Match[1].trim()));
      } catch {
        // fallback
      }
    }
    const basicMatch = contentDisposition.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
    if (basicMatch && basicMatch[1].trim()) {
      return sanitizeFilename(basicMatch[1].trim());
    }
  }

  try {
    const parsed = new URL(urlStr);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.includes('.')) {
      return sanitizeFilename(decodeURIComponent(last));
    }
    if (last) {
      const ext = guessExtensionFromMime(contentType);
      return sanitizeFilename(`${last}${ext}`);
    }
  } catch {
    // ignore URL parse error
  }

  return sanitizeFilename(`file${guessExtensionFromMime(contentType)}`);
}

export function guessExtensionFromMime(contentType?: string | null): string {
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/json': '.json',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/csv': '.csv',
    'text/markdown': '.md',
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/xml': '.xml',
  };
  return map[mime] || '';
}

export function classifyContentType(contentType?: string | null): FileKind {
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  if (
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/webp' ||
    mime === 'image/gif'
  ) {
    return 'image';
  }

  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/ld+json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/x-yaml' ||
    mime === 'application/yaml' ||
    mime === 'image/svg+xml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  ) {
    return 'text';
  }

  return 'binary';
}
