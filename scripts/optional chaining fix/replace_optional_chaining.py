import os
import re

def replace_optional_chaining(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Define patterns and replacements
    patterns = [
        (r'\.(\w+)\s*\?\.\s*(\w+)', r'.\1 ? \1.\2 : undefined'),  # e.g., obj?.prop -> obj ? obj.prop : undefined
        (r'\.(\w+)\s*\?\.\s*\[(\w+)\]', r'.\1 ? \1[\2] : undefined'),  # e.g., obj?.[prop] -> obj ? obj[prop] : undefined
        (r'\.(\w+)\s*\?\.\s*\((\w+)\)', r'.\1 ? \1(\2) : undefined'),  # e.g., obj?.(prop) -> obj ? obj(prop) : undefined
    ]

    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)

    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)

def find_and_replace_in_folder(folder_path):
    for root, _, files in os.walk(folder_path):
        for file in files:
            if file == 'server.js':
                file_path = os.path.join(root, file)
                print(f"Processing {file_path}")
                replace_optional_chaining(file_path)
                print(f"Replaced optional chaining in {file_path}")

if __name__ == "__main__":
    folder_path = input("Enter the folder path to search for server.js: ")
    find_and_replace_in_folder(folder_path)