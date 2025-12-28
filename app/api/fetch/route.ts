import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Simple in-memory storage (in production, use a database)
const storage = new Map<string, { url: string; title: string; content: string; timestamp: number }>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// SSRF protection: Check if URL points to private/internal IP ranges
function isPrivateIP(hostname: string): boolean {
  // Check for localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  
  // Check for private IP ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  
  if (match) {
    const [, a, b] = match.map(Number);
    
    // 10.0.0.0/8
    if (a === 10) return true;
    
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
  }
  
  return false;
}

function validateURL(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP and HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }
    
    // Check for private IPs
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

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, iframe, .ad, .advertisement, .social-share').remove();

  // Try to find the title
  const title = $('title').text() || $('h1').first().text() || 'Untitled';

  // Try to find the main content
  let content = '';
  
  // Look for common article containers
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

  // Fallback to body if no main content found
  if (!content) {
    content = $('body').html() || '';
  }

  // Clean up the content
  const $content = cheerio.load(content);
  $content('script, style, nav, header, footer, aside, iframe, .ad, .advertisement').remove();
  
  return {
    title,
    content: $content.html() || '',
  };
}

function getDemoContent(): { title: string; content: string } {
  return {
    title: 'Demo Article: The Art of Reading',
    content: `
      <h2>Introduction</h2>
      <p>Reading is one of humanity's most powerful tools for learning and growth. This demo article showcases the reader functionality with a clean, distraction-free interface.</p>
      
      <pre>
Chapter One: The Beginning
This is the first chapter of our story.
It has multiple lines
that should be reflowed into a single paragraph.

But when there's an empty line like above,
it should create a new paragraph.

This is the third paragraph in chapter one.
More text here that flows together
on multiple lines.
      </pre>
      
      <h2>The Benefits of Reading</h2>
      <p>Reading provides numerous cognitive benefits. It improves vocabulary, enhances focus, reduces stress, and expands knowledge. Whether you're reading fiction or non-fiction, the act of reading stimulates your brain and keeps it active.</p>
      
      <pre>
Chapter Two: The Middle
Chapter two begins here.
This is also a multi-line chapter
that needs text reflow.

Another paragraph in chapter two
with text that flows
across multiple lines
smoothly.
      </pre>
      
      <p>Studies have shown that regular reading can improve memory, analytical thinking, and even empathy. When we read stories, we experience different perspectives and emotions, which helps us understand others better.</p>
      
      <h2>Reader Mode Features</h2>
      <p>This reader mode is designed to provide a comfortable reading experience:</p>
      <ul>
        <li>Clean, distraction-free layout</li>
        <li>Garamond font family for elegant typography</li>
        <li>Adjustable font size for comfort</li>
        <li>Black text on white background for optimal contrast</li>
        <li>Automatic position saving to resume where you left off</li>
        <li>Chapter navigation for PRE-formatted content</li>
      </ul>
      
      <pre>
Chapter Three: The End
The final chapter.
Short and sweet.

With a second paragraph
that also has some
multi-line text.

And a third paragraph to demonstrate
the paragraph preservation feature
working correctly.
      </pre>
      
      <h2>How to Use</h2>
      <p>To use this reader, simply enter a URL on the home page. The system will fetch the content, extract the main article, and present it in this clean format. You can adjust the font size using the controls at the top of the page.</p>
      
      <p>Your reading position is automatically saved in your browser's local storage, so you can always pick up where you left off when you return to an article.</p>
      
      <h2>Conclusion</h2>
      <p>We hope you enjoy this clean reading experience. Whether you're reading articles, blog posts, or long-form content, this reader mode is designed to make your reading sessions more pleasant and focused.</p>
      
      <p>Happy reading!</p>
    `,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL and check for SSRF
    const validation = validateURL(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    let title: string;
    let content: string;

    // Check if this is a demo URL
    const parsedUrl = new URL(url);
    if (url.toLowerCase().includes('demo') || parsedUrl.hostname === 'example.com' || parsedUrl.hostname.endsWith('.example.com')) {
      const demo = getDemoContent();
      title = demo.title;
      content = demo.content;
    } else {
      try {
        // Fetch the URL
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Reader/1.0)',
          },
        });

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
        // If fetch fails, use demo content as fallback
        console.log('Fetch failed, using demo content:', error);
        const demo = getDemoContent();
        title = demo.title + ' (Demo - Fetch Failed)';
        content = demo.content;
      }
    }

    // Store the content
    const id = generateId();
    storage.set(id, {
      url,
      title,
      content,
      timestamp: Date.now(),
    });

    return NextResponse.json({ id, title });
  } catch (error) {
    console.error('Error fetching URL:', error);
    return NextResponse.json(
      { error: 'Failed to fetch and parse URL' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  const data = storage.get(id);

  if (!data) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
