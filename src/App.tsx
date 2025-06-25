import React, { useState, useEffect, useRef } from 'react';
import type { GameState, LeafData, BudData } from './game/state';
import { initialGameState } from './game/state';
import { loadGame, saveGame, updateGame, GROWTH_HYDRATION_THRESHOLD } from './game/engine';
import { IS_DEBUG_MODE } from './game/debug';
import { GAME_WIDTH, GAME_HEIGHT, SOIL_LEVEL } from './game/constants';

function App() {
  const [gameState, setGameState] = useState<GameState>(loadGame());
  const [hasPlantedSeed, setHasPlantedSeed] = useState(() => {
    // A plant with any structure means a seed has been planted.
    // A growth value > 0 also works.
    return loadGame().plant.structure.length > 0;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [debugTimeOverride, setDebugTimeOverride] = useState<Date | null>(null);

  // Function to determine if it's day or night
  const isDayTime = () => {
    const hours = new Date().getHours();
    return hours > 6 && hours < 20; // 6 AM to 8 PM
  };

  const fetchWeatherData = async (location: string | null) => {
    try {
      let lat, lon, city;

      if (location) {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
        const geoData = await geoResponse.json();
        if (!geoData.results) {
          console.error("Could not find location:", location);
          alert(`Could not find location: ${location}`);
          return;
        }
        lat = geoData.results[0].latitude;
        lon = geoData.results[0].longitude;
        city = geoData.results[0].name;
      } else {
        const ipResponse = await fetch('https://ipinfo.io/json');
        if (!ipResponse.ok) {
          console.error("Failed to get location from IP:", ipResponse.statusText);
          return; // Silently fail for IP lookup
        }
        const ipData = await ipResponse.json();
        const [latStr, lonStr] = ipData.loc.split(',');
        lat = parseFloat(latStr);
        lon = parseFloat(lonStr);
        city = ipData.city;
      }

      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,rain&daily=sunrise,sunset&timezone=auto`);
      const weatherData = await weatherResponse.json();
      
      const weather = {
        temperature: weatherData.current.temperature_2m,
        isRaining: weatherData.current.rain > 0,
      };

      const sunrise = weatherData.daily.sunrise[0];
      const sunset = weatherData.daily.sunset[0];

      setGameState(prevState => {
        const newState = {
          ...prevState,
          environment: { 
            ...prevState.environment, 
            weather, 
            userLocation: city,
            sunrise,
            sunset,
          }
        };
        saveGame(newState);
        return newState;
      });
    } catch (error) {
      console.error("Failed to fetch weather data", error);
    }
  };

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locationInput.trim()) {
      fetchWeatherData(locationInput.trim());
      setShowSettings(false);
    }
  };

  const handleWaterPlant = () => {
    // Prevent watering if there's no seed planted
    if (!hasPlantedSeed) return;

    setGameState(prevState => {
      const newState = {
        ...prevState,
        plant: {
          ...prevState.plant,
          hydration: Math.min(1, prevState.plant.hydration + 0.4),
          lastWatered: new Date(),
        },
      };
      saveGame(newState);
      return newState;
    });
  };

  const handleToggleDayNight = () => {
    setGameState(prevState => {
      const newState = {
        ...prevState,
        environment: {
          ...prevState.environment,
          isDay: !prevState.environment.isDay,
        },
      };
      saveGame(newState);
      return newState;
    });
  };

  const handleDebugTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10); // value is in minutes
    const newTime = new Date();
    newTime.setHours(0, 0, 0, 0); // Start of day
    newTime.setMinutes(value);
    setDebugTimeOverride(newTime);
  };

  const handleToggleRain = () => {
    setGameState(prevState => {
      const isCurrentlyRaining = prevState.environment.weather?.isRaining ?? false;
      const newWeatherState = prevState.environment.weather 
        ? { ...prevState.environment.weather, isRaining: !isCurrentlyRaining }
        : { temperature: 15, isRaining: true }; // Default weather if none exists

      return {
        ...prevState,
        environment: { ...prevState.environment, weather: newWeatherState }
      }
    });
  }

  useEffect(() => {
    // Set initial day/night state and fetch weather
    setGameState(prevState => ({
      ...prevState,
      environment: {
        ...prevState.environment,
        isDay: isDayTime(),
      },
    }));
    // Fetch weather using saved location if it exists, otherwise use IP
    fetchWeatherData(gameState.environment.userLocation);

    const timer = setInterval(() => {
      // --- Sun Intensity Calculation ---
      const { sunrise, sunset } = gameState.environment;
      let sunIntensity = 0;
      let isDay = false;
      const now = debugTimeOverride || new Date();

      if (sunrise && sunset) {
        const sunriseDate = new Date(sunrise);
        const sunsetDate = new Date(sunset);

        if (now > sunriseDate && now < sunsetDate) {
          isDay = true;
          const totalDaylight = sunsetDate.getTime() - sunriseDate.getTime();
          const timeSinceSunrise = now.getTime() - sunriseDate.getTime();
          const dayPercentage = timeSinceSunrise / totalDaylight;
          // Use a sine wave for smooth transition of intensity
          sunIntensity = Math.sin(dayPercentage * Math.PI);
        }
      }

      setGameState(prevState => {
        // Only update if the game has started (seed is planted)
        if (!hasPlantedSeed) return prevState;
        
        const newState = updateGame({ ...prevState, environment: { ...prevState.environment, isDay }}, sunIntensity);
        
        if (newState === null) { // Game over signal
          const freshState = {
            ...initialGameState,
            lastUpdate: new Date(), // Create a fresh timestamp
          };
          saveGame(freshState);
          return freshState;
        }

        saveGame(newState);
        return newState;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasPlantedSeed]);

  return (
    <div className="App">
      {IS_DEBUG_MODE && (
        <div style={{ position: 'fixed', top: 0, left: 0, background: 'rgba(255,0,0,0.5)', color: 'white', padding: '2px 5px', fontSize: '10px', zIndex: 100 }}>
          DEBUG
          <button onClick={handleToggleDayNight} style={{ marginLeft: '10px' }}>
            Toggle Day/Night
          </button>
          <button onClick={handleToggleRain} style={{ marginLeft: '10px' }}>
            Toggle Rain
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px' }}>
            <label htmlFor="time-slider">Time:</label>
            <input 
              id="time-slider"
              type="range" 
              min="0" 
              max={24 * 60 -1} 
              defaultValue={new Date().getHours() * 60 + new Date().getMinutes()}
              onChange={handleDebugTimeChange}
            />
          </div>
        </div>
      )}
      <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 100 }}>
        <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>⚙️</button>
        {showSettings && (
          <form onSubmit={handleLocationSubmit} style={{ position: 'absolute', right: '30px', top: 0, background: 'white', padding: '10px', border: '1px solid black', borderRadius: '5px' }}>
            <input 
              type="text" 
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="Enter City"
            />
            <button type="submit">Set</button>
          </form>
        )}
      </div>
      <header className="App-header">
        <h1>Nur Natur</h1>
        <button onClick={handleWaterPlant} disabled={!hasPlantedSeed}>
          Water Plant
        </button>
      </header>
      <main>
        <Game 
          gameState={gameState} 
          setGameState={setGameState} 
          hasPlantedSeed={hasPlantedSeed} 
          setHasPlantedSeed={setHasPlantedSeed} 
          debugTimeOverride={debugTimeOverride}
        />
      </main>
      </div>
  );
}

interface GameProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  hasPlantedSeed: boolean;
  setHasPlantedSeed: React.Dispatch<React.SetStateAction<boolean>>;
  debugTimeOverride: Date | null;
}

// --- Hit Detection ---
function isClickInsideLeaf(x: number, y: number, leaf: LeafData): boolean {
  // This is a simplified hit detection for an ellipse.
  // 1. Translate the click coordinates to be relative to the leaf's attachment point.
  const translatedX = x - leaf.x;
  const translatedY = y - leaf.y;

  // 2. Rotate the translated coordinates in the *opposite* direction of the leaf's angle.
  const cosAngle = Math.cos(-leaf.angle);
  const sinAngle = Math.sin(-leaf.angle);
  const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
  const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

  // 3. Check if the rotated point is within the un-rotated ellipse bounds.
  const leafOffset = leaf.angle > 0 ? leaf.size : -leaf.size;
  const dx = rotatedX - leafOffset;
  const dy = rotatedY;
  
  const rx = leaf.size;
  const ry = leaf.size / 2;

  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function isClickInsideBud(x: number, y: number, bud: BudData): boolean {
  const dx = x - bud.x;
  const dy = y - bud.y;
  return (dx * dx + dy * dy) <= (bud.size * bud.size);
}

function Game({ gameState, setGameState, hasPlantedSeed, setHasPlantedSeed, debugTimeOverride }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if a withered part was clicked
    const witheredPart = gameState.plant.structure.find(p => {
        if (!p.withered) return false;
        // Simple bounding box for now, can be improved
        if (p.type === 'stem') {
            return x >= p.x - p.width / 2 && x <= p.x + p.width / 2 && y >= p.y - p.height && y <= p.y;
        }
        if (p.type === 'leaf') {
            return isClickInsideLeaf(x, y, p as LeafData);
        }
        if (p.type === 'flower') {
             return x >= p.x - p.size && x <= p.x + p.size && y >= p.y - p.size && y <= p.y + p.size;
        }
        if (p.type === 'bud') {
            return isClickInsideBud(x, y, p as BudData);
        }
        return false;
    });

    if (witheredPart) {
        // Prune the withered part
        setGameState(prevState => {
            const newStructure = prevState.plant.structure.filter(p => p.id !== witheredPart.id);
            const newState = { ...prevState, plant: { ...prevState.plant, structure: newStructure } };
            saveGame(newState);
            return newState;
        });
        return; // Don't process other clicks like planting
    }

    if (!hasPlantedSeed) {
      setHasPlantedSeed(true);
      // We don't need to change the game state here,
      // as the timer will now start running updates.
      return;
    }

    if (gameState.plant.stage === 'Harvestable') {
      // Check for bud harvesting
      const buds = gameState.plant.structure.filter(s => s.type === 'bud' && !s.withered) as BudData[];
      
      for (const bud of buds) {
        if (isClickInsideBud(x, y, bud)) {
          setGameState(prevState => {
            const newState = {
              ...prevState,
              plant: {
                ...prevState.plant,
                structure: prevState.plant.structure.filter(s => s.id !== bud.id),
              },
              teaLeavesHarvested: prevState.teaLeavesHarvested + 1,
            };
            saveGame(newState);
            return newState;
          });
          return; // Stop after harvesting one bud
        }
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- Sun/Sky Calculation ---
    const { sunrise, sunset, isDay, weather } = gameState.environment;
    const now = debugTimeOverride || new Date();
    let dayPercentage = 0;
    if (sunrise && sunset) {
      const sunriseDate = new Date(sunrise);
      const sunsetDate = new Date(sunset);
      if (now > sunriseDate && now < sunsetDate) {
        const totalDaylight = sunsetDate.getTime() - sunriseDate.getTime();
        const timeSinceSunrise = now.getTime() - sunriseDate.getTime();
        dayPercentage = timeSinceSunrise / totalDaylight;
      }
    }

    // --- Drawing ---
    const isRaining = weather?.isRaining ?? false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Sky & Weather
    // Calculate sun position
    const sunX = (canvas.width + 200) * dayPercentage - 100; // Move from left to right
    const sunY = SOIL_LEVEL - Math.sin(dayPercentage * Math.PI) * (SOIL_LEVEL - 50);

    // Dynamic sky color based on sun position
    let skyColor = isDay ? '#87CEEB' : '#000033'; // Default day/night
    if (isDay) {
      const noonColor = [135, 206, 235]; // #87CEEB
      const horizonColor = [255, 165, 0]; // orange
      const intensity = Math.sin(dayPercentage * Math.PI);
      const r = noonColor[0] + (horizonColor[0] - noonColor[0]) * (1 - intensity);
      const g = noonColor[1] + (horizonColor[1] - noonColor[1]) * (1 - intensity);
      const b = noonColor[2] + (horizonColor[2] - noonColor[2]) * (1 - intensity);
      skyColor = `rgb(${r}, ${g}, ${b})`;
    }
    if (isRaining) {
      skyColor = isDay ? '#a0b0b8' : '#2c3e50';
    }

    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Sun or Moon
    if (isDay) {
      ctx.fillStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(canvas.width - 50, 50, 30, 0, Math.PI * 2); // Fixed moon position
      ctx.fill();
    }

    // Draw Rain
    if (isRaining) {
      ctx.fillStyle = 'rgba(174,194,224,0.5)';
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillRect(x, y, 1, 10);
      }
    }

    // 2. Draw Soil
    const soilColor = `hsl(30, 30%, ${30 + (1 - gameState.plant.hydration) * 40}%)`;
    ctx.fillStyle = soilColor;
    ctx.fillRect(0, SOIL_LEVEL, canvas.width, GAME_HEIGHT - SOIL_LEVEL);


    if (!hasPlantedSeed) {
      // 2. Draw 'Click to Plant' text
      ctx.fillStyle = '#000000';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to plant a seed', canvas.width / 2, canvas.height / 2);
    } else {
      // --- Plant rendering ---
      // Draw Seed (placeholder)
      ctx.fillStyle = '#6d4c41';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, SOIL_LEVEL - 10, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw Sprout (placeholder) only during the Sprout stage
      if (gameState.plant.stage === 'Sprout') {
        ctx.fillStyle = '#66bb6a';
        ctx.fillRect(canvas.width / 2 - 2, SOIL_LEVEL - 30, 4, 20);
      }

      // Draw the procedural plant from its structure
      gameState.plant.structure.forEach(segment => {
        const isWithered = segment.withered;
        if (segment.type === 'stem') {
          ctx.fillStyle = isWithered ? '#8d6e63' : '#66bb6a'; // brown when withered
          // Draw the stem growing upwards from its base y-coordinate
          ctx.fillRect(segment.x - (segment.width / 2), segment.y - segment.height, segment.width, segment.height);
        } else if (segment.type === 'leaf') {
            ctx.save();
            ctx.translate(segment.x, segment.y);
            ctx.rotate(segment.angle);
            
            ctx.fillStyle = isWithered ? '#a1887f' : '#4caf50'; // brown when withered
            ctx.beginPath();
            // The leaf is drawn offset from its attachment point for a more natural look
            const leafOffset = segment.angle > 0 ? segment.size : -segment.size;
            ctx.ellipse(leafOffset, 0, segment.size, segment.size / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else if (segment.type === 'flower') {
          ctx.fillStyle = isWithered ? '#795548' : '#e91e63';
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segment.size, 0, Math.PI * 2);
          ctx.fill();

          // Add a small center to the flower
          ctx.fillStyle = isWithered ? '#8d6e63' : '#c8b900';
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segment.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else if (segment.type === 'bud') {
          ctx.fillStyle = isWithered ? '#6d4c41' : '#fdd835'; // Golden yellow for healthy buds
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, segment.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // --- UI Text Overlays ---
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Tea Leaves Harvested: ${gameState.teaLeavesHarvested}`, 10, 20);
    ctx.fillText(`Hydration: ${(gameState.plant.hydration * 100).toFixed(0)}%`, 10, 40);
    ctx.fillText(`Stage: ${gameState.plant.stage}`, 10, 60);
    ctx.fillText(`Growth: ${gameState.plant.growth.toFixed(2)}`, 10, 80);
    if (gameState.environment.weather) {
      ctx.fillText(`Temp: ${gameState.environment.weather.temperature}°C`, 10, 100);
      ctx.fillText(`Location: ${gameState.environment.userLocation}`, 10, 120);
    }

    // Display a warning if the plant needs water
    if (hasPlantedSeed && gameState.plant.hydration < GROWTH_HYDRATION_THRESHOLD) {
        ctx.fillStyle = 'red';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Needs Water!', canvas.width / 2, 30);
    }

  }, [gameState, hasPlantedSeed]);

  return (
    <canvas
      ref={canvasRef}
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      onClick={handleCanvasClick}
      style={{ cursor: !hasPlantedSeed ? 'pointer' : 'default' }}
    ></canvas>
  );
}

export default App;
