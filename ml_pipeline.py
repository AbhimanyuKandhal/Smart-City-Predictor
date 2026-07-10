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

def fetch_all_data(supabase: Client, location: str) -> pd.DataFrame:
    print(f"[{location}] Fetching data from Supabase...")
    all_data = []
    limit = 1000
    offset = 0
    while True:
        response = supabase.table("environmental_data").select("*").eq("location", location).order("timestamp").range(offset, offset + limit - 1).execute()
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
    print("Engineering features for 24-step (hourly) multi-variable forecasting...")
    
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
    steps = 24 # 24 hours at 1-hour intervals
    
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
    
    reversed_rain = df['is_raining'][::-1]
    df['will_rain_next_24h'] = reversed_rain.rolling(window=steps, min_periods=1).max()[::-1].shift(-1).fillna(False).astype(bool)
    
    df['pm25_lag1'] = df['pm25'].shift(1)
    df['pm25_lag24'] = df['pm25'].shift(24) # 24 steps = 24 hours
    
    df = df.dropna().reset_index(drop=True)
    return df, target_cols

def train_model(df: pd.DataFrame, target_cols: list):
    features = ['temperature_c', 'humidity_percent', 'pm25', 'wind_speed', 'cloud_cover', 'pm25_lag1', 'pm25_lag24']
    X = df[features]
    
    y_reg = df[target_cols]
    base_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
    reg_model = MultiOutputRegressor(base_model)
    reg_model.fit(X, y_reg)
    
    y_clf = df['will_rain_next_24h']
    clf_model = xgb.XGBClassifier(n_estimators=100, learning_rate=0.1, random_state=42, use_label_encoder=False, eval_metric='logloss')
    
    if len(y_clf.unique()) > 1:
        clf_model.fit(X, y_clf)
    else:
        clf_model = None
        
    return reg_model, clf_model, features

def get_top_factors(reg_model, features):
    # Explainability: Extract feature importances from the first estimator
    try:
        importances = reg_model.estimators_[0].feature_importances_
        feature_importance_dict = {features[i]: float(importances[i]) for i in range(len(features))}
        sorted_factors = sorted(feature_importance_dict.items(), key=lambda x: x[1], reverse=True)
        return [f[0] for f in sorted_factors[:3]] # Top 3 factors
    except Exception as e:
        print(f"Could not extract feature importances: {e}")
        return []

def predict_next_24_hours(reg_model, clf_model, features_list, target_cols, latest_data: pd.Series, supabase: Client, location: str):
    X_pred = pd.DataFrame([latest_data[features_list].to_dict()])
    predictions = reg_model.predict(X_pred)[0] 
    
    if clf_model is not None:
        will_rain = bool(clf_model.predict(X_pred)[0])
    else:
        will_rain = False
    
    pred_dict = dict(zip(target_cols, predictions))
    
    try:
        # Delete old predictions for THIS location
        supabase.table("hourly_predictions").delete().eq('location', location).execute()
    except Exception as e:
        print("Could not clean old predictions:", e)

    records = []
    base_time = latest_data['timestamp']
    top_factors = get_top_factors(reg_model, features_list)
    
    for h in range(1, 25):
        # 1-hour intervals
        target_time = base_time + timedelta(hours=1 * h)
        records.append({
            "target_timestamp": target_time.isoformat(),
            "location": location,
            "predicted_pm25": max(0, float(pred_dict[f'target_pm25_{h}'])),
            "predicted_temp": float(pred_dict[f'target_temp_{h}']),
            "predicted_humidity": max(0, min(100, float(pred_dict[f'target_hum_{h}']))),
            "predicted_wind_speed": max(0, float(pred_dict[f'target_wind_{h}'])),
            "predicted_cloud_cover": max(0, min(100, float(pred_dict[f'target_cloud_{h}']))),
            "will_rain_next_24h": will_rain,
            "top_factors": ", ".join(top_factors) # Add explainability factors
        })
        
    try:
        supabase.table("hourly_predictions").insert(records).execute()
        print(f"[{location}] Successfully saved 24-step forecast.")
    except Exception as e:
        print("Failed to save predictions:", e)

