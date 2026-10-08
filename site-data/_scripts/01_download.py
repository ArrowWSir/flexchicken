"""Download raw data from flexchicken.co.uk: REST APIs, sitemap HTML, CSS, images."""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://flexchicken.co.uk"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW = os.path.join(ROOT, "raw")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36"}


def get(url, binary=False, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                return (data, dict(r.headers)) if binary else (data.decode("utf-8", "replace"), dict(r.headers))
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                print(f"FAIL {url}: {e}", file=sys.stderr)
                return None, {}
            time.sleep(1.5 * (attempt + 1))


def save(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if isinstance(content, bytes) else "w"
    with open(path, mode, **({} if mode == "wb" else {"encoding": "utf-8"})) as f:
        f.write(content)


def get_paged(endpoint, per_page=100):
    items, page = [], 1
    while True:
        sep = "&" if "?" in endpoint else "?"
        body, headers = get(f"{BASE}{endpoint}{sep}per_page={per_page}&page={page}")
        if not body:
            break
        try:
            chunk = json.loads(body)
        except json.JSONDecodeError:
            break
        if not isinstance(chunk, list) or not chunk:
            break
        items.extend(chunk)
        total_pages = int(headers.get("X-WP-TotalPages") or headers.get("x-wp-totalpages") or 1)
        if page >= total_pages and len(chunk) < per_page:
            break
        if len(chunk) < per_page:
            break
        page += 1
    return items


def download_api():
    endpoints = {
        "products": "/wp-json/wc/store/v1/products",
        "product_categories": "/wp-json/wc/store/v1/products/categories",
        "product_tags": "/wp-json/wc/store/v1/products/tags",
        "product_attributes": "/wp-json/wc/store/v1/products/attributes",
        "pages": "/wp-json/wp/v2/pages",
        "posts": "/wp-json/wp/v2/posts",
        "media": "/wp-json/wp/v2/media",
        "categories": "/wp-json/wp/v2/categories",
        "tags": "/wp-json/wp/v2/tags",
        "users": "/wp-json/wp/v2/users",
    }
    for name, ep in endpoints.items():
        data = get_paged(ep)
        save(os.path.join(RAW, "api", f"{name}.json"), json.dumps(data, indent=2, ensure_ascii=False))
        print(f"api {name}: {len(data)}")
    root, _ = get(f"{BASE}/wp-json/")
    if root:
        info = json.loads(root)
        slim = {k: info.get(k) for k in ("name", "description", "url", "home", "gmt_offset", "timezone_string", "site_logo", "site_icon", "site_icon_url")}
        slim["namespaces"] = info.get("namespaces")
        save(os.path.join(RAW, "api", "site.json"), json.dumps(slim, indent=2, ensure_ascii=False))


def sitemap_urls():
    idx, _ = get(f"{BASE}/wp-sitemap.xml")
    urls = []
    for sm in re.findall(r"<loc>([^<]+)</loc>", idx or ""):
        if "users" in sm:
            continue
        body, _ = get(sm)
        urls.extend(re.findall(r"<loc>([^<]+)</loc>", body or ""))
    extra = [f"{BASE}/", f"{BASE}/shop/", f"{BASE}/full-menu/", f"{BASE}/feed/"]
    return sorted(set(urls + extra))


def url_to_file(url):
    path = urllib.parse.urlparse(url).path.strip("/") or "home"
    return os.path.join(RAW, "html", path.replace("/", "__") + ".html")


def download_html(urls):
    def job(u):
        body, _ = get(u)
        if body:
            save(url_to_file(u), body)
        return u, bool(body)

    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(job, urls))
    save(os.path.join(RAW, "html", "_urls.json"), json.dumps([u for u, ok in results if ok], indent=2))
    print(f"html: {sum(ok for _, ok in results)}/{len(urls)}")


def collect_asset_urls():
    css, imgs = set(), set()
    html_dir = os.path.join(RAW, "html")
    for fn in os.listdir(html_dir):
        if not fn.endswith(".html"):
            continue
        text = open(os.path.join(html_dir, fn), encoding="utf-8").read()
        for m in re.findall(r"""href=['"]([^'"]+\.css[^'"]*)['"]""", text):
            css.add(m.replace("&#038;", "&"))
        for m in re.findall(r"""https?://flexchicken\.co\.uk/wp-content/uploads/[^\s'"()<>\\]+?\.(?:jpe?g|png|webp|gif|svg|avif|ico|mp4|webm|pdf)""", text, re.I):
            imgs.add(m)
    for name in ("media", "products", "product_categories"):
        p = os.path.join(RAW, "api", f"{name}.json")
        if os.path.exists(p):
            for m in re.findall(r"https?:\\?/\\?/flexchicken\.co\.uk[^\"]+?\.(?:jpe?g|png|webp|gif|svg|avif|ico|mp4|webm|pdf)", open(p, encoding="utf-8").read(), re.I):
                imgs.add(m.replace("\\/", "/"))
    return css, imgs


def to_original(url):
    """Strip WP size suffix (-300x200) to get the full-size upload."""
    return re.sub(r"-\d+x\d+(\.\w+)$", r"\1", url)


def download_assets(css, imgs):
    def css_job(u):
        full = urllib.parse.urljoin(BASE, u)
        body, _ = get(full)
        if body:
            name = urllib.parse.urlparse(full).path.strip("/").replace("/", "__")
            save(os.path.join(RAW, "css", name), body)

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(css_job, css))
    print(f"css: {len(css)}")

    originals = sorted({to_original(u) for u in imgs})

    def img_job(u):
        rel = urllib.parse.unquote(urllib.parse.urlparse(u).path.split("/wp-content/uploads/")[-1])
        dest = os.path.join(ROOT, "images", rel)
        if os.path.exists(dest):
            return True
        data, _ = get(u, binary=True)
        if data is None:
            return False
        save(dest, data)
        return True

    with ThreadPoolExecutor(8) as ex:
        ok = list(ex.map(img_job, originals))
    print(f"images: {sum(ok)}/{len(originals)}")


if __name__ == "__main__":
    download_api()
    download_html(sitemap_urls())
    css, imgs = collect_asset_urls()
    download_assets(css, imgs)
