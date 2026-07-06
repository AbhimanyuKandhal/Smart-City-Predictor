import os
import requests
from datetime import datetime, timedelta
import math
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Keys & Endpoints
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

# Target City: Delhi
CITY_LAT = 28.7041
CITY_LON = 77.1025

def init_supabase() -> Client:
    """Initialize Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def extract_weather_data():
    """Fetch weather data from OpenWeatherMap."""
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={CITY_LAT}&lon={CITY_LON}&appid={OPENWEATHER_API_KEY}&units=metric"
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
    else:
        print(f"Error fetching weather: {response.text}")
        return None

def extract_air_quality_data():
    """Fetch PM2.5 and AQI data from OpenWeatherMap Air Pollution API."""
    url = f"http://api.openweathermap.org/data/2.5/air_pollution?lat={CITY_LAT}&lon={CITY_LON}&appid={OPENWEATHER_API_KEY}"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        # OpenWeather returns a list of data, we take the first item
        components = data["list"][0]["components"]
        return {
            "pm25": components["pm2_5"]
        }
    else:
        print(f"Error fetching air quality: {response.text}")
        return None

def load_to_supabase(supabase: Client, payload: dict):
    """Insert the combined data into Supabase."""
    try:
        data, count = supabase.table("environmental_data").insert(payload).execute()
        print(f"Successfully loaded data: {data}")
    except Exception as e:
        print(f"Failed to load data into Supabase: {e}")

def main():
    print(f"[{datetime.now()}] Starting ETL Pipeline for Delhi...")
    
    supabase = init_supabase()
    
    # Extract
    weather = extract_weather_data()
    aqi = extract_air_quality_data()
    
    if weather and aqi:
        current_time = datetime.utcnow()
        current_payload = {
            "timestamp": current_time.isoformat(),
            "temperature_c": weather["temperature_c"],
            "humidity_percent": weather["humidity_percent"],
            "pm25": aqi["pm25"],
            "wind_speed": weather["wind_speed"],
            "cloud_cover": weather["cloud_cover"],
            "is_raining": weather["is_raining"]
        }
        
        # --- Autonomous Backfilling Logic ---
        payloads_to_insert = []
        try:
            res = supabase.table("environmental_data").select("*").order("timestamp", desc=True).limit(1).execute()
            if res.data and len(res.data) > 0:
                last_record = res.data[0]
                last_time_str = last_record["timestamp"].replace("Z", "+00:00")
                last_time = datetime.fromisoformat(last_time_str).replace(tzinfo=None)
                
                diff_minutes = (current_time - last_time).total_seconds() / 60.0
                if diff_minutes > 45:
                    # Calculate how many 30-minute slots we missed
                    n_missing = int((diff_minutes - 15) // 30)
                    if n_missing > 0:
                        print(f"Detected {n_missing} missing intervals. Autonomous backfilling initiated...")
                        
                        # Linear interpolation for missing gaps
                        for i in range(1, n_missing + 1):
                            fraction = i / (n_missing + 1)
                            
                            interp_payload = {
                                "timestamp": (last_time + timedelta(minutes=30 * i)).isoformat(),
                                "temperature_c": round(last_record["temperature_c"] + (current_payload["temperature_c"] - last_record["temperature_c"]) * fraction, 2),
                                "humidity_percent": round(last_record["humidity_percent"] + (current_payload["humidity_percent"] - last_record["humidity_percent"]) * fraction, 1),
                                "pm25": round(last_record["pm25"] + (current_payload["pm25"] - last_record["pm25"]) * fraction, 2),
                                "wind_speed": round(last_record["wind_speed"] + (current_payload["wind_speed"] - last_record["wind_speed"]) * fraction, 2),
                                "cloud_cover": round(last_record["cloud_cover"] + (current_payload["cloud_cover"] - last_record["cloud_cover"]) * fraction, 1),
                                "is_raining": current_payload["is_raining"] if fraction > 0.5 else last_record["is_raining"]
                            }
                            payloads_to_insert.append(interp_payload)
        except Exception as e:
            print(f"Error during backfilling check: {e}")
            
        # Add current payload at the end
        payloads_to_insert.append(current_payload)
        
        # Load all (batch insert)
        load_to_supabase(supabase, payloads_to_insert)
    else:
        print("Failed to fetch all required data. ETL aborted.")

if __name__ == "__main__":
    main()
