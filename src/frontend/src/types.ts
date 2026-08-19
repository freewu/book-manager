// Type definitions mirroring the Go models.

export interface Tag {
  id: number;
  name: string;
  color: string;
  book_count: number;
  created_at: string;
}

export interface Book {
  id: number;
  path: string;
  file_name: string;
  format: string;
  title: string;
  author: string;
  publisher: string;
  language: string;
  description: string;
  size: number;
  hash: string;
  cover_path: string;
  has_cover: boolean;
  douban_url: string;
  douban_rating: number;
  douban_rating_count: number;
  douban_authors: string;
  misrecord: boolean;
  current_location: string;
  current_page: number;
  total_pages: number;
  read_progress: number;
  last_read_at: string;
  total_read_seconds: number;
  note_count: number;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  book_id: number;
  content: string;
  location: string;
  chapter: string;
  quote: string;
  created_at: string;
  updated_at: string;
}

export interface Misrecord {
  id: number;
  path: string;
  hash: string;
  file_name: string;
  reason: string;
  created_at: string;
}

export interface ReadingSession {
  id: number;
  book_id: number;
  start_time: string;
  end_time: string;
  seconds: number;
  pages_read: number;
  book_title: string;
  book_format: string;
}

export interface DoubanBook {
  title: string;
  url: string;
  pic: string;
  rating: number;
  count: number;
  author: string;
  pub_info: string;
}

export interface BookQueryInput {
  keyword: string;
  formats: string[];
  tag_ids: number[];
  sort: string;
  desc: boolean;
  misrecord: boolean;
  limit: number;
  offset: number;
}

export interface Stats {
  total_books: number;
  total_size: number;
  total_read_seconds: number;
  total_notes: number;
  total_tags: number;
  total_misrecords: number;
  reading_books: number;
  finished_books: number;
  unread_books: number;
  format_counts: Record<string, number>;
}

export type Settings = Record<string, string>;

export interface ScanProgress {
  current: number;
  total: number;
  file: string;
  status: string;
  message: string;
  finished: boolean;
  added: number;
  skipped: number;
  errors: number;
  total_new: number;
}
