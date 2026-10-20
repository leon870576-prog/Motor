"""Editorial regression guard, supplementing (not replacing) manual selection."""
import difflib
import html
import json
import re
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
jokes = (root/'code-update/includes/chat_shut.php').read_text().splitlines()
assert len(jokes) == len(set(jokes)) == 400
ban = re.compile((root/'checks/joke-forbidden.txt').read_text().strip(), re.I)
normalize = lambda t: re.sub(r'\W', '', html.unescape(t).lower().replace('ё', 'е'))
old = []
for name in ['motor-source.tar.gz', 'motor-code.tar.gz']:
    with tarfile.open(root/name) as archive:
        member = next((m for m in archive.getmembers() if m.name.removeprefix('./') == 'includes/chat_shut.php'), None)
        if member:
            old = archive.extractfile(member).read().decode('utf-8').splitlines()
assert old, 'original repertoire required'
previous = [normalize(t) for t in old if t.strip()]
for i, joke in enumerate(jokes):
    assert 35 <= len(joke) <= 999 and not re.search(r'[<>|\x00-\x1f]', joke), i
    assert not ban.search(joke.replace('ё', 'е')), i
    text = normalize(joke)
    for earlier in previous:
        if min(len(text), len(earlier)) / max(len(text), len(earlier)) >= .84:
            assert difflib.SequenceMatcher(None, text, earlier).ratio() < .84, f'near duplicate at {i}'
    previous.append(text)
result = dict(jokes=400, old_jokes=len(old), near_duplicate_threshold=.84, manual_selection=True, automated_filter=True)
(root/'checks/joke-content-results.json').write_text(json.dumps(result, indent=2)+'\n')
print('PASS joke content:', json.dumps(result))
