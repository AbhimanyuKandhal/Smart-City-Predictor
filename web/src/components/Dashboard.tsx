"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Droplets, Thermometer, Wind, Activity, ArrowUp, ArrowDown, Cloud, Umbrella } from "lucide-react";
import { useState } from "react";

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
}

export default function Dashboard({ 
  historicalData, 
  hourlyPredictions 
}: { 
  historicalData: EnvData[], 
  hourlyPredictions: PredictionData[] 
}) {
  const latestData = historicalData[historicalData.length - 1];
  const [activeMetric, setActiveMetric] = useState<'pm25'|'temp'|'humidity'|'wind'|'clouds'>('pm25');

  // Determine dynamic theme and background image based on latest weather
  const temp = latestData?.temperature_c || 25;
  const humidity = latestData?.humidity_percent || 50;
  const aqi = latestData?.pm25 || 20;
  
  let themeClass = "bg-gradient-to-br from-blue-50 to-slate-100 text-slate-900"; 
  let cardClass = "bg-white/60 backdrop-blur-xl border border-slate-200 shadow-xl";
  let bgImage = "/sun.png";

  if (aqi > 150) {
    themeClass = "bg-gradient-to-br from-stone-200 via-yellow-100 to-orange-100 text-stone-900";
    cardClass = "bg-white/50 backdrop-blur-xl border border-yellow-300 shadow-xl";
    bgImage = "/smog.png";
  } else if (temp < 5) {
    themeClass = "bg-gradient-to-br from-slate-100 via-blue-50 to-cyan-100 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-cyan-200 shadow-xl";
    bgImage = "/snow.png";
  } else if (humidity > 80 && temp > 15) {
    themeClass = "bg-gradient-to-br from-slate-200 via-blue-100 to-indigo-100 text-slate-900";
    cardClass = "bg-white/60 backdrop-blur-xl border border-blue-300 shadow-xl";
    bgImage = "/rain.png";
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

  const getAQIStatus = (pm25: number) => {
    if (pm25 <= 12) return { text: "Good", color: "text-emerald-600", dot: "bg-emerald-500" };
    if (pm25 <= 35.4) return { text: "Moderate", color: "text-amber-600", dot: "bg-amber-500" };
    return { text: "Unhealthy", color: "text-red-600", dot: "bg-red-500" };
  };

  const status = getAQIStatus(latestData?.pm25 || 0);
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  
  const maxTempObj = hourlyPredictions.reduce((max, p) => p.predicted_temp > max.predicted_temp ? p : max, hourlyPredictions[0]);
  const minTempObj = hourlyPredictions.reduce((min, p) => p.predicted_temp < min.predicted_temp ? p : min, hourlyPredictions[0]);
  
  // Is rain expected globally?
  const willRain = hourlyPredictions.length > 0 ? hourlyPredictions[0].will_rain_next_24h : false;

  // Filter 48 points down to 24 points (one per hour) for the cards at the bottom
  const hourlyCards = hourlyPredictions.filter((_, i) => i % 2 === 0);

  return (
    <div className={`relative min-h-screen w-full transition-colors duration-1000 overflow-hidden ${themeClass}`}>
      
      <div className="absolute -top-16 -left-16 pointer-events-none opacity-50 z-0 mix-blend-multiply [mask-image:radial-gradient(circle_at_center,black_30%,transparent_65%)] [-webkit-mask-image:radial-gradient(circle_at_center,black_30%,transparent_65%)]">
        <img src={bgImage} alt="Weather" className="w-[500px] h-[500px] object-contain" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto space-y-8 p-4 md:p-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4"
        >
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Delhi Air & Climate</h1>
            <p className="opacity-70 font-medium text-lg">Next-Gen 24-Hour ML Forecast</p>
          </div>
          <div className="flex flex-col items-end gap-2">
             <div className={`flex items-center space-x-3 px-5 py-2.5 rounded-full ${cardClass}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${status.dot}`} />
              <span className={`font-bold ${status.color}`}>AQI: {status.text}</span>
            </div>
            {willRain !== undefined && (
               <div className={`flex items-center space-x-2 px-5 py-2.5 rounded-full ${cardClass}`}>
                 <Umbrella className={`w-4 h-4 ${willRain ? 'text-blue-600' : 'text-slate-400'}`} />
                 <span className={`font-bold ${willRain ? 'text-blue-600' : 'text-slate-500'}`}>
                    Rain Expected: {willRain ? 'YES' : 'NO'}
                 </span>
               </div>
            )}
          </div>
        </motion.div>

        {/* Peaks Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-4"
        >
          <div className={`flex items-center px-4 py-2 rounded-lg ${cardClass}`}>
            <Thermometer className="w-4 h-4 mr-2 text-orange-600" />
            <span className="text-sm font-semibold opacity-80 mr-4">Temp Peaks:</span>
            <div className="flex items-center text-red-600 mr-4">
              <ArrowUp className="w-4 h-4" /> 
              <span className="font-bold">{maxTempObj.predicted_temp.toFixed(1)}°C</span>
              <span className="text-xs ml-1 opacity-70">at {formatTime(maxTempObj.target_timestamp)}</span>
            </div>
            <div className="flex items-center text-blue-600">
              <ArrowDown className="w-4 h-4" /> 
              <span className="font-bold">{minTempObj.predicted_temp.toFixed(1)}°C</span>
              <span className="text-xs ml-1 opacity-70">at {formatTime(minTempObj.target_timestamp)}</span>
            </div>
          </div>
        </motion.div>

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
              className={`${cardClass} p-4 md:p-6 rounded-2xl cursor-pointer transition-all duration-300 hover:scale-[1.02] ${activeMetric === metric.id ? 'ring-2 ring-blue-500 bg-white/90' : ''}`}
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
              24-Hour Predictive Curve (48 Points)
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

        {/* Detailed Hourly Forecast Cards (Only 24 points shown) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-xl font-bold mb-4 flex items-center">
             Detailed 24-Hour Breakdown (Hourly)
          </h2>
          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex space-x-4 w-max">
              {hourlyCards.map((p, idx) => (
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
      </div>
    </div>
  );
}
