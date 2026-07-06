import os
import requests
from datetime import datetime
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
        # Transform (Combine data)
        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "temperature_c": weather["temperature_c"],
            "humidity_percent": weather["humidity_percent"],
            "pm25": aqi["pm25"],
            "wind_speed": weather["wind_speed"],
            "cloud_cover": weather["cloud_cover"],
            "is_raining": weather["is_raining"]
        }
        
        # Load
        load_to_supabase(supabase, payload)
    else:
        print("Failed to fetch all required data. ETL aborted.")

if __name__ == "__main__":
    main()
