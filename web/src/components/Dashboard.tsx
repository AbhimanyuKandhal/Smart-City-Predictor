"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Droplets, Thermometer, Wind, Activity, ArrowUp, ArrowDown, Cloud, Umbrella, MapPin, Brain, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface EnvData {
  timestamp: string;
  temperature_c: number;
  humidity_percent: number;
  pm25: number;
  wind_speed?: number;
  cloud_cover?: number;
  is_raining?: boolean;
}

interface PredictionData {
  target_timestamp: string;
  predicted_pm25: number;
  predicted_temp: number;
  predicted_humidity: number;
  predicted_wind_speed?: number;
  predicted_cloud_cover?: number;
  will_rain_next_24h?: boolean;
  top_factors?: string;
}

const ZONES = [
  "Central Delhi",
  "Dwarka",
  "Rohini",
  "Dabri Mor",
  "Model Town"
];

export default function Dashboard({ 
  historicalData, 
  hourlyPredictions,
  accuracyData = [],
  currentLocation = "Central Delhi"
}: { 
  historicalData: EnvData[], 
  hourlyPredictions: PredictionData[],
  accuracyData?: any[],
  currentLocation?: string
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const latestData = historicalData[historicalData.length - 1];
  const [activeMetric, setActiveMetric] = useState<'pm25'|'temp'|'humidity'|'wind'|'clouds'>('pm25');

  const handleLocationChange = (loc: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('location', loc);
    router.push(`/?${params.toString()}`);
  };

  // Determine dynamic theme and background image based on latest weather
  const temp = latestData?.temperature_c || 25;
  const humidity = latestData?.humidity_percent || 50;
  const aqi = latestData?.pm25 || 20;
  const isRaining = latestData?.is_raining || false;
  const cloudCover = latestData?.cloud_cover || 0;
  
  const currentDateParam = searchParams.get('date') || '';
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set('date', e.target.value + 'T23:59:59');
    } else {
      params.delete('date');
    }
    router.push(`/?${params.toString()}`);
  };

  const calculateSustainability = (pm25: number, temp: number) => {
    let score = 100;
    if (pm25 > 50) score -= (pm25 - 50) * 0.5;
    if (temp > 35) score -= (temp - 35) * 2;
    if (temp < 10) score -= (10 - temp) * 2;
    return Math.max(0, Math.min(100, Math.round(score)));
  };
  const sustainabilityScore = calculateSustainability(aqi, temp);
  const getSustainabilityColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  };
  
  const currentHour = latestData ? new Date(latestData.timestamp).getHours() : 12;
  const isNight = currentHour >= 19 || currentHour <= 5;
  
  let themeClass = "bg-gradient-to-br from-blue-50 to-slate-100 text-slate-900"; 
  let cardClass = "bg-white/60 backdrop-blur-xl border border-slate-200 shadow-xl";
  let bgImage = "/sun.png";

  if (isRaining || (humidity > 85 && cloudCover > 80)) {
    themeClass = "bg-gradient-to-br from-slate-200 via-blue-100 to-indigo-100 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-blue-300 shadow-xl";
    bgImage = "/rain.png";
  } else if (cloudCover > 70) {
    themeClass = "bg-gradient-to-br from-slate-300 via-slate-200 to-slate-100 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-slate-300 shadow-xl";
    bgImage = "/cloud.png";
  } else if (aqi > 150) {
    themeClass = "bg-gradient-to-br from-stone-200 via-yellow-100 to-orange-100 text-stone-900";
    cardClass = "bg-white/50 backdrop-blur-xl border border-yellow-300 shadow-xl";
    bgImage = "/smog.png";
  } else if (temp < 5) {
    themeClass = "bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-cyan-200 shadow-xl";
    bgImage = "/snow.png";
  } else if (isNight) {
    themeClass = "bg-gradient-to-br from-indigo-200 via-blue-200 to-slate-300 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-indigo-300 shadow-xl";
    bgImage = "/moon.png";
  } else if (temp > 35) {
    themeClass = "bg-gradient-to-br from-amber-100 via-orange-100 to-red-100 text-amber-950";
    cardClass = "bg-white/60 backdrop-blur-xl border border-orange-300 shadow-xl";
    bgImage = "/sun.png";
  } else if (temp > 25 && humidity < 50) {
    themeClass = "bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 text-amber-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-amber-200 shadow-xl";
    bgImage = "/sun.png";
  }

  const chartData: any[] = historicalData.map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    actual_pm25: d.pm25,
    actual_temp: d.temperature_c,
    actual_humidity: d.humidity_percent,
    actual_wind: d.wind_speed || 0,
    actual_clouds: d.cloud_cover || 0,
  }));

  hourlyPredictions.forEach(p => {
    chartData.push({
      time: new Date(p.target_timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      predicted_pm25: p.predicted_pm25,
      predicted_temp: p.predicted_temp,
      predicted_humidity: p.predicted_humidity,
      predicted_wind: p.predicted_wind_speed || 0,
      predicted_clouds: p.predicted_cloud_cover || 0,
    });
  });

  const accuracyChartData = accuracyData.map(d => ({
    time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    actual_pm25: d.actual_pm25,
    predicted_pm25: d.predicted_pm25,
    actual_temp: d.actual_temp,
    predicted_temp: d.predicted_temp,
    actual_humidity: d.actual_humidity,
    predicted_humidity: d.predicted_humidity,
    actual_wind: d.actual_wind_speed,
    predicted_wind: d.predicted_wind_speed,
    actual_clouds: d.actual_cloud_cover,
    predicted_clouds: d.predicted_cloud_cover,
    diagnostic: d.diagnostic_note
  }));

  let totalError = 0;
  let count = 0;
  
  accuracyChartData.forEach(d => {
    let actual = 0, pred = 0;
    if (activeMetric === 'pm25') { actual = d.actual_pm25; pred = d.predicted_pm25; }
    else if (activeMetric === 'temp') { actual = d.actual_temp; pred = d.predicted_temp; }
    else if (activeMetric === 'humidity') { actual = d.actual_humidity; pred = d.predicted_humidity; }
    else if (activeMetric === 'wind') { actual = d.actual_wind; pred = d.predicted_wind; }
    else if (activeMetric === 'clouds') { actual = d.actual_clouds; pred = d.predicted_clouds; }

    if (actual > 0) {
      const err = Math.abs(actual - pred) / actual;
      totalError += Math.min(err, 1);
      count++;
    } else if (actual === 0 && pred > 0) {
      totalError += 1;
      count++;
    } else {
      count++;
    }
  });

  const accuracyPercent = count > 0 ? Math.round((1 - (totalError / count)) * 100) : 100;
  const getMetricColor = () => {
    if (activeMetric === 'pm25') return '#7c3aed';
    if (activeMetric === 'temp') return '#ea580c';
    if (activeMetric === 'humidity') return '#0284c7';
    if (activeMetric === 'wind') return '#0d9488';
    return '#475569';
  };

  const calculateAQI = (pm25: number) => {
    // US EPA standard conversion from PM2.5 to AQI
    if (pm25 <= 12.0) return Math.round((50 - 0) / (12.0 - 0) * (pm25 - 0) + 0);
    if (pm25 <= 35.4) return Math.round((100 - 51) / (35.4 - 12.1) * (pm25 - 12.1) + 51);
    if (pm25 <= 55.4) return Math.round((150 - 101) / (55.4 - 35.5) * (pm25 - 35.5) + 101);
    if (pm25 <= 150.4) return Math.round((200 - 151) / (150.4 - 55.5) * (pm25 - 55.5) + 151);
    if (pm25 <= 250.4) return Math.round((300 - 201) / (250.4 - 150.5) * (pm25 - 150.5) + 201);
    if (pm25 <= 350.4) return Math.round((400 - 301) / (350.4 - 250.5) * (pm25 - 250.5) + 301);
    if (pm25 <= 500.4) return Math.round((500 - 401) / (500.4 - 350.5) * (pm25 - 350.5) + 401);
    return 500; // Max out at 500
  };

  const getAQIStatus = (pm25: number) => {
    const aqiNum = calculateAQI(pm25);
    if (aqiNum <= 50) return { num: aqiNum, text: "Good", color: "text-emerald-600", dot: "bg-emerald-500" };
    if (aqiNum <= 100) return { num: aqiNum, text: "Moderate", color: "text-amber-600", dot: "bg-amber-500" };
    if (aqiNum <= 150) return { num: aqiNum, text: "Unhealthy for Sensitive", color: "text-orange-600", dot: "bg-orange-500" };
    if (aqiNum <= 200) return { num: aqiNum, text: "Unhealthy", color: "text-red-600", dot: "bg-red-500" };
    if (aqiNum <= 300) return { num: aqiNum, text: "Very Unhealthy", color: "text-purple-600", dot: "bg-purple-500" };
    return { num: aqiNum, text: "Hazardous", color: "text-rose-900", dot: "bg-rose-900" };
  };

  const status = getAQIStatus(latestData?.pm25 || 0);
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const maxTempObj = hourlyPredictions.length > 0 ? hourlyPredictions.reduce((max, p) => p.predicted_temp > max.predicted_temp ? p : max, hourlyPredictions[0]) : null;
  const minTempObj = hourlyPredictions.length > 0 ? hourlyPredictions.reduce((min, p) => p.predicted_temp < min.predicted_temp ? p : min, hourlyPredictions[0]) : null;
  
  const willRain = hourlyPredictions.length > 0 ? hourlyPredictions[0].will_rain_next_24h : false;
  const topFactors = (hourlyPredictions.length > 0 && hourlyPredictions[0].top_factors) ? hourlyPredictions[0].top_factors : "N/A";
  const latestDiagnostic = (accuracyChartData.length > 0 && accuracyChartData[accuracyChartData.length - 1].diagnostic) ? accuracyChartData[accuracyChartData.length - 1].diagnostic : "Stable";

  const generateLiveIntelligence = (factors: string) => {
    if (factors === "N/A") return "Awaiting latest neural network convergence data.";
    const fList = factors.split(', ');
    let text = `The primary driving factors for the current microclimate in ${currentLocation} are ${fList.join(' and ')}. `;
    if (aqi > 100) text += "Elevated PM2.5 levels are creating a localized heat-trap effect. ";
    else if (fList.includes('Wind Speed') || fList.includes('Wind')) text += "Current wind patterns are effectively dispersing airborne particulates. ";
    if (temp > 35) text += "Thermal anomaly detected; urban heat island effect is peaking.";
    return text;
  };
  const liveIntelligence = generateLiveIntelligence(topFactors);
  
  const generateRecoveryStrategy = (diagnostic: string) => {
    if (!diagnostic.includes("Error") && !diagnostic.includes("degraded")) return "All systems nominal. Neural network tracking reality accurately.";
    return "Anomaly detected. The system has automatically triggered a self-healing recalibration sequence on the latest API telemetry streams to minimize future forecasting error.";
  };
  const recoveryStrategy = generateRecoveryStrategy(latestDiagnostic);

  return (
    <div className={`relative min-h-screen w-full transition-colors duration-1000 overflow-hidden pb-12 ${themeClass}`}>
      <div className="absolute -top-16 -left-16 pointer-events-none opacity-50 z-0 mix-blend-multiply [mask-image:radial-gradient(circle_at_center,black_30%,transparent_65%)] [-webkit-mask-image:radial-gradient(circle_at_center,black_30%,transparent_65%)]">
        <img src={bgImage} alt="Weather" className="w-[500px] h-[500px] object-contain" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto space-y-6 p-4 md:p-8">
        
        {/* Header and Zone Selector */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8"
        >
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Smart City Intelligence</h1>
            <p className="opacity-70 font-medium text-lg flex items-center">
              Next-Gen Autonomous V2.0 Platform
              <span className="ml-4 px-2 py-1 text-xs bg-black/10 rounded-lg flex items-center gap-2">
                Time Travel:
                <input 
                  type="date" 
                  value={currentDateParam ? currentDateParam.split('T')[0] : ''} 
                  onChange={handleDateChange}
                  className="bg-transparent font-bold outline-none cursor-pointer"
                />
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ZONES.map(zone => (
              <button
                key={zone}
                onClick={() => handleLocationChange(zone)}
                className={`px-4 py-2 rounded-full font-bold text-sm transition-all flex items-center shadow-sm ${
                  currentLocation === zone 
                    ? "bg-slate-900 text-white shadow-lg scale-105" 
                    : "bg-white/70 hover:bg-white text-slate-600 backdrop-blur-md"
                }`}
              >
                {currentLocation === zone && <MapPin className="w-4 h-4 mr-2" />}
                {zone}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Intelligence / Context Bar */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-4"
        >
          <div className={`flex items-center px-5 py-2.5 rounded-full ${cardClass}`}>
            <div className={`w-3 h-3 rounded-full animate-pulse mr-3 ${status.dot}`} />
            <span className={`font-bold uppercase tracking-wider ${status.color}`}>AQI {status.num}: {status.text}</span>
          </div>

          {willRain !== undefined && (
             <div className={`flex items-center px-5 py-2.5 rounded-full ${cardClass}`}>
               <Umbrella className={`w-4 h-4 mr-2 ${willRain ? 'text-blue-600' : 'text-slate-400'}`} />
               <span className={`font-bold uppercase tracking-wider ${willRain ? 'text-blue-600' : 'text-slate-500'}`}>
                  Rain Expected: {willRain ? 'YES' : 'NO'}
               </span>
             </div>
          )}

          {maxTempObj && minTempObj && (
            <div className={`flex items-center px-4 py-2 rounded-full ${cardClass}`}>
              <Thermometer className="w-4 h-4 mr-2 text-orange-600" />
              <div className="flex items-center text-red-600 mr-4">
                <ArrowUp className="w-3 h-3 mr-1" /> 
                <span className="font-bold">{maxTempObj.predicted_temp.toFixed(1)}°</span>
              </div>
              <div className="flex items-center text-blue-600">
                <ArrowDown className="w-3 h-3 mr-1" /> 
                <span className="font-bold">{minTempObj.predicted_temp.toFixed(1)}°</span>
              </div>
            </div>
          )}

          <div className={`flex items-center px-5 py-2.5 rounded-full ${cardClass}`}>
            <Activity className={`w-4 h-4 mr-2 ${getSustainabilityColor(sustainabilityScore)}`} />
            <span className={`font-bold uppercase tracking-wider ${getSustainabilityColor(sustainabilityScore)}`}>
              Sustainability Score: {sustainabilityScore}/100
            </span>
          </div>
        </motion.div>

        {/* AI Diagnostics & Explainability */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className={`p-5 rounded-2xl ${cardClass} flex flex-col justify-center`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center text-slate-500 text-sm font-bold uppercase tracking-wide">
                <Brain className="w-4 h-4 mr-2 text-purple-500" /> Live AI Intelligence
              </span>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold">Auto-Generated</span>
            </div>
            <p className="text-lg font-medium leading-tight">
              {liveIntelligence}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className={`p-5 rounded-2xl ${cardClass} flex flex-col justify-center`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center text-slate-500 text-sm font-bold uppercase tracking-wide">
                <ShieldAlert className={`w-4 h-4 mr-2 ${latestDiagnostic.includes("Error") || latestDiagnostic.includes("degraded") ? "text-red-500" : "text-emerald-500"}`} /> Failure Recovery & Diagnostics
              </span>
            </div>
            <p className={`text-lg font-medium leading-tight mb-2 ${latestDiagnostic.includes("Error") || latestDiagnostic.includes("degraded") ? "text-red-600" : "text-emerald-600"}`}>
              <span className="font-bold block text-xs uppercase opacity-70 mb-1">Status Code</span>
              {latestDiagnostic}
            </p>
            <p className="text-sm font-semibold opacity-75">
              <span className="font-bold block text-xs uppercase opacity-70 mb-1">Recovery Protocol</span>
              {recoveryStrategy}
            </p>
          </motion.div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { id: 'temp', label: 'Temperature', value: `${latestData?.temperature_c.toFixed(1)}°`, icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-100' },
            { id: 'humidity', label: 'Humidity', value: `${latestData?.humidity_percent}%`, icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-100' },
            { id: 'pm25', label: 'PM2.5', value: `${latestData?.pm25.toFixed(1)}`, icon: Wind, color: 'text-purple-600', bg: 'bg-purple-100' },
            { id: 'wind', label: 'Wind', value: `${(latestData?.wind_speed || 0).toFixed(1)}m/s`, icon: Wind, color: 'text-teal-600', bg: 'bg-teal-100' },
            { id: 'clouds', label: 'Clouds', value: `${(latestData?.cloud_cover || 0).toFixed(0)}%`, icon: Cloud, color: 'text-slate-600', bg: 'bg-slate-200' }
          ].map((metric, i) => (
            <motion.div 
              key={metric.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              onClick={() => setActiveMetric(metric.id as any)}
              className={`${cardClass} p-4 md:p-6 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] ${activeMetric === metric.id ? 'ring-2 ring-blue-500 bg-white/90 shadow-2xl' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs md:text-sm font-bold opacity-70 mb-2 uppercase tracking-wider">{metric.label}</p>
                  <p className="text-2xl md:text-4xl font-black">{metric.value}</p>
                </div>
                <div className={`p-2 md:p-3 rounded-xl ${metric.bg}`}>
                  <metric.icon className={`w-4 h-4 md:w-6 md:h-6 ${metric.color}`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Chart Section */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className={`${cardClass} p-4 md:p-8 rounded-3xl`}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <h2 className="text-xl font-bold flex items-center">
              <Activity className="w-5 h-5 mr-2 opacity-70" />
              24-Hour Predictive Curve ({currentLocation})
            </h2>
            <div className="flex space-x-2 text-sm font-bold">
              <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-blue-600 mr-2"/> Actual</span>
              <span className="flex items-center ml-4"><div className="w-3 h-3 rounded-full bg-blue-300 border-2 border-blue-600 border-dashed mr-2"/> Forecast</span>
            </div>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
                <XAxis dataKey="time" stroke="currentColor" opacity={0.6} tick={{fontSize: 12, fontWeight: 600}} minTickGap={30} />
                <YAxis stroke="currentColor" opacity={0.6} tick={{fontSize: 12, fontWeight: 600}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 700 }}
                />
                
                {activeMetric === 'pm25' && (
                  <>
                    <Area type="monotone" dataKey="actual_pm25" stroke="#7c3aed" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" name="Actual PM2.5" />
                    <Area type="monotone" dataKey="predicted_pm25" stroke="#7c3aed" strokeWidth={4} strokeDasharray="6 6" fillOpacity={1} fill="url(#colorForecast)" name="Forecast PM2.5" />
                  </>
                )}
                {activeMetric === 'temp' && (
                  <>
                    <Area type="monotone" dataKey="actual_temp" stroke="#ea580c" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" name="Actual Temp" />
                    <Area type="monotone" dataKey="predicted_temp" stroke="#ea580c" strokeWidth={4} strokeDasharray="6 6" fillOpacity={1} fill="url(#colorForecast)" name="Forecast Temp" />
                  </>
                )}
                {activeMetric === 'humidity' && (
                  <>
                    <Area type="monotone" dataKey="actual_humidity" stroke="#0284c7" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" name="Actual Humidity" />
                    <Area type="monotone" dataKey="predicted_humidity" stroke="#0284c7" strokeWidth={4} strokeDasharray="6 6" fillOpacity={1} fill="url(#colorForecast)" name="Forecast Humidity" />
                  </>
                )}
                {activeMetric === 'wind' && (
                  <>
                    <Area type="monotone" dataKey="actual_wind" stroke="#0d9488" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" name="Actual Wind (m/s)" />
                    <Area type="monotone" dataKey="predicted_wind" stroke="#0d9488" strokeWidth={4} strokeDasharray="6 6" fillOpacity={1} fill="url(#colorForecast)" name="Forecast Wind" />
                  </>
                )}
                {activeMetric === 'clouds' && (
                  <>
                    <Area type="monotone" dataKey="actual_clouds" stroke="#475569" strokeWidth={4} fillOpacity={1} fill="url(#colorActual)" name="Actual Clouds (%)" />
                    <Area type="monotone" dataKey="predicted_clouds" stroke="#475569" strokeWidth={4} strokeDasharray="6 6" fillOpacity={1} fill="url(#colorForecast)" name="Forecast Clouds" />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Detailed Hourly Forecast Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-xl font-bold mb-4 flex items-center">
             Detailed 24-Hour Timeline
          </h2>
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex space-x-4 w-max">
              {hourlyPredictions.map((p, idx) => (
                <div key={idx} className={`${cardClass} p-4 rounded-2xl w-32 flex-shrink-0 text-center hover:-translate-y-1 transition-transform`}>
                  <p className="font-bold text-sm mb-3 opacity-80 border-b border-black/5 pb-2">
                    {formatTime(p.target_timestamp)}
                  </p>
                  <div className="space-y-2 text-sm font-semibold">
                    <p className="text-orange-600 flex justify-between">
                      <Thermometer className="w-4 h-4"/> {p.predicted_temp.toFixed(0)}°
                    </p>
                    <p className="text-blue-600 flex justify-between">
                      <Droplets className="w-4 h-4"/> {p.predicted_humidity.toFixed(0)}%
                    </p>
                    <p className="text-teal-600 flex justify-between">
                      <Wind className="w-4 h-4"/> {p.predicted_wind_speed?.toFixed(1) || 0}
                    </p>
                    <p className="text-slate-600 flex justify-between">
                      <Cloud className="w-4 h-4"/> {p.predicted_cloud_cover?.toFixed(0) || 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Accuracy Chart Section */}
        {accuracyChartData.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className={`${cardClass} p-4 md:p-8 rounded-3xl`}
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center space-x-4">
                <div className="relative flex items-center justify-center w-16 h-16">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-200" />
                    <circle 
                      cx="32" cy="32" r="26" 
                      stroke={getMetricColor()} 
                      strokeWidth="6" fill="transparent" 
                      strokeDasharray={2 * Math.PI * 26} 
                      strokeDashoffset={(2 * Math.PI * 26) - (accuracyPercent / 100) * (2 * Math.PI * 26)} 
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out" 
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-sm">
                    {accuracyPercent}%
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold flex items-center">
                    <Activity className="w-5 h-5 mr-2 opacity-70" />
                    Model Accuracy: Actual vs Predicted
                  </h2>
                  <p className="text-xs font-semibold opacity-60 uppercase tracking-wider">Past 24 Hours</p>
                </div>
              </div>
              
              <div className="flex space-x-2 text-sm font-bold">
                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-blue-600 mr-2"/> Actual</span>
                <span className="flex items-center ml-4"><div className="w-3 h-3 rounded-full bg-blue-300 border-2 border-blue-600 border-dashed mr-2"/> AI Prediction</span>
              </div>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={accuracyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
                  <XAxis dataKey="time" stroke="currentColor" opacity={0.6} tick={{fontSize: 12, fontWeight: 600}} minTickGap={30} />
                  <YAxis stroke="currentColor" opacity={0.6} tick={{fontSize: 12, fontWeight: 600}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#0f172a', fontWeight: 700 }}
                  />
                  
                  {activeMetric === 'pm25' && (
                    <>
                      <Area type="monotone" dataKey="actual_pm25" stroke="#7c3aed" strokeWidth={4} fillOpacity={0.1} fill="#7c3aed" name="Actual PM2.5" />
                      <Area type="monotone" dataKey="predicted_pm25" stroke="#7c3aed" strokeWidth={4} strokeDasharray="6 6" fillOpacity={0} name="Predicted PM2.5" />
                    </>
                  )}
                  {activeMetric === 'temp' && (
                    <>
                      <Area type="monotone" dataKey="actual_temp" stroke="#ea580c" strokeWidth={4} fillOpacity={0.1} fill="#ea580c" name="Actual Temp" />
                      <Area type="monotone" dataKey="predicted_temp" stroke="#ea580c" strokeWidth={4} strokeDasharray="6 6" fillOpacity={0} name="Predicted Temp" />
                    </>
                  )}
                  {activeMetric === 'humidity' && (
                    <>
                      <Area type="monotone" dataKey="actual_humidity" stroke="#0284c7" strokeWidth={4} fillOpacity={0.1} fill="#0284c7" name="Actual Humidity" />
                      <Area type="monotone" dataKey="predicted_humidity" stroke="#0284c7" strokeWidth={4} strokeDasharray="6 6" fillOpacity={0} name="Predicted Humidity" />
                    </>
                  )}
                  {activeMetric === 'wind' && (
                    <>
                      <Area type="monotone" dataKey="actual_wind" stroke="#0d9488" strokeWidth={4} fillOpacity={0.1} fill="#0d9488" name="Actual Wind (m/s)" />
                      <Area type="monotone" dataKey="predicted_wind" stroke="#0d9488" strokeWidth={4} strokeDasharray="6 6" fillOpacity={0} name="Predicted Wind" />
                    </>
                  )}
                  {activeMetric === 'clouds' && (
                    <>
                      <Area type="monotone" dataKey="actual_clouds" stroke="#475569" strokeWidth={4} fillOpacity={0.1} fill="#475569" name="Actual Clouds (%)" />
                      <Area type="monotone" dataKey="predicted_clouds" stroke="#475569" strokeWidth={4} strokeDasharray="6 6" fillOpacity={0} name="Predicted Clouds" />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
