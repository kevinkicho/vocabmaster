import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add role="dialog" aria-modal="true"
html = html.replace('id="modal-stats" class="', 'id="modal-stats" role="dialog" aria-modal="true" class="')
html = html.replace('id="modal-note" class="', 'id="modal-note" role="dialog" aria-modal="true" class="')
html = html.replace('id="modal-edit" class="', 'id="modal-edit" role="dialog" aria-modal="true" class="')
html = html.replace('id="modal-settings" class="', 'id="modal-settings" role="dialog" aria-modal="true" class="')
html = html.replace('id="modal-ai-cloze" class="', 'id="modal-ai-cloze" role="dialog" aria-modal="true" class="')

# Icon buttons aria labels
labels = {
    'ph-arrows-out': 'Toggle Fullscreen',
    'ph-gear': 'Settings',
    'ph-x': 'Close',
    'ph-text-b': 'Bold',
    'ph-text-italic': 'Italic',
    'ph-text-underline': 'Underline',
    'ph-list-bullets': 'Bulleted List'
}

for k, v in labels.items():
    html = re.sub(r'(<button[^>]*>)\s*<i[^>]*' + k + r'[^>]*></i>\s*</button>', 
                  lambda m: m.group(0).replace('<button ', f'<button aria-label="{v}" '), html)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
