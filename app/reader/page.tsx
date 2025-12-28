'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DOMPurify from 'isomorphic-dompurify';

function ReaderContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [content, setContent] = useState<{ url: string; title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Initialize font size from localStorage
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedFontSize = localStorage.getItem('reader-font-size');
      return savedFontSize ? parseInt(savedFontSize, 10) : 18;
    }
    return 18;
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

  // Process PRE blocks into chapters and extract chapter titles
  const { processedContent, chapters } = useMemo(() => {
    if (!content) return { processedContent: '', chapters: [] };
    
    const chapterList: { id: string; title: string }[] = [];
    let chapterIndex = 0;
    
    // Process <pre> blocks into chapters
    const htmlContent = content.content.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (match, preContent) => {
      chapterIndex++;
      const chapterId = `chapter-${chapterIndex}`;
      
      // Extract first line as potential chapter title (first 50 chars or until newline)
      const firstLineMatch = preContent.trim().match(/^([^\n]{1,50})/);
      const chapterTitle = firstLineMatch ? firstLineMatch[1].trim() : `Chapter ${chapterIndex}`;
      
      chapterList.push({ id: chapterId, title: chapterTitle });
      
      // Process the content within the PRE block:
      // 1. Preserve paragraph breaks (double newlines or more)
      // 2. Convert single line breaks to spaces for text reflow
      const processedPre = preContent
        // First, normalize line endings
        .replace(/\r\n/g, '\n')
        // Mark paragraph breaks (double newlines) with a placeholder
        .replace(/\n\s*\n/g, '<!PARAGRAPH_BREAK!>')
        // Replace single newlines with spaces for reflow
        .replace(/\n/g, ' ')
        // Replace multiple spaces with single space
        .replace(/  +/g, ' ')
        // Convert paragraph breaks back to HTML
        .replace(/<!PARAGRAPH_BREAK!>/g, '</p><p>');
      
      // Wrap in a chapter div with ID for navigation
      return `<div class="chapter" id="${chapterId}"><h2>${chapterTitle}</h2><p>${processedPre}</p></div>`;
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
    }
  };

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Fixed header with controls */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
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
              fontFamily: 'Garamond, serif',
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
            <details className="lg:hidden mb-6 border border-gray-200 rounded-lg">
              <summary className="cursor-pointer px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg">
                <span className="text-sm font-bold text-gray-700">Chapters ({chapters.length})</span>
              </summary>
              <nav className="p-4 space-y-1">
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => scrollToChapter(chapter.id)}
                    className="block w-full text-left text-sm text-gray-600 hover:text-black hover:bg-gray-50 px-2 py-1 rounded transition-colors"
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
              fontFamily: 'Garamond, serif',
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
