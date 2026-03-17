import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { storage, MAX_STORED_PAGES, generateId } from '@/app/lib/storage';

// SSRF protection: Check if URL points to private/internal IP ranges
function isPrivateIP(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const [, a, b] = match.map(Number);

    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
  }

  return false;
}

function validateURL(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    if (isPrivateIP(parsed.hostname)) {
      return { valid: false, error: 'Access to private/internal IPs is not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

function extractMainContent(html: string): { title: string; content: string } {
  const $ = cheerio.load(html);

  $('script, style, nav, header, footer, aside, iframe, .ad, .advertisement, .social-share').remove();

  const title = $('title').text() || $('h1').first().text() || 'Untitled';

  let content = '';

  const articleSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '#content',
    '.content',
  ];

  for (const selector of articleSelectors) {
    const element = $(selector);
    if (element.length > 0 && element.text().trim().length > 100) {
      content = element.html() || '';
      break;
    }
  }

  if (!content) {
    content = $('body').html() || '';
  }

  const $content = cheerio.load(content);
  $content('script, style, nav, header, footer, aside, iframe, .ad, .advertisement').remove();

  return {
    title,
    content: $content.html() || '',
  };
}

/**
 * Public GET endpoint — no authentication required.
 *
 * Usage:
 *   GET /api/open?url=https://example.com/article
 *     → fetches the URL, stores the content, redirects to /view?id=<id>
 *
 *   GET /api/open?id=<id>
 *     → returns stored content as JSON (used by the /view page)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const id = searchParams.get('id');

  // ── Serve stored content by ID (called by the /view page) ──────────────────
  if (id) {
    const data = storage.get(id);
    if (!data) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  // ── Fetch a URL and redirect to the reader ──────────────────────────────────
  if (!url) {
    return NextResponse.json(
      { error: "A 'url' query parameter is required" },
      { status: 400 }
    );
  }

  const validation = validateURL(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  let title: string;
  let content: string;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Reader/1.0)' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const extracted = extractMainContent(html);
    title = extracted.title;
    content = extracted.content;
  } catch (error) {
    console.error('Error fetching URL in /api/open:', error);
    return NextResponse.json(
      { error: 'Failed to fetch the requested URL' },
      { status: 502 }
    );
  }

  // Remove any existing entry for this URL
  for (const [existingId, existingData] of storage.entries()) {
    if (existingData.url === url) {
      storage.delete(existingId);
      break;
    }
  }

  const newId = generateId();
  storage.set(newId, { url, title, content, timestamp: Date.now() });

  // Evict oldest entries if over the limit
  if (storage.size > MAX_STORED_PAGES) {
    const sorted = Array.from(storage.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = storage.size - MAX_STORED_PAGES;
    for (let i = 0; i < toRemove; i++) {
      storage.delete(sorted[i][0]);
    }
  }

  // Redirect to the public reader page
  const viewUrl = new URL('/view', request.url);
  viewUrl.searchParams.set('id', newId);
  return NextResponse.redirect(viewUrl);
}
