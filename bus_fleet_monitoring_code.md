# Bus Fleet Monitoring System - Complete Code

## Project Structure
```
/app/
├── backend/
│   ├── server.py          # FastAPI backend with AI integration
│   ├── requirements.txt   # Python dependencies
│   └── .env              # Environment variables
├── frontend/
│   ├── src/
│   │   ├── App.js        # React main component
│   │   ├── App.css       # Styling
│   │   └── index.js      # Entry point
│   ├── package.json      # Node dependencies
│   └── .env              # Frontend environment
└── README.md
```

## Backend Code (`/app/backend/server.py`)

```python
from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import math
import random
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Global variables for simulation
simulation_running = False

# Define Models
class BusStop(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    lat: float
    lng: float
    city: str

class Route(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    stops: List[str]  # List of stop IDs
    distance_km: float
    estimated_duration_minutes: int
    city: str

class Bus(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bus_number: str
    route_id: str
    capacity: int
    current_occupancy: int
    current_lat: float
    current_lng: float
    current_stop_index: int = 0
    direction: int = 1  # 1 for forward, -1 for backward
    status: str = "active"  # active, maintenance, offline
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LocationUpdate(BaseModel):
    bus_id: str
    lat: float
    lng: float
    occupancy: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BusQuery(BaseModel):
    from_stop: str
    to_stop: str

class BusQueryResponse(BaseModel):
    bus_number: str
    route_name: str
    eta_minutes: int
    occupancy_percentage: int
    available_seats: int
    next_arrival: str

# Indian city sample data with real coordinates
INDIAN_CITIES_DATA = {
    "Delhi": {
        "stops": [
            {"name": "Red Fort", "lat": 28.6562, "lng": 77.2410},
            {"name": "India Gate", "lat": 28.6129, "lng": 77.2295},
            {"name": "Connaught Place", "lat": 28.6315, "lng": 77.2167},
            {"name": "Karol Bagh", "lat": 28.6519, "lng": 77.1909},
            {"name": "Rajouri Garden", "lat": 28.6449, "lng": 77.1212},
            {"name": "Dwarka", "lat": 28.5921, "lng": 77.0460},
            {"name": "Chandni Chowk", "lat": 28.6506, "lng": 77.2303},
            {"name": "Khan Market", "lat": 28.5983, "lng": 77.2319}
        ],
        "routes": [
            {"name": "Red Line", "stops": [0, 1, 2, 3], "distance": 25.5, "duration": 45},
            {"name": "Blue Line", "stops": [2, 3, 4, 5], "distance": 30.2, "duration": 50},
            {"name": "Green Line", "stops": [6, 0, 2, 7], "distance": 18.7, "duration": 35}
        ]
    },
    "Mumbai": {
        "stops": [
            {"name": "Gateway of India", "lat": 18.9220, "lng": 72.8347},
            {"name": "Marine Drive", "lat": 18.9432, "lng": 72.8235},
            {"name": "Bandra", "lat": 19.0596, "lng": 72.8295},
            {"name": "Andheri", "lat": 19.1136, "lng": 72.8697},
            {"name": "Juhu Beach", "lat": 19.0968, "lng": 72.8269},
            {"name": "Worli", "lat": 19.0176, "lng": 72.8236},
            {"name": "Powai", "lat": 19.1171, "lng": 72.9062}
        ],
        "routes": [
            {"name": "Western Express", "stops": [0, 1, 5, 2, 3], "distance": 35.8, "duration": 60},
            {"name": "Coastal Route", "stops": [1, 0, 5, 4], "distance": 22.4, "duration": 40},
            {"name": "Tech Corridor", "stops": [2, 3, 6, 4], "distance": 28.1, "duration": 45}
        ]
    },
    "Bangalore": {
        "stops": [
            {"name": "MG Road", "lat": 12.9716, "lng": 77.5946},
            {"name": "Koramangala", "lat": 12.9352, "lng": 77.6245},
            {"name": "Electronic City", "lat": 12.8456, "lng": 77.6603},
            {"name": "Whitefield", "lat": 12.9698, "lng": 77.7500},
            {"name": "Indiranagar", "lat": 12.9719, "lng": 77.6412},
            {"name": "Jayanagar", "lat": 12.9237, "lng": 77.5831},
            {"name": "Marathahalli", "lat": 12.9591, "lng": 77.6974}
        ],
        "routes": [
            {"name": "Tech Hub Express", "stops": [0, 4, 6, 3], "distance": 32.5, "duration": 55},
            {"name": "South Loop", "stops": [0, 1, 5, 2], "distance": 28.9, "duration": 50},
            {"name": "Central Line", "stops": [4, 0, 1, 6], "distance": 24.3, "duration": 42}
        ]
    }
}

# Helper functions for GPS calculations and bus simulation
def calculate_distance(lat1, lng1, lat2, lng2):
    """Calculate distance between two points in kilometers"""
    R = 6371  # Earth's radius in kilometers
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = math.sin(delta_lat/2) * math.sin(delta_lat/2) + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * \
        math.sin(delta_lng/2) * math.sin(delta_lng/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def interpolate_position(start_lat, start_lng, end_lat, end_lng, progress):
    """Interpolate position between two points based on progress (0-1)"""
    lat = start_lat + (end_lat - start_lat) * progress
    lng = start_lng + (end_lng - start_lng) * progress
    return lat, lng

# AI Integration for Fleet Insights
async def get_ai_insights(buses_data: List[Dict], routes_data: List[Dict]) -> str:
    """Get AI-powered insights for fleet management"""
    try:
        # Initialize LLM chat with Emergent integration
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"fleet_insights_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            system_message="You are an expert transportation analyst providing actionable insights for bus fleet management in Indian cities. Provide clear, numbered recommendations that fleet managers can implement immediately."
        ).with_model("openai", "gpt-4o-mini")
        
        # Calculate fleet metrics
        total_buses = len(buses_data)
        active_buses = len([b for b in buses_data if b["status"] == "active"])
        avg_occupancy = sum(b["current_occupancy"] for b in buses_data) / total_buses if total_buses > 0 else 0
        total_capacity = sum(b["capacity"] for b in buses_data)
        
        occupancy_rate = (sum(b["current_occupancy"] for b in buses_data) / total_capacity * 100) if total_capacity > 0 else 0
        
        high_occupancy_buses = [b for b in buses_data if (b["current_occupancy"] / b["capacity"]) > 0.8]
        low_occupancy_buses = [b for b in buses_data if (b["current_occupancy"] / b["capacity"]) < 0.3]
        
        # Get route cities
        route_cities = list(set([r["city"] for r in routes_data]))
        
        prompt = f"""
        🚌 FLEET ANALYSIS REQUEST
        
        Current Fleet Status:
        • Total Buses: {total_buses} ({active_buses} active)
        • Overall Occupancy: {occupancy_rate:.1f}%
        • Average Passengers per Bus: {avg_occupancy:.1f}
        • Cities Covered: {', '.join(route_cities)}
        • High Occupancy Buses (>80%): {len(high_occupancy_buses)}
        • Low Occupancy Buses (<30%): {len(low_occupancy_buses)}
        
        Please provide 4-5 SPECIFIC, ACTIONABLE recommendations in this format:
        
        🎯 IMMEDIATE ACTIONS (Today):
        1. [Specific action with bus numbers/routes if applicable]
        
        📊 OPTIMIZATION OPPORTUNITIES (This Week):  
        2. [Route or scheduling recommendation]
        
        👥 PASSENGER EXPERIENCE (Ongoing):
        3. [Crowd management suggestion]
        
        💡 EFFICIENCY IMPROVEMENTS:
        4. [Operational efficiency recommendation]
        
        🚀 STRATEGIC INSIGHTS:
        5. [Long-term improvement suggestion]
        
        Make each recommendation specific, measurable, and implementable by Indian bus fleet managers.
        """
        
        message = UserMessage(text=prompt)
        response = await chat.send_message(message)
        return response
        
    except Exception as e:
        logging.error(f"Error getting AI insights: {e}")
        return """
🚌 FLEET MANAGEMENT INSIGHTS

🎯 IMMEDIATE ACTIONS (Today):
1. Deploy additional buses to high-occupancy routes during peak hours (7-9 AM, 6-8 PM)

📊 OPTIMIZATION OPPORTUNITIES (This Week):
2. Analyze passenger flow patterns to adjust bus frequency on underutilized routes
3. Implement dynamic routing based on real-time crowd data

👥 PASSENGER EXPERIENCE (Ongoing):
4. Set up real-time passenger information displays at major stops
5. Introduce mobile app notifications for bus arrivals and delays

💡 EFFICIENCY IMPROVEMENTS:
6. Schedule preventive maintenance during off-peak hours to maximize bus availability
7. Train drivers on fuel-efficient driving techniques to reduce operational costs

🚀 STRATEGIC INSIGHTS:
8. Consider electric buses for high-frequency routes to reduce long-term costs
9. Implement AI-powered predictive maintenance to prevent breakdowns

Note: AI insights temporarily unavailable. These are general recommendations for Indian bus fleet management.
        """

# API Routes for all fleet management functionality
@api_router.get("/")
async def root():
    return {"message": "Bus Fleet Monitoring API"}

@api_router.post("/initialize-data")
async def initialize_data():
    """Initialize sample data for demo"""
    await initialize_sample_data()
    return {"message": "Sample data initialized successfully"}

@api_router.post("/start-simulation")
async def start_simulation(background_tasks: BackgroundTasks):
    """Start bus movement simulation"""
    global simulation_running
    if not simulation_running:
        simulation_running = True
        background_tasks.add_task(simulate_bus_movement)
        return {"message": "Bus simulation started"}
    return {"message": "Simulation already running"}

@api_router.get("/fleet-status")
async def get_fleet_status():
    """Get comprehensive fleet status for admin dashboard"""
    buses = await db.buses.find().to_list(length=None)
    routes = await db.routes.find().to_list(length=None)
    
    total_buses = len(buses)
    active_buses = len([b for b in buses if b["status"] == "active"])
    total_capacity = sum(b["capacity"] for b in buses)
    current_occupancy = sum(b["current_occupancy"] for b in buses)
    
    # Convert buses to proper format (remove MongoDB ObjectId)
    buses_data = [Bus(**bus).dict() for bus in buses]
    
    return {
        "total_buses": total_buses,
        "active_buses": active_buses,
        "offline_buses": total_buses - active_buses,
        "total_capacity": total_capacity,
        "current_occupancy": current_occupancy,
        "occupancy_rate": (current_occupancy / total_capacity * 100) if total_capacity > 0 else 0,
        "buses": buses_data,
        "routes": len(routes),
        "last_updated": datetime.now().isoformat()
    }

@api_router.get("/ai-insights")
async def get_fleet_insights():
    """Get AI-powered fleet management insights"""
    buses = await db.buses.find().to_list(length=None)
    routes = await db.routes.find().to_list(length=None)
    
    insights = await get_ai_insights(buses, routes)
    
    return {
        "insights": insights,
        "generated_at": datetime.now().isoformat()
    }

@api_router.post("/find-buses", response_model=List[BusQueryResponse])
async def find_buses(query: BusQuery):
    """Find buses between two stops for customers"""
    try:
        # Find stops using case-insensitive search
        from_stop = await db.bus_stops.find_one({"name": {"$regex": query.from_stop, "$options": "i"}})
        to_stop = await db.bus_stops.find_one({"name": {"$regex": query.to_stop, "$options": "i"}})
        
        if not from_stop or not to_stop:
            raise HTTPException(status_code=404, detail="One or both stops not found")
        
        # Find routes that contain both stops
        routes = await db.routes.find({
            "stops": {"$all": [from_stop["id"], to_stop["id"]]}
        }).to_list(length=None)
        
        results = []
        
        for route in routes:
            # Find buses on this route
            buses = await db.buses.find({"route_id": route["id"], "status": "active"}).to_list(length=None)
            
            for bus in buses:
                # Calculate ETA based on current position and route
                distance_to_from = calculate_distance(
                    bus["current_lat"], bus["current_lng"],
                    from_stop["lat"], from_stop["lng"]
                )
                
                # Estimate ETA in minutes (assuming 20 km/h average speed)
                eta_minutes = int(distance_to_from / 20 * 60) + random.randint(2, 8)
                
                occupancy_percentage = int((bus["current_occupancy"] / bus["capacity"]) * 100)
                available_seats = bus["capacity"] - bus["current_occupancy"]
                
                next_arrival = (datetime.now() + timedelta(minutes=eta_minutes)).strftime("%H:%M")
                
                results.append(BusQueryResponse(
                    bus_number=bus["bus_number"],
                    route_name=route["name"],
                    eta_minutes=eta_minutes,
                    occupancy_percentage=occupancy_percentage,
                    available_seats=available_seats,
                    next_arrival=next_arrival
                ))
        
        # Sort by ETA
        results.sort(key=lambda x: x.eta_minutes)
        
        return results
        
    except Exception as e:
        logging.error(f"Error finding buses: {e}")
        raise HTTPException(status_code=500, detail="Error finding buses")

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging and shutdown
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global simulation_running
    simulation_running = False
    client.close()
```

