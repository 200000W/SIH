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

# Indian city sample data
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

async def initialize_sample_data():
    """Initialize sample data for Indian cities"""
    # Clear existing data
    await db.bus_stops.delete_many({})
    await db.routes.delete_many({})
    await db.buses.delete_many({})
    
    all_stops = []
    all_routes = []
    
    for city, data in INDIAN_CITIES_DATA.items():
        # Insert stops
        city_stops = []
        for stop_data in data["stops"]:
            stop = BusStop(
                name=stop_data["name"],
                lat=stop_data["lat"],
                lng=stop_data["lng"],
                city=city
            )
            city_stops.append(stop)
            all_stops.append(stop.dict())
        
        # Insert routes
        for route_data in data["routes"]:
            stop_ids = [city_stops[i].id for i in route_data["stops"]]
            route = Route(
                name=route_data["name"],
                stops=stop_ids,
                distance_km=route_data["distance"],
                estimated_duration_minutes=route_data["duration"],
                city=city
            )
            all_routes.append(route.dict())
    
    # Insert all data
    if all_stops:
        await db.bus_stops.insert_many(all_stops)
    if all_routes:
        await db.routes.insert_many(all_routes)
    
    # Create sample buses
    routes = await db.routes.find().to_list(length=None)
    buses = []
    
    for i, route in enumerate(routes):
        # Get first stop coordinates
        first_stop = await db.bus_stops.find_one({"id": route["stops"][0]})
        if first_stop:
            for j in range(2):  # 2 buses per route
                bus = Bus(
                    bus_number=f"BUS-{route['city'][:3].upper()}-{i+1}{j+1}",
                    route_id=route["id"],
                    capacity=random.randint(40, 60),
                    current_occupancy=random.randint(5, 30),
                    current_lat=first_stop["lat"],
                    current_lng=first_stop["lng"],
                    current_stop_index=0,
                    status="active"
                )
                buses.append(bus.dict())
    
    if buses:
        await db.buses.insert_many(buses)

async def simulate_bus_movement():
    """Simulate bus movement along routes"""
    while simulation_running:
        try:
            buses = await db.buses.find({"status": "active"}).to_list(length=None)
            
            for bus_data in buses:
                # Get route information
                route = await db.routes.find_one({"id": bus_data["route_id"]})
                if not route:
                    continue
                
                # Get current and next stop
                current_stop_index = bus_data["current_stop_index"]
                direction = bus_data["direction"]
                
                # Calculate next stop index
                if direction == 1:  # Forward
                    next_stop_index = current_stop_index + 1
                    if next_stop_index >= len(route["stops"]):
                        next_stop_index = len(route["stops"]) - 1
                        direction = -1  # Reverse direction
                else:  # Backward
                    next_stop_index = current_stop_index - 1
                    if next_stop_index < 0:
                        next_stop_index = 0
                        direction = 1  # Forward direction
                
                # Get stop coordinates
                current_stop = await db.bus_stops.find_one({"id": route["stops"][current_stop_index]})
                next_stop = await db.bus_stops.find_one({"id": route["stops"][next_stop_index]})
                
                if current_stop and next_stop:
                    # Simulate movement (small random progress)
                    progress = random.uniform(0.02, 0.08)  # 2-8% progress per update
                    
                    new_lat, new_lng = interpolate_position(
                        bus_data["current_lat"], bus_data["current_lng"],
                        next_stop["lat"], next_stop["lng"],
                        progress
                    )
                    
                    # Add some randomness to simulate traffic
                    new_lat += random.uniform(-0.001, 0.001)
                    new_lng += random.uniform(-0.001, 0.001)
                    
                    # Check if reached next stop (within 100m)
                    distance_to_next = calculate_distance(new_lat, new_lng, next_stop["lat"], next_stop["lng"])
                    
                    if distance_to_next < 0.1:  # 100 meters
                        # Reached next stop
                        new_lat = next_stop["lat"]
                        new_lng = next_stop["lng"]
                        current_stop_index = next_stop_index
                        
                        # Simulate passenger changes
                        if random.random() < 0.3:  # 30% chance of passenger change
                            change = random.randint(-5, 8)
                            new_occupancy = max(0, min(bus_data["capacity"], 
                                                     bus_data["current_occupancy"] + change))
                        else:
                            new_occupancy = bus_data["current_occupancy"]
                    else:
                        new_occupancy = bus_data["current_occupancy"]
                    
                    # Update bus position
                    await db.buses.update_one(
                        {"id": bus_data["id"]},
                        {
                            "$set": {
                                "current_lat": new_lat,
                                "current_lng": new_lng,
                                "current_stop_index": current_stop_index,
                                "direction": direction,
                                "current_occupancy": new_occupancy,
                                "last_updated": datetime.now(timezone.utc)
                            }
                        }
                    )
                    
                    # Store location update
                    location_update = LocationUpdate(
                        bus_id=bus_data["id"],
                        lat=new_lat,
                        lng=new_lng,
                        occupancy=new_occupancy
                    )
                    await db.location_updates.insert_one(location_update.dict())
            
            await asyncio.sleep(3)  # Update every 3 seconds
            
        except Exception as e:
            logging.error(f"Error in bus simulation: {e}")
            await asyncio.sleep(5)

