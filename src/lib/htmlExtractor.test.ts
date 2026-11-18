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

test('htmlToMarkdown strips head, scripts/styles and converts headings and links', () => {
  const html = `
    <html>
      <head><title>Ignored Head Title</title></head>
      <body>
        <script>alert("xss")</script>
        <style>.x { color: red; }</style>
        <h1>Main Heading</h1>
        <p>Read the <a href="https://modelcontextprotocol.io">MCP Docs</a> now.</p>
        <ul><li>Step one</li><li>Step two</li></ul>
      </body>
    </html>
  `;
  const md = htmlToMarkdown(html);
  assert.equal(md.includes('Ignored Head Title'), false);
  assert.equal(md.includes('alert("xss")'), false);
  assert.equal(md.includes('color: red'), false);
  assert.equal(md.includes('# Main Heading'), true);
  assert.equal(md.includes('[MCP Docs](https://modelcontextprotocol.io)'), true);
  assert.equal(md.includes('- Step one'), true);
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
