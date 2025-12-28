import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Simple in-memory storage (in production, use a database)
const storage = new Map<string, { url: string; title: string; content: string; timestamp: number }>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
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
      
      <h2>The Benefits of Reading</h2>
      <p>Reading provides numerous cognitive benefits. It improves vocabulary, enhances focus, reduces stress, and expands knowledge. Whether you're reading fiction or non-fiction, the act of reading stimulates your brain and keeps it active.</p>
      
      <p>Studies have shown that regular reading can improve memory, analytical thinking, and even empathy. When we read stories, we experience different perspectives and emotions, which helps us understand others better.</p>
      
      <h2>Reader Mode Features</h2>
      <p>This reader mode is designed to provide a comfortable reading experience:</p>
      <ul>
        <li>Clean, distraction-free layout</li>
        <li>Garamond font family for elegant typography</li>
        <li>Adjustable font size for comfort</li>
        <li>Black text on white background for optimal contrast</li>
        <li>Automatic position saving to resume where you left off</li>
      </ul>
      
      <h2>How to Use</h2>
      <p>To use this reader, simply enter a URL on the home page. The system will fetch the content, extract the main article, and present it in this clean format. You can adjust the font size using the controls at the top of the page.</p>
      
      <p>Your reading position is automatically saved in your browser's local storage, so you can always pick up where you left off when you return to an article.</p>
      
      <h2>Typography and Design</h2>
      <p>The choice of Garamond as the primary font is intentional. This classic serif typeface is known for its readability and elegance, making it perfect for long-form reading. The generous line height and spacing ensure that your eyes can move smoothly through the text without strain.</p>
      
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

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    let title: string;
    let content: string;

    // Check if this is a demo URL
    if (url.toLowerCase().includes('demo') || url.includes('example.com')) {
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
