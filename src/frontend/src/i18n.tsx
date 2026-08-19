// Lightweight i18n: dictionary + React context.
// Keys are dot-namespaced; {var} placeholders are interpolated via t().

import React, {createContext, useContext, useMemo} from 'react';

export type Lang = 'zh-CN' | 'zh-TW' | 'en';

export const LANGS: {key: Lang; labelKey: string}[] = [
  {key: 'zh-CN', labelKey: 'lang.zh-CN'},
  {key: 'zh-TW', labelKey: 'lang.zh-TW'},
  {key: 'en', labelKey: 'lang.en'},
];

export function normalizeLang(v: string | undefined): Lang {
  if (v === 'zh-TW' || v === 'en') return v;
  return 'zh-CN';
}

type Dict = Record<string, Record<Lang, string>>;

const DICT: Dict = {
  // ---- sidebar / nav ----
  'nav.bookshelf': {'zh-CN': '书架', 'zh-TW': '書架', 'en': 'Bookshelf'},
  'nav.reading': {'zh-CN': '阅读', 'zh-TW': '閱讀', 'en': 'Reading'},
  'nav.stats': {'zh-CN': '统计', 'zh-TW': '統計', 'en': 'Stats'},
  'nav.settings': {'zh-CN': '设置', 'zh-TW': '設定', 'en': 'Settings'},
  'sidebar.subtitle': {'zh-CN': '本地电子书管理', 'zh-TW': '本地電子書管理', 'en': 'Local e-book manager'},
  'sidebar.collapse': {'zh-CN': '收起侧栏', 'zh-TW': '收起側欄', 'en': 'Collapse sidebar'},
  'sidebar.expand': {'zh-CN': '展开侧栏', 'zh-TW': '展開側欄', 'en': 'Expand sidebar'},

  // ---- bookshelf ----
  'bookshelf.title': {'zh-CN': '书架', 'zh-TW': '書架', 'en': 'Bookshelf'},
  'bookshelf.count': {'zh-CN': '共 {n} 本', 'zh-TW': '共 {n} 本', 'en': '{n} books'},
  'bookshelf.total': {'zh-CN': ' / {n} 本藏书', 'zh-TW': ' / {n} 本藏書', 'en': ' / {n} in library'},
  'bookshelf.searchPlaceholder': {'zh-CN': '搜索书名 / 作者 / 出版社...', 'zh-TW': '搜尋書名 / 作者 / 出版社...', 'en': 'Search title / author / publisher...'},
  'sort.created': {'zh-CN': '入库时间', 'zh-TW': '入庫時間', 'en': 'Added date'},
  'sort.title': {'zh-CN': '书名', 'zh-TW': '書名', 'en': 'Title'},
  'sort.author': {'zh-CN': '作者', 'zh-TW': '作者', 'en': 'Author'},
  'sort.rating': {'zh-CN': '豆瓣评分', 'zh-TW': '豆瓣評分', 'en': 'Douban rating'},
  'sort.last_read': {'zh-CN': '最近阅读', 'zh-TW': '最近閱讀', 'en': 'Recently read'},
  'sort.size': {'zh-CN': '文件大小', 'zh-TW': '檔案大小', 'en': 'File size'},
  'sort.desc': {'zh-CN': '降序', 'zh-TW': '降序', 'en': 'Descending'},
  'sort.asc': {'zh-CN': '升序', 'zh-TW': '升序', 'en': 'Ascending'},
  'sort.descShort': {'zh-CN': '↓ 降序', 'zh-TW': '↓ 降序', 'en': '↓ Desc'},
  'sort.ascShort': {'zh-CN': '↑ 升序', 'zh-TW': '↑ 升序', 'en': '↑ Asc'},
  'tag.manage': {'zh-CN': '🏷️ 标签管理', 'zh-TW': '🏷️ 標籤管理', 'en': '🏷️ Tags'},
  'btn.refresh': {'zh-CN': '↻ 刷新', 'zh-TW': '↻ 重新整理', 'en': '↻ Refresh'},
  'btn.scan': {'zh-CN': '🔍 扫描', 'zh-TW': '🔍 掃描', 'en': '🔍 Scan'},
  'filter.format': {'zh-CN': '格式', 'zh-TW': '格式', 'en': 'Format'},
  'filter.tag': {'zh-CN': '标签', 'zh-TW': '標籤', 'en': 'Tag'},
  'filter.noTags': {'zh-CN': '暂无标签，在书本详情中添加', 'zh-TW': '暫無標籤，在書籍詳情中新增', 'en': 'No tags yet — add them in book details'},
  'filter.clear': {'zh-CN': '✕ 清除筛选', 'zh-TW': '✕ 清除篩選', 'en': '✕ Clear filters'},
  'loading': {'zh-CN': '正在加载...', 'zh-TW': '正在載入...', 'en': 'Loading...'},
  'empty.noMatch': {'zh-CN': '没有符合条件的书籍', 'zh-TW': '沒有符合條件的書籍', 'en': 'No books match your filters'},
  'empty.shelf': {'zh-CN': '书架空空如也', 'zh-TW': '書架空空如也', 'en': 'Your bookshelf is empty'},
  'empty.intro': {
    'zh-CN': '扫描你电脑中的电子书目录（支持 EPUB、PDF、MOBI、AZW3、KEPUB 等格式），书籍信息会自动保存到本地数据库，并可从豆瓣获取封面与评分。',
    'zh-TW': '掃描你電腦中的電子書目錄（支援 EPUB、PDF、MOBI、AZW3、KEPUB 等格式），書籍資訊會自動儲存到本機資料庫，並可從豆瓣取得封面與評分。',
    'en': 'Scan your e-book folders (EPUB, PDF, MOBI, AZW3, KEPUB, ...). Book info is stored locally, and covers/ratings can be fetched from Douban.',
  },
  'empty.startScan': {'zh-CN': '🔍 开始扫描', 'zh-TW': '🔍 開始掃描', 'en': '🔍 Start scanning'},
  'book.done': {'zh-CN': '✅ 已读完', 'zh-TW': '✅ 已讀完', 'en': '✅ Finished'},
  'book.detailTip': {'zh-CN': '详情 / 豆瓣 / 笔记', 'zh-TW': '詳情 / 豆瓣 / 筆記', 'en': 'Details / Douban / Notes'},

  // ---- reading page ----
  'reading.title': {'zh-CN': '阅读', 'zh-TW': '閱讀', 'en': 'Reading'},
  'reading.summary': {'zh-CN': '在读 {a} 本 · 已读完 {b} 本', 'zh-TW': '在讀 {a} 本 · 已讀完 {b} 本', 'en': '{a} reading · {b} finished'},
  'reading.empty': {'zh-CN': '还没有阅读记录', 'zh-TW': '還沒有閱讀記錄', 'en': 'No reading history yet'},
  'reading.emptyHint': {'zh-CN': '打开书架中的任意一本书，阅读进度会自动记录到这里。', 'zh-TW': '打開書架中的任意一本書，閱讀進度會自動記錄到這裡。', 'en': 'Open any book on your bookshelf; progress is recorded here automatically.'},
  'reading.inProgress': {'zh-CN': '在读', 'zh-TW': '在讀', 'en': 'Reading'},
  'reading.finished': {'zh-CN': '已读完', 'zh-TW': '已讀完', 'en': 'Finished'},
  'reading.lastRead': {'zh-CN': '上次阅读 {t}', 'zh-TW': '上次閱讀 {t}', 'en': 'Last read {t}'},
  'reading.readAgain': {'zh-CN': '再看一遍', 'zh-TW': '再看一遍', 'en': 'Read again'},
  'reading.continue': {'zh-CN': '继续阅读', 'zh-TW': '繼續閱讀', 'en': 'Continue reading'},

  // ---- stats page ----
  'stats.title': {'zh-CN': '统计', 'zh-TW': '統計', 'en': 'Stats'},
  'stats.misrecords': {'zh-CN': '🚫 误录管理', 'zh-TW': '🚫 誤錄管理', 'en': '🚫 Misrecords'},
  'stats.totalBooks': {'zh-CN': '藏书', 'zh-TW': '藏書', 'en': 'Books'},
  'stats.totalSize': {'zh-CN': '总大小', 'zh-TW': '總大小', 'en': 'Total size'},
  'stats.totalTime': {'zh-CN': '累计阅读', 'zh-TW': '累計閱讀', 'en': 'Reading time'},
  'stats.notes': {'zh-CN': '笔记', 'zh-TW': '筆記', 'en': 'Notes'},
  'stats.reading': {'zh-CN': '在读', 'zh-TW': '在讀', 'en': 'Reading'},
  'stats.finished': {'zh-CN': '已读完', 'zh-TW': '已讀完', 'en': 'Finished'},
  'stats.unread': {'zh-CN': '未读', 'zh-TW': '未讀', 'en': 'Unread'},
  'stats.misrecord': {'zh-CN': '误录', 'zh-TW': '誤錄', 'en': 'Misrecords'},
  'stats.formats': {'zh-CN': '格式分布', 'zh-TW': '格式分佈', 'en': 'Format distribution'},
  'stats.noData': {'zh-CN': '暂无数据', 'zh-TW': '暫無數據', 'en': 'No data'},
  'stats.count': {'zh-CN': '{n} 本', 'zh-TW': '{n} 本', 'en': '{n}'},
  'stats.recent': {'zh-CN': '最近阅读', 'zh-TW': '最近閱讀', 'en': 'Recently read'},
  'stats.sessions': {'zh-CN': '阅读记录', 'zh-TW': '閱讀紀錄', 'en': 'Reading sessions'},

  // ---- settings page ----
  'settings.title': {'zh-CN': '设置', 'zh-TW': '設定', 'en': 'Settings'},
  'settings.appearance': {'zh-CN': '外观', 'zh-TW': '外觀', 'en': 'Appearance'},
  'settings.uiTheme': {'zh-CN': '系统样式', 'zh-TW': '系統樣式', 'en': 'Interface theme'},
  'theme.light': {'zh-CN': '浅色', 'zh-TW': '淺色', 'en': 'Light'},
  'theme.dark': {'zh-CN': '深色', 'zh-TW': '深色', 'en': 'Dark'},
  'theme.system': {'zh-CN': '跟随系统', 'zh-TW': '跟隨系統', 'en': 'Follow system'},
  'theme.lightHint': {'zh-CN': '始终使用浅色界面', 'zh-TW': '始終使用淺色介面', 'en': 'Always light'},
  'theme.darkHint': {'zh-CN': '始终使用深色界面', 'zh-TW': '始終使用深色介面', 'en': 'Always dark'},
  'theme.systemHint': {'zh-CN': '随 Windows 外观自动切换', 'zh-TW': '隨 Windows 外觀自動切換', 'en': 'Match Windows appearance'},
  'settings.uiThemeHint': {
    'zh-CN': '设置整个应用（窗口、书架、统计等）的明暗外观，默认跟随系统。',
    'zh-TW': '設定整個應用（視窗、書架、統計等）的明暗外觀，預設跟隨系統。',
    'en': 'Controls the light/dark look of the whole app (window, shelf, stats...). Defaults to system.',
  },
  'settings.readerTheme': {'zh-CN': '阅读器主题', 'zh-TW': '閱讀器主題', 'en': 'Reader theme'},
  'theme.sepia': {'zh-CN': '羊皮纸', 'zh-TW': '羊皮紙', 'en': 'Sepia'},
  'settings.readerThemeHint': {
    'zh-CN': '阅读器正文区域的显示主题（与系统样式相互独立）。',
    'zh-TW': '閱讀器正文區域的顯示主題（與系統樣式相互獨立）。',
    'en': 'The reader content theme (independent of the interface theme).',
  },
  'settings.readingScan': {'zh-CN': '阅读与扫描', 'zh-TW': '閱讀與掃描', 'en': 'Reading & scanning'},
  'settings.idleLimit': {'zh-CN': '阅读计时闲置上限（秒）', 'zh-TW': '閱讀計時閒置上限（秒）', 'en': 'Reading idle limit (seconds)'},
  'settings.idleHint': {
    'zh-CN': '阅读时长时间不翻页只累计该秒数，之后暂停计时，直到再次翻页。默认 60 秒。',
    'zh-TW': '閱讀時長時間不翻頁只累計該秒數，之後暫停計時，直到再次翻頁。預設 60 秒。',
    'en': 'Reading time stops counting after this many seconds without a page turn; any interaction resumes it. Default 60.',
  },
  'settings.scanFormats': {'zh-CN': '扫描格式（逗号分隔）', 'zh-TW': '掃描格式（逗號分隔）', 'en': 'Scan formats (comma separated)'},
  'settings.doubanAuto': {'zh-CN': '扫描完成后自动获取豆瓣信息', 'zh-TW': '掃描完成後自動取得豆瓣資訊', 'en': 'Fetch Douban info automatically after scanning'},
  'settings.language': {'zh-CN': '语言', 'zh-TW': '語言', 'en': 'Language'},
  'settings.dataDir': {'zh-CN': '数据目录（book.db 位置）', 'zh-TW': '資料目錄（book.db 位置）', 'en': 'Data directory (book.db location)'},
  'lang.zh-CN': {'zh-CN': '简体中文', 'zh-TW': '简体中文', 'en': 'Simplified Chinese'},
  'lang.zh-TW': {'zh-CN': '繁體中文', 'zh-TW': '繁體中文', 'en': 'Traditional Chinese'},
  'lang.en': {'zh-CN': 'English', 'zh-TW': 'English', 'en': 'English'},
  'settings.about': {'zh-CN': '本地电子书管理', 'zh-TW': '本地電子書管理', 'en': 'Local e-book manager'},

  // ---- scan dialog ----
  'scan.title': {'zh-CN': '🔍 扫描电子书目录', 'zh-TW': '🔍 掃描電子書目錄', 'en': '🔍 Scan e-book folders'},
  'scan.dirs': {'zh-CN': '扫描目录', 'zh-TW': '掃描目錄', 'en': 'Scan folders'},
  'scan.manualPlaceholder': {'zh-CN': '或直接输入目录路径，如 E:\\Books', 'zh-TW': '或直接輸入目錄路徑，如 E:\\Books', 'en': 'or type a folder path, e.g. E:\\Books'},
  'scan.pick': {'zh-CN': '选择文件夹', 'zh-TW': '選擇資料夾', 'en': 'Choose folder'},
  'scan.noDirs': {'zh-CN': '尚未添加目录', 'zh-TW': '尚未新增目錄', 'en': 'No folders added yet'},
  'scan.remove': {'zh-CN': '移除', 'zh-TW': '移除', 'en': 'Remove'},
  'scan.formats': {'zh-CN': '扫描格式', 'zh-TW': '掃描格式', 'en': 'Scan formats'},
  'scan.doubanAuto': {'zh-CN': '扫描完成后自动从豆瓣获取封面 / 评分信息', 'zh-TW': '掃描完成後自動從豆瓣取得封面 / 評分資訊', 'en': 'Fetch covers/ratings from Douban after scanning'},
  'scan.processing': {'zh-CN': '正在处理 {cur}/{total} · {file}', 'zh-TW': '正在處理 {cur}/{total} · {file}', 'en': 'Processing {cur}/{total} · {file}'},
  'scan.preparing': {'zh-CN': '准备扫描...', 'zh-TW': '準備掃描...', 'en': 'Preparing to scan...'},
  'scan.added': {'zh-CN': '✅ 新增 {n}', 'zh-TW': '✅ 新增 {n}', 'en': '✅ Added {n}'},
  'scan.skipped': {'zh-CN': '⏭️ 跳过 {n}', 'zh-TW': '⏭️ 跳過 {n}', 'en': '⏭️ Skipped {n}'},
  'scan.errors': {'zh-CN': '⚠️ 错误 {n}', 'zh-TW': '⚠️ 錯誤 {n}', 'en': '⚠️ Errors {n}'},
  'scan.done': {'zh-CN': '✅ {msg}：新增 {a} 本，跳过 {s} 本，错误 {e} 个', 'zh-TW': '✅ {msg}：新增 {a} 本，跳過 {s} 本，錯誤 {e} 個', 'en': '✅ {msg}: {a} added, {s} skipped, {e} errors'},
  'scan.doneDefault': {'zh-CN': '扫描完成', 'zh-TW': '掃描完成', 'en': 'Scan complete'},
  'scan.logTitle': {'zh-CN': '跳过 / 错误详情', 'zh-TW': '跳過 / 錯誤詳情', 'en': 'Skipped / error details'},
  'scan.close': {'zh-CN': '关闭', 'zh-TW': '關閉', 'en': 'Close'},
  'scan.running': {'zh-CN': '扫描中...', 'zh-TW': '掃描中...', 'en': 'Scanning...'},
  'scan.start': {'zh-CN': '开始扫描', 'zh-TW': '開始掃描', 'en': 'Start scan'},
  'scan.finish': {'zh-CN': '完成', 'zh-TW': '完成', 'en': 'Done'},
  'scan.addedToast': {'zh-CN': '扫描完成，新增 {n} 本书', 'zh-TW': '掃描完成，新增 {n} 本書', 'en': 'Scan complete, {n} books added'},

  // ---- tag manager ----
  'tag.title': {'zh-CN': '🏷️ 标签管理', 'zh-TW': '🏷️ 標籤管理', 'en': '🏷️ Tag manager'},
  'tag.new': {'zh-CN': '新建标签', 'zh-TW': '新建標籤', 'en': 'New tag'},
  'tag.namePlaceholder': {'zh-CN': '标签名称', 'zh-TW': '標籤名稱', 'en': 'Tag name'},
  'tag.add': {'zh-CN': '添加', 'zh-TW': '新增', 'en': 'Add'},
  'tag.hint': {'zh-CN': '标签可在书籍详情中为每本书打上，也可用于书架筛选。', 'zh-TW': '標籤可在書籍詳情中為每本書標記，也可用於書架篩選。', 'en': 'Tags can be assigned to books in the detail view and used to filter the shelf.'},
  'tag.empty': {'zh-CN': '暂无标签', 'zh-TW': '暫無標籤', 'en': 'No tags yet'},
  'tag.books': {'zh-CN': '{n} 本书', 'zh-TW': '{n} 本書', 'en': '{n} books'},
  'tag.edit': {'zh-CN': '编辑', 'zh-TW': '編輯', 'en': 'Edit'},
  'tag.delete': {'zh-CN': '删除', 'zh-TW': '刪除', 'en': 'Delete'},
  'tag.save': {'zh-CN': '保存', 'zh-TW': '儲存', 'en': 'Save'},
  'tag.cancel': {'zh-CN': '取消', 'zh-TW': '取消', 'en': 'Cancel'},
  'tag.deleteConfirm': {'zh-CN': '删除标签「{name}」？将同时解除其与 {n} 本书的关联', 'zh-TW': '刪除標籤「{name}」？將同時解除其與 {n} 本書的關聯', 'en': 'Delete tag "{name}"? It will be removed from {n} books.'},

  // ---- misrecord manager ----
  'mis.title': {'zh-CN': '🚫 误录管理', 'zh-TW': '🚫 誤錄管理', 'en': '🚫 Misrecord manager'},
  'mis.intro': {
    'zh-CN': '被标记为「误录」的文件不会显示在书架上，且下次扫描时会自动跳过（按文件路径与 MD5 双重匹配）。你可以在此恢复误录的文件。',
    'zh-TW': '被標記為「誤錄」的檔案不會顯示在書架上，且下次掃描時會自動跳過（按檔案路徑與 MD5 雙重比對）。你可以在這裡還原誤錄的檔案。',
    'en': 'Files marked as misrecords are hidden from the shelf and skipped on the next scan (matched by path + MD5). Restore them here.',
  },
  'mis.loading': {'zh-CN': '加载中...', 'zh-TW': '載入中...', 'en': 'Loading...'},
  'mis.empty': {'zh-CN': '暂无误录记录', 'zh-TW': '暫無誤錄記錄', 'en': 'No misrecords'},
  'mis.fileName': {'zh-CN': '文件名', 'zh-TW': '檔案名稱', 'en': 'File name'},
  'mis.path': {'zh-CN': '文件路径', 'zh-TW': '檔案路徑', 'en': 'File path'},
  'mis.reason': {'zh-CN': '原因', 'zh-TW': '原因', 'en': 'Reason'},
  'mis.time': {'zh-CN': '时间', 'zh-TW': '時間', 'en': 'Time'},
  'mis.unnamed': {'zh-CN': '(未命名)', 'zh-TW': '(未命名)', 'en': '(unnamed)'},
  'mis.restore': {'zh-CN': '恢复', 'zh-TW': '還原', 'en': 'Restore'},
  'mis.clearAll': {'zh-CN': '清空全部', 'zh-TW': '清空全部', 'en': 'Clear all'},
  'mis.close': {'zh-CN': '关闭', 'zh-TW': '關閉', 'en': 'Close'},
  'mis.clearConfirm': {
    'zh-CN': '清空所有误录记录？对应书籍将恢复显示，下次扫描将不再跳过这些文件。',
    'zh-TW': '清空所有誤錄記錄？對應書籍將恢復顯示，下次掃描將不再跳過這些檔案。',
    'en': 'Clear all misrecords? The books will reappear and will no longer be skipped on the next scan.',
  },

  // ---- book detail ----
  'detail.title': {'zh-CN': '📖 书籍详情', 'zh-TW': '📖 書籍詳情', 'en': '📖 Book details'},
  'detail.unknownAuthor': {'zh-CN': '未知作者', 'zh-TW': '未知作者', 'en': 'Unknown author'},
  'detail.ratingCount': {'zh-CN': '{n} 人评价', 'zh-TW': '{n} 人評價', 'en': '{n} ratings'},
  'detail.doubanPage': {'zh-CN': '豆瓣页面 ↗', 'zh-TW': '豆瓣頁面 ↗', 'en': 'Douban page ↗'},
  'detail.publisher': {'zh-CN': '出版社', 'zh-TW': '出版社', 'en': 'Publisher'},
  'detail.language': {'zh-CN': '语言', 'zh-TW': '語言', 'en': 'Language'},
  'detail.size': {'zh-CN': '大小', 'zh-TW': '大小', 'en': 'Size'},
  'detail.progress': {'zh-CN': '阅读进度', 'zh-TW': '閱讀進度', 'en': 'Reading progress'},
  'detail.totalTime': {'zh-CN': ' · 累计 {t}', 'zh-TW': ' · 累計 {t}', 'en': ' · {t} total'},
  'detail.addedAt': {'zh-CN': '入库时间', 'zh-TW': '入庫時間', 'en': 'Added date'},
  'detail.filePath': {'zh-CN': '文件位置', 'zh-TW': '檔案位置', 'en': 'File location'},
  'detail.open': {'zh-CN': '📖 打开阅读', 'zh-TW': '📖 開啟閱讀', 'en': '📖 Open'},
  'detail.doubanFetch': {'zh-CN': '🌐 豆瓣获取', 'zh-TW': '🌐 豆瓣取得', 'en': '🌐 Fetch Douban'},
  'detail.fetching': {'zh-CN': '获取中...', 'zh-TW': '取得中...', 'en': 'Fetching...'},
  'detail.openFolder': {'zh-CN': '📁 打开文件夹', 'zh-TW': '📁 開啟資料夾', 'en': '📁 Open folder'},
  'detail.editInfo': {'zh-CN': '✏️ 编辑信息', 'zh-TW': '✏️ 編輯資訊', 'en': '✏️ Edit info'},
  'detail.markMis': {'zh-CN': '🚫 标记误录', 'zh-TW': '🚫 標記誤錄', 'en': '🚫 Mark misrecord'},
  'detail.delete': {'zh-CN': '🗑️ 删除', 'zh-TW': '🗑️ 刪除', 'en': '🗑️ Delete'},
  'detail.title2': {'zh-CN': '书名', 'zh-TW': '書名', 'en': 'Title'},
  'detail.author': {'zh-CN': '作者', 'zh-TW': '作者', 'en': 'Author'},
  'detail.publisher2': {'zh-CN': '出版社', 'zh-TW': '出版社', 'en': 'Publisher'},
  'detail.desc': {'zh-CN': '简介', 'zh-TW': '簡介', 'en': 'Description'},
  'detail.save': {'zh-CN': '保存', 'zh-TW': '儲存', 'en': 'Save'},
  'detail.tabTags': {'zh-CN': '标签 / 豆瓣', 'zh-TW': '標籤 / 豆瓣', 'en': 'Tags / Douban'},
  'detail.tabNotes': {'zh-CN': '笔记（{n}）', 'zh-TW': '筆記（{n}）', 'en': 'Notes ({n})'},
  'detail.tags': {'zh-CN': '标签', 'zh-TW': '標籤', 'en': 'Tags'},
  'detail.doubanSearch': {'zh-CN': '豆瓣手动搜索（书名不匹配时可手动关联）', 'zh-TW': '豆瓣手動搜尋（書名不匹配時可手動關聯）', 'en': 'Manual Douban search (when the title does not match)'},
  'detail.searchPlaceholder': {'zh-CN': '输入书名搜索豆瓣', 'zh-TW': '輸入書名搜尋豆瓣', 'en': 'Type a title to search Douban'},
  'detail.search': {'zh-CN': '搜索', 'zh-TW': '搜尋', 'en': 'Search'},
  'detail.searching': {'zh-CN': '搜索中...', 'zh-TW': '搜尋中...', 'en': 'Searching...'},
  'detail.clearDouban': {'zh-CN': '清除豆瓣信息', 'zh-TW': '清除豆瓣資訊', 'en': 'Clear Douban info'},
  'detail.link': {'zh-CN': '关联', 'zh-TW': '關聯', 'en': 'Link'},
  'detail.notePlaceholder': {'zh-CN': '写下你的阅读笔记...', 'zh-TW': '寫下你的閱讀筆記...', 'en': 'Write your reading note...'},
  'detail.addNote': {'zh-CN': '＋ 添加笔记', 'zh-TW': '＋ 新增筆記', 'en': '＋ Add note'},
  'detail.noNotes': {'zh-CN': '暂无笔记', 'zh-TW': '暫無筆記', 'en': 'No notes'},
  'detail.noteDelete': {'zh-CN': '删除', 'zh-TW': '刪除', 'en': 'Delete'},
  'detail.descLabel': {'zh-CN': '简介：', 'zh-TW': '簡介：', 'en': 'Description: '},
  'detail.toastDoubanOk': {'zh-CN': '已获取豆瓣信息：{r}', 'zh-TW': '已取得豆瓣資訊：{r}', 'en': 'Douban info fetched: {r}'},
  'detail.matchOk': {'zh-CN': '匹配成功', 'zh-TW': '匹配成功', 'en': 'matched'},
  'detail.ratingZero': {'zh-CN': '评分 0', 'zh-TW': '評分 0', 'en': 'rating 0'},
  'detail.toastDoubanFail': {'zh-CN': '豆瓣获取失败：{e}', 'zh-TW': '豆瓣取得失敗：{e}', 'en': 'Douban fetch failed: {e}'},
  'detail.toastSearchFail': {'zh-CN': '搜索失败：{e}', 'zh-TW': '搜尋失敗：{e}', 'en': 'Search failed: {e}'},
  'detail.toastLinked': {'zh-CN': '已关联《{t}》', 'zh-TW': '已關聯《{t}》', 'en': 'Linked "{t}"'},
  'detail.toastSaved': {'zh-CN': '已保存', 'zh-TW': '已儲存', 'en': 'Saved'},
  'detail.toastMisMarked': {'zh-CN': '已标记为误录，后续扫描将跳过该文件', 'zh-TW': '已標記為誤錄，後續掃描將跳過該檔案', 'en': 'Marked as misrecord; it will be skipped on the next scan'},
  'detail.toastDeleted': {'zh-CN': '已删除', 'zh-TW': '已刪除', 'en': 'Deleted'},
  'detail.toastNoteSaved': {'zh-CN': '笔记已保存', 'zh-TW': '筆記已儲存', 'en': 'Note saved'},
  'detail.misPrompt': {'zh-CN': '标记为误录（可选原因）：', 'zh-TW': '標記為誤錄（可選原因）：', 'en': 'Mark as misrecord (optional reason):'},
  'detail.deleteConfirm': {
    'zh-CN': '确定从书架删除《{t}》吗？\n（不会删除磁盘上的文件）',
    'zh-TW': '確定從書架刪除《{t}》嗎？\n（不會刪除磁碟上的檔案）',
    'en': 'Delete "{t}" from the shelf?\n(The file on disk will NOT be deleted.)',
  },

  // ---- reader ----
  'reader.back': {'zh-CN': '← 返回书架', 'zh-TW': '← 返回書架', 'en': '← Back to shelf'},
  'reader.cannotOpen': {'zh-CN': '无法打开这本书', 'zh-TW': '無法打開這本書', 'en': 'Cannot open this book'},
  'reader.loading': {'zh-CN': '正在加载书籍...', 'zh-TW': '正在載入書籍...', 'en': 'Loading book...'},
  'reader.prev': {'zh-CN': '‹ 上一页', 'zh-TW': '‹ 上一頁', 'en': '‹ Previous'},
  'reader.next': {'zh-CN': '下一页 ›', 'zh-TW': '下一頁 ›', 'en': 'Next ›'},
  'reader.session': {'zh-CN': '本次 {m} 分钟', 'zh-TW': '本次 {m} 分鐘', 'en': '{m} min this session'},
  'reader.close': {'zh-CN': '✕ 关闭', 'zh-TW': '✕ 關閉', 'en': '✕ Close'},
  'reader.fontSize': {'zh-CN': '字号：{n}px', 'zh-TW': '字號：{n}px', 'en': 'Font size: {n}px'},
  'reader.idleLimit': {'zh-CN': '阅读计时闲置上限：{n} 秒（设置中可修改）', 'zh-TW': '閱讀計時閒置上限：{n} 秒（設定中可修改）', 'en': 'Reading idle limit: {n}s (changeable in Settings)'},
  'reader.notePlaceholder': {'zh-CN': '写下你的想法...', 'zh-TW': '寫下你的想法...', 'en': 'Write your thoughts...'},
  'reader.noteCancel': {'zh-CN': '取消', 'zh-TW': '取消', 'en': 'Cancel'},
  'reader.noteSave': {'zh-CN': '保存笔记', 'zh-TW': '儲存筆記', 'en': 'Save note'},
};

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICT[key]?.[lang] ?? DICT[key]?.['zh-CN'] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

interface I18nCtx {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx>({lang: 'zh-CN', t: (k) => k});

export function I18nProvider({lang, children}: {lang: Lang; children: React.ReactNode}) {
  const value = useMemo<I18nCtx>(() => ({lang, t: (key, vars) => translate(lang, key, vars)}), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  return useContext(Ctx);
}
