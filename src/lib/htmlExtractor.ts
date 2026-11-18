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
  '&laquo;': '«',
  '&raquo;': '»',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|copy|laquo|raquo|#39);/gi, (m) => {
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
  return decodeHtmlEntities(html.replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, ' '))
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
    ) ||
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["'][^>]*>/i
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

function resolveMaybeRelativeUrl(rawHref: string, baseUrl?: string): string {
  const clean = decodeHtmlEntities(rawHref).trim();
  if (!clean || !baseUrl) return clean;
  if (clean.startsWith('#') || clean.startsWith('javascript:') || clean.startsWith('mailto:')) {
    return clean;
  }
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

function extractBalancedTagBlocks(html: string, tagName: string): string[] {
  const blocks: string[] = [];
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeTag = `</${tagName}>`;
  let match: RegExpExecArray | null;
  let searchFrom = 0;

  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    match = openRe.exec(html);
    if (!match) break;

    const startIdx = match.index;
    let depth = 1;
    let cursor = match.index + match[0].length;
    const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = cursor;

    let innerMatch: RegExpExecArray | null;
    while ((innerMatch = tagRe.exec(html)) !== null) {
      if (innerMatch[1] === '/') {
        depth--;
        if (depth === 0) {
          const endIdx = innerMatch.index + innerMatch[0].length;
          blocks.push(html.slice(startIdx, endIdx));
          cursor = endIdx;
          break;
        }
      } else {
        depth++;
      }
    }

    if (depth > 0) {
      // Unclosed tag fallback: take until end or stop loop
      blocks.push(html.slice(startIdx));
      break;
    }
    searchFrom = cursor;
    void closeTag;
  }

  return blocks;
}

function stripBalancedTag(html: string, tagName: string): string {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
  let out = '';
  let lastPos = 0;

  while (lastPos < html.length) {
    openRe.lastIndex = lastPos;
    const match = openRe.exec(html);
    if (!match) {
      out += html.slice(lastPos);
      break;
    }

    out += html.slice(lastPos, match.index);
    let depth = 1;
    let cursor = match.index + match[0].length;
    tagRe.lastIndex = cursor;

    let innerMatch: RegExpExecArray | null;
    while ((innerMatch = tagRe.exec(html)) !== null) {
      if (innerMatch[1] === '/') {
        depth--;
        if (depth === 0) {
          cursor = innerMatch.index + innerMatch[0].length;
          break;
        }
      } else {
        depth++;
      }
    }

    if (depth > 0) {
      // Unclosed noise tag (e.g. truncated script/nav) -> drop remainder
      break;
    }
    lastPos = cursor;
  }

  return out;
}

function extractStructuredSpaFallback(html: string): string {
  const parts: string[] = [];

  // 1. JSON-LD structured data (news articles, products, orgs)
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.headline) parts.push(`## ${String(item.headline)}`);
        else if (item?.name) parts.push(`## ${String(item.name)}`);
        if (item?.description) parts.push(String(item.description));
        if (item?.articleBody) parts.push(String(item.articleBody));
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }

  // 2. OpenGraph / Twitter metadata fallback
  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](og:title|og:description|twitter:title|twitter:description)["'][^>]+content=["']([\s\S]*?)["'][^>]*>/gi;
  const seenMeta = new Set<string>();
  while ((m = metaRegex.exec(html)) !== null) {
    const val = decodeHtmlEntities(m[2]).trim();
    if (val && !seenMeta.has(val)) {
      seenMeta.add(val);
      parts.push(val);
    }
  }

  // 3. __NEXT_DATA__ readable strings fallback if still sparse
  if (parts.join('\n').length < 200) {
    const nextMatch = html.match(
      /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (nextMatch) {
      try {
        const nextJson = JSON.parse(nextMatch[1]);
        const collected: string[] = [];
        const walk = (node: unknown, depth = 0) => {
          if (depth > 8 || collected.length > 60) return;
          if (typeof node === 'string') {
            const trimmed = node.trim();
            if (
              trimmed.length >= 25 &&
              trimmed.length <= 1200 &&
              !/^https?:\/\//i.test(trimmed) &&
              !/^[a-z0-9_-]+$/i.test(trimmed)
            ) {
              collected.push(trimmed);
            }
          } else if (Array.isArray(node)) {
            for (const el of node) walk(el, depth + 1);
          } else if (node && typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) {
              if (['buildId', 'assetPrefix', 'scriptLoader', 'gssp'].includes(k)) continue;
              walk(v, depth + 1);
            }
          }
        };
        walk(nextJson);
        const unique = Array.from(new Set(collected));
        if (unique.length > 0) parts.push(...unique);
      } catch {
        // ignore invalid __NEXT_DATA__
      }
    }
  }

  return parts.join('\n\n').trim();
}