## Frontend Code (`/app/frontend/src/App.js`)

```javascript
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

// Custom bus icon for map
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

  // Initialize data on component mount
  useEffect(() => {
    initializeData();
  }, []);

  // Set up real-time polling when simulation is running
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

  // API functions
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

  // Render components
  const AdminDashboard = () => (
    <div className="space-y-6">
      {/* Fleet Status Cards */}
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
              disabled={searchLoading || !fromStop.trim() || !toStop.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-200 transform hover:scale-105"
            >
              {searchLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Finding Buses...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  🔍 Find My Bus
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Available Stops */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="text-lg font-semibold mb-4">🚏 Popular Bus Stops in Major Cities</h3>
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
            <Bus className="w-5 h-5 text-green-500" />
            🚌 Available Buses ({searchResults.length} found)
          </h3>
          <div className="space-y-4">
            {searchResults.map((result, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
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
```

## Environment Configuration

### Backend Environment (`.env`)
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="bus_fleet_db"
CORS_ORIGINS="*"
EMERGENT_LLM_KEY=sk-emergent-67f3b6eF57180A1A9D
```

### Frontend Environment (`.env`)
```
REACT_APP_BACKEND_URL=https://your-domain.com
WDS_SOCKET_PORT=443
```

## Installation & Setup

### Backend Setup
```bash
cd backend
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
pip install fastapi uvicorn motor python-dotenv starlette
pip freeze > requirements.txt
```

### Frontend Setup
```bash
cd frontend
yarn add leaflet react-leaflet lucide-react
yarn install
```

## Key Features

1. **Admin Dashboard**
   - Live fleet tracking on OpenStreetMap
   - Real-time bus location updates
   - Comprehensive fleet statistics
   - AI-powered insights using Emergent LLM integration

2. **Customer Interface**
   - Bus finder with ETA calculations
   - Real-time space availability
   - Support for major Indian cities (Delhi, Mumbai, Bangalore)

3. **Backend Architecture**
   - FastAPI with MongoDB integration
   - Real-time GPS simulation for Indian routes
   - AI integration for fleet optimization insights
   - RESTful APIs for all functionality

4. **Real-time Features**
   - Background simulation of bus movement
   - Live location updates every 3 seconds
   - Automatic crowd/occupancy simulation
   - Polling-based real-time updates in frontend

## API Endpoints

- `POST /api/initialize-data` - Initialize sample data
- `GET /api/cities` - Get available cities
- `GET /api/stops` - Get all bus stops
- `GET /api/routes` - Get all routes
- `GET /api/buses` - Get all buses
- `GET /api/fleet-status` - Get fleet overview
- `POST /api/start-simulation` - Start bus movement simulation
- `POST /api/find-buses` - Find buses between stops
- `GET /api/ai-insights` - Get AI-powered fleet insights

## Technology Stack

- **Backend**: FastAPI, MongoDB, Python, Emergent LLM Integration
- **Frontend**: React, Leaflet, OpenStreetMap, Tailwind CSS
- **Database**: MongoDB with GPS coordinate storage
- **AI**: GPT-4o-mini via Emergent integration
- **Maps**: OpenStreetMap with Leaflet
- **Real-time**: Polling-based updates with background simulation

This system provides a complete solution for bus fleet monitoring with both administrative oversight and customer-facing functionality, specifically designed for Indian urban transportation networks.