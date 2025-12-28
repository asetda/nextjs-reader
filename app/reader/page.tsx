'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
          <div
            className="prose max-w-none"
            style={{
              fontFamily: 'Garamond, serif',
              fontSize: `${fontSize}px`,
              lineHeight: '1.8',
            }}
            dangerouslySetInnerHTML={{ __html: content.content }}
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
