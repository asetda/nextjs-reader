'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const RECENT_URLS_KEY = 'reader-recent-urls';
const MAX_RECENT_URLS = 10;

// Helper function to get stored URLs from localStorage
const getStoredUrls = (): string[] => {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem(RECENT_URLS_KEY);
  if (!stored) return [];
  
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Ignore invalid JSON
    return [];
  }
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const router = useRouter();

  // Load recent URLs from localStorage on mount
  useEffect(() => {
    setRecentUrls(getStoredUrls());
  }, []);

  const saveRecentUrl = (url: string) => {
    if (typeof window !== 'undefined') {
      let urls = getStoredUrls();

      // Remove the URL if it already exists (to move it to the front)
      urls = urls.filter(u => u !== url);
      
      // Add the new URL to the front
      urls.unshift(url);
      
      // Keep only the last 10 URLs
      urls = urls.slice(0, MAX_RECENT_URLS);
      
      localStorage.setItem(RECENT_URLS_KEY, JSON.stringify(urls));
      setRecentUrls(urls);
    }
  };

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
      
      // Save URL to recent URLs
      saveRecentUrl(url);
      
      router.push(`/reader?id=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleRecentUrlClick = (recentUrl: string) => {
    setUrl(recentUrl);
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

          {recentUrls.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Recent URLs</h3>
              <div className="space-y-2">
                {recentUrls.map((recentUrl) => (
                  <button
                    key={recentUrl}
                    type="button"
                    onClick={() => handleRecentUrlClick(recentUrl)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors truncate"
                    title={recentUrl}
                  >
                    {recentUrl}
                  </button>
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
