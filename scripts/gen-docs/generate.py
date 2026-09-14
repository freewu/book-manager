#!/usr/bin/env python3
"""从 content.py 生成 README（英 / 简 / 繁）与 docs 官网（三语言静态页）。

用法：
    python3 scripts/gen-docs/generate.py            # 写入文件
    python3 scripts/gen-docs/generate.py --check     # 只检查是否与磁盘一致（CI / just test）

官网是纯静态的：docs/ 目录直接交给 GitHub Pages（见 .github/workflows/pages.yml），
语言用页面右上角的 select 切换，默认英文（docs/index.html）。
"""

from __future__ import annotations

import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from content import AUTHOR, CONTENT, LANGS, NAV_IDS, REPO, SHOT_FILES, VERSION, YEAR  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, "docs")

# 中文用破折号双写更好看
DASH = {"en": "—", "zh-CN": "——", "zh-TW": "——"}
# 官网/README 里的 hero 截图就是第一张
HERO_SHOT = SHOT_FILES[0]


def esc(text: str) -> str:
    """HTML 转义，并把 content.py 里用反引号写的行内代码变成 <code>。"""
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", html.escape(text, quote=True))


# ------------------------------------------------------------------ README

def readme(lang: str) -> str:
    c = CONTENT[lang]
    dash = DASH.get(lang, "—")
    out: list[str] = []

    # 语言互链：当前语言加粗，其余给链接
    links = []
    for code, _h, file, _p, label in LANGS:
        links.append(f"**[{label}]({file})**" if code == lang else f"[{label}]({file})")
    out.append(f"# {c['title']}")
    out.append("")
    out.append(" · ".join(links))
    out.append("")

    badges = [
        f"![version](https://img.shields.io/badge/version-{VERSION}-5b7cfa.svg)",
        "![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078d4.svg)",
        "![license](https://img.shields.io/badge/license-MIT-22c55e.svg)",
        "![Wails](https://img.shields.io/badge/Wails-v2-DF0000.svg)",
        "![Go](https://img.shields.io/badge/Go-1.21%2B-00ADD8.svg)",
    ]
    out.append(" ".join(badges))
    out.append("")
    out.append(c["intro"])
    out.append("")

    shot_titles = {f: t for f, (t, _cap) in zip(SHOT_FILES, c["shots"])}
    out.append(f"![{shot_titles[HERO_SHOT]}](docs/images/{HERO_SHOT})")
    out.append("")

    out.append(f"## {c['features_title']}")
    out.append("")
    for icon, title, desc in c["features"]:
        out.append(f"- **{icon} {title}** {dash} {desc}")
    out.append("")

    out.append(f"## {c['shots_title']}")
    out.append("")
    for file, (title, caption) in zip(SHOT_FILES, c["shots"]):
        out.append(f"### {title}")
        out.append("")
        out.append(f"![{title}](docs/images/{file})")
        out.append("")
        out.append(caption)
        out.append("")

    out.append(f"## {c['tools_title']}")
    out.append("")
    out.append(c["tools_note"])
    out.append("")
    for group, tools in c["tool_groups"]:
        out.append(f"### {group}")
        out.append("")
        for icon, name, desc in tools:
            out.append(f"- **{icon} {name}** {dash} {desc}")
        out.append("")

    out.append(f"## {c['start_title']}")
    out.append("")
    out.append(f"### {c['requirements_title']}")
    out.append("")
    for item in c["requirements"]:
        out.append(f"- {item}")
    out.append("")
    out.append(f"### {c['commands_title']}")
    out.append("")
    out.append("```bash")
    for cmd, _desc in c["commands"]:
        out.append(f"{cmd:<22} # {_desc}" if lang == "en" else f"{cmd:<22} # {_desc}")
    out.append("```")
    out.append("")
    out.append(f"> {c['docs_note']}")
    out.append("")

    out.append(f"## {c['data_title']}")
    out.append("")
    for item in c["data"]:
        out.append(f"- {item}")
    out.append("")

    out.append(f"## {c['known_title']}")
    out.append("")
    out.append(c["known_body"])
    out.append("")
    out.append("```go")
    out.extend(c["known_code"])
    out.append("```")
    out.append("")
    out.append(c["known_tip"])
    out.append("")

    out.append(f"## {c['version_title']}")
    out.append("")
    out.append(f"- {c['version_current']}: **{VERSION}**")
    for item in c["version_items"]:
        out.append(f"- {item}")
    out.append("")

    out.append(f"## {c['download_title']}")
    out.append("")
    out.append(c["download_text"])
    out.append("")
    out.append(f"- [{c['download_button']}]({REPO}/releases/latest)")
    out.append(f"- [{c['download_alt']}]({REPO}/releases)")
    out.append("")

    out.append("## License")
    out.append("")
    out.append(f"MIT © {YEAR} {AUTHOR} · [{REPO}]({REPO})")
    out.append("")

    return "\n".join(out)


# -------------------------------------------------------------------- HTML

