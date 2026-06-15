import re
import os
import glob

# Get all js files
js_files = []
for file in glob.glob("public/js/*.js"):
    js_files.append("./" + file.replace("\\", "/").replace("public/", ""))

# Load sw.js
with open("public/sw.js", "r") as f:
    sw = f.read()

# Generate new assets array
new_assets = []
new_assets.append("  './',")
new_assets.append("  './index.html',")
new_assets.append("  './tailwind.css',")
new_assets.append("  './favicon.svg',")

for js in js_files:
    new_assets.append(f"  '{js}',")

# external libs and flag icons
external = """  // External Libraries
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  // Flag Icons
  'https://flagcdn.com/w40/jp.png',
  'https://flagcdn.com/w40/kr.png',
  'https://flagcdn.com/w40/us.png',
  'https://flagcdn.com/w40/cn.png',
  'https://flagcdn.com/w40/es.png',
  'https://flagcdn.com/w40/br.png',
  'https://flagcdn.com/w40/it.png',
  'https://flagcdn.com/w40/fr.png',
  'https://flagcdn.com/w40/de.png',
  'https://flagcdn.com/w40/ru.png',
  // Firebase SDKs
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-database-compat.js'"""

new_assets_str = "\n".join(new_assets) + "\n" + external

# Update sw.js
sw = re.sub(r'const ASSETS_TO_CACHE = \[\s*.*?\];', 'const ASSETS_TO_CACHE = [\n' + new_assets_str + '\n];', sw, flags=re.DOTALL)

with open("public/sw.js", "w") as f:
    f.write(sw)
