'use client';

import { Suspense, useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';

// Font configuration
const FONT_STACKS: { [key: string]: string } = {
  'Garamond': 'Garamond, serif',
  'Georgia': 'Georgia, serif',
  'Palatino': 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  'Iowan': 'Iowan Old Style, Palatino, "Palatino Linotype", "Book Antiqua", serif',
};

const AVAILABLE_FONTS = ['Garamond', 'Georgia', 'Palatino', 'Iowan'] as const;
const DEFAULT_FONT = 'Garamond';

function ReaderContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [content, setContent] = useState<{ url: string; title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const detailsRef = useRef<HTMLDetailsElement>(null);
  
  // Initialize font size from localStorage
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedFontSize = localStorage.getItem('reader-font-size');
      return savedFontSize ? parseInt(savedFontSize, 10) : 18;
    }
    return 18;
  });

  // Initialize font family from localStorage
  const [fontFamily, setFontFamily] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedFont = localStorage.getItem('reader-font-family');
      return savedFont || DEFAULT_FONT;
    }
    return DEFAULT_FONT;
  });

  useEffect(() => {
    if (!id) {
      return;
    }

    // Fetch the content
    fetch(`/api/fetch?id=${id}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Failed to load content');
        }
        return res.json();
      })
      .then((data) => {
        setContent(data);
        setLoading(false);

        // Restore scroll position
        const savedPosition = localStorage.getItem(`reader-position-${id}`);
        if (savedPosition) {
          setTimeout(() => {
            window.scrollTo(0, parseInt(savedPosition, 10));
          }, 100);
        }
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;

    // Save scroll position periodically
    const savePosition = () => {
      localStorage.setItem(`reader-position-${id}`, String(window.scrollY));
    };

    const handleScroll = () => {
      savePosition();
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      savePosition();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [id]);

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(12, Math.min(32, fontSize + delta));
    setFontSize(newSize);
    localStorage.setItem('reader-font-size', String(newSize));
  };

  const handleFontFamilyChange = (font: string) => {
    setFontFamily(font);
    localStorage.setItem('reader-font-family', font);
  };

  // Map font names to CSS font stacks
  const getFontStack = (font: string) => {
    return FONT_STACKS[font] || FONT_STACKS[DEFAULT_FONT];
  };

  // Process PRE blocks into chapters and extract chapter titles
  const { processedContent, chapters } = useMemo(() => {
    if (!content) return { processedContent: '', chapters: [] };
    
    const MAX_CHAPTER_TITLE_LENGTH = 50;
    const PARAGRAPH_BREAK_PLACEHOLDER = '\u0000PARAGRAPH_BREAK\u0000';
    const chapterList: { id: string; title: string }[] = [];
    let chapterIndex = 0;
    
    // Process <pre> blocks into chapters
    const htmlWithPreChapters = content.content.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (match, preContent) => {
      chapterIndex++;
      const chapterId = `chapter-${chapterIndex}`;
      
      // Extract first line as potential chapter title
      const firstLineMatch = preContent.trim().match(new RegExp(`^([^\n]{1,${MAX_CHAPTER_TITLE_LENGTH}})`));
      const chapterTitle = firstLineMatch ? firstLineMatch[1].trim() : `Chapter ${chapterIndex}`;
      
      chapterList.push({ id: chapterId, title: chapterTitle });
      
      // Process the content within the PRE block:
      // 1. Preserve paragraph breaks (double newlines or more)
      // 2. Convert single line breaks to spaces for text reflow
      const processedPre = preContent
        // First, normalize line endings
        .replace(/\r\n/g, '\n')
        // Mark paragraph breaks (double newlines) with a unique placeholder
        .replace(/\n\s*\n/g, PARAGRAPH_BREAK_PLACEHOLDER)
        // Replace single newlines with spaces for reflow
        .replace(/\n/g, ' ')
        // Replace multiple spaces with single space
        .replace(/  +/g, ' ')
        // Convert paragraph breaks back to HTML
        .replace(new RegExp(PARAGRAPH_BREAK_PLACEHOLDER, 'g'), '</p><br/><br/><p>');
      
      // Wrap in a chapter div with ID for navigation (use className for React)
      return `<div className="chapter" id="${chapterId}"><h2>${chapterTitle}</h2><p>${processedPre}</p></div>`;
    });
    
    // Process paragraphs for chapter detection (case-insensitive patterns)
    // Pattern matches: "Chapter N", "Part N", "Chapter N:", "Part N:", etc.
    const chapterPattern = /^(?:Chapter|Part)\s+\d+/i;
    
    const htmlContent = htmlWithPreChapters.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (match, pContent) => {
      // Extract text content for chapter pattern matching
      // SECURITY NOTE: This simple tag removal is intentionally used here because:
      // 1. The extracted textContent is ONLY used for regex pattern matching (never rendered)
      // 2. The actual pContent that gets rendered goes through DOMPurify sanitization
      // 3. This code is for content navigation, not content sanitization
      const textContent = pContent.replace(/<[^>]*>/g, '').trim();
      const chapterMatch = textContent.match(chapterPattern);
      
      if (chapterMatch) {
        chapterIndex++;
        const chapterId = `chapter-${chapterIndex}`;
        
        // Extract chapter title (up to MAX_CHAPTER_TITLE_LENGTH)
        const titleText = textContent.substring(0, MAX_CHAPTER_TITLE_LENGTH);
        const chapterTitle = titleText.length < textContent.length ? `${titleText}...` : titleText;
        
        chapterList.push({ id: chapterId, title: chapterTitle });
        
        // Wrap paragraph with chapter div and ID
        return `<div className="chapter" id="${chapterId}"><p>${pContent}</p></div>`;
      }
      
      // Return unchanged if not a chapter
      return match;
    });
    
    return { processedContent: htmlContent, chapters: chapterList };
  }, [content]);

  // Sanitize HTML content to prevent XSS attacks
  const sanitizedContent = useMemo(() => {
    if (!processedContent) return '';
    
    return DOMPurify.sanitize(processedContent, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'img', 'div', 'span'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
      ALLOW_DATA_ATTR: false,
    });
  }, [processedContent]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-xl text-black">Loading...</div>
      </div>
    );
  }

  if (error || !content || !id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error || !id ? 'No article ID provided' : 'Content not found'}</div>
          <Link href="/" className="text-black underline">
            Return to home
          </Link>
        </div>
      </div>
    );
  }

  const scrollToChapter = (chapterId: string) => {
    const element = document.getElementById(chapterId);
    if (element) {
      const headerOffset = 100; // Account for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      
      // Close the mobile chapter menu after clicking
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Fixed header with controls */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link href="/" className="text-black hover:text-gray-600">
              ← Back
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Font Size:</span>
              <button
                onClick={() => handleFontSizeChange(-2)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                aria-label="Decrease font size"
              >
                −
              </button>
              <span className="text-sm font-medium w-8 text-center">{fontSize}</span>
              <button
                onClick={() => handleFontSizeChange(2)}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded"
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-gray-600">Font:</span>
            {AVAILABLE_FONTS.map((font) => (
              <button
                key={font}
                onClick={() => handleFontFamilyChange(font)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  fontFamily === font
                    ? 'bg-black text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-black'
                }`}
                style={{ fontFamily: getFontStack(font) }}
              >
                {font}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chapter navigation sidebar (if chapters exist) */}
      {chapters.length > 0 && (
        <div className="fixed left-4 top-32 hidden lg:block">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 max-w-xs">
            <h3 className="text-sm font-bold mb-2 text-gray-700">Chapters</h3>
            <nav className="space-y-1 max-h-96 overflow-y-auto">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => scrollToChapter(chapter.id)}
                  className="block w-full text-left text-sm text-gray-600 hover:text-black hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                  title={chapter.title}
                >
                  {chapter.title.length > 30 ? `${chapter.title.substring(0, 30)}...` : chapter.title}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <article>
          <h1
            className="mb-4 font-bold leading-tight"
            style={{
              fontFamily: getFontStack(fontFamily),
              fontSize: `${fontSize * 2}px`,
            }}
          >
            {content.title}
          </h1>
          <div className="text-sm text-gray-500 mb-8">
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {content.url}
            </a>
          </div>
          
          {/* Mobile chapter navigation */}
          {chapters.length > 0 && (
            <details ref={detailsRef} className="lg:hidden mb-6 border-2 border-gray-300 rounded-lg shadow-sm bg-white">
              <summary className="cursor-pointer px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 rounded-lg transition-colors list-none flex items-center justify-between min-h-[44px]">
                <span className="text-base font-bold text-gray-800 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Chapters ({chapters.length})
                </span>
                <span className="text-gray-500 text-sm">Tap to expand</span>
              </summary>
              <nav className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => scrollToChapter(chapter.id)}
                    className="block w-full text-left text-sm text-gray-700 hover:text-black hover:bg-blue-50 active:bg-blue-100 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                  >
                    {chapter.title}
                  </button>
                ))}
              </nav>
            </details>
          )}
          
          <div
            className="prose max-w-none"
            style={{
              fontFamily: getFontStack(fontFamily),
              fontSize: `${fontSize}px`,
              lineHeight: '1.8',
            }}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </article>
      </main>
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-xl text-black">Loading...</div>
      </div>
    }>
      <ReaderContent />
    </Suspense>
  );
}
