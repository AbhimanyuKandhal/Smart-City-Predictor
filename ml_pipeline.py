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
    print("Engineering features for V3 48-step multi-variable forecasting...")
    
    # Handle missing columns if they don't exist yet in older data
    for col in ['wind_speed', 'cloud_cover']:
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = df[col].fillna(0.0)
            
    if 'is_raining' not in df.columns:
        df['is_raining'] = False
    else:
        df['is_raining'] = df['is_raining'].fillna(False).astype(bool)
    
    target_cols = []
    # Create 48 half-hours of targets (Next 24 hours at 30 min intervals)
    # We will interpolate the current 1-hour data if we don't have 30-min data yet
    steps = 48
    
    for h in range(1, steps + 1):
        pm_col = f'target_pm25_{h}'
        temp_col = f'target_temp_{h}'
        hum_col = f'target_hum_{h}'
        wind_col = f'target_wind_{h}'
        cloud_col = f'target_cloud_{h}'
        
        df[pm_col] = df['pm25'].shift(-h)
        df[temp_col] = df['temperature_c'].shift(-h)
        df[hum_col] = df['humidity_percent'].shift(-h)
        df[wind_col] = df['wind_speed'].shift(-h)
        df[cloud_col] = df['cloud_cover'].shift(-h)
        
        target_cols.extend([pm_col, temp_col, hum_col, wind_col, cloud_col])
    
    # Global Rain Prediction: Will it rain in any of the next 48 steps?
    # shift(-1) to look forward, rolling 48 to look at the next 48 rows, max() checks for any True.
    reversed_rain = df['is_raining'][::-1]
    df['will_rain_next_24h'] = reversed_rain.rolling(window=steps, min_periods=1).max()[::-1].shift(-1).fillna(False).astype(bool)
    
    # Features: current state
    df['pm25_lag1'] = df['pm25'].shift(1)
    df['pm25_lag24'] = df['pm25'].shift(48) # 48 steps = 24 hours
    
    # Drop rows with NaN (from shifts)
    df = df.dropna().reset_index(drop=True)
    return df, target_cols

def train_model(df: pd.DataFrame, target_cols: list):
    print("Training MultiOutputRegressor XGBoost & Rain Classifier...")
    features = ['temperature_c', 'humidity_percent', 'pm25', 'wind_speed', 'cloud_cover', 'pm25_lag1', 'pm25_lag24']
    X = df[features]
    
    # Train Main Regressor (Temp, Hum, PM25, Wind, Cloud)
    y_reg = df[target_cols]
    base_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
    reg_model = MultiOutputRegressor(base_model)
    reg_model.fit(X, y_reg)
    
    # Train Binary Classifier (Will it rain?)
    y_clf = df['will_rain_next_24h']
    clf_model = xgb.XGBClassifier(n_estimators=100, learning_rate=0.1, random_state=42, use_label_encoder=False, eval_metric='logloss')
    
    # Only train classifier if there is at least one instance of rain in the dataset (prevent XGBoost error on single class)
    if len(y_clf.unique()) > 1:
        clf_model.fit(X, y_clf)
    else:
        print("No rain instances found in training data. Classifier will default to False.")
        clf_model = None
        
    print("Training complete.")
    return reg_model, clf_model, features

