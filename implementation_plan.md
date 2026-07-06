# Smart City Air Quality, Weather & Traffic Predictor (Cloud Architecture)

This document outlines the end-to-end architecture for building a Smart City predictive pipeline. It will run **24/7 completely free of charge**, load instantly without "sleeping", and feature a self-correcting ML feedback loop designed to be robust against random anomalies.

## Architecture & Tech Stack (100% Free Tier, No Sleeping)

To solve the Streamlit "spin-down" issue, we separate the heavy ML processing from the web display. We compute the predictions in the background and store them, so the web interface just has to load data, which is instantaneous.

*   **Orchestration (ETL & ML):** GitHub Actions.
*   **Database:** Supabase (Free-tier PostgreSQL).
*   **Machine Learning (Self-Correcting):** Python with `xgboost`, executed via GitHub Actions.
*   **Web App (Frontend):** Next.js (React).
*   **Hosting:** Vercel (Serverless, instant loading, completely free).

## User Review Required

> [!IMPORTANT]
> **Free Account Registrations Required:** 
> 1.  **Supabase:** For the PostgreSQL database.
> 2.  **GitHub:** To host the code and run the automated pipelines.
> 3.  **Vercel:** To host the Next.js web interface.
> 4.  **Data APIs:** OpenWeatherMap, OpenAQ, and TomTom.

## Open Questions

> [!WARNING]
> 1. **Target City:** Which specific city would you like to build this model for? 
> 2. **Repository:** Are you comfortable creating a new GitHub repository for this project?

## Implementation Pathway

### Phase 1: Database Setup (Supabase)
*   We will define the tables in Supabase:
    *   `environmental_data`: Raw weather, traffic, and air quality data.
    *   `model_predictions`: What the model predicted.
    *   `model_performance`: The error calculation (Actual vs Predicted).

### Phase 2: Data Extraction & Loading (The ETL Pipeline)
*   I will write `etl_pipeline.py`.
*   This script will fetch data from the APIs, transform it, and insert it into Supabase hourly via a GitHub Action.

### Phase 3: The Self-Correcting ML Pipeline & Outlier Mitigation
To ensure the model doesn't overreact to random "lucky" or freak events (e.g., a one-off traffic accident or nearby fire), we implement a robust feedback loop:

*   **Prediction Generation:** Every night, an ML script predicts tomorrow's PM2.5 levels.
*   **The Feedback Loop:** When actual data arrives, we calculate the error (Residual).
*   **Outlier Mitigation & Smoothing (NEW):** 
    1.  Instead of blindly reacting to a single day's error, we calculate a **7-Day Rolling Average Error**. This smooths out random anomalies. If the model was wrong yesterday by pure chance, the 7-day average barely moves. If the model is *consistently* biased, the rolling average will reflect that.
    2.  **Outlier Clipping:** We will add a function that checks if an error is > 3 standard deviations from normal. If it is an extreme anomaly, we ignore it so it doesn't corrupt future training.
*   **Automated Retraining:** A GitHub Action will retrain the XGBoost model weekly. Because XGBoost is an ensemble tree model training on hundreds of historical rows, a single day of random noise will naturally be ignored by the algorithm in favor of persistent, statistically significant patterns.

### Phase 4: Next.js Web App on Vercel
*   Build a fast web dashboard using Next.js and Tailwind CSS.
*   Fetch the latest actuals, predictions, and model accuracy directly from Supabase.
*   Deploy to Vercel for instant loading.

## Verification Plan

### Automated Checks
*   **GitHub Actions Logs:** Monitor the Actions tab.
*   **Data Integrity:** Verify the `model_performance` table correctly logs the delta.

### Manual Verification
*   Check the dashboard to see the model's self-correction metrics and ensure extreme anomalies aren't skewing predictions.
