// Shared in-memory storage for fetched page content
// In production, replace with a database

export interface StoredPage {
  url: string;
  title: string;
  content: string;
  timestamp: number;
}

export const storage = new Map<string, StoredPage>();

export const MAX_STORED_PAGES = 50;

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
