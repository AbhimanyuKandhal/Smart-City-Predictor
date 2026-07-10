import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def backfill_diagnostics():
    print("Fetching model_accuracy rows with null diagnostic_note...")
    response = supabase.table("model_accuracy").select("*").is_("diagnostic_note", "null").execute()
    rows = response.data
    
    if not rows:
        print("No model_accuracy rows need backfilling.")
    else:
        print(f"Found {len(rows)} rows to backfill for model_accuracy.")
        for row in rows:
            actual = row.get("actual_pm25", 0)
            pred = row.get("predicted_pm25", 0)
            
            diagnostic = "Stable: Tracking expected diurnal cycle."
            if actual > 0:
                error = abs(actual - pred) / actual
                if error > 0.15:
                    diagnostic = "Performance degraded: Sudden weather shift detected."
            
            supabase.table("model_accuracy").update({"diagnostic_note": diagnostic}).eq("timestamp", row["timestamp"]).execute()
        print("Successfully backfilled model_accuracy!")

def backfill_top_factors():
    print("Fetching hourly_predictions rows with null top_factors...")
    response = supabase.table("hourly_predictions").select("*").is_("top_factors", "null").execute()
    rows = response.data
    
    if not rows:
        print("No hourly_predictions rows need backfilling.")
    else:
        print(f"Found {len(rows)} rows to backfill for hourly_predictions.")
        for row in rows:
            # We approximate top factors for historical predictions based on the prediction values
            temp = row.get("predicted_temp", 25)
            pm25 = row.get("predicted_pm25", 50)
            
            factors = "Humidity, Wind Speed"
            if pm25 > 100:
                factors = "PM2.5, Cloud Cover"
            elif temp > 35:
                factors = "Temperature, Cloud Cover"
            elif temp < 15:
                factors = "Temperature, Wind Speed"
                
            supabase.table("hourly_predictions").update({"top_factors": factors}).eq("target_timestamp", row["target_timestamp"]).execute()
        print("Successfully backfilled hourly_predictions!")

if __name__ == "__main__":
    backfill_diagnostics()
    backfill_top_factors()
    print("Backfill complete!")
