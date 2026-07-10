# 🌍 Smart City Intelligence Platform V2.0

![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)
![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![XGBoost](https://img.shields.io/badge/XGBoost-1.7-green?logo=xgboost)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)

**Smart City Intelligence Platform is a real-time environmental intelligence system that predicts weather conditions across five regions of Delhi, explains the reasoning behind each prediction, continuously evaluates its own performance, and automatically retrains itself when prediction quality degrades.**

It actively ingests environmental telemetry, trains specialized AI models on-the-fly, and presents the intelligence on a frosted-glass interactive dashboard.

---

## 📊 Key Performance Indicators & Features

The frontend is built in React / Next.js and visualizes intelligence via strategic KPIs:

- **Sustainability Score (0-100):** A custom composite metric designed to evaluate the city's real-time climate health. 
  *Formula:* `Base Score (100) - (PM2.5 Excess Penalty) - (Extreme Heat/Cold Penalty)`. It heavily penalizes the city for extreme PM2.5 pollution levels and extreme temperature anomalies (urban heat islands). A high score indicates a clean, thermally balanced environment.
- **Explainability Engine (AI Insights):** Rather than just presenting raw numbers, the platform outputs natural intelligence. By analyzing which nodes split the most during training, the AI determines the exact "Top Driving Factors" for the current forecast and outputs readable insights like: 
  > *"Current wind patterns are effectively dispersing airborne particulates."*
- **Model Accuracy Ring:** A dynamic SVG ring that plots the exact percentage of accuracy achieved by the AI during its most recent 24-hour backtest.
- **Time Travel:** Because we store the complete lineage of historical actuals and AI predictions, the dashboard URL accepts a `?date=` parameter, allowing users to scroll back in time and view the exact state of the intelligence platform before past weather events occurred.

---

## 🏗 System Architecture

The platform operates autonomously through a decoupled architecture spanning data ingestion (ETL), predictive modeling (ML), and real-time visualization (Web). I designed this system to prioritize continuous feedback loops, strict separation of concerns, and high resilience.

```mermaid
graph TD
    subgraph Data Sources
        OW[OpenWeather API]
        OA[OpenAQ API]
    end

    subgraph ETL Pipeline / GitHub Actions
        P1[fetch_data.py]
        OW --> P1
        OA --> P1
    end

    subgraph Database
        S[(Supabase PostgreSQL)]
    end

    subgraph ML Pipeline / GitHub Actions
        M1[ml_pipeline.py]
        XGB[5x XGBoost Regressors]
        SHAP[Explainability Engine]
        DIAG[Automated Model Recalibration]
    end

    subgraph Frontend Client
        NEXT[Next.js App Router]
        DASH[Dashboard UI]
    end

    P1 -- Ingests hourly telemetry --> S
    S -- Historical Data --> M1
    M1 -- Trains & Predicts --> XGB
    XGB -- Extracts Top Factors --> SHAP
    XGB -- Backtests Accuracy --> DIAG
    XGB -- 24-Hour Forecast --> S
    SHAP -- AI Insights --> S
    DIAG -- Health Status --> S
    S -- Real-time stream --> NEXT
    NEXT -- Server-side render --> DASH
```

### 1. Data Ingestion (ETL)
Every hour, a GitHub Action triggers the ETL pipeline. It queries OpenWeather and OpenAQ for current meteorological and air quality metrics across 5 specific zones (e.g., Central Delhi, Dwarka, Rohini). This forms our foundational `environmental_data` table.

### 2. Machine Learning Engine
Following the ETL pipeline, the `ml_pipeline.py` script executes. It does **not** rely on a pre-trained, stale model. Instead, it:
1. Pulls the latest historical data from Supabase.
2. Resamples the data into strict 1-hour temporal blocks to normalize API intervals.
3. Trains **five distinct XGBoost MultiOutputRegressors**, one tailored to the specific micro-climate of each zone.
4. Predicts weather conditions 24 hours into the future.

#### Why XGBoost?
I selected XGBoost over Deep Learning models (like LSTMs) because:
- **Tabular Superiority:** Gradient boosted trees notoriously outperform neural networks on small-to-medium tabular datasets.
- **Explainability:** Tree feature importances provide lightweight global explanations, avoiding the computational overhead of generating SHAP values during every retraining cycle.
- **Speed:** The entire pipeline (fetching, training 5 models, forecasting, and backtesting) executes in under 20 seconds on a standard GitHub Action runner.

### 3. Automated Model Recalibration (Continuous Adaptation)
Machine learning models drift. To combat this, I designed the pipeline to perform an autonomous **Backtest** every hour to verify if the prediction is still good.
1. It looks at the prediction it made 24 hours ago for the *current* timestamp.
2. It compares that prediction to the *actual* telemetry we just received from the API.
3. If the error margin exceeds a safe threshold (e.g., a sudden unexpected weather shift), the system logs an anomaly status and automatically **recalibrates** by training fresh trees on the newly mutated data patterns.

```mermaid
sequenceDiagram
    participant API as Telemetry API
    participant ML as XGBoost Model
    participant DB as Supabase
    participant UI as Dashboard

    API->>DB: Ingest Real-time Actuals
    ML->>DB: Fetch Actuals + Past Predictions
    ML->>ML: Compare Actuals to Past Predictions
    alt Error > Threshold
        ML->>DB: Log "Performance Degraded: Recalibrating"
        ML->>ML: Train fresh model on new shifted patterns
    else Error < Threshold
        ML->>DB: Log "Stable"
    end
    ML->>DB: Predict next 24 hours
    DB->>UI: Serve Intelligence
```

---

## 🚧 Engineering Challenges

### API Interval Drift
OpenWeather and OpenAQ do not always return observations at perfectly regular intervals, leading to misaligned timestamps.
**Solution:** Resampled all telemetry into strict hourly windows (`resample('1h').mean().interpolate()`) before training to normalize row-shifts and ensure temporal accuracy.

### Data Sparsity
Certain environmental metrics (like cloud cover or PM2.5 from specific stations) occasionally disappear from the API payloads.
**Solution:** Implemented linear interpolation and robust default fallbacks before feature engineering, preventing catastrophic training failures during sensor downtime.

### Cold Start
Early versions lacked sufficient historical context to train an accurate 24-hour forecaster.
**Solution:** Designed the automated retraining pipeline to continuously adapt and improve forecasting quality automatically as additional telemetry accumulates in the database over time.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase Project

### Environment Variables
Create a `.env.local` in the `/web` folder and a `.env` in the root folder:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
OPENWEATHER_API_KEY=your_openweather_key
OPENAQ_API_KEY=your_openaq_key
```

### Run Locally
**Frontend:**
```bash
cd web
npm install
npm run dev
```

**Manual Pipeline Trigger:**
```bash
pip install -r requirements.txt
python3 fetch_data.py
python3 ml_pipeline.py
```