FAVICON = (
    "data:image/svg+xml,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
    "%3Ctext y='50' font-size='52'%3E%F0%9F%93%9A%3C/text%3E%3C/svg%3E"
)


def page(lang: str) -> str:
    c = CONTENT[lang]
    lang_attr = dict((code, attr) for code, attr, *_ in LANGS)[lang]
    own_file = dict((code, page_file) for code, _a, _r, page_file, _l in LANGS)[lang]
    dash = DASH.get(lang, "—")

    alt_links = "\n".join(
        f'<link rel="alternate" hreflang="{attr}" href="{page_file}" />'
        for _code, attr, _r, page_file, _l in LANGS
    )
    options = "\n".join(
        '        <option value="{f}"{sel}>{label}</option>'.format(
            f=page_file, sel=" selected" if code == lang else "", label=label
        )
        for code, _a, _r, page_file, label in LANGS
    )
    nav = "\n".join(
        f'      <a href="#{anchor}">{esc(label)}</a>' for anchor, label in zip(NAV_IDS, c["nav"])
    )

    features = "\n".join(
        f"""      <article class="card">
        <div class="card-ico">{icon}</div>
        <h3>{esc(title)}</h3>
        <p>{esc(desc)}</p>
      </article>"""
        for icon, title, desc in c["features"]
    )

    # 首屏轮播：6 张截图各一张 slide（第一张立即加载，其余懒加载）
    slides = "\n".join(
        f"""          <li class="slide{' active' if i == 0 else ''}" data-slide="{i}">
            <a href="images/{file}" target="_blank" rel="noopener">
              <img src="images/{file}" alt="{esc(title)}" width="2880" height="1728"{'' if i == 0 else ' loading="lazy"'} />
            </a>
            <span class="slide-cap"><strong>{esc(title)}</strong><span>{esc(caption)}</span></span>
          </li>"""
        for i, (file, (title, caption)) in enumerate(zip(SHOT_FILES, c["shots"]))
    )
    dots = "\n".join(
        f"""          <button class="car-dot{' active' if i == 0 else ''}" type="button" data-goto="{i}" aria-label="{esc(title)}"></button>"""
        for i, (_file, (title, _cap)) in enumerate(zip(SHOT_FILES, c["shots"]))
    )
    hero_shot = f"""        <div class="carousel" data-interval="5200" role="group" aria-roledescription="carousel" aria-label="{esc(c['shots_title'])}">
          <div class="car-viewport">
            <ul class="car-track">
{slides}
            </ul>
            <button class="car-btn car-prev" type="button" aria-label="{esc(c['shot_prev'])}" title="{esc(c['shot_prev'])}">‹</button>
            <button class="car-btn car-next" type="button" aria-label="{esc(c['shot_next'])}" title="{esc(c['shot_next'])}">›</button>
          </div>
          <div class="car-dots">
{dots}
          </div>
        </div>"""

    shots = "\n".join(
        f"""      <figure class="shot">
        <a href="images/{file}" target="_blank" rel="noopener">
          <img src="images/{file}" alt="{esc(title)}" loading="lazy" />
        </a>
        <figcaption><strong>{esc(title)}</strong><span>{esc(caption)}</span></figcaption>
      </figure>"""
        for file, (title, caption) in zip(SHOT_FILES, c["shots"])
    )

    groups = []
    for group, tools in c["tool_groups"]:
        items = "\n".join(
            f"""        <article class="card tool">
          <div class="card-ico">{icon}</div>
          <h4>{esc(name)}</h4>
          <p>{esc(desc)}</p>
        </article>"""
            for icon, name, desc in tools
        )
        groups.append(
            f"""      <div class="tgroup">
        <h3>{esc(group)}</h3>
        <div class="cards">
{items}
        </div>
      </div>"""
        )
    tools_html = "\n".join(groups)

    requires = "\n".join(f"        <li>{esc(x)}</li>" for x in c["requirements"])
    commands = "\n".join(
        f"          <tr><td><code>{esc(cmd)}</code></td><td>{esc(desc)}</td></tr>"
        for cmd, desc in c["commands"]
    )
    data = "\n".join(f"        <li>{esc(x)}</li>" for x in c["data"])
    version_items = "\n".join(f"        <li>{esc(x)}</li>" for x in c["version_items"])
    known_code = "\n".join(esc(line) for line in c["known_code"])
    badges = "\n".join(f'      <li>{esc(b)}</li>' for b in c["badges"])

    return f"""<!doctype html>
<html lang="{lang_attr}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{esc(c['title'])}</title>
    <meta name="description" content="{esc(c['intro'][:180])}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{esc(c['title'])}" />
    <meta property="og:description" content="{esc(c['intro'][:180])}" />
    <meta property="og:image" content="images/{HERO_SHOT}" />
{alt_links}
    <link rel="icon" href="{FAVICON}" />
    <link rel="stylesheet" href="site.css" />
  </head>
  <body>
    <header class="hdr">
      <div class="hdr-in">
        <a class="brand" href="{own_file}">
          <span class="brand-ico">📚</span>
          <span class="brand-txt">{esc(c['name'])}</span>
          <span class="brand-ver">{VERSION}</span>
        </a>
        <nav class="nav">
{nav}
        </nav>
        <label class="lang">
          <span class="lang-ico" aria-hidden="true">🌏</span>
          <select id="lang" aria-label="{esc(c['lang_label'])}">
{options}
          </select>
        </label>
      </div>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">{esc(c['tagline'])}</p>
        <h1>{esc(c['name'])}</h1>
        <p class="lede">{esc(c['intro'])}</p>
        <div class="cta">
          <a class="btn primary" href="{REPO}/releases/latest">⬇ {esc(c['cta_download'])}</a>
          <a class="btn ghost" href="{REPO}">★ {esc(c['cta_source'])}</a>
        </div>
        <p class="cta-note">{esc(c['cta_note'])}</p>
        <ul class="badges">
{badges}
        </ul>
{hero_shot}
      </section>

      <section class="sec" id="features">
        <h2>{esc(c['features_title'])}</h2>
        <div class="cards">
{features}
        </div>
      </section>

      <section class="sec" id="screenshots">
        <h2>{esc(c['shots_title'])}</h2>
        <div class="shots">
{shots}
        </div>
      </section>

      <section class="sec" id="tools">
        <h2>{esc(c['tools_title'])}</h2>
        <p class="muted">{esc(c['tools_note'])}</p>
{tools_html}
      </section>

      <section class="sec" id="start">
        <h2>{esc(c['start_title'])}</h2>
        <div class="cols">
          <div>
            <h3>{esc(c['requirements_title'])}</h3>
            <ul class="list">
{requires}
            </ul>
          </div>
          <div>
            <h3>{esc(c['commands_title'])}</h3>
            <table class="cmds">
              <tbody>
{commands}
              </tbody>
            </table>
          </div>
        </div>
        <p class="note">{esc(c['docs_note'])}</p>
        <h3>{esc(c['data_title'])}</h3>
        <ul class="list">
{data}
        </ul>
        <h3>{esc(c['known_title'])}</h3>
        <p class="muted">{esc(c['known_body'])}</p>
        <pre class="code"><code>{known_code}</code></pre>
        <p class="muted">{esc(c['known_tip'])}</p>
        <h3>{esc(c['version_title'])}</h3>
        <ul class="list">
{version_items}
        </ul>
      </section>

      <section class="sec" id="download">
        <h2>{esc(c['download_title'])}</h2>
        <p class="muted">{esc(c['download_text'])}</p>
        <div class="cta">
          <a class="btn primary" href="{REPO}/releases/latest">⬇ {esc(c['download_button'])}</a>
          <a class="btn ghost" href="{REPO}/releases">{esc(c['download_alt'])}</a>
        </div>
      </section>
    </main>

    <footer class="ftr">
      <div class="ftr-in">
        <span>MIT © {YEAR} {AUTHOR}</span>
        <span class="dot">·</span>
        <a href="{REPO}">GitHub</a>
        <span class="dot">·</span>
        <a href="{REPO}/blob/main/{dict((code, r) for code, _a, r, _p, _l in LANGS)[lang]}">{esc(c['ftr_readme'])}</a>
        <span class="dot">·</span>
        <a href="{REPO}/issues">{esc(c['ftr_issues'])}</a>
        <span class="dot">·</span>
        <a href="{REPO}/blob/main/LICENSE">{esc(c['ftr_license'])}</a>
        <span class="dot">·</span>
        <span>{VERSION}</span>
      </div>
    </footer>

    <script src="site.js"></script>
  </body>
</html>
"""


