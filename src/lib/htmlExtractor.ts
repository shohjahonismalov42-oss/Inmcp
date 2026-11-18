export interface ExtractedLink {
  text: string;
  url: string;
  external: boolean;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '...',
  '&copy;': '©',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|copy|#39);/gi, (m) => {
      return ENTITY_MAP[m.toLowerCase()] ?? m;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTitleAndDescription(html: string): {
  title: string;
  description: string;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : '';

  const descMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i
    ) ||
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
    );

  const description = descMatch ? decodeHtmlEntities(descMatch[1]).trim() : '';
  return { title, description };
}

export function extractLinksFromHtml(
  html: string,
  baseUrl: string,
  limit = 40
): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  let baseOrigin = '';
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = '';
  }

  const anchorRegex = /<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && links.length < limit) {
    const rawHref = decodeHtmlEntities(match[1]).trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
      continue;
    }

    let resolved: string;
    try {
      const u = new URL(rawHref, baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      resolved = u.toString();
    } catch {
      continue;
    }

    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const text = stripTags(match[2]) || resolved;
    let external = false;
    try {
      external = baseOrigin ? new URL(resolved).origin !== baseOrigin : true;
    } catch {
      external = true;
    }

    links.push({ text: text.slice(0, 140), url: resolved, external });
  }

  return links;
}

export function htmlToMarkdown(html: string, maxChars = 14_000): string {
  // Remove head and noisy non-content tags completely
  let text = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Convert code blocks before inline tags
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const clean = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
    return `\n\n\`\`\`\n${clean}\n\`\`\`\n\n`;
  });

  // Headings
  for (let lvl = 1; lvl <= 6; lvl++) {
    const prefix = '#'.repeat(lvl);
    const re = new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)<\\/h${lvl}>`, 'gi');
    text = text.replace(re, (_, inner) => `\n\n${prefix} ${stripTags(inner)}\n\n`);
  }

  // Links
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, inner) => {
      const label = stripTags(inner);
      const cleanHref = decodeHtmlEntities(href).trim();
      if (!label) return cleanHref;
      return `[${label}](${cleanHref})`;
    }
  );

  // List items & blockquotes
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const clean = stripTags(inner);
    return clean ? `\n- ${clean}` : '';
  });
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const clean = stripTags(inner);
    return clean ? `\n\n> ${clean}\n\n` : '';
  });

  // Paragraphs & line breaks
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|tr|header|footer|main)>/gi, '\n\n')
    .replace(/<(td|th)[^>]*>/gi, ' | ');

  // Strip remaining tags
  text = decodeHtmlEntities(text.replace(/<[^>]+>/g, ''));

  // Normalize whitespace
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > maxChars) {
    return `${text.slice(0, maxChars)}\n\n...[Qisqartirildi: jami ${text.length} belgi]`;
  }

  return text;
}

export function parseDuckDuckGoHtml(html: string, limit = 8): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  // Match result blocks from DuckDuckGo HTML endpoint
  const titleRegex = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<(?:a|div|span)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;

  const titles: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = titleRegex.exec(html)) !== null) {
    let rawUrl = decodeHtmlEntities(m[1]).trim();
    // DuckDuckGo wraps links in //duckduckgo.com/l/?uddg=...
    if (rawUrl.includes('uddg=')) {
      try {
        const full = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
        const uddg = new URL(full).searchParams.get('uddg');
        if (uddg) rawUrl = uddg;
      } catch {
        // keep original
      }
    }
    if (rawUrl.startsWith('//')) rawUrl = `https:${rawUrl}`;
    const title = stripTags(m[2]);
    if (title && rawUrl.startsWith('http')) {
      titles.push({ url: rawUrl, title });
    }
  }

  const snippets: string[] = [];
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(m[1]));
  }

  for (let i = 0; i < Math.min(titles.length, limit); i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}
