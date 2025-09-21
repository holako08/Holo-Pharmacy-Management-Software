import re
import shutil
import os

def guard_addEventListener_in_file(js_path):
    backup_path = js_path + ".bak"
    shutil.copyfile(js_path, backup_path)
    print(f"[{js_path}] Backup created.")

    with open(js_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    pattern = re.compile(r"(document\.getElementById\(\s*['\"]([a-zA-Z0-9_\-]+)['\"]\s*\))\.addEventListener\((.*)\);")
    new_lines = []
    for line in lines:
        m = pattern.search(line)
        if m:
            get_elt = m.group(1)
            elt_id = m.group(2)
            rest = m.group(3)
            indent = re.match(r"^(\s*)", line).group(1)
            new_lines.append(f"{indent}var _el_{elt_id} = {get_elt};\n")
            new_lines.append(f"{indent}if (_el_{elt_id}) _el_{elt_id}.addEventListener({rest});\n")
        else:
            new_lines.append(line)

    with open(js_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print(f"[{js_path}] Patched.")

def process_all_js_files():
    script_name = os.path.basename(__file__)
    for filename in os.listdir('.'):
        if filename.endswith('.js') and filename != script_name:
            guard_addEventListener_in_file(filename)

if __name__ == "__main__":
    process_all_js_files()
    print("All JS files processed. Check for .bak backups.")
