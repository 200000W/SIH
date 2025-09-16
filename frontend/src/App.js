import React, { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from 'prop-types';
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
  CheckCircle,
  Wifi,
  WifiOff
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

// Environment variable validation with fallbacks
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API_BASE = `${BACKEND_URL}/api`;

// Validate backend URL
const validateBackendUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">Please refresh the page or try again later.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

// Custom bus icon
const busIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2563eb">
      <path d="M17 20H7V21C7 21.552 6.552 22 6 22H5C4.448 22 4 21.552 4 21V12L5 3H19L20 12V21C20 21.552 19.552 22 19 22H18C17.448 22 17 21.552 17 21V20ZM6 5V11H18V5H6ZM6.5 17C7.328 17 8 16.328 8 15.5S7.328 14 6.5 14 5 14.672 5 15.5 5.672 17 6.5 17ZM17.5 17C18.328 17 19 16.328 19 15.5S18.328 14 17.5 14 16 14.672 16 15.5 16.672 17 17.5 17Z"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// API utility functions with error handling
const apiCall = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error);
    throw error;
  }
};

// Connection Status Component
const ConnectionStatus = ({ isOnline }) => (
  <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
    isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }`}>
    {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
    <span>{isOnline ? 'Connected' : 'Offline'}</span>
  </div>
);

ConnectionStatus.propTypes = {
  isOnline: PropTypes.bool.isRequired,
};

// Loading Spinner Component
const LoadingSpinner = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center p-8">
    <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mb-4" />
    <p className="text-gray-600">{message}</p>
  </div>
);

LoadingSpinner.propTypes = {
  message: PropTypes.string,
};

// Status Card Component
const StatusCard = ({ title, value, icon: Icon, color = "blue" }) => {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    yellow: "bg-yellow-50 text-yellow-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-lg p-6 ${colorClasses[color]}`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className="h-8 w-8" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
};

StatusCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.oneOf(['blue', 'green', 'yellow', 'red']),
};

