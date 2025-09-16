#!/usr/bin/env python3
"""
Backend API Testing Suite for Bus Fleet Monitoring System
Tests all backend APIs according to the review request sequence
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://transit-dash-2.preview.emergentagent.com/api"
TIMEOUT = 30

class BusFleetTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name, success, details, response_data=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
    
    def test_initialize_data(self):
        """Test 1: Initialize Data API"""
        try:
            response = self.session.post(f"{BASE_URL}/initialize-data", timeout=TIMEOUT)
            
            if response.status_code in [200, 201]:
                data = response.json()
                if "message" in data and "initialized" in data["message"].lower():
                    self.log_test("Initialize Data API", True, 
                                f"Status: {response.status_code}, Message: {data['message']}")
                    return True
                else:
                    self.log_test("Initialize Data API", False, 
                                f"Unexpected response format", data)
                    return False
            else:
                self.log_test("Initialize Data API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Initialize Data API", False, f"Exception: {str(e)}")
            return False
    
    def test_get_cities(self):
        """Test 2: Get Cities API"""
        try:
            response = self.session.get(f"{BASE_URL}/cities", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if "cities" in data and isinstance(data["cities"], list):
                    expected_cities = ["Delhi", "Mumbai", "Bangalore"]
                    cities = data["cities"]
                    
                    if all(city in cities for city in expected_cities):
                        self.log_test("Get Cities API", True, 
                                    f"Found {len(cities)} cities: {cities}")
                        return True
                    else:
                        self.log_test("Get Cities API", False, 
                                    f"Missing expected cities. Got: {cities}")
                        return False
                else:
                    self.log_test("Get Cities API", False, 
                                f"Invalid response format", data)
                    return False
            else:
                self.log_test("Get Cities API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Cities API", False, f"Exception: {str(e)}")
            return False
    
    def test_get_stops(self):
        """Test 3: Get Stops API"""
        try:
            response = self.session.get(f"{BASE_URL}/stops", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if stops have required fields
                    sample_stop = data[0]
                    required_fields = ["id", "name", "lat", "lng", "city"]
                    
                    if all(field in sample_stop for field in required_fields):
                        # Check for expected stops
                        stop_names = [stop["name"] for stop in data]
                        expected_stops = ["Red Fort", "India Gate", "Gateway of India", "MG Road"]
                        found_stops = [stop for stop in expected_stops if stop in stop_names]
                        
                        self.log_test("Get Stops API", True, 
                                    f"Found {len(data)} stops, including: {found_stops}")
                        return True
                    else:
                        self.log_test("Get Stops API", False, 
                                    f"Missing required fields in stop data")
                        return False
                else:
                    self.log_test("Get Stops API", False, 
                                f"Empty or invalid response format")
                    return False
            else:
                self.log_test("Get Stops API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Stops API", False, f"Exception: {str(e)}")
            return False
    
    def test_get_routes(self):
        """Test 4: Get Routes API"""
        try:
            response = self.session.get(f"{BASE_URL}/routes", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if routes have required fields
                    sample_route = data[0]
                    required_fields = ["id", "name", "stops", "distance_km", "estimated_duration_minutes", "city"]
                    
                    if all(field in sample_route for field in required_fields):
                        route_names = [route["name"] for route in data]
                        expected_routes = ["Red Line", "Blue Line", "Western Express", "Tech Hub Express"]
                        found_routes = [route for route in expected_routes if route in route_names]
                        
                        self.log_test("Get Routes API", True, 
                                    f"Found {len(data)} routes, including: {found_routes}")
                        return True
                    else:
                        self.log_test("Get Routes API", False, 
                                    f"Missing required fields in route data")
                        return False
                else:
                    self.log_test("Get Routes API", False, 
                                f"Empty or invalid response format")
                    return False
            else:
                self.log_test("Get Routes API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Routes API", False, f"Exception: {str(e)}")
            return False
    
    def test_get_buses(self):
        """Test 5: Get Buses API"""
        try:
            response = self.session.get(f"{BASE_URL}/buses", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    # Check if buses have required fields
                    sample_bus = data[0]
                    required_fields = ["id", "bus_number", "route_id", "capacity", "current_occupancy", 
                                     "current_lat", "current_lng", "status"]
                    
                    if all(field in sample_bus for field in required_fields):
                        active_buses = [bus for bus in data if bus["status"] == "active"]
                        bus_numbers = [bus["bus_number"] for bus in data[:3]]  # Show first 3
                        
                        self.log_test("Get Buses API", True, 
                                    f"Found {len(data)} buses ({len(active_buses)} active), examples: {bus_numbers}")
                        return True
                    else:
                        self.log_test("Get Buses API", False, 
                                    f"Missing required fields in bus data")
                        return False
                else:
                    self.log_test("Get Buses API", False, 
                                f"Empty or invalid response format")
                    return False
            else:
                self.log_test("Get Buses API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Buses API", False, f"Exception: {str(e)}")
            return False
    
    def test_fleet_status(self):
        """Test 6: Fleet Status API"""
        try:
            response = self.session.get(f"{BASE_URL}/fleet-status", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_buses", "active_buses", "total_capacity", 
                                 "current_occupancy", "occupancy_rate", "buses"]
                
                if all(field in data for field in required_fields):
                    self.log_test("Fleet Status API", True, 
                                f"Total: {data['total_buses']} buses, Active: {data['active_buses']}, "
                                f"Occupancy: {data['occupancy_rate']:.1f}%")
                    return True
                else:
                    self.log_test("Fleet Status API", False, 
                                f"Missing required fields in fleet status")
                    return False
            else:
                self.log_test("Fleet Status API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Fleet Status API", False, f"Exception: {str(e)}")
            return False
    
    def test_start_simulation(self):
        """Test 7: Start Simulation API"""
        try:
            response = self.session.post(f"{BASE_URL}/start-simulation", timeout=TIMEOUT)
            
            if response.status_code in [200, 201]:
                data = response.json()
                if "message" in data and ("started" in data["message"].lower() or "running" in data["message"].lower()):
                    self.log_test("Start Simulation API", True, 
                                f"Status: {response.status_code}, Message: {data['message']}")
                    return True
                else:
                    self.log_test("Start Simulation API", False, 
                                f"Unexpected response format", data)
                    return False
            else:
                self.log_test("Start Simulation API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Start Simulation API", False, f"Exception: {str(e)}")
            return False
    
    def test_find_buses(self):
        """Test 8: Bus Finder API"""
        try:
            # Test with Red Fort to India Gate (Delhi stops)
            payload = {
                "from_stop": "Red Fort",
                "to_stop": "India Gate"
            }
            
            response = self.session.post(f"{BASE_URL}/find-buses", 
                                       json=payload, timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    if len(data) > 0:
                        # Check if bus results have required fields
                        sample_result = data[0]
                        required_fields = ["bus_number", "route_name", "eta_minutes", 
                                         "occupancy_percentage", "available_seats", "next_arrival"]
                        
                        if all(field in sample_result for field in required_fields):
                            bus_info = [(bus["bus_number"], bus["eta_minutes"]) for bus in data[:2]]
                            self.log_test("Bus Finder API", True, 
                                        f"Found {len(data)} buses from Red Fort to India Gate: {bus_info}")
                            return True
                        else:
                            self.log_test("Bus Finder API", False, 
                                        f"Missing required fields in bus finder results")
                            return False
                    else:
                        self.log_test("Bus Finder API", True, 
                                    f"No buses found for Red Fort to India Gate route (valid response)")
                        return True
                else:
                    self.log_test("Bus Finder API", False, 
                                f"Invalid response format", data)
                    return False
            else:
                self.log_test("Bus Finder API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Bus Finder API", False, f"Exception: {str(e)}")
            return False
    
    def test_ai_insights(self):
        """Test 9: AI Insights API"""
        try:
            response = self.session.get(f"{BASE_URL}/ai-insights", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if "insights" in data and "generated_at" in data:
                    insights = data["insights"]
                    if isinstance(insights, str) and len(insights) > 50:
                        # Check if it contains fleet management keywords
                        keywords = ["fleet", "bus", "route", "occupancy", "optimization"]
                        found_keywords = [kw for kw in keywords if kw.lower() in insights.lower()]
                        
                        self.log_test("AI Insights API", True, 
                                    f"Generated insights ({len(insights)} chars) with keywords: {found_keywords}")
                        return True
                    else:
                        self.log_test("AI Insights API", False, 
                                    f"Insights too short or invalid: {insights[:100]}...")
                        return False
                else:
                    self.log_test("AI Insights API", False, 
                                f"Missing required fields in AI insights response")
                    return False
            else:
                self.log_test("AI Insights API", False, 
                            f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("AI Insights API", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 80)
        print("BUS FLEET MONITORING SYSTEM - BACKEND API TESTING")
        print("=" * 80)
        print(f"Base URL: {BASE_URL}")
        print(f"Started at: {datetime.now().isoformat()}")
        print("=" * 80)
        print()
        
        # Test sequence as requested
        tests = [
            ("Initialize Data API", self.test_initialize_data),
            ("Get Cities API", self.test_get_cities),
            ("Get Stops API", self.test_get_stops),
            ("Get Routes API", self.test_get_routes),
            ("Get Buses API", self.test_get_buses),
            ("Fleet Status API", self.test_fleet_status),
            ("Start Simulation API", self.test_start_simulation),
            ("Bus Finder API", self.test_find_buses),
            ("AI Insights API", self.test_ai_insights)
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL {test_name}: Unexpected error - {str(e)}")
                failed += 1
            
            # Small delay between tests
            time.sleep(1)
        
        # Summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {passed + failed}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed / (passed + failed) * 100):.1f}%")
        print("=" * 80)
        
        return passed, failed, self.test_results

if __name__ == "__main__":
    tester = BusFleetTester()
    passed, failed, results = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)