function convertCleanHtmlFragment(fragment: string, baseUrl?: string): string {
  let text = fragment;

  // Convert code blocks before inline tags
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const clean = decodeHtmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
    return clean ? `\n\n\`\`\`\n${clean}\n\`\`\`\n\n` : '';
  });

  // Headings
  for (let lvl = 1; lvl <= 6; lvl++) {
    const prefix = '#'.repeat(lvl);
    const re = new RegExp(`<h${lvl}[^>]*>([\\s\\S]*?)<\\/h${lvl}>`, 'gi');
    text = text.replace(re, (_, inner) => {
      const clean = stripTags(inner);
      return clean ? `\n\n${prefix} ${clean}\n\n` : '';
    });
  }

  // Links (resolve relative URLs if baseUrl provided)
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, inner) => {
      const label = stripTags(inner);
      const cleanHref = resolveMaybeRelativeUrl(href, baseUrl);
      if (!label) return '';
      if (cleanHref.startsWith('#') || cleanHref.startsWith('javascript:')) {
        return label;
      }
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

  // Paragraphs, tables & line breaks
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|tr|header|footer|main)>/gi, '\n\n')
    .replace(/<(td|th)[^>]*>/gi, ' | ');

  // Strip remaining tags (respecting > inside quoted attributes like data-mw)
  text = decodeHtmlEntities(text.replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, ''));

  // Normalize whitespace and clean orphan separator-only lines (preserve "- list item")
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n[\/|•·-][ \t]*(?=\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToMarkdown(
  html: string,
  maxChars = 16_000,
  baseUrl?: string
): string {
  const spaFallback = extractStructuredSpaFallback(html);

  // 1. Remove head, scripts, styles, SVGs, templates, comments
  let cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 2. Strip navigation/chrome blocks cleanly using balanced tag removal
  cleaned = stripBalancedTag(cleaned, 'nav');
  cleaned = stripBalancedTag(cleaned, 'footer');
  cleaned = stripBalancedTag(cleaned, 'aside');

  // 3. Try focused main/article content first so sidebars/menus don't drown out content
  let candidateHtml = '';

  // Wikipedia main content container (#mw-content-text)
  const wikiMatch = cleaned.match(
    /<div[^>]+id=["']mw-content-text["'][^>]*>([\s\S]*?)<div[^>]+class=["'][^"']*printfooter/i
  );
  if (wikiMatch && wikiMatch[1].length > 300) {
    candidateHtml = wikiMatch[1];
  }

  // Primary <main> block
  if (!candidateHtml) {
    const mainBlocks = extractBalancedTagBlocks(cleaned, 'main');
    const combinedMain = mainBlocks.join('\n\n');
    if (stripTags(combinedMain).length >= 200) {
      candidateHtml = combinedMain;
    }
  }

  // Primary <article> blocks (handles blogs, docs, and multi-article news homepages)
  if (!candidateHtml) {
    const articleBlocks = extractBalancedTagBlocks(cleaned, 'article');
    const combinedArticles = articleBlocks.join('\n\n');
    if (stripTags(combinedArticles).length >= 200) {
      candidateHtml = combinedArticles;
    }
  }

  // Fallback: strip top-level <header> from remaining cleaned body
  if (!candidateHtml) {
    candidateHtml = stripBalancedTag(cleaned, 'header');
  } else {
    // Also remove any nested nav inside main/article
    candidateHtml = stripBalancedTag(candidateHtml, 'nav');
  }

  let markdown = convertCleanHtmlFragment(candidateHtml, baseUrl);

  // If <main> had a noisy top <header> inside it and very little body text, retry without <header>
  if (markdown.length < 150) {
    const wholeBody = stripBalancedTag(cleaned, 'header');
    const fallbackBody = convertCleanHtmlFragment(wholeBody, baseUrl);
    if (fallbackBody.length > markdown.length) {
      markdown = fallbackBody;
    }
  }

  // If still near-empty (JS-rendered SPA), append structured JSON-LD / OG / __NEXT_DATA__ fallback
  if (markdown.length < 150 && spaFallback.length > markdown.length) {
    markdown = spaFallback;
  }

  if (markdown.length > maxChars) {
    return `${markdown.slice(0, maxChars)}\n\n...[Qisqartirildi: jami ${markdown.length} belgi]`;
  }

  return markdown;
}

export function parseDuckDuckGoHtml(html: string, limit = 8): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const titleRegex = /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<(?:a|div|span)[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/gi;

  const titles: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = titleRegex.exec(html)) !== null) {
    let rawUrl = decodeHtmlEntities(m[1]).trim();
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
