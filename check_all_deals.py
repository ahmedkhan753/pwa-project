import requests
import json

def check_raw_deals():
    url = "http://localhost:8000/deals" # Generic fetch
    print(f"Checking {url}...")
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Total in Bitrix: {data.get('total_in_bitrix', 'N/A')}")
        if data.get('scheduled') or data.get('unscheduled'):
            print("SUCCESS: Found deals!")
            print(f"Scheduled: {len(data['scheduled'])}")
            print(f"Unscheduled: {len(data['unscheduled'])}")
            all_items = data['scheduled'] + data['unscheduled']
            user_ids = set()
            for item in all_items:
                # Based on transform_from_bitrix, appraiser_mobile might be the key
                uid = item.get('appraiser_mobile')
                if uid: user_ids.add(uid)
            print(f"Appraiser IDs in data: {user_ids}")
        else:
            print("WARNING: No deals found even in generic fetch.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_raw_deals()
