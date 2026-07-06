import Dashboard from "@/components/Dashboard";
import { supabase } from "@/lib/supabase";

export const revalidate = 0; // Disable caching for real-time dashboard

export default async function Home() {
  // Fetch historical data (last 24 hours only for a cleaner chart focus)
  const { data: historicalData, error: historyError } = await supabase
    .from("environmental_data")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(48);

  // Fetch the 24-hour forecast
  const { data: predictions, error: predictionError } = await supabase
    .from("hourly_predictions")
    .select("*")
    .order("target_timestamp", { ascending: true });

  // Fetch the accuracy log
  const { data: accuracyData, error: accuracyError } = await supabase
    .from("model_accuracy")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(48);

  if (historyError || predictionError || accuracyError) {
    console.error("Database Error:", historyError || predictionError || accuracyError);
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-slate-800">
        <div className="p-8 bg-white shadow-xl rounded-2xl text-center border border-gray-200">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Connection Error</h2>
          <p className="text-slate-500">Could not connect to the database. Make sure your .env.local keys are correct.</p>
        </div>
      </div>
    );
  }

  // Reverse history so it goes chronologically
  const sortedHistory = (historicalData || []).reverse();

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Dashboard historicalData={sortedHistory} hourlyPredictions={predictions || []} accuracyData={(accuracyData || []).reverse()} />
    </main>
  );
}
