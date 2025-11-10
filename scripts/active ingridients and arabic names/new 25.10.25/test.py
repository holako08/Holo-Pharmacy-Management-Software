# test_generate_rest_fixed.py
import requests, json

API_KEY = "AIzaSyC6g9j5hOx-LQIpGIJFEgRsUm8HHoKEihQ"    # your key
MODEL_NAME = "models/gemini-2.5-pro"

def generate(api_key, model_name, prompt="Hello! Short test sentence."):
    url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 200
        }
    }
    headers = {"Content-Type": "application/json"}
    r = requests.post(url, headers=headers, json=payload, timeout=20)
    print("Status code:", r.status_code)
    if r.status_code != 200:
        print("Response text:\n", r.text[:2000])
    else:
        try:
            print(json.dumps(r.json(), indent=2)[:4000])
        except Exception:
            print("Non-JSON response:\n", r.text[:2000])
    return r

if __name__ == "__main__":
    print("Using model:", MODEL_NAME)
    generate(API_KEY, MODEL_NAME)
