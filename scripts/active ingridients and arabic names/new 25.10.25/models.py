# validate_list_models.py
import requests
import json

# --- YOUR API KEY (from your script) ---
API_KEY = "AIzaSyC6g9j5hOx-LQIpGIJFEgRsUm8HHoKEihQ"

def list_models(api_key):
    url = f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
    r = requests.get(url, timeout=15)
    print("Status code:", r.status_code)
    text = r.text
    # Print part of the response to avoid flooding the console
    print("Response (first 1000 chars):\n", text[:1000])
    try:
        data = r.json()
        # Pretty print the models list if present
        if 'models' in data:
            print("\nAvailable models:")
            for m in data['models']:
                # model name and any description
                print(" -", m.get('name'), ":", m.get('displayName', ''))
        else:
            print("\n'models' key not found in response JSON; full JSON below:\n")
            print(json.dumps(data, indent=2)[:2000])
    except Exception as e:
        print("Could not parse JSON from response:", e)

if __name__ == "__main__":
    list_models(API_KEY)
