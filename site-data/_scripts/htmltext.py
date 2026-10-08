"""Convert saved HTML to readable plain text (body only, scripts/styles/svg stripped)."""
import html
import re
import sys


def body_text(raw: str) -> str:
    body = raw[raw.find("<body"):] if "<body" in raw else raw
    body = re.sub(r"<(script|style|svg|noscript)\b.*?</\1>", "", body, flags=re.S | re.I)
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    text = re.sub(r"<[^>]+>", "\n", body)
    lines = [html.unescape(line).strip() for line in text.split("\n")]
    out = []
    for line in lines:
        if line and (not out or out[-1] != line):
            out.append(line)
    return "\n".join(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(body_text(open(sys.argv[1], encoding="utf-8").read()))
