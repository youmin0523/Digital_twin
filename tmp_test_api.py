import urllib.request
import json

url = "https://api.open-meteo.com/v1/forecast?latitude=35.1&longitude=129.04&current=temperature_2m,visibility"
try:
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("Success:")
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