def predict_next_24_hours(reg_model, clf_model, features_list, target_cols, latest_data: pd.Series, supabase: Client):
    print("Predicting Next 24 Hours (48 half-hour slots)...")
    
    X_pred = pd.DataFrame([latest_data[features_list].to_dict()])
    predictions = reg_model.predict(X_pred)[0] 
    
    if clf_model is not None:
        will_rain = bool(clf_model.predict(X_pred)[0])
    else:
        will_rain = False
    
    # Map predictions back to columns
    pred_dict = dict(zip(target_cols, predictions))
    
    try:
        supabase.table("hourly_predictions").delete().neq('id', -1).execute()
    except Exception as e:
        print("Could not clean old predictions:", e)

    records = []
    base_time = latest_data['timestamp']
    
    for h in range(1, 49):
        # 30-minute intervals
        target_time = base_time + timedelta(minutes=30 * h)
        records.append({
            "target_timestamp": target_time.isoformat(),
            "predicted_pm25": max(0, float(pred_dict[f'target_pm25_{h}'])),
            "predicted_temp": float(pred_dict[f'target_temp_{h}']),
            "predicted_humidity": max(0, min(100, float(pred_dict[f'target_hum_{h}']))),
            "predicted_wind_speed": max(0, float(pred_dict[f'target_wind_{h}'])),
            "predicted_cloud_cover": max(0, min(100, float(pred_dict[f'target_cloud_{h}']))),
            "will_rain_next_24h": will_rain
        })
        
    try:
        supabase.table("hourly_predictions").insert(records).execute()
        print(f"Successfully saved 48-step forecast to Supabase.")
    except Exception as e:
        print("Failed to save predictions:", e)

def backtest_model(reg_model, clf_model, features_list, target_cols, raw_data: pd.DataFrame, supabase: Client):
    print("Running backtest for the last 24 hours...")
    if len(raw_data) < 97:
        print("Not enough data for backtesting.")
        return
        
    backtest_row = raw_data.iloc[-49].copy()
    backtest_row['pm25_lag1'] = raw_data.iloc[-50]['pm25']
    backtest_row['pm25_lag24'] = raw_data.iloc[-97]['pm25']
    
    X_backtest = pd.DataFrame([backtest_row[features_list].to_dict()])
    predictions = reg_model.predict(X_backtest)[0]
    
    if clf_model is not None:
        will_rain = bool(clf_model.predict(X_backtest)[0])
    else:
        will_rain = False
        
    pred_dict = dict(zip(target_cols, predictions))
    actuals = raw_data.iloc[-48:]
    records = []
    
    for i in range(len(actuals)):
        h = i + 1
        actual_row = actuals.iloc[i]
        records.append({
            "timestamp": actual_row['timestamp'].isoformat(),
            "actual_temp": float(actual_row['temperature_c']),
            "predicted_temp": float(pred_dict[f'target_temp_{h}']),
            "actual_humidity": float(actual_row['humidity_percent']),
            "predicted_humidity": max(0, min(100, float(pred_dict[f'target_hum_{h}']))),
            "actual_pm25": float(actual_row['pm25']),
            "predicted_pm25": max(0, float(pred_dict[f'target_pm25_{h}'])),
            "actual_wind_speed": float(actual_row['wind_speed']),
            "predicted_wind_speed": max(0, float(pred_dict[f'target_wind_{h}'])),
            "actual_cloud_cover": float(actual_row['cloud_cover']),
            "predicted_cloud_cover": max(0, min(100, float(pred_dict[f'target_cloud_{h}']))),
            "actual_rain": bool(actual_row['is_raining']),
            "predicted_rain": will_rain
        })
        
    try:
        supabase.table("model_accuracy").upsert(records).execute()
        print("Successfully backtested and saved accuracy data to Supabase.")
    except Exception as e:
        print("Failed to save accuracy data:", e)

def main():
    print(f"[{datetime.now()}] Starting V3 ML Pipeline (48-Step Forecast + Rain)...")
    supabase = init_supabase()
    
    raw_data = fetch_all_data(supabase)
    if raw_data.empty or len(raw_data) < 100:
        print("Not enough data to train.")
        return
        
    df, target_cols = prepare_features(raw_data)
    reg_model, clf_model, features = train_model(df, target_cols)
    
    latest_row = raw_data.iloc[-1].copy()
    latest_row['pm25_lag1'] = raw_data.iloc[-2]['pm25'] if len(raw_data) > 1 else latest_row['pm25']
    latest_row['pm25_lag24'] = raw_data.iloc[-49]['pm25'] if len(raw_data) > 48 else latest_row['pm25']
    
    predict_next_24_hours(reg_model, clf_model, features, target_cols, latest_row, supabase)
    backtest_model(reg_model, clf_model, features, target_cols, raw_data, supabase)

if __name__ == "__main__":
    main()
