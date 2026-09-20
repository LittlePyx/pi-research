"""Freeze public arXiv abstracts for the bounded ranking pilot; no user data."""
import datetime
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / 'benchmarks/personalization/candidates.json'
IDS = {
    'mathematics': ['1807.03465', 'math/0605014', 'math/0611577', '1104.2791',
                    '2303.14938', '2305.10690', '2402.10758', '2011.13661', '2203.15551'],
    'information': ['1102.3944', '1209.1317', '1510.02190', '1508.06025',
                    '1410.2687', '1203.3217', 'physics/0004057', 'cs/0412108', '1411.3575'],
}

def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', value))).strip()

def main():
    if DEST.exists():
        raise SystemExit('Frozen candidates already exist; use a new version instead of overwriting.')
    papers = []
    for domain, ids in IDS.items():
        for identity in ids:
            url = 'https://arxiv.org/abs/' + identity
            request = urllib.request.Request(url, headers={'User-Agent': 'PiResearch-evaluation/1.0 (public abstract snapshot)'})
            with urllib.request.urlopen(request, timeout=25) as response:
                source = response.read().decode('utf-8')
            title = re.search(r'<meta\s+name="citation_title"\s+content="([^"]+)"', source)
            abstract = re.search(r'<blockquote\s+class="abstract[^>]*>(.*?)</blockquote>', source, re.S)
            canonical = re.search(r'<meta\s+name="citation_arxiv_id"\s+content="([^"]+)"', source)
            version = re.search(re.escape(identity) + r'(v\d+)', source)
            if not title or not abstract or not canonical or canonical[1].split('v')[0] != identity:
                raise ValueError('Missing or mismatched source: ' + identity)
            text = re.sub(r'^Abstract:\s*', '', clean(abstract[1]))
            if len(text) < 120:
                raise ValueError('Insufficient abstract: ' + identity)
            paper = {'id': 'arxiv:' + identity, 'domain': domain, 'title': html.unescape(title[1]),
                     'abstract': text, 'sourceUrl': url, 'sourceVersion': version[1] if version else None,
                     'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'sourceHtmlSha256': hashlib.sha256(source.encode()).hexdigest(),
                     'abstractSha256': hashlib.sha256(text.encode()).hexdigest()}
            papers.append(paper)
            print(identity, len(text), flush=True)
            time.sleep(3)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps({'version': 'abstract-pilot-v1', 'papers': papers}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
