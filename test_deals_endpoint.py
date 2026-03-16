import requests
import json

def test_deals():
    try:
        url = "http://localhost:8000/deals?user_id=1&date_from=2026-03-16"
        print(f"Testing {url}...")
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("Response Length:", len(str(data)))
            # Print first few deals keys if available
            if isinstance(data, dict):
                print("Groups:", data.keys())
                for group in ['scheduled', 'unscheduled']:
                    items = data.get(group, [])
                    print(f" - {group}: {len(items)} items")
                    if items:
                        print(f"   First item keys: {items[0].keys()}")
            else:
                print("Unexpected response format (not a dict)")
        else:
            print("Error response:", response.text)
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_deals()
