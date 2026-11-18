import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTitleAndDescription,
  extractLinksFromHtml,
  htmlToMarkdown,
  parseDuckDuckGoHtml,
} from './htmlExtractor';

test('extractTitleAndDescription parses title and meta description cleanly', () => {
  const html = `
    <html>
      <head>
        <title>MCP &amp; Claude Guide</title>
        <meta name="description" content="Connect Claude to the web safely." />
      </head>
      <body><h1>Hello</h1></body>
    </html>
  `;
  const meta = extractTitleAndDescription(html);
  assert.equal(meta.title, 'MCP & Claude Guide');
  assert.equal(meta.description, 'Connect Claude to the web safely.');
});

test('htmlToMarkdown strips head, nav, footer, scripts/styles and converts main content', () => {
  const html = `
    <html>
      <head><title>Ignored Head Title</title></head>
      <body>
        <nav><a href="/menu">Mega Menu Item</a></nav>
        <script>alert("xss")</script>
        <style>.x { color: red; }</style>
        <main>
          <h1>Main Heading</h1>
          <p>Read the <a href="/docs/intro">MCP Docs</a> now. This paragraph has enough real content to be prioritized over navigation chrome and sidebars on large documentation sites.</p>
          <ul><li>Step one</li><li>Step two</li></ul>
        </main>
        <footer>Copyright 2026</footer>
      </body>
    </html>
  `;
  const md = htmlToMarkdown(html, 12000, 'https://modelcontextprotocol.io');
  assert.equal(md.includes('Ignored Head Title'), false);
  assert.equal(md.includes('Mega Menu Item'), false);
  assert.equal(md.includes('Copyright 2026'), false);
  assert.equal(md.includes('alert("xss")'), false);
  assert.equal(md.includes('# Main Heading'), true);
  assert.equal(md.includes('[MCP Docs](https://modelcontextprotocol.io/docs/intro)'), true);
  assert.equal(md.includes('- Step one'), true);
});

test('htmlToMarkdown extracts JSON-LD fallback for empty JS-only SPAs', () => {
  const html = `
    <html>
      <head>
        <title>SPA News Article</title>
        <script type="application/ld+json">
          {"headline": "Breaking Tech News", "articleBody": "Full article text embedded in structured JSON-LD for client-side React apps."}
        </script>
      </head>
      <body><div id="root"></div></body>
    </html>
  `;
  const md = htmlToMarkdown(html);
  assert.equal(md.includes('Breaking Tech News'), true);
  assert.equal(md.includes('Full article text embedded in structured JSON-LD'), true);
});

test('extractLinksFromHtml resolves relative URLs and detects external links', () => {
  const html = `
    <a href="/docs/intro">Intro</a>
    <a href="https://github.com/anthropics">Anthropic GitHub</a>
    <a href="javascript:void(0)">Ignore</a>
  `;
  const links = extractLinksFromHtml(html, 'https://example.com/start');
  assert.equal(links.length, 2);
  assert.deepEqual(links[0], {
    text: 'Intro',
    url: 'https://example.com/docs/intro',
    external: false,
  });
  assert.deepEqual(links[1], {
    text: 'Anthropic GitHub',
    url: 'https://github.com/anthropics',
    external: true,
  });
});

test('parseDuckDuckGoHtml extracts uddg target URLs and snippets', () => {
  const html = `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmodelcontextprotocol.io%2Fdocs">Model Context Protocol</a>
      <a class="result__snippet">Open standard for connecting AI assistants to data.</a>
    </div>
  `;
  const results = parseDuckDuckGoHtml(html, 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://modelcontextprotocol.io/docs');
  assert.equal(results[0].title, 'Model Context Protocol');
  assert.equal(results[0].snippet.includes('Open standard'), true);
});
