import React, { useState, useEffect } from "react";
import "./App.css";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { 
  Bus, 
  MapPin, 
  Users, 
  Activity, 
  Search, 
  RefreshCw, 
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="blue" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 6v6"/>
      <path d="M15 6v6"/>
      <path d="M2 12h19.6"/>
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2v-2H22"/>
      <path d="M2 12v6c0 1.5.5 2 2 2h16c1.5 0 2-.5 2-2v-6"/>
      <circle cx="7" cy="18" r="2"/>
      <circle cx="17" cy="18" r="2"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function App() {
  const [activeTab, setActiveTab] = useState('admin');
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [fleetStatus, setFleetStatus] = useState(null);
  const [aiInsights, setAiInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  
  // Customer search states
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    initializeData();
  }, []);

  useEffect(() => {
    let interval;
    if (simulationRunning) {
      interval = setInterval(() => {
        fetchBuses();
        fetchFleetStatus();
      }, 5000); // Update every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simulationRunning]);

  const initializeData = async () => {
    try {
      setLoading(true);
      await fetch(`${API}/initialize-data`, {
        method: 'POST',
      });
      
      await Promise.all([
        fetchBuses(),
        fetchRoutes(),
        fetchStops(),
        fetchFleetStatus()
      ]);
    } catch (error) {
      console.error('Error initializing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuses = async () => {
    try {
      const response = await fetch(`${API}/buses`);
      const data = await response.json();
      setBuses(data);
    } catch (error) {
      console.error('Error fetching buses:', error);
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await fetch(`${API}/routes`);
      const data = await response.json();
      setRoutes(data);
    } catch (error) {
      console.error('Error fetching routes:', error);
    }
  };

  const fetchStops = async () => {
    try {
      const response = await fetch(`${API}/stops`);
      const data = await response.json();
      setStops(data);
    } catch (error) {
      console.error('Error fetching stops:', error);
    }
  };

  const fetchFleetStatus = async () => {
    try {
      const response = await fetch(`${API}/fleet-status`);
      const data = await response.json();
      setFleetStatus(data);
    } catch (error) {
      console.error('Error fetching fleet status:', error);
    }
  };

  const fetchAIInsights = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/ai-insights`);
      const data = await response.json();
      setAiInsights(data.insights);
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      setAiInsights('Failed to load AI insights. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSimulation = async () => {
    try {
      const endpoint = simulationRunning ? '/stop-simulation' : '/start-simulation';
      await fetch(`${API}${endpoint}`, {
        method: 'POST',
      });
      setSimulationRunning(!simulationRunning);
    } catch (error) {
      console.error('Error toggling simulation:', error);
    }
  };

  const searchBuses = async () => {
    if (!fromStop.trim() || !toStop.trim()) return;
    
    try {
      setSearchLoading(true);
      const response = await fetch(`${API}/find-buses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_stop: fromStop.trim(),
          to_stop: toStop.trim(),
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching buses:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const getOccupancyColor = (occupancy, capacity) => {
    const percentage = (occupancy / capacity) * 100;
    if (percentage < 30) return 'text-green-600';
    if (percentage < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getOccupancyBgColor = (percentage) => {
    if (percentage < 30) return 'bg-green-100';
    if (percentage < 70) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const AdminDashboard = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Fleet Management Dashboard</h1>
        <div className="flex gap-3">
          <button
            onClick={toggleSimulation}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              simulationRunning 
                ? 'bg-red-500 text-white hover:bg-red-600' 
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {simulationRunning ? <Activity className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
            {simulationRunning ? 'Stop Simulation' : 'Start Simulation'}
          </button>
          <button
            onClick={fetchAIInsights}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <TrendingUp className="w-4 h-4" />
            Get AI Insights
          </button>
        </div>
      </div>

      {/* Status Cards */}
      {fleetStatus && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Buses</p>
                <p className="text-2xl font-bold text-gray-800">{fleetStatus.total_buses}</p>
              </div>
              <Bus className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Active Buses</p>
                <p className="text-2xl font-bold text-green-600">{fleetStatus.active_buses}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Occupancy Rate</p>
                <p className="text-2xl font-bold text-orange-600">{fleetStatus.occupancy_rate.toFixed(1)}%</p>
              </div>
              <Users className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Capacity</p>
                <p className="text-2xl font-bold text-purple-600">{fleetStatus.total_capacity}</p>
              </div>
              <Activity className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* AI Insights */}
      {aiInsights && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            AI-Powered Fleet Insights
          </h3>
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed font-sans">
              {aiInsights}
            </pre>
          </div>
        </div>
      )}

      {/* Live Map */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-red-500" />
          Live Fleet Tracking
        </h3>
        <div className="h-96 rounded-lg overflow-hidden">
          <MapContainer
            center={[28.6139, 77.2090]} // Delhi center
            zoom={11}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            
            {/* Bus markers */}
            {buses.map((bus) => (
              <Marker
                key={bus.id}
                position={[bus.current_lat, bus.current_lng]}
                icon={busIcon}
              >
                <Popup>
                  <div className="text-sm">
                    <h4 className="font-semibold">{bus.bus_number}</h4>
                    <p>Occupancy: {bus.current_occupancy}/{bus.capacity}</p>
                    <p>Status: {bus.status}</p>
                    <p className="text-xs text-gray-500">
                      Last updated: {new Date(bus.last_updated).toLocaleTimeString()}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Bus stop markers */}
            {stops.map((stop) => (
              <Marker
                key={stop.id}
                position={[stop.lat, stop.lng]}
              >
                <Popup>
                  <div className="text-sm">
                    <h4 className="font-semibold">{stop.name}</h4>
                    <p>{stop.city}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Bus List */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Fleet Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Bus Number</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Occupancy</th>
                <th className="text-left py-2">Capacity</th>
                <th className="text-left py-2">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {buses.map((bus) => (
                <tr key={bus.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 font-medium">{bus.bus_number}</td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {bus.status}
                    </span>
                  </td>
                  <td className={`py-2 font-medium ${getOccupancyColor(bus.current_occupancy, bus.capacity)}`}>
                    {bus.current_occupancy}
                  </td>
                  <td className="py-2">{bus.capacity}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(bus.last_updated).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const CustomerApp = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Bus Finder</h1>
        <p className="text-gray-600">Find buses between your stops with real-time ETA</p>
      </div>

      {/* Search Form */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📍 Starting Point
            </label>
            <input
              type="text"
              value={fromStop}
              onChange={(e) => setFromStop(e.target.value)}
              placeholder="Type your starting stop (e.g., Red Fort, Gateway of India)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🎯 Destination
            </label>
            <input
              type="text"
              value={toStop}
              onChange={(e) => setToStop(e.target.value)}
              placeholder="Type your destination (e.g., India Gate, Marine Drive)"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={searchBuses}
              disabled={searchLoading || !fromStop || !toStop}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searchLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search Buses
            </button>
          </div>
        </div>
      </div>

      {/* Available Stops */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Available Bus Stops</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Delhi', 'Mumbai', 'Bangalore'].map((city) => (
            <div key={city} className="border rounded-lg p-4">
              <h4 className="font-semibold text-blue-600 mb-2">{city}</h4>
              <div className="space-y-1 text-sm text-gray-600">
                {stops
                  .filter(stop => stop.city === city)
                  .slice(0, 4)
                  .map(stop => (
                    <div key={stop.id}>{stop.name}</div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Bus className="w-5 h-5 text-blue-500" />
            Available Buses ({searchResults.length})
          </h3>
          <div className="space-y-4">
            {searchResults.map((result, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${getOccupancyBgColor(result.occupancy_percentage)}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-lg">{result.bus_number}</h4>
                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {result.route_name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span>ETA: {result.eta_minutes} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-green-500" />
                        <span>{result.available_seats} seats</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-purple-500" />
                        <span>{result.occupancy_percentage}% full</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <span>Next: {result.next_arrival}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {result.eta_minutes}m
                    </div>
                    <div className="text-xs text-gray-500">
                      Arrives at {result.next_arrival}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {searchResults.length === 0 && fromStop && toStop && !searchLoading && (
        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No buses found</h3>
          <p className="text-gray-500">
            No buses are currently running between "{fromStop}" and "{toStop}".
            <br />
            Please check the spelling or try different stops.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Bus className="w-8 h-8 text-blue-500" />
              <span className="text-xl font-bold text-gray-800">Transit Dashboard</span>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:text-blue-500 hover:bg-blue-50'
                }`}
              >
                Admin Dashboard
              </button>
              <button
                onClick={() => setActiveTab('customer')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'customer'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:text-blue-500 hover:bg-blue-50'
                }`}
              >
                Bus Finder
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        )}
        
        {!loading && (
          <>
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'customer' && <CustomerApp />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;