# ------------------------------------------------------------------- 磁盘

def targets() -> dict[str, str]:
    out = {}
    for code, _attr, readme_file, page_file, _label in LANGS:
        out[os.path.join(ROOT, readme_file)] = readme(code)
        out[os.path.join(DOCS, page_file)] = page(code)
    return out


def check() -> int:
    bad = []
    for name in SHOT_FILES:
        if not os.path.exists(os.path.join(DOCS, "images", name)):
            bad.append(f"docs/images/{name} 不存在")
    for path, text in targets().items():
        rel = os.path.relpath(path, ROOT)
        try:
            with open(path, encoding="utf-8") as fh:
                disk = fh.read()
        except FileNotFoundError:
            bad.append(f"{rel} 不存在（跑 `just docs` 生成）")
            continue
        if disk != text:
            bad.append(f"{rel} 与 content.py 不一致（跑 `just docs` 重新生成）")
    if bad:
        print("✗ 文档未同步:")
        for line in bad:
            print(f"  - {line}")
        return 1
    print(f"✓ 文档已同步（README ×3、官网 ×3、截图 ×{len(SHOT_FILES)}）")
    return 0


def write() -> int:
    for path, text in targets().items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        print(f"  wrote {os.path.relpath(path, ROOT)} ({len(text)} bytes)")
    print(f"✓ 生成完成：README ×3、docs 官网 ×3（默认英文 {LANGS[0][3]}）")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else write())
