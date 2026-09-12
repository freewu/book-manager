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
  douban_fail_count: number;
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

export interface DoubanProgress {
  current: number;
  total: number;
  title: string;
  status: string;
  message: string;
  finished: boolean;
  ok: number;
  errors: number;
  skipped: number;
}

/** PDF 设置密码工具（tools/pdf-password）。 */
export interface PdfFileInfo {
  path: string;
  name: string;
  size: number;
  pages: number;
  title: string;
  encrypted: boolean;
  /** 已加密且当前密码不对（或未提供）：需要用户先输入当前密码 */
  needs_password: boolean;
}

export interface PdfProtectOptions {
  /** >0 表示书架中的书（用书上的路径，path 被忽略），否则传 0 */
  book_id: number;
  path: string;
  user_password: string;
  owner_password: string;
  current_password: string;
  /** aes256（默认）/ aes128 / rc4128 */
  strength: string;
  allow_print: boolean;
  allow_copy: boolean;
}

/** PDF 转存 EPUB 工具（tools/pdf-epub）。 */
export interface PdfToEpubOptions {
  /** >0 表示书架中的书（用书上的路径，path 被忽略），否则传 0 */
  book_id: number;
  path: string;
  /** 已加密 PDF 的打开密码 */
  password: string;
  /** 保存目录（留空 = PDF 所在目录） */
  out_dir: string;
  /** 输出文件名（不含扩展名，留空 = 用书名 / 原文件名） */
  file_name: string;
  title: string;
  author: string;
  /** EPUB 语言代码，留空按 zh 处理 */
  language: string;
  /** 把 PDF 内嵌封面作为 EPUB 封面 */
  use_cover: boolean;
  /** 转换成功后自动入库 */
  add_to_shelf: boolean;
}

export interface PdfToEpubResult {
  /** 源 PDF 路径（需要密码 / 无文字层时用它提示） */
  path: string;
  /** 生成的 EPUB 路径（成功时） */
  file_name: string;
  pages: number;
  chars: number;
  bytes: number;
  /** 已加密且密码不对：需要用户输入密码 */
  needs_password: boolean;
  /** 扫描版 PDF，没有可提取的文字 */
  no_text: boolean;
  /** 被当作页眉页脚丢弃的行数 */
  dropped: number;
  added: boolean;
  book_id: number;
  shelf_error: string;
}

/** pdf2epub:progress 事件 */
export interface PdfToEpubProgress {
  current: number;
  total: number;
  chars: number;
}
