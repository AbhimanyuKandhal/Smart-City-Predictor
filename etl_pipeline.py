import os
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

# Zones for V2.0 Smart City Intelligence
LOCATIONS = {
    "Central Delhi": {"lat": 28.6139, "lon": 77.2090},
    "Dwarka": {"lat": 28.5921, "lon": 77.0460},
    "Rohini": {"lat": 28.7383, "lon": 77.0822},
    "Dabri Mor": {"lat": 28.6080, "lon": 77.0833},
    "Model Town": {"lat": 28.7159, "lon": 77.1908}
}

def init_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def extract_weather_data(lat, lon):
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units=metric"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        return {
            "temperature_c": data["main"]["temp"],
            "humidity_percent": data["main"]["humidity"],
            "wind_speed": data.get("wind", {}).get("speed", 0),
            "cloud_cover": data.get("clouds", {}).get("all", 0),
            "is_raining": "rain" in data or data.get("weather", [{}])[0].get("main") == "Rain"
        }
    print(f"Error fetching weather for lat/lon {lat}/{lon}: {response.text}")
    return None

def extract_air_quality_data(lat, lon):
    url = f"http://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        return {"pm25": data["list"][0]["components"]["pm2_5"]}
    print(f"Error fetching AQI for lat/lon {lat}/{lon}: {response.text}")
    return None

def load_to_supabase(supabase: Client, payloads: list):
    if not payloads: return
    try:
        supabase.table("environmental_data").insert(payloads).execute()
        print(f"Successfully loaded {len(payloads)} records.")
    except Exception as e:
        print(f"Failed to load data into Supabase: {e}")

def process_location(supabase, loc_name, coords):
    print(f"\n[{datetime.now()}] Processing zone: {loc_name}...")
    weather = extract_weather_data(coords["lat"], coords["lon"])
    aqi = extract_air_quality_data(coords["lat"], coords["lon"])
    
    if not weather or not aqi:
        print(f"Failed to fetch data for {loc_name}. Skipping.")
        return

    current_time = datetime.utcnow()
    current_payload = {
        "timestamp": current_time.isoformat(),
        "location": loc_name,
        "temperature_c": weather["temperature_c"],
        "humidity_percent": weather["humidity_percent"],
        "pm25": aqi["pm25"],
        "wind_speed": weather["wind_speed"],
        "cloud_cover": weather["cloud_cover"],
        "is_raining": weather["is_raining"]
    }
    
    payloads_to_insert = []
    try:
        # Check last record for THIS specific location
        res = supabase.table("environmental_data").select("*").eq("location", loc_name).order("timestamp", desc=True).limit(1).execute()
        if res.data and len(res.data) > 0:
            last_record = res.data[0]
            last_time_str = last_record["timestamp"].replace("Z", "+00:00")
            last_time = datetime.fromisoformat(last_time_str).replace(tzinfo=None)
            
            diff_minutes = (current_time - last_time).total_seconds() / 60.0
            
            # Since cron is now hourly, a gap of > 90 mins means missed hourly slots
            if diff_minutes > 90:
                n_missing = int((diff_minutes - 30) // 60)
                if n_missing > 0:
                    print(f"[{loc_name}] Detected {n_missing} missing hourly intervals. Backfilling...")
                    for i in range(1, n_missing + 1):
                        fraction = i / (n_missing + 1)
                        interp_payload = {
                            "timestamp": (last_time + timedelta(hours=1 * i)).isoformat(),
                            "location": loc_name,
                            "temperature_c": round(last_record["temperature_c"] + (current_payload["temperature_c"] - last_record["temperature_c"]) * fraction, 2),
                            "humidity_percent": round(last_record["humidity_percent"] + (current_payload["humidity_percent"] - last_record["humidity_percent"]) * fraction, 1),
                            "pm25": round(last_record["pm25"] + (current_payload["pm25"] - last_record["pm25"]) * fraction, 2),
                            "wind_speed": round(last_record["wind_speed"] + (current_payload["wind_speed"] - last_record["wind_speed"]) * fraction, 2),
                            "cloud_cover": round(last_record["cloud_cover"] + (current_payload["cloud_cover"] - last_record["cloud_cover"]) * fraction, 1),
                            "is_raining": current_payload["is_raining"] if fraction > 0.5 else last_record["is_raining"]
                        }
                        payloads_to_insert.append(interp_payload)
    except Exception as e:
        print(f"Error during backfilling check for {loc_name}: {e}")
        
    payloads_to_insert.append(current_payload)
    load_to_supabase(supabase, payloads_to_insert)

def main():
    print(f"[{datetime.now()}] Starting Multi-Zone ETL Pipeline...")
    supabase = init_supabase()
    
    for loc_name, coords in LOCATIONS.items():
        process_location(supabase, loc_name, coords)

if __name__ == "__main__":
    main()