function App() {
  const [activeTab, setActiveTab] = useState('admin');
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [fleetStatus, setFleetStatus] = useState(null);
  const [aiInsights, setAiInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState(null);

  // Customer search states
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Connection status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Error handler
  const handleError = useCallback((error, context) => {
    console.error(`Error in ${context}:`, error);
    setError(`${context}: ${error.message}`);
  }, []);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Validate backend URL on mount
  useEffect(() => {
    if (!validateBackendUrl(BACKEND_URL)) {
      setError('Invalid backend URL configuration');
      return;
    }

    initializeData();
  }, []);

  // Auto-refresh data when simulation is running
  useEffect(() => {
    let interval;
    if (simulationRunning && isOnline) {
      interval = setInterval(() => {
        Promise.all([
          fetchBuses().catch(e => console.error('Failed to fetch buses:', e)),
          fetchFleetStatus().catch(e => console.error('Failed to fetch fleet status:', e))
        ]);
      }, 5000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [simulationRunning, isOnline]);

  // API functions with proper error handling
  const initializeData = useCallback(async () => {
    if (!isOnline) return;

    try {
      setLoading(true);
      setError(null);

      await apiCall('/initialize-data', { method: 'POST' });

      await Promise.allSettled([
        fetchBuses(),
        fetchRoutes(),
        fetchStops(),
        fetchFleetStatus()
      ]);
    } catch (error) {
      handleError(error, 'Data Initialization');
    } finally {
      setLoading(false);
    }
  }, [isOnline, handleError]);

  const fetchBuses = useCallback(async () => {
    try {
      const data = await apiCall('/buses');
      setBuses(data);
    } catch (error) {
      handleError(error, 'Fetch Buses');
    }
  }, [handleError]);

  const fetchRoutes = useCallback(async () => {
    try {
      const data = await apiCall('/routes');
      setRoutes(data);
    } catch (error) {
      handleError(error, 'Fetch Routes');
    }
  }, [handleError]);

  const fetchStops = useCallback(async () => {
    try {
      const data = await apiCall('/stops');
      setStops(data);
    } catch (error) {
      handleError(error, 'Fetch Stops');
    }
  }, [handleError]);

  const fetchFleetStatus = useCallback(async () => {
    try {
      const data = await apiCall('/fleet-status');
      setFleetStatus(data);
    } catch (error) {
      handleError(error, 'Fetch Fleet Status');
    }
  }, [handleError]);

  const fetchAIInsights = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiCall('/ai-insights');
      setAiInsights(data.insights);
    } catch (error) {
      handleError(error, 'Fetch AI Insights');
      setAiInsights('Failed to load AI insights. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const toggleSimulation = useCallback(async () => {
    if (!isOnline) {
      setError('Cannot toggle simulation while offline');
      return;
    }

    try {
      const endpoint = simulationRunning ? '/stop-simulation' : '/start-simulation';
      await apiCall(endpoint, { method: 'POST' });
      setSimulationRunning(!simulationRunning);
    } catch (error) {
      handleError(error, 'Toggle Simulation');
    }
  }, [simulationRunning, isOnline, handleError]);

  const searchBuses = useCallback(async () => {
    if (!fromStop.trim() || !toStop.trim()) return;
    if (!isOnline) {
      setError('Cannot search buses while offline');
      return;
    }

    try {
      setSearchLoading(true);
      const data = await apiCall('/find-buses', {
        method: 'POST',
        body: JSON.stringify({
          from_stop: fromStop.trim(),
          to_stop: toStop.trim(),
        }),
      });
      setSearchResults(data);
    } catch (error) {
      handleError(error, 'Search Buses');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [fromStop, toStop, isOnline, handleError]);

  // Memoized helper functions
  const getOccupancyColor = useMemo(() => (occupancy, capacity) => {
    const percentage = (occupancy / capacity) * 100;
    if (percentage < 30) return 'text-green-600';
    if (percentage < 70) return 'text-yellow-600';
    return 'text-red-600';
  }, []);

  const getOccupancyBgColor = useMemo(() => (percentage) => {
    if (percentage < 30) return 'bg-green-100';
    if (percentage < 70) return 'bg-yellow-100';
    return 'bg-red-100';
  }, []);

  // Error display component
  const ErrorAlert = () => error && (
    <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50">
      <div className="flex">
        <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    </div>
  );

  const AdminDashboard = () => (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Fleet Management Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <ConnectionStatus isOnline={isOnline} />
              <button
                onClick={fetchAIInsights}
                disabled={loading || !isOnline}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <TrendingUp className="h-4 w-4" />
                <span>Get AI Insights</span>
              </button>
              <button
                onClick={toggleSimulation}
                disabled={!isOnline}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed ${
                  simulationRunning 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <Activity className="h-4 w-4" />
                <span>{simulationRunning ? 'Stop' : 'Start'} Simulation</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Cards */}
        {fleetStatus && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatusCard
              title="Total Buses"
              value={fleetStatus.total_buses}
              icon={Bus}
              color="blue"
            />
            <StatusCard
              title="Active Buses"
              value={fleetStatus.active_buses}
              icon={CheckCircle}
              color="green"
            />
            <StatusCard
              title="Occupancy Rate"
              value={`${fleetStatus.occupancy_rate.toFixed(1)}%`}
              icon={Users}
              color={fleetStatus.occupancy_rate > 70 ? "red" : fleetStatus.occupancy_rate > 40 ? "yellow" : "green"}
            />
            <StatusCard
              title="Total Capacity"
              value={fleetStatus.total_capacity}
              icon={Activity}
              color="blue"
            />
          </div>
        )}

        {/* AI Insights */}
        {aiInsights && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">AI-Powered Fleet Insights</h3>
            </div>
            <div className="px-6 py-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-gray-50 p-4 rounded">
                {aiInsights}
              </pre>
            </div>
          </div>
        )}

        {/* Live Map */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Live Fleet Tracking</h3>
          </div>
          <div className="px-6 py-4">
            <div className="h-96 w-full">
              <MapContainer
                center={[20.5937, 78.9629]} // Center of India
                zoom={5}
                className="h-full w-full rounded"
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
        </div>

        {/* Bus List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Fleet Details</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bus Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Occupancy
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Capacity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {buses.map((bus) => (
                  <tr key={bus.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {bus.bus_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        bus.status === 'active' ? 'bg-green-100 text-green-800' : 
                        bus.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {bus.status}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${getOccupancyColor(bus.current_occupancy, bus.capacity)}`}>
                      {bus.current_occupancy}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {bus.capacity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(bus.last_updated).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const CustomerApp = () => (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h1 className="text-4xl font-bold mb-4">Bus Finder</h1>
          <p className="text-xl text-blue-100">Find buses between your stops with real-time ETA</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status */}
        <div className="flex justify-center mb-6">
          <ConnectionStatus isOnline={isOnline} />
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                disabled={!isOnline}
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
                disabled={!isOnline}
              />
            </div>
          </div>
          <button
            onClick={searchBuses}
            disabled={searchLoading || !fromStop.trim() || !toStop.trim() || !isOnline}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
          >
            {searchLoading ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            <span>{searchLoading ? 'Searching...' : 'Find Buses'}</span>
          </button>
        </div>

        {/* Available Stops */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">🚏 Popular Bus Stops in Major Cities</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['Delhi', 'Mumbai', 'Bangalore'].map((city) => (
              <div key={city}>
                <h4 className="font-medium text-gray-900 mb-2">{city}</h4>
                <div className="space-y-1">
                  {stops
                    .filter(stop => stop.city === city)
                    .slice(0, 4)
                    .map(stop => (
                      <span
                        key={stop.id}
                        className="inline-block bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded mr-2 mb-1 cursor-pointer hover:bg-blue-100"
                        onClick={() => setFromStop(stop.name)}
                      >
                        {stop.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🚌 Available Buses ({searchResults.length} found)
            </h3>
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Bus className="h-5 w-5 text-blue-600" />
                        <h4 className="font-semibold text-gray-900">{result.bus_number}</h4>
                        <span className="text-sm text-gray-600">({result.route_name})</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4 text-gray-400" />
                          <span>ETA: {result.eta_minutes} min</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span>{result.available_seats} seats</span>
                        </div>
                        <div className={`flex items-center space-x-1 ${getOccupancyBgColor(result.occupancy_percentage)} px-2 py-1 rounded`}>
                          <Activity className="h-4 w-4" />
                          <span>{result.occupancy_percentage}% full</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span>Next: {result.next_arrival}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{result.eta_minutes}m</div>
                      <div className="text-sm text-gray-500">Arrives at {result.next_arrival}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results */}
        {searchResults.length === 0 && fromStop && toStop && !searchLoading && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No buses found</h3>
            <p className="text-gray-600">
              No buses are currently running between "{fromStop}" and "{toStop}".
              <br />
              Please check the spelling or try different stops.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="App">
        {/* Error Alert */}
        <ErrorAlert />

        {/* Navigation */}
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('admin')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'admin'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Admin Dashboard
              </button>
              <button
                onClick={() => setActiveTab('customer')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'customer'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Bus Finder
              </button>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1">
          {loading && <LoadingSpinner message="Initializing application..." />}

          {!loading && (
            <>
              {activeTab === 'admin' && <AdminDashboard />}
              {activeTab === 'customer' && <CustomerApp />}
            </>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
