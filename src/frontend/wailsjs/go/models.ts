export namespace main {
	
	export class BookQueryInput {
	    keyword: string;
	    formats: string[];
	    tag_ids: number[];
	    sort: string;
	    desc: boolean;
	    misrecord: boolean;
	    limit: number;
	    offset: number;
	
	    static createFrom(source: any = {}) {
	        return new BookQueryInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keyword = source["keyword"];
	        this.formats = source["formats"];
	        this.tag_ids = source["tag_ids"];
	        this.sort = source["sort"];
	        this.desc = source["desc"];
	        this.misrecord = source["misrecord"];
	        this.limit = source["limit"];
	        this.offset = source["offset"];
	    }
	}

}

export namespace models {
	
	export class Tag {
	    id: number;
	    name: string;
	    color: string;
	    book_count: number;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Tag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.book_count = source["book_count"];
	        this.created_at = source["created_at"];
	    }
	}
	export class Book {
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
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.file_name = source["file_name"];
	        this.format = source["format"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.publisher = source["publisher"];
	        this.language = source["language"];
	        this.description = source["description"];
	        this.size = source["size"];
	        this.hash = source["hash"];
	        this.cover_path = source["cover_path"];
	        this.has_cover = source["has_cover"];
	        this.douban_url = source["douban_url"];
	        this.douban_rating = source["douban_rating"];
	        this.douban_rating_count = source["douban_rating_count"];
	        this.douban_authors = source["douban_authors"];
	        this.misrecord = source["misrecord"];
	        this.douban_fail_count = source["douban_fail_count"];
	        this.current_location = source["current_location"];
	        this.current_page = source["current_page"];
	        this.total_pages = source["total_pages"];
	        this.read_progress = source["read_progress"];
	        this.last_read_at = source["last_read_at"];
	        this.total_read_seconds = source["total_read_seconds"];
	        this.note_count = source["note_count"];
	        this.tags = this.convertValues(source["tags"], Tag);
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DoubanBook {
	    title: string;
	    url: string;
	    pic: string;
	    rating: number;
	    count: number;
	    author: string;
	    pub_info: string;
	
	    static createFrom(source: any = {}) {
	        return new DoubanBook(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.url = source["url"];
	        this.pic = source["pic"];
	        this.rating = source["rating"];
	        this.count = source["count"];
	        this.author = source["author"];
	        this.pub_info = source["pub_info"];
	    }
	}
	export class EpubFileInfo {
	    path: string;
	    name: string;
	    size: number;
	    title: string;
	    author: string;
	    language: string;
	    chapters: number;
	    chars: number;
	    has_cover: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EpubFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.language = source["language"];
	        this.chapters = source["chapters"];
	        this.chars = source["chars"];
	        this.has_cover = source["has_cover"];
	    }
	}
	export class EpubToPdfOptions {
	    book_id: number;
	    path: string;
	    out_dir: string;
	    file_name: string;
	    title: string;
	    author: string;
	    language: string;
	    page_size: string;
	    use_cover: boolean;
	    add_to_shelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EpubToPdfOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.book_id = source["book_id"];
	        this.path = source["path"];
	        this.out_dir = source["out_dir"];
	        this.file_name = source["file_name"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.language = source["language"];
	        this.page_size = source["page_size"];
	        this.use_cover = source["use_cover"];
	        this.add_to_shelf = source["add_to_shelf"];
	    }
	}
	export class EpubToPdfResult {
	    path: string;
	    file_name: string;
	    pages: number;
	    chars: number;
	    chapters: number;
	    bytes: number;
	    no_text: boolean;
	    added: boolean;
	    book_id: number;
	    shelf_error: string;
	
	    static createFrom(source: any = {}) {
	        return new EpubToPdfResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.file_name = source["file_name"];
	        this.pages = source["pages"];
	        this.chars = source["chars"];
	        this.chapters = source["chapters"];
	        this.bytes = source["bytes"];
	        this.no_text = source["no_text"];
	        this.added = source["added"];
	        this.book_id = source["book_id"];
	        this.shelf_error = source["shelf_error"];
	    }
	}
	export class Misrecord {
	    id: number;
	    path: string;
	    hash: string;
	    file_name: string;
	    reason: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Misrecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.hash = source["hash"];
	        this.file_name = source["file_name"];
	        this.reason = source["reason"];
	        this.created_at = source["created_at"];
	    }
	}
	export class Note {
	    id: number;
	    book_id: number;
	    content: string;
	    location: string;
	    chapter: string;
	    quote: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Note(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.book_id = source["book_id"];
	        this.content = source["content"];
	        this.location = source["location"];
	        this.chapter = source["chapter"];
	        this.quote = source["quote"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class PdfExtractInfo {
	    path: string;
	    name: string;
	    size: number;
	    pages: number;
	    encrypted: boolean;
	    needs_password: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfExtractInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.pages = source["pages"];
	        this.encrypted = source["encrypted"];
	        this.needs_password = source["needs_password"];
	        this.error = source["error"];
	    }
	}
	export class PdfExtractOptions {
	    path: string;
	    password: string;
	    pages: number[];
	    out_path: string;
	    add_to_shelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PdfExtractOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.password = source["password"];
	        this.pages = source["pages"];
	        this.out_path = source["out_path"];
	        this.add_to_shelf = source["add_to_shelf"];
	    }
	}
	export class PdfExtractResult {
	    path: string;
	    pages: number[];
	    bytes: number;
	    added: boolean;
	    book_id: number;
	    shelf_error: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfExtractResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.pages = source["pages"];
	        this.bytes = source["bytes"];
	        this.added = source["added"];
	        this.book_id = source["book_id"];
	        this.shelf_error = source["shelf_error"];
	    }
	}
	export class PdfFileInfo {
	    path: string;
	    name: string;
	    size: number;
	    pages: number;
	    title: string;
	    encrypted: boolean;
	    needs_password: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PdfFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.pages = source["pages"];
	        this.title = source["title"];
	        this.encrypted = source["encrypted"];
	        this.needs_password = source["needs_password"];
	    }
	}
	export class PdfMergeFile {
	    path: string;
	    name: string;
	    size: number;
	    pages: number;
	    encrypted: boolean;
	    needs_password: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfMergeFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	        this.pages = source["pages"];
	        this.encrypted = source["encrypted"];
	        this.needs_password = source["needs_password"];
	        this.error = source["error"];
	    }
	}
	export class PdfMergeOptions {
	    files: string[];
	    passwords: Record<string, string>;
	    out_path: string;
	    bookmarks: boolean;
	    add_to_shelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PdfMergeOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.passwords = source["passwords"];
	        this.out_path = source["out_path"];
	        this.bookmarks = source["bookmarks"];
	        this.add_to_shelf = source["add_to_shelf"];
	    }
	}
	export class PdfMergeResult {
	    path: string;
	    files: number;
	    pages: number;
	    bytes: number;
	    added: boolean;
	    book_id: number;
	    shelf_error: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfMergeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.files = source["files"];
	        this.pages = source["pages"];
	        this.bytes = source["bytes"];
	        this.added = source["added"];
	        this.book_id = source["book_id"];
	        this.shelf_error = source["shelf_error"];
	    }
	}
	export class PdfProtectOptions {
	    book_id: number;
	    path: string;
	    user_password: string;
	    owner_password: string;
	    current_password: string;
	    strength: string;
	    allow_print: boolean;
	    allow_copy: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PdfProtectOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.book_id = source["book_id"];
	        this.path = source["path"];
	        this.user_password = source["user_password"];
	        this.owner_password = source["owner_password"];
	        this.current_password = source["current_password"];
	        this.strength = source["strength"];
	        this.allow_print = source["allow_print"];
	        this.allow_copy = source["allow_copy"];
	    }
	}
	export class PdfToEpubOptions {
	    book_id: number;
	    path: string;
	    password: string;
	    out_dir: string;
	    file_name: string;
	    title: string;
	    author: string;
	    language: string;
	    use_cover: boolean;
	    add_to_shelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PdfToEpubOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.book_id = source["book_id"];
	        this.path = source["path"];
	        this.password = source["password"];
	        this.out_dir = source["out_dir"];
	        this.file_name = source["file_name"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.language = source["language"];
	        this.use_cover = source["use_cover"];
	        this.add_to_shelf = source["add_to_shelf"];
	    }
	}
	export class PdfToEpubResult {
	    path: string;
	    file_name: string;
	    pages: number;
	    chars: number;
	    bytes: number;
	    needs_password: boolean;
	    no_text: boolean;
	    dropped: number;
	    added: boolean;
	    book_id: number;
	    shelf_error: string;
	
	    static createFrom(source: any = {}) {
	        return new PdfToEpubResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.file_name = source["file_name"];
	        this.pages = source["pages"];
	        this.chars = source["chars"];
	        this.bytes = source["bytes"];
	        this.needs_password = source["needs_password"];
	        this.no_text = source["no_text"];
	        this.dropped = source["dropped"];
	        this.added = source["added"];
	        this.book_id = source["book_id"];
	        this.shelf_error = source["shelf_error"];
	    }
	}
	export class ReadingSession {
	    id: number;
	    book_id: number;
	    start_time: string;
	    end_time: string;
	    seconds: number;
	    pages_read: number;
	    book_title: string;
	    book_format: string;
	
	    static createFrom(source: any = {}) {
	        return new ReadingSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.book_id = source["book_id"];
	        this.start_time = source["start_time"];
	        this.end_time = source["end_time"];
	        this.seconds = source["seconds"];
	        this.pages_read = source["pages_read"];
	        this.book_title = source["book_title"];
	        this.book_format = source["book_format"];
	    }
	}
	export class Stats {
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
	
	    static createFrom(source: any = {}) {
	        return new Stats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total_books = source["total_books"];
	        this.total_size = source["total_size"];
	        this.total_read_seconds = source["total_read_seconds"];
	        this.total_notes = source["total_notes"];
	        this.total_tags = source["total_tags"];
	        this.total_misrecords = source["total_misrecords"];
	        this.reading_books = source["reading_books"];
	        this.finished_books = source["finished_books"];
	        this.unread_books = source["unread_books"];
	        this.format_counts = source["format_counts"];
	    }
	}

}

