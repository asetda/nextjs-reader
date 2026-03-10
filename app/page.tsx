'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface StoredPage {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentPages, setRecentPages] = useState<StoredPage[]>([]);
  const router = useRouter();

  const loadRecentPages = useCallback(async () => {
    try {
      const response = await fetch('/api/fetch');
      if (response.ok) {
        const data = await response.json();
        setRecentPages(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore errors loading recent pages
    }
  }, []);

  // Load recent pages from server on mount
  useEffect(() => {
    loadRecentPages();
  }, [loadRecentPages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch the URL');
      }

      const data = await response.json();

      await loadRecentPages();
      router.push(`/reader?id=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleRecentPageClick = (page: StoredPage) => {
    router.push(`/reader?id=${page.id}`);
  };

  const handleDeletePage = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/fetch?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRecentPages(prev => prev.filter(p => p.id !== id));
      }
    } catch {
      // Ignore delete errors
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <main className="w-full max-w-2xl px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold mb-4 text-black" style={{ fontFamily: 'Garamond, serif' }}>
            Web Reader
          </h1>
          <p className="text-lg text-gray-700">
            Enter a URL to read in a clean, distraction-free format
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              required
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black text-black"
            />
          </div>

          {recentPages.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Pages</h3>
              <div className="space-y-2">
                {recentPages.map((page) => (
                  <div key={page.id} className="flex items-center group">
                    <button
                      type="button"
                      onClick={() => handleRecentPageClick(page)}
                      className="flex-1 text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors truncate"
                      title={page.url}
                    >
                      {page.title}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeletePage(e, page.id)}
                      className="ml-1 px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title="Delete"
                      aria-label={`Delete "${page.title}"`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Fetching...' : 'Read Article'}
          </button>
        </form>
      </main>
    </div>
  );
}
