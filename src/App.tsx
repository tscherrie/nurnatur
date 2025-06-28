import React, { useState, useEffect, useRef } from 'react';
import type { GameState, LeafData, BudData } from './game/state';
import { initialGameState } from './game/state';
import { loadGame, saveGame, updateGame, fetchHistoricalWeather, simulateOfflineProgress } from './game/engine';
import { IS_DEBUG_MODE } from './game/debug';
import { GAME_WIDTH, GAME_HEIGHT, SOIL_LEVEL, PLANT_BASE_X, PLANT_BASE_Y } from './game/constants';

const musicTracks = {
  day: Array.from({ length: 4 }, (_, i) => `/assets/audio/day_${i + 1}.mp3`),
  rain: Array.from({ length: 2 }, (_, i) => `/assets/audio/rain_${i + 1}.mp3`),
  night: Array.from({ length: 4 }, (_, i) => `/assets/audio/night_${i + 1}.mp3`),
};

function getSoilImageForHydration(hydration: number): string {
  const level = hydration * 100;
  if (level > 90) return '/assets/images/soil/drowning_soil.webp';
  if (level > 80) return '/assets/images/soil/waterlogged_soil.webp';
  if (level > 70) return '/assets/images/soil/very_wet_soil.webp';
  if (level > 60) return '/assets/images/soil/wet_soil.webp';
  if (level > 50) return '/assets/images/soil/very_humid_soil.webp';
  if (level > 40) return '/assets/images/soil/humid_soil.webp';
  if (level > 30) return '/assets/images/soil/mildy_dry_soil.webp';
  if (level > 20) return '/assets/images/soil/dry_soil.webp';
  if (level > 10) return '/assets/images/soil/arid_soil.webp';
  return '/assets/images/soil/very_arid_soil.webp';
}

const soilImagePaths = [
  '/assets/images/soil/drowning_soil.webp',
  '/assets/images/soil/waterlogged_soil.webp',
  '/assets/images/soil/very_wet_soil.webp',
  '/assets/images/soil/wet_soil.webp',
  '/assets/images/soil/very_humid_soil.webp',
  '/assets/images/soil/humid_soil.webp',
  '/assets/images/soil/mildy_dry_soil.webp',
  '/assets/images/soil/dry_soil.webp',
  '/assets/images/soil/arid_soil.webp',
  '/assets/images/soil/very_arid_soil.webp',
];

const planterImagePath = '/assets/images/planter/acre_soil.webp';

const backgroundPaths = {
  sunrise: '/assets/images/backgrounds/sunrise.webp',
  mid_morning: '/assets/images/backgrounds/mid_morning.webp',
  noon: '/assets/images/backgrounds/noon.webp',
  mid_afternoon: '/assets/images/backgrounds/mid_afternoon.webp',
  sunset: '/assets/images/backgrounds/sunset.webp',
  day_rain: '/assets/images/backgrounds/day_rain.webp',
  night_clear: '/assets/images/backgrounds/night_clear.webp',
  night_rain: '/assets/images/backgrounds/night_rain.webp',
};

const sunPath = '/assets/images/objects/sun.webp';
const moonPath = '/assets/images/objects/moon.webp';
const wateringCanPath = '/assets/images/objects/watering_can.webp';

const leafPath = '/assets/images/plant/leaf.webp';
const flowerPath = '/assets/images/plant/flower.webp';
const budPath = '/assets/images/plant/bud.webp';
const seedPath = '/assets/images/plant/seed.webp';

function getBackgroundImage(isDay: boolean, isRaining: boolean, dayPercentage: number): string {
  if (isRaining) {
    return isDay ? backgroundPaths.day_rain : backgroundPaths.night_rain;
  }

  if (isDay) {
    if (dayPercentage < 0.1) return backgroundPaths.sunrise;
    if (dayPercentage < 0.4) return backgroundPaths.mid_morning;
    if (dayPercentage < 0.6) return backgroundPaths.noon;
    if (dayPercentage < 0.9) return backgroundPaths.mid_afternoon;
    return backgroundPaths.sunset;
  } else {
    return backgroundPaths.night_clear;
  }
}

