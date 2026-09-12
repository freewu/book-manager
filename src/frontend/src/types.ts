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

/** EPUB 文件信息（转存 PDF 工具的表头） */
export interface EpubFileInfo {
  path: string;
  name: string;
  size: number;
  title: string;
  author: string;
  language: string;
  chapters: number;
  chars: number;
  has_cover: boolean;
}

export interface EpubToPdfOptions {
  /** >0 表示书架中的书（用书上的路径，path 被忽略），否则传 0 */
  book_id: number;
  path: string;
  /** 保存目录（留空 = EPUB 所在目录） */
  out_dir: string;
  /** 输出文件名（不含扩展名，留空 = 用书名 / 原文件名） */
  file_name: string;
  title: string;
  author: string;
  language: string;
  /** 纸张：A4 / A5 / B5 / 16K / LETTER，留空按 A4 */
  page_size: string;
  /** 用 EPUB 封面生成封面页 */
  use_cover: boolean;
  /** 转换成功后自动入库 */
  add_to_shelf: boolean;
}

export interface EpubToPdfResult {
  /** 源 EPUB 路径 */
  path: string;
  /** 生成的 PDF 文件名（成功时） */
  file_name: string;
  pages: number;
  chars: number;
  chapters: number;
  bytes: number;
  /** EPUB 里没有可排版的正文 */
  no_text: boolean;
  added: boolean;
  book_id: number;
  shelf_error: string;
}

/** epub2pdf:progress 事件 */
export interface EpubToPdfProgress {
  current: number;
  total: number;
  chars: number;
}

/** 合并 PDF 工具里的一个输入文件 */
export interface PdfMergeFile {
  path: string;
  name: string;
  size: number;
  pages: number;
  /** 文件带打开密码 */
  encrypted: boolean;
  /** 需要用户先填打开密码 */
  needs_password: boolean;
  /** 这个文件本身的问题（不是 PDF、读不出来…），空串表示没问题 */
  error: string;
}

export interface PdfMergeOptions {
  /** 按数组顺序合并 */
  files: string[];
  /** 文件路径 → 打开密码（只有加密文件需要） */
  passwords: Record<string, string>;
  /** 合并后的文件（含文件名的完整路径） */
  out_path: string;
  /** 按文件名生成一份顶层书签目录 */
  bookmarks: boolean;
  /** 合并成功后自动入库 */
  add_to_shelf: boolean;
}

export interface PdfMergeResult {
  path: string;
  /** 参与合并的文件数 */
  files: number;
  /** 合并后的总页数 */
  pages: number;
  bytes: number;
  added: boolean;
  book_id: number;
  shelf_error: string;
}

/** pdfmerge:progress 事件；phase = prepare（逐个检查/解密）| merge（开始合并） */
export interface PdfMergeProgress {
  current: number;
  total: number;
  name: string;
  phase: string;
}