async def get_ai_insights(buses_data: List[Dict], routes_data: List[Dict]) -> str:
    """Get AI-powered insights for fleet management"""
    try:
        # Initialize LLM chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"fleet_insights_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            system_message="You are an expert transportation analyst providing insights for bus fleet management in Indian cities."
        ).with_model("openai", "gpt-4o-mini")
        
        # Prepare data summary
        total_buses = len(buses_data)
        active_buses = len([b for b in buses_data if b["status"] == "active"])
        avg_occupancy = sum(b["current_occupancy"] for b in buses_data) / total_buses if total_buses > 0 else 0
        total_capacity = sum(b["capacity"] for b in buses_data)
        
        occupancy_rate = (sum(b["current_occupancy"] for b in buses_data) / total_capacity * 100) if total_capacity > 0 else 0
        
        high_occupancy_buses = [b for b in buses_data if (b["current_occupancy"] / b["capacity"]) > 0.8]
        low_occupancy_buses = [b for b in buses_data if (b["current_occupancy"] / b["capacity"]) < 0.3]
        
        prompt = f"""
        Analyze this bus fleet data and provide 3-4 actionable insights:
        
        Fleet Overview:
        - Total buses: {total_buses}
        - Active buses: {active_buses}
        - Overall occupancy rate: {occupancy_rate:.1f}%
        - Average occupancy per bus: {avg_occupancy:.1f} passengers
        
        High occupancy buses (>80%): {len(high_occupancy_buses)}
        Low occupancy buses (<30%): {len(low_occupancy_buses)}
        
        Route coverage: {len(routes_data)} routes across Indian cities
        
        Provide specific, actionable recommendations for:
        1. Route optimization
        2. Fleet deployment
        3. Crowd management
        4. Operational efficiency
        
        Keep response concise and practical for fleet managers.
        """
        
        message = UserMessage(text=prompt)
        response = await chat.send_message(message)
        return response
        
    except Exception as e:
        logging.error(f"Error getting AI insights: {e}")
        return "AI insights temporarily unavailable. Manual analysis recommended for current fleet status."

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Bus Fleet Monitoring API"}

@api_router.post("/initialize-data")
async def initialize_data():
    """Initialize sample data for the demo"""
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

@api_router.post("/stop-simulation")
async def stop_simulation():
    """Stop bus movement simulation"""
    global simulation_running
    simulation_running = False
    return {"message": "Bus simulation stopped"}

@api_router.get("/buses", response_model=List[Bus])
async def get_buses():
    """Get all buses"""
    buses = await db.buses.find().to_list(length=None)
    return [Bus(**bus) for bus in buses]

@api_router.get("/routes", response_model=List[Route])
async def get_routes():
    """Get all routes"""
    routes = await db.routes.find().to_list(length=None)
    return [Route(**route) for route in routes]

@api_router.get("/stops", response_model=List[BusStop])
async def get_stops():
    """Get all bus stops"""
    stops = await db.bus_stops.find().to_list(length=None)
    return [BusStop(**stop) for stop in stops]

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
        "last_updated": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/ai-insights")
async def get_fleet_insights():
    """Get AI-powered fleet management insights"""
    buses = await db.buses.find().to_list(length=None)
    routes = await db.routes.find().to_list(length=None)
    
    insights = await get_ai_insights(buses, routes)
    
    return {
        "insights": insights,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }

@api_router.post("/find-buses", response_model=List[BusQueryResponse])
async def find_buses(query: BusQuery):
    """Find buses between two stops for customers"""
    try:
        # Find stops
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
                from_index = route["stops"].index(from_stop["id"])
                to_index = route["stops"].index(to_stop["id"])
                
                # Simple ETA calculation (can be improved with real-time traffic)
                distance_to_from = calculate_distance(
                    bus["current_lat"], bus["current_lng"],
                    from_stop["lat"], from_stop["lng"]
                )
                
                # Estimate ETA in minutes (assuming 20 km/h average speed)
                eta_minutes = int(distance_to_from / 20 * 60) + random.randint(2, 8)
                
                occupancy_percentage = int((bus["current_occupancy"] / bus["capacity"]) * 100)
                available_seats = bus["capacity"] - bus["current_occupancy"]
                
                next_arrival = (datetime.now(timezone.utc) + timedelta(minutes=eta_minutes)).strftime("%H:%M")
                
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

@api_router.get("/cities")
async def get_cities():
    """Get available cities"""
    return {"cities": list(INDIAN_CITIES_DATA.keys())}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    global simulation_running
    simulation_running = False
    client.close()