function App() {
  const [gameState, setGameState] = useState<GameState>(loadGame());
  const [hasPlantedSeed, setHasPlantedSeed] = useState(() => {
    // A plant with any structure means a seed has been planted.
    // A growth value > 0 also works.
    return loadGame().plant.structure.length > 0;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const wateringAudioRef = useRef<HTMLAudioElement>(null);
  const [currentTrack, setCurrentTrack] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  
  // State for watering can interaction - lifted up from Game component
  const [canPos, setCanPos] = useState({ x: 0, y: 0 });
  const [isDraggingCan, setIsDraggingCan] = useState(false);
  const [isWatering, setIsWatering] = useState(false);
  const isWateringRef = useRef(isWatering);
  isWateringRef.current = isWatering;
  const [waterDrops, setWaterDrops] = useState<{id: number, x: number, y: number, speed: number}[]>([]);
  const canPosRef = useRef(canPos);
  canPosRef.current = canPos;
  
  // Need to get resting position into App scope
  useEffect(() => {
    setCanPos({ x: GAME_WIDTH - 150, y: SOIL_LEVEL - 80 });
  }, []);

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
            latitude: lat,
            longitude: lon,
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
    
    // This is tricky. We can't put the time in state as it causes too many re-renders.
    // Instead, we'll just use the slider's value directly when we need it in the loop.
    // This function now effectively does nothing to React state.
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

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
  };

  useEffect(() => {
    if (IS_DEBUG_MODE) {
      const slider = document.getElementById('time-slider') as HTMLInputElement;
      if (slider) {
        slider.value = '0';
      }
    }
    
    // --- Version Checking ---
    const checkVersion = async () => {
      try {
        const response = await fetch('/version.json?t=' + new Date().getTime()); // Prevent caching
        const data = await response.json();
        const currentVersion = localStorage.getItem('appVersion');

        if (currentVersion && data.version && currentVersion !== data.version) {
          setNewVersionAvailable(true);
        }
        
        if (data.version) {
          localStorage.setItem('appVersion', data.version);
        }
      } catch (error) {
        console.error("Could not check app version:", error);
      }
    };
    
    checkVersion(); // Check on initial load
    const versionInterval = setInterval(checkVersion, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(versionInterval);
  }, []);

  useEffect(() => {
    // This is the main setup effect.
    const now = new Date();
    const lastUpdate = new Date(gameState.lastUpdate);
    const elapsedHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const offlineThreshold = IS_DEBUG_MODE ? (1 / 60) : 1; // 1 minute in debug, 1 hour otherwise.

    const performStartup = async () => {
      if (elapsedHours > offlineThreshold && gameState.environment.latitude && gameState.environment.longitude) {
        setIsSimulating(true);
        console.log(`Player has been away for ${elapsedHours.toFixed(2)} hours. Simulating offline progress...`);
        
        const historicalData = await fetchHistoricalWeather(
          gameState.environment.latitude,
          gameState.environment.longitude,
          lastUpdate,
          now
        );
        
        if (historicalData) {
          const simulatedState = simulateOfflineProgress(gameState, historicalData);
          setGameState(simulatedState);
          saveGame(simulatedState); // Save the new state immediately
        }
        
        setIsSimulating(false);
      }

      // Set initial day/night state and fetch current weather for the UI
      setGameState(prevState => ({
        ...prevState,
        environment: {
          ...prevState.environment,
          isDay: isDayTime(),
        },
      }));
      // Fetch current weather for the UI
      fetchWeatherData(gameState.environment.userLocation);

      let lastLogicUpdate = Date.now();
      const timer = setInterval(() => {
        const now = Date.now();

        // --- Game Logic Update (runs once per second) ---
        if (now - lastLogicUpdate >= 1000) {
          lastLogicUpdate = now;

          setGameState(prevState => {
            // Only update if the game has started (seed is planted)
            if (!hasPlantedSeed) return prevState;
            
            // --- Sun Intensity Calculation ---
            const { sunrise, sunset } = prevState.environment;
            let sunIntensity = 0;
            const currentTime = new Date(); // Use real time for this calculation
            if (sunrise && sunset) {
              const sunriseDate = new Date(sunrise);
              const sunsetDate = new Date(sunset);
              if (currentTime > sunriseDate && currentTime < sunsetDate) {
                const totalDaylight = sunsetDate.getTime() - sunriseDate.getTime();
                const timeSinceSunrise = currentTime.getTime() - sunriseDate.getTime();
                const dayPercentage = timeSinceSunrise / totalDaylight;
                sunIntensity = Math.sin(dayPercentage * Math.PI);
              }
            }

            let stateWithWatering = prevState;
            const hydrationRate = IS_DEBUG_MODE ? 0.1 : 0.01;
            // Continuous watering - must be immutable
            if (isWateringRef.current) {
              stateWithWatering = {
                ...prevState,
                plant: {
                  ...prevState.plant,
                  hydration: Math.min(1, prevState.plant.hydration + hydrationRate),
                }
              };
            }

            // Pass the (potentially updated) state to the main game update function.
            const newState = updateGame(stateWithWatering, sunIntensity);
            
            if (newState) {
                saveGame(newState);
                return newState;
            }
            return prevState; // Should not happen with new logic, but safe fallback
          });
        }


        // --- Water Drop Animation (runs every frame) ---
        setWaterDrops(prevDrops => {
          let newDrops = [...prevDrops];
          
          // Add new drops if watering
          if (isWateringRef.current) {
            // Calculate spout position based on can position and rotation
            const spoutOffsetX = -95; // Shifted back to the right
            const spoutOffsetY = -70; // Move the origin up to match the spout
            const angle = -Math.PI / 4;  
            const rotatedSpoutX = spoutOffsetX * Math.cos(angle) - spoutOffsetY * Math.sin(angle);
            const rotatedSpoutY = spoutOffsetX * Math.sin(angle) + spoutOffsetY * Math.cos(angle);
            
            const spoutX = canPosRef.current.x + rotatedSpoutX;
            const spoutY = canPosRef.current.y + rotatedSpoutY;

            for (let i = 0; i < 2; i++) { // Add 2 drops per frame for a fuller stream
              newDrops.push({
                id: Date.now() + Math.random(),
                x: spoutX + (Math.random() - 0.5) * 30, // Wider horizontal spread
                y: spoutY,
                speed: 2 + Math.random() * 2
              });
            }
          }
          
          // Move and filter existing drops
          newDrops = newDrops
            .map(drop => ({ ...drop, y: drop.y + drop.speed }))
            .filter(drop => drop.y < SOIL_LEVEL - 20);

          return newDrops;
        });
      }, 1000 / 60); // Run at 60fps for smooth animation

      return () => clearInterval(timer);
    };

    performStartup();
  }, [hasPlantedSeed]);

  useEffect(() => {
    const musicAudio = audioRef.current;
    const wateringAudio = wateringAudioRef.current;
    if (musicAudio) {
      musicAudio.muted = isMuted;
    }
    if (wateringAudio) {
      wateringAudio.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    const audio = wateringAudioRef.current;
    if (!audio) return;

    if (isWatering) {
      audio.play().catch(e => console.error("Watering sound failed to play", e));
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [isWatering]);

  useEffect(() => {
    // --- Audio Control ---
    const audio = audioRef.current;
    if (!audio || !hasPlantedSeed) return;

    const { isDay } = gameState.environment;
    const isRaining = gameState.environment.weather?.isRaining ?? false;
    let newTrackCategory: 'day' | 'rain' | 'night';

    if (isRaining) {
      newTrackCategory = 'rain';
    } else if (isDay) {
      newTrackCategory = 'day';
    } else {
      newTrackCategory = 'night';
    }
    
    const potentialTracks = musicTracks[newTrackCategory];
    if (!potentialTracks.some(track => currentTrack.includes(track))) {
      const newTrack = potentialTracks[Math.floor(Math.random() * potentialTracks.length)];
      setCurrentTrack(newTrack);
      audio.src = newTrack;
      audio.play().catch(error => console.error("Audio playback failed:", error));
    }
  }, [gameState.environment.isDay, gameState.environment.weather?.isRaining, hasPlantedSeed]);

  useEffect(() => {
    // This effect ensures that when the game resets (e.g., after plant death),
    // we return to the initial planter screen.
    if (gameState.plant.structure.length === 0 && hasPlantedSeed) {
      setHasPlantedSeed(false);
    }
  }, [gameState.plant.structure.length, hasPlantedSeed]);

  const handleResetGame = () => {
    const freshState = {
        ...initialGameState,
        environment: gameState.environment, // Keep weather and location settings
        lastUpdate: new Date(),
    };
    saveGame(freshState);
    setGameState(freshState);
    setHasPlantedSeed(false); // Go back to the initial screen
  };

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
      <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 100, display: 'flex', alignItems: 'center' }}>
        <button onClick={handleToggleMute} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', marginRight: '5px' }}>
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>⚙️</button>
        {showSettings && (
          <form onSubmit={handleLocationSubmit} style={{ position: 'absolute', right: '0', top: '40px', background: 'white', padding: '10px', border: '1px solid black', borderRadius: '5px' }}>
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
      {newVersionAvailable && (
        <div className="version-banner" onClick={() => window.location.reload()}>
          A new version is available. Click to update.
        </div>
      )}
      {isSimulating && (
        <div className="simulation-overlay">
          <p>Updating your plant's progress...</p>
        </div>
      )}
      <header className="App-header">
        <h1>Nur Natur</h1>
      </header>
      <main>
        <Game 
          gameState={gameState} 
          setGameState={setGameState} 
          hasPlantedSeed={hasPlantedSeed} 
          setHasPlantedSeed={setHasPlantedSeed} 
          canPos={canPos}
          setCanPos={setCanPos}
          isDraggingCan={isDraggingCan}
          setIsDraggingCan={setIsDraggingCan}
          isWatering={isWatering}
          setIsWatering={setIsWatering}
          waterDrops={waterDrops}
          onResetGame={handleResetGame}
        />
      </main>
      <audio ref={audioRef} loop />
      <audio ref={wateringAudioRef} src="/assets/audio/objects/watering_can.mp3" loop />
    </div>
  );
}

interface GameProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  hasPlantedSeed: boolean;
  setHasPlantedSeed: React.Dispatch<React.SetStateAction<boolean>>;
  canPos: { x: number; y: number; };
  setCanPos: (pos: { x: number; y: number; }) => void;
  isDraggingCan: boolean;
  setIsDraggingCan: (isDragging: boolean) => void;
  isWatering: boolean;
  setIsWatering: (isWatering: boolean) => void;
  waterDrops: {id: number, x: number, y: number}[];
  onResetGame: () => void;
}

// --- Hit Detection ---
function isClickInsideLeaf(x: number, y: number, leaf: LeafData, leafImage: HTMLImageElement | null): boolean {
  if (!leafImage || !leafImage.naturalWidth) return false;

  const aspectRatio = leafImage.naturalWidth / leafImage.naturalHeight;
  const h = leaf.currentSize * 5;
  const w = h * aspectRatio;

  // The image is drawn from (-w/2, -h) to (w/2, 0) in its local, rotated coordinate system.
  // We perform an inverse transformation on the click coordinates to check if they fall within this box.
  
  // 1. Translate click to the leaf's pivot point
  const translatedX = x - leaf.x;
  const translatedY = y - leaf.y;

  // 2. Rotate the translated point by the *opposite* of the leaf's angle
  const cosAngle = Math.cos(-leaf.angle);
  const sinAngle = Math.sin(-leaf.angle);
  const localX = translatedX * cosAngle - translatedY * sinAngle;
  const localY = translatedX * sinAngle + translatedY * cosAngle;

  // 3. Check if the local point is within the image's drawing bounds
  return localX >= -w / 2 && localX <= w / 2 && localY >= -h && localY <= 0;
}

function isClickInsideCenteredImage(x: number, y: number, segment: { x: number, y: number, size: number }, scale: number): boolean {
    const h = segment.size * scale;
    const w = h; // Assuming a square image for buds and flowers

    const halfW = w / 2;
    const halfH = h / 2;

    return (
        x >= segment.x - halfW &&
        x <= segment.x + halfW &&
        y >= segment.y - halfH &&
        y <= segment.y + halfH
    );
}

function Game({ 
  gameState, setGameState, hasPlantedSeed, setHasPlantedSeed, 
  canPos, setCanPos, isDraggingCan, setIsDraggingCan, isWatering, setIsWatering,
  waterDrops, onResetGame
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [soilImages, setSoilImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [planterImage, setPlanterImage] = useState<HTMLImageElement | null>(null);
  const [backgroundImages, setBackgroundImages] = useState<{[key: string]: HTMLImageElement}>({});
  const [sunImage, setSunImage] = useState<HTMLImageElement | null>(null);
  const [moonImage, setMoonImage] = useState<HTMLImageElement | null>(null);
  const [wateringCanImage, setWateringCanImage] = useState<HTMLImageElement | null>(null);
  const [leafImage, setLeafImage] = useState<HTMLImageElement | null>(null);
  const [flowerImage, setFlowerImage] = useState<HTMLImageElement | null>(null);
  const [budImage, setBudImage] = useState<HTMLImageElement | null>(null);
  const [seedImage, setSeedImage] = useState<HTMLImageElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const restingCanPos = { x: GAME_WIDTH - 150, y: SOIL_LEVEL - 80 };

  // Preload images
  useEffect(() => {
    const images: {[key:string]: HTMLImageElement} = {};
    soilImagePaths.forEach(path => {
        const img = new Image();
        img.src = path;
        images[path] = img;
    });
    setSoilImages(images);

    const pImg = new Image();
    pImg.src = planterImagePath;
    setPlanterImage(pImg);

    const bgImages: {[key: string]: HTMLImageElement} = {};
    Object.values(backgroundPaths).forEach(path => {
        const img = new Image();
        img.src = path;
        bgImages[path] = img;
    });
    setBackgroundImages(bgImages);

    const sunImg = new Image();
    sunImg.src = sunPath;
    setSunImage(sunImg);

    const moonImg = new Image();
    moonImg.src = moonPath;
    setMoonImage(moonImg);

    const canImg = new Image();
    canImg.src = wateringCanPath;
    setWateringCanImage(canImg);

    const leafImg = new Image();
    leafImg.src = leafPath;
    setLeafImage(leafImg);

    const flowerImg = new Image();
    flowerImg.src = flowerPath;
    setFlowerImage(flowerImg);

    const budImg = new Image();
    budImg.src = budPath;
    setBudImage(budImg);

    const seedImg = new Image();
    seedImg.src = seedPath;
    setSeedImage(seedImg);
  }, []);

  const getEventCoordinates = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in event.nativeEvent) {
      clientX = event.nativeEvent.touches[0].clientX;
      clientY = event.nativeEvent.touches[0].clientY;
    } else {
      clientX = event.nativeEvent.clientX;
      clientY = event.nativeEvent.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const isOverObject = (pos: {x: number, y: number}, objPos: {x: number, y: number}, img: HTMLImageElement | null) => {
    if (!img) return false;
    const width = img.width;
    const height = img.height;
    return (
      pos.x > objPos.x - width / 2 &&
      pos.x < objPos.x + width / 2 &&
      pos.y > objPos.y - height / 2 &&
      pos.y < objPos.y + height / 2
    );
  };
  
  const isOverPlantArea = (pos: {x: number, y: number}) => {
    // Expand the watering zone to be wider and taller for a better feel.
    const plantArea = {
      x: GAME_WIDTH / 2 - 40, // Shifted more to the right
      y: SOIL_LEVEL - 700,   // Start higher up
      width: 300,              // Make it wide
      height: 600              // Make it tall, ending at the soil level
    }
    return (
      pos.x > plantArea.x &&
      pos.x < plantArea.x + plantArea.width &&
      pos.y > plantArea.y &&
      pos.y < plantArea.y + plantArea.height
    );
  }

  const handleInteractionStart = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getEventCoordinates(event);
    if (isOverObject(coords, canPos, wateringCanImage)) {
      setIsDraggingCan(true);
    }
  };

  const handleInteractionMove = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getEventCoordinates(event);
    setMousePos(coords);

    if (!isDraggingCan) return;
    setCanPos(coords);
    
    if (isOverPlantArea(coords)) {
      setIsWatering(true);
    } else {
      setIsWatering(false);
    }
  };

  const handleInteractionEnd = () => {
    setIsDraggingCan(false);
    setIsWatering(false);
    setCanPos(restingCanPos);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState.plant.stage === 'Dead') {
      onResetGame();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if a withered part was clicked
    const witheredPart = gameState.plant.structure.find(p => {
        if (!p.withered) return false;
        
        if (p.type === 'stem') {
            return x >= p.x - p.width / 2 && x <= p.x + p.width / 2 && y >= p.y - p.height && y <= p.y;
        }
        if (p.type === 'leaf') {
            return isClickInsideLeaf(x, y, p as LeafData, leafImage);
        }
        if (p.type === 'flower') {
             return isClickInsideCenteredImage(x, y, p, 5);
        }
        if (p.type === 'bud') {
            return isClickInsideCenteredImage(x, y, p, 8);
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
      // Immediately create the first seed to avoid the reset logic misfiring.
      setGameState(prevState => {
        const newSeed = { 
            id: `seed-${Date.now()}`, 
            type: 'seed' as const, 
            x: PLANT_BASE_X, 
            y: PLANT_BASE_Y, 
            size: 10, // A nominal size for the seed object
            withered: false 
        };
        const newState = {
          ...prevState,
          plant: {
            ...prevState.plant,
            growth: 0,
            stage: 'Seed' as const,
            structure: [newSeed],
          }
        };
        saveGame(newState); // Save the initial plant structure immediately
        return newState;
      });
      // Start music on first interaction
      document.querySelector('audio')?.play().catch(_e => console.log("Audio play failed until next interaction"));
      return;
    }

    if (gameState.plant.stage === 'Harvestable') {
      // Check for bud harvesting
      const buds = gameState.plant.structure.filter(s => s.type === 'bud' && !s.withered) as BudData[];
      
      for (const bud of buds) {
        if (isClickInsideCenteredImage(x, y, bud, 8)) {
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
    
    const timeSlider = IS_DEBUG_MODE ? document.getElementById('time-slider') as HTMLInputElement : null;
    let now: Date;

    if (timeSlider && timeSlider.value) {
      const value = parseInt(timeSlider.value, 10);
      now = new Date();
      now.setHours(0, 0, 0, 0);
      now.setMinutes(value);
    } else {
      now = new Date();
    }

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

    // 1. Draw Background
    const bgImageSrc = getBackgroundImage(isDay, isRaining, dayPercentage);
    const bgImage = backgroundImages[bgImageSrc];
    if (bgImage?.complete) {
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    }

    // Draw Sun or Moon, but only if it's not raining
    if (!isRaining) {
      if (isDay && sunImage?.complete) {
        const sunX = (canvas.width + 200) * dayPercentage - 100;
        const sunY = SOIL_LEVEL - Math.sin(dayPercentage * Math.PI) * (SOIL_LEVEL - 50);
        ctx.drawImage(sunImage, sunX - sunImage.width / 2, sunY - sunImage.height / 2);
      } else if (!isDay && moonImage?.complete) {
        ctx.drawImage(moonImage, canvas.width - 150, 50);
      }
    }

    // Draw Rain
    if (isRaining) {
      ctx.fillStyle = 'rgba(230, 240, 255, 0.8)'; // Use a consistent, nearly-white color for good contrast
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillRect(x, y, 1, 10);
      }
    }

    // 2. Draw Soil
    if (!hasPlantedSeed) {
      if (planterImage?.complete && planterImage.naturalWidth > 0) {
        const baseSoilHeight = GAME_HEIGHT - SOIL_LEVEL;
        const soilHeight = baseSoilHeight * 2;
        const aspectRatio = planterImage.naturalWidth / planterImage.naturalHeight;
        const drawnWidth = soilHeight * aspectRatio;
        const xOffset = (canvas.width - drawnWidth) / 2;
        const yPosition = SOIL_LEVEL - baseSoilHeight;
        ctx.drawImage(planterImage, xOffset, yPosition, drawnWidth, soilHeight);
      }
      // Draw 'Click to Plant' text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click to plant a seed', canvas.width / 2, canvas.height / 2);
    } else {
      const soilImageSrc = getSoilImageForHydration(gameState.plant.hydration);
      const soilImage = soilImages[soilImageSrc];
      if (soilImage?.complete && soilImage.naturalWidth > 0) {
          const baseSoilHeight = GAME_HEIGHT - SOIL_LEVEL;
          const soilHeight = baseSoilHeight * 2; // Double the size
          const aspectRatio = soilImage.naturalWidth / soilImage.naturalHeight;
          const drawnWidth = soilHeight * aspectRatio;
          const xOffset = (canvas.width - drawnWidth) / 2;
          // Move the image up by half of its original height
          const yPosition = SOIL_LEVEL - baseSoilHeight;
          ctx.drawImage(soilImage, xOffset, yPosition, drawnWidth, soilHeight);
      }

      // 3. Draw Watering Can
      if (wateringCanImage?.complete) {
        ctx.save();
        
        if (isWatering) {
          // Translate to the rotation point (e.g., center of the can) and rotate
          ctx.translate(canPos.x, canPos.y);
          ctx.rotate(-Math.PI / 4); // Rotate 45 degrees counter-clockwise
          ctx.drawImage(wateringCanImage, -wateringCanImage.width / 2, -wateringCanImage.height / 2);
        } else {
          ctx.drawImage(wateringCanImage, canPos.x - wateringCanImage.width / 2, canPos.y - wateringCanImage.height / 2);
        }

        ctx.restore();
      }

      // 4. Draw Water Drops
      ctx.fillStyle = ' rgba(191, 219, 255, 0.9)';
      waterDrops.forEach(drop => {
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // --- Plant rendering ---
      gameState.plant.structure.forEach(segment => {
        const isWithered = segment.withered;
        if (segment.type === 'stem') {
          ctx.fillStyle = isWithered ? '#8d6e63' : '#66bb6a'; // brown when withered
          ctx.fillRect(segment.x - (segment.width / 2), segment.y - segment.height, segment.width, segment.height);
        } else if (segment.type === 'seed' && seedImage?.complete) {
            const h = 80; // Double the size
            const aspectRatio = seedImage.naturalWidth / seedImage.naturalHeight;
            const w = h * aspectRatio;
            ctx.drawImage(seedImage, segment.x - w / 2, segment.y - (h * 0.5), w, h);
        } else if (segment.type === 'leaf' && leafImage?.complete) {
            ctx.save();
            ctx.translate(segment.x, segment.y);
            ctx.rotate(segment.angle);
            
            const aspectRatio = leafImage.naturalWidth / leafImage.naturalHeight;
            const h = segment.currentSize * 5; // Use currentSize for dynamic growth
            const w = h * aspectRatio;

            // Since the image points up, we need to draw it "above" the attachment point.
            // We'll offset it by half its height so the base connects to the stem.
            if (isWithered) ctx.globalAlpha = 0.5;
            ctx.drawImage(leafImage, -w / 2, -h, w, h);
            if (isWithered) ctx.globalAlpha = 1.0;

            ctx.restore();
        } else if (segment.type === 'flower' && flowerImage?.complete) {
            ctx.save();
            ctx.translate(segment.x, segment.y);
            const angle = segment.x > PLANT_BASE_X ? -Math.PI / 2 : Math.PI / 2;
            ctx.rotate(angle);
            const h = segment.size * 5; 
            const w = h;
            if (isWithered) ctx.globalAlpha = 0.5;
            ctx.drawImage(flowerImage, -w / 2, -h / 2, w, h);
            if (isWithered) ctx.globalAlpha = 1.0;
            ctx.restore();
        } else if (segment.type === 'bud' && budImage?.complete) {
            ctx.save();
            ctx.translate(segment.x, segment.y);
            ctx.rotate((segment as BudData).angle);
            const h = segment.size * 16;
            const w = h;
            if (isWithered) ctx.globalAlpha = 0.5;
            ctx.drawImage(budImage, -w / 2, -h / 2, w, h);
            if (isWithered) ctx.globalAlpha = 1.0;
            ctx.restore();
        }
      });
    }

    // --- Death Screen Overlay ---
    if (gameState.plant.stage === 'Dead') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Your plant has died.', canvas.width / 2, canvas.height / 2 - 20);
    }

    // --- UI Text Overlays ---
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Tea Leaves Harvested: ${gameState.teaLeavesHarvested}`, 10, 20);
    if (IS_DEBUG_MODE) {
      ctx.fillText(`Hydration: ${(gameState.plant.hydration * 100).toFixed(0)}%`, 10, 40);
      ctx.fillText(`Stage: ${gameState.plant.stage}`, 10, 60);
      ctx.fillText(`Growth: ${gameState.plant.growth.toFixed(2)}`, 10, 80);
    }
    if (gameState.environment.weather) {
      ctx.fillText(`Temp: ${gameState.environment.weather.temperature}°C`, 10, IS_DEBUG_MODE ? 100 : 40);
      ctx.fillText(`Location: ${gameState.environment.userLocation}`, 10, IS_DEBUG_MODE ? 120 : 60);
    }

  }, [gameState, hasPlantedSeed, soilImages, planterImage, backgroundImages, isDraggingCan, isWatering, canPos, waterDrops, leafImage, flowerImage, budImage, seedImage]);

  return (
    <>
    <canvas
      ref={canvasRef}
      width={GAME_WIDTH}
      height={GAME_HEIGHT}
      onClick={handleCanvasClick}
      onMouseDown={handleInteractionStart}
      onMouseMove={handleInteractionMove}
      onMouseUp={handleInteractionEnd}
      onMouseLeave={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      onTouchMove={handleInteractionMove}
      onTouchEnd={handleInteractionEnd}
      style={{ cursor: isDraggingCan ? 'grabbing' : (isOverObject(mousePos, canPos, wateringCanImage) ? 'grab' : (gameState.plant.stage === 'Dead' ? 'pointer' : (!hasPlantedSeed ? 'pointer' : 'default'))) }}
    ></canvas>
    </>
  );
}

export default App;
