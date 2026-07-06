import os
import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.multioutput import MultiOutputRegressor
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def init_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all_data(supabase: Client) -> pd.DataFrame:
    print("Fetching data from Supabase...")
    all_data = []
    limit = 1000
    offset = 0
    while True:
        response = supabase.table("environmental_data").select("*").order("timestamp").range(offset, offset + limit - 1).execute()
        data = response.data
        if not data:
            break
        all_data.extend(data)
        offset += limit
        
    df = pd.DataFrame(all_data)
    if not df.empty:
        df['timestamp'] = pd.to_datetime(df['timestamp'], format='ISO8601')
        df = df.sort_values('timestamp').reset_index(drop=True)
    return df

def prepare_features(df: pd.DataFrame):
    print("Engineering features for 24-hour multi-variable forecasting...")
    
    target_cols = []
    # Create 24 hours of targets for PM2.5, Temp, and Humidity
    for h in range(1, 25):
        pm_col = f'target_pm25_{h}h'
        temp_col = f'target_temp_{h}h'
        hum_col = f'target_hum_{h}h'
        
        df[pm_col] = df['pm25'].shift(-h)
        df[temp_col] = df['temperature_c'].shift(-h)
        df[hum_col] = df['humidity_percent'].shift(-h)
        
        target_cols.extend([pm_col, temp_col, hum_col])
    
    # Features: current state and past PM2.5 values
    df['pm25_lag1'] = df['pm25'].shift(1)
    df['pm25_lag24'] = df['pm25'].shift(24)
    
    # Drop rows with NaN (from shifts)
    df = df.dropna().reset_index(drop=True)
    return df, target_cols

def train_model(df: pd.DataFrame, target_cols: list):
    print("Training MultiOutputRegressor XGBoost...")
    features = ['temperature_c', 'humidity_percent', 'pm25', 'pm25_lag1', 'pm25_lag24']
    X = df[features]
    y = df[target_cols]
    
    # MultiOutputRegressor wraps XGBRegressor to predict multiple outputs (72 targets)
    base_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
    model = MultiOutputRegressor(base_model)
    
    model.fit(X, y)
    print("Training complete.")
    return model, features

def predict_next_24_hours(model, features_list, target_cols, latest_data: pd.Series, supabase: Client):
    print("Predicting Next 24 Hours...")
    
    X_pred = pd.DataFrame([latest_data[features_list].to_dict()])
    predictions = model.predict(X_pred)[0] # Array of 72 values
    
    # Map predictions back to columns
    pred_dict = dict(zip(target_cols, predictions))
    
    # Delete old predictions to keep the table clean (optional, but good for this use-case)
    try:
        # Simplest way to keep the table clean: delete all rows
        # In a real app we might just delete past rows or keep a history
        supabase.table("hourly_predictions").delete().neq('id', -1).execute()
    except Exception as e:
        print("Could not clean old predictions:", e)

    # Prepare batch insertion for Supabase
    records = []
    base_time = latest_data['timestamp']
    
    for h in range(1, 25):
        target_time = base_time + timedelta(hours=h)
        records.append({
            "target_timestamp": target_time.isoformat(),
            "predicted_pm25": float(pred_dict[f'target_pm25_{h}h']),
            "predicted_temp": float(pred_dict[f'target_temp_{h}h']),
            "predicted_humidity": float(pred_dict[f'target_hum_{h}h'])
        })
        
    try:
        supabase.table("hourly_predictions").insert(records).execute()
        print(f"Successfully saved 24-hour forecast to Supabase.")
    except Exception as e:
        print("Failed to save predictions:", e)

def main():
    print(f"[{datetime.now()}] Starting V2 ML Pipeline (24H Forecast)...")
    supabase = init_supabase()
    
    raw_data = fetch_all_data(supabase)
    if raw_data.empty or len(raw_data) < 48:
        print("Not enough data to train. Please run backfill_data.py")
        return
        
    df, target_cols = prepare_features(raw_data)
    model, features = train_model(df, target_cols)
    
    latest_row = raw_data.iloc[-1].copy()
    latest_row['pm25_lag1'] = raw_data.iloc[-2]['pm25'] if len(raw_data) > 1 else latest_row['pm25']
    latest_row['pm25_lag24'] = raw_data.iloc[-25]['pm25'] if len(raw_data) > 24 else latest_row['pm25']
    
    predict_next_24_hours(model, features, target_cols, latest_row, supabase)

if __name__ == "__main__":
    main()
