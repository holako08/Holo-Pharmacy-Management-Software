import os

# The favicon link to ensure in every file
FAVICON_LINK = '<link rel="shortcut icon" href="images/logo.png" type="image/x-icon">'
FAVICON_LINK_STRIPPED = FAVICON_LINK.strip()

# Look for all .html files in current directory
for filename in os.listdir('.'):
    if filename.endswith('.html'):
        with open(filename, encoding='utf-8') as f:
            content = f.read()

        # Check if favicon link already present
        if FAVICON_LINK_STRIPPED in content:
            print(f"Favicon link already present in {filename}")
            continue

        # Insert favicon link before </head>
        if '</head>' in content:
            # Insert favicon with proper indentation
            new_content = content.replace('</head>', f'    {FAVICON_LINK}\n</head>')
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Added favicon link to {filename}")
        else:
            print(f"No </head> found in {filename}, skipping.")
