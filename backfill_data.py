import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")

CITY_LAT = 28.7041
CITY_LON = 77.1025

def init_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_historical_pm25(start_date: datetime, end_date: datetime):
    """Fetch historical PM2.5 from OpenWeatherMap (Free Tier)"""
    start_unix = int(start_date.timestamp())
    end_unix = int(end_date.timestamp())
    
    url = f"http://api.openweathermap.org/data/2.5/air_pollution/history?lat={CITY_LAT}&lon={CITY_LON}&start={start_unix}&end={end_unix}&appid={OPENWEATHER_API_KEY}"
    response = requests.get(url)
    
    if response.status_code != 200:
        print("Failed to fetch PM2.5:", response.text)
        return pd.DataFrame()
        
    data = response.json().get("list", [])
    
    records = []
    for item in data:
        records.append({
            "timestamp": datetime.utcfromtimestamp(item["dt"]).isoformat() + "+00:00",
            "pm25": item["components"]["pm2_5"]
        })
        
    df = pd.DataFrame(records)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df

def fetch_historical_weather(start_date: datetime, end_date: datetime):
    """Fetch historical weather from Open-Meteo (100% Free, No API Key)"""
    # Open-Meteo requires YYYY-MM-DD
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={CITY_LAT}&longitude={CITY_LON}&start_date={start_str}&end_date={end_str}&hourly=temperature_2m,relative_humidity_2m"
    response = requests.get(url)
    
    if response.status_code != 200:
        print("Failed to fetch Weather:", response.text)
        return pd.DataFrame()
        
    data = response.json()
    hourly = data.get("hourly", {})
    
    df = pd.DataFrame({
        "timestamp": pd.to_datetime(hourly.get("time", [])),
        "temperature_c": hourly.get("temperature_2m", []),
        "humidity_percent": hourly.get("relative_humidity_2m", [])
    })
    # Add UTC timezone awareness to match Supabase TIMESTAMPTZ
    df['timestamp'] = df['timestamp'].dt.tz_localize('UTC')
    return df

def main():
    print("Starting Historical Data Backfill (Last 60 Days)...")
    supabase = init_supabase()
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=60)
    
    print("1. Fetching Historical PM2.5...")
    pm25_df = fetch_historical_pm25(start_date, end_date)
    
    print("2. Fetching Historical Weather...")
    weather_df = fetch_historical_weather(start_date, end_date)
    
    if pm25_df.empty or weather_df.empty:
        print("Failed to fetch necessary data. Aborting.")
        return
        
    print("3. Aligning Data...")
    # Merge on timestamp rounded to the nearest hour
    pm25_df['timestamp_hour'] = pm25_df['timestamp'].dt.floor('h')
    weather_df['timestamp_hour'] = weather_df['timestamp'].dt.floor('h')
    
    merged_df = pd.merge(weather_df, pm25_df, on='timestamp_hour', how='inner')
    
    # Prepare payload for Supabase
    records_to_insert = []
    for _, row in merged_df.iterrows():
        records_to_insert.append({
            "timestamp": row['timestamp_hour'].isoformat(),
            "temperature_c": row['temperature_c'],
            "humidity_percent": row['humidity_percent'],
            "pm25": row['pm25']
        })
    
    print(f"4. Inserting {len(records_to_insert)} rows into Supabase...")
    
    # Insert in batches of 500 to avoid request size limits
    batch_size = 500
    for i in range(0, len(records_to_insert), batch_size):
        batch = records_to_insert[i:i + batch_size]
        supabase.table("environmental_data").insert(batch).execute()
        print(f"Inserted batch {i//batch_size + 1}...")
        
    print("Backfill Complete!")

if __name__ == "__main__":
    main()