def backtest_model(reg_model, clf_model, features_list, target_cols, raw_data: pd.DataFrame, supabase: Client, location: str):
    if len(raw_data) < 49:
        print(f"[{location}] Not enough data for backtesting.")
        return
        
    backtest_row = raw_data.iloc[-25].copy()
    backtest_row['pm25_lag1'] = raw_data.iloc[-26]['pm25']
    backtest_row['pm25_lag24'] = raw_data.iloc[-49]['pm25']
    
    X_backtest = pd.DataFrame([backtest_row[features_list].to_dict()])
    predictions = reg_model.predict(X_backtest)[0]
    
    if clf_model is not None:
        will_rain = bool(clf_model.predict(X_backtest)[0])
    else:
        will_rain = False
        
    pred_dict = dict(zip(target_cols, predictions))
    actuals = raw_data.iloc[-24:]
    records = []
    
    for i in range(len(actuals)):
        h = i + 1
        actual_row = actuals.iloc[i]
        
        # Calculate Diagnostics (Root Cause of Errors)
        actual_t = float(actual_row['temperature_c'])
        pred_t = float(pred_dict[f'target_temp_{h}'])
        error_margin = abs(actual_t - pred_t)
        diagnostic = "Stable"
        if error_margin > 2.0:
            diagnostic = "High Error: Sudden weather shift detected"
            
        records.append({
            "timestamp": actual_row['timestamp'].isoformat(),
            "location": location,
            "actual_temp": actual_t,
            "predicted_temp": pred_t,
            "actual_humidity": float(actual_row['humidity_percent']),
            "predicted_humidity": max(0, min(100, float(pred_dict[f'target_hum_{h}']))),
            "actual_pm25": float(actual_row['pm25']),
            "predicted_pm25": max(0, float(pred_dict[f'target_pm25_{h}'])),
            "actual_wind_speed": float(actual_row['wind_speed']),
            "predicted_wind_speed": max(0, float(pred_dict[f'target_wind_{h}'])),
            "actual_cloud_cover": float(actual_row['cloud_cover']),
            "predicted_cloud_cover": max(0, min(100, float(pred_dict[f'target_cloud_{h}']))),
            "actual_rain": bool(actual_row['is_raining']),
            "predicted_rain": will_rain,
            "diagnostic_note": diagnostic # Added diagnostic column
        })
        
    try:
        supabase.table("model_accuracy").upsert(records).execute()
        print(f"[{location}] Successfully backtested and saved accuracy data.")
    except Exception as e:
        print(f"[{location}] Failed to save accuracy data:", e)

def process_location(supabase, location):
    print(f"\n--- Processing ML Pipeline for {location} ---")
    raw_data = fetch_all_data(supabase, location)
    if raw_data.empty or len(raw_data) < 50:
        print(f"[{location}] Not enough data to train. Skipping.")
        return
        
    df, target_cols = prepare_features(raw_data)
    if df.empty:
        print(f"[{location}] Insufficient data after feature engineering.")
        return
        
    reg_model, clf_model, features = train_model(df, target_cols)
    
    latest_row = raw_data.iloc[-1].copy()
    latest_row['pm25_lag1'] = raw_data.iloc[-2]['pm25'] if len(raw_data) > 1 else latest_row['pm25']
    latest_row['pm25_lag24'] = raw_data.iloc[-25]['pm25'] if len(raw_data) > 24 else latest_row['pm25']
    
    predict_next_24_hours(reg_model, clf_model, features, target_cols, latest_row, supabase, location)
    backtest_model(reg_model, clf_model, features, target_cols, raw_data, supabase, location)

def main():
    print(f"[{datetime.now()}] Starting Multi-Zone V2.0 ML Pipeline...")
    supabase = init_supabase()
    
    locations = ["Central Delhi", "Dwarka", "Rohini", "Dabri Mor", "Model Town"]
    for loc in locations:
        process_location(supabase, loc)

if __name__ == "__main__":
    main()
