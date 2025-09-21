import os
import re

# The new links you want to add
NEW_LINKS = '''
<li><a href="near-expiry-report.html">Near Expiry Report</a></li>
<li><a href="stock-report.html">Stock Report</a></li>
'''

# The anchor after which to insert (must match exactly as in your files)
ANCHOR_LINK = '<li><a href="item-wise sale report.html">Item-wise Sales Report</a></li>'

def insert_links_in_navbar(html):
    # If the new links already exist, don't add again
    if 'near-expiry-report.html' in html and 'stock-report.html' in html:
        return html

    # Find anchor
    idx = html.find(ANCHOR_LINK)
    if idx == -1:
        return html  # anchor not found, do nothing

    # Insert after the anchor
    insert_at = idx + len(ANCHOR_LINK)
    new_html = html[:insert_at] + '\n' + NEW_LINKS + html[insert_at:]
    return new_html

def process_file(path):
    with open(path, encoding='utf-8') as f:
        html = f.read()

    new_html = insert_links_in_navbar(html)

    if new_html != html:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_html)
        print(f'Updated navbar in: {path}')
    else:
        print(f'No changes needed: {path}')

def main():
    for root, _, files in os.walk('.'):  # use os.walk for subfolders, or os.listdir('.') for current only
        for name in files:
            if name.endswith('.html'):
                process_file(os.path.join(root, name))

if __name__ == "__main__":
    main()
