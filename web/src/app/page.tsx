import Dashboard from "@/components/Dashboard";
import { supabase } from "@/lib/supabase";

export const revalidate = 0; // Disable caching for real-time dashboard

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const location = typeof params.location === 'string' ? params.location : "Central Delhi";
  const dateStr = typeof params.date === 'string' ? params.date : null;

  let historyQuery = supabase.from("environmental_data").select("*").eq("location", location).order("timestamp", { ascending: false }).limit(24);
  let accuracyQuery = supabase.from("model_accuracy").select("*").eq("location", location).order("timestamp", { ascending: false }).limit(24);

  if (dateStr) {
    historyQuery = historyQuery.lte("timestamp", dateStr);
    accuracyQuery = accuracyQuery.lte("timestamp", dateStr);
  }

  const { data: historicalData, error: historyError } = await historyQuery;

  // Fetch the 24-hour forecast (note: only latest forecast is stored in DB)
  const { data: predictions, error: predictionError } = await supabase
    .from("hourly_predictions")
    .select("*")
    .eq("location", location)
    .order("target_timestamp", { ascending: true });

  const { data: accuracyData, error: accuracyError } = await accuracyQuery;

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
  const sortedAccuracy = (accuracyData || []).reverse();

  return (
    <main className="min-h-screen flex items-center justify-center p-0 md:p-4 bg-slate-50">
      <Dashboard 
        historicalData={sortedHistory} 
        hourlyPredictions={predictions || []} 
        accuracyData={sortedAccuracy} 
        currentLocation={location}
      />
    </main>
  );
}
