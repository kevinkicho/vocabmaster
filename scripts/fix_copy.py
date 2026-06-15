import re

def fix(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # in notes.js
    if 'notes.js' in filepath:
        content = re.sub(r'if \(!navigator\.clipboard\) \{.*?\} else \{ (.*?) \}', r'\1', content, flags=re.DOTALL)
    
    # in ui.js and ui_settings.js
    if 'ui' in filepath:
        content = content.replace("el.select(); document.execCommand('copy');", "navigator.clipboard.writeText(el.value);")

    # in settings_html.js
    if 'settings_html.js' in filepath:
        content = content.replace("onclick=\"this.select(); document.execCommand('copy');", "onclick=\"navigator.clipboard.writeText(this.value);")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix('public/js/notes.js')
fix('public/js/ui.js')
fix('public/js/ui_settings.js')
fix('public/js/settings_html.js')
