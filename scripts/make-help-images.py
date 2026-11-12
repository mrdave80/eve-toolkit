"""Builds renderer/help/*.jpg from the screenshot run (scripts/screens/out/overview) for the shots help-data.js uses."""
import os, re, sys
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'scripts', 'screens', 'out', 'overview')
dst = os.path.join(root, 'renderer', 'help'); os.makedirs(dst, exist_ok=True)
names = sorted(set(re.findall(r"\['([0-9A-Z][0-9A-Za-z-]+)', '", open(os.path.join(root, 'renderer', 'help-data.js'), encoding='utf8').read())))
missing = []
for n in names:
    p = os.path.join(src, n + '.png')
    if not os.path.exists(p): missing.append(n); continue
    im = Image.open(p).convert('RGB'); w = 1000
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, n + '.jpg'), quality=72, optimize=True, progressive=True)
for f in os.listdir(dst):
    if f.endswith('.jpg') and f[:-4] not in names: os.remove(os.path.join(dst, f))
print(len(names) - len(missing), 'images;', 'missing:', missing)
sys.exit(1 if missing else 0)
