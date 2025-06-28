import type { GameState, PlantStage, LeafData, FlowerData, BudData, PlantSegment, StemData } from './state';
import { initialGameState } from './state';
import { IS_DEBUG_MODE } from './debug';
import { PLANT_BASE_X, PLANT_BASE_Y } from './constants';

const STORAGE_KEY = 'nurnatur-game-state';

/**
 * A utility function to format a Date object into 'YYYY-MM-DD' string format.
 */
function toAPIDateFormat(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function fetchHistoricalWeather(lat: number, lon: number, startDate: Date, endDate: Date) {
  const start_date = toAPIDateFormat(startDate);
  const end_date = toAPIDateFormat(endDate);

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&hourly=temperature_2m,precipitation&daily=sunrise,sunset&timezone=auto`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Historical weather data fetch failed: ${response.statusText}`);
    }
    const data = await response.json();
    console.log("Structured Historical Weather API Response:", data);
    return data;
  } catch (error) {
    console.error("Error fetching historical weather data:", error);
    return null;
  }
}

/**
 * Calculates the sun's intensity for a given hour based on sunrise and sunset times.
 * @returns A value between 0 (night) and 1 (peak day).
 */
function calculateSunIntensityForHour(hour: Date, sunrise: Date, sunset: Date): number {
  if (hour > sunrise && hour < sunset) {
    const totalDaylight = sunset.getTime() - sunrise.getTime();
    if (totalDaylight <= 0) return 0;
    const timeSinceSunrise = hour.getTime() - sunrise.getTime();
    const dayPercentage = timeSinceSunrise / totalDaylight;
    return Math.sin(dayPercentage * Math.PI);
  }
  return 0;
}

export function simulateOfflineProgress(state: GameState, historicalData: any): GameState {
  // Create a deep mutable copy of the state to modify during the simulation
  const simulatedState: GameState = JSON.parse(JSON.stringify(state));

  const hourlyTime = historicalData.hourly.time;
  const hourlyTemp = historicalData.hourly.temperature_2m;
  const hourlyPrecip = historicalData.hourly.precipitation;
  const dailyTime = historicalData.daily.time;
  const dailySunrise = historicalData.daily.sunrise;
  const dailySunset = historicalData.daily.sunset;

  // Loop through each hour of absence
  for (let i = 0; i < hourlyTime.length; i++) {
    const currentHour = new Date(hourlyTime[i]);
    const currentTemp = hourlyTemp[i];
    const currentPrecip = hourlyPrecip[i];

    // Find the corresponding day's data for sunrise and sunset
    const dayString = hourlyTime[i].split('T')[0];
    const dayIndex = dailyTime.indexOf(dayString);
    if (dayIndex === -1) continue; // Skip if we can't find daily data for this hour

    const sunrise = new Date(dailySunrise[dayIndex]);
    const sunset = new Date(dailySunset[dayIndex]);

    // 1. Handle rain first. If it rained, plant is fully hydrated.
    if (currentPrecip > 0) {
      simulatedState.plant.hydration = 1;
      simulatedState.plant.timeAtZeroHydration = 0; // Reset withering timer
    }

    // If temp is null, we can't do much. Let's skip this hour's simulation.
    if (currentTemp === null) continue;

    // Update the weather in the simulated state for this hour
    simulatedState.environment.weather = {
      temperature: currentTemp,
      isRaining: currentPrecip > 0,
    };
    
    // 2. Dehydration Step (for 1 hour)
    const { newHydration, newTimeAtZeroHydration, newStructure: structureAfterDehydration } = updateDehydrationAndWithering(simulatedState, 1);
    simulatedState.plant.hydration = newHydration;
    simulatedState.plant.timeAtZeroHydration = newTimeAtZeroHydration;
    simulatedState.plant.structure = structureAfterDehydration;

    // 3. Growth Step (for 1 hour)
    const sunIntensity = calculateSunIntensityForHour(currentHour, sunrise, sunset);
    const { newGrowth, newStructure } = updateGrowthAndStructure(simulatedState, 1, newHydration, structureAfterDehydration, sunIntensity);
    simulatedState.plant.growth = newGrowth;
    simulatedState.plant.structure = newStructure;
    
    // 4. Update the plant's overall stage
    simulatedState.plant.stage = updateState(newGrowth, newStructure).newStage;
  }

  // Set the final lastUpdate time to now.
  simulatedState.lastUpdate = new Date();

  console.log("Offline simulation complete. New state:", simulatedState);
  return simulatedState;
}

export function saveGame(state: GameState): void {
  try {
    const stateString = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, stateString);
  } catch (error) {
    console.error("Could not save game state", error);
  }
}

export function loadGame(): GameState {
  try {
    const stateString = localStorage.getItem(STORAGE_KEY);
    if (!stateString) {
      return initialGameState;
    }
    const savedState = JSON.parse(stateString);
    
    // Create a new state object by merging the saved state into the initial state.
    // This ensures that any new properties added to the state in updates are present.
    const migratedState: GameState = {
      ...initialGameState,
      ...savedState,
      plant: {
        ...initialGameState.plant,
        ...savedState.plant,
      },
      // Keep the saved environment
      environment: savedState.environment ? { ...initialGameState.environment, ...savedState.environment } : initialGameState.environment,
    };
    
    // Dates are not automatically converted from JSON, so we need to parse them back
    migratedState.lastUpdate = new Date(migratedState.lastUpdate);
    if (migratedState.environment.sunrise) {
      migratedState.environment.sunrise = new Date(migratedState.environment.sunrise).toISOString();
    }
    if (migratedState.environment.sunset) {
      migratedState.environment.sunset = new Date(migratedState.environment.sunset).toISOString();
    }

    return migratedState;
  } catch (error) {
    console.error("Could not load game state, starting a new game.", error);
    return initialGameState;
  }
}

// Growth thresholds for different milestones
const GROWTH_THRESHOLDS: Record<PlantStage, number> = {
  Seed: 0,
  Sprout: 1,
  Young: 2,
  Mature: 4,
  Flowering: 5,
  Harvestable: 6,
  Withering: Infinity, // A special case
  Dead: Infinity, // A special case
};

// Structure-specific growth points
const STRUCTURE_GROWTH_POINTS = {
  SPROUT_HEIGHT_1: 1.2,
  SPROUT_HEIGHT_2: 1.5,
  SPROUT_LEAF_1: 1.8,
  YOUNG_STEM_FULL_HEIGHT: 2.5,
  MATURE_STEM_GROWTH_END: 4.5,
  FLOWER_1: 5.2,
  FLOWER_2: 5.4,
  FLOWER_3: 5.6,
  BUD_1: 6.1,
  BUD_2: 6.2,
  BUD_3: 6.3,
  BUD_4: 6.4,
};

export const GROWTH_HYDRATION_THRESHOLD = 0.4; // Plant only grows if hydration is above 40%

const REAL_GROWTH_RATE_PER_HOUR = 0.1; // Takes 10 hours of good hydration to grow to next stage
const DEBUG_GROWTH_RATE_PER_HOUR = REAL_GROWTH_RATE_PER_HOUR * 3600; // ~10 seconds in debug
const GROWTH_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_GROWTH_RATE_PER_HOUR : REAL_GROWTH_RATE_PER_HOUR;

const REAL_DEHYDRATION_RATE_PER_HOUR = 0.02; // Plant loses 2% hydration per hour
// In debug mode, we speed this up significantly to be 2% per second
const DEBUG_DEHYDRATION_RATE_PER_HOUR = REAL_DEHYDRATION_RATE_PER_HOUR * 3600; 

const DEHYDRATION_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_DEHYDRATION_RATE_PER_HOUR : REAL_DEHYDRATION_RATE_PER_HOUR;

const DAY_GROWTH_MULTIPLIER = 1.5; // Plants grow up to 50% faster during the day
const DEHYDRATION_TEMP_BASE = 20; // Celsius
const DEHYDRATION_TEMP_FACTOR = 0.05; // 5% change in dehydration per degree above/below base

// New constant: How many hours of zero hydration it takes for one plant part to wither.
const REAL_WITHER_RATE_PER_PART_HOURS = 4;
const DEBUG_WITHER_RATE_PER_PART_HOURS = 5 / 3600; // 5 seconds per part in debug
const WITHER_RATE_PER_PART_HOURS = IS_DEBUG_MODE ? DEBUG_WITHER_RATE_PER_PART_HOURS : REAL_WITHER_RATE_PER_PART_HOURS;

function getTemperatureGrowthFactor(temp: number): number {
  if (temp < 15) return 0.20;
  if (temp > 33) return 0.20;
  const factors: { [key: number]: number } = {
    15: 0.20, 16: 0.29, 17: 0.36, 18: 0.43, 19: 0.50, 20: 0.57,
    21: 0.64, 22: 0.71, 23: 0.79, 24: 0.86, 25: 0.93, 26: 1.00,
    27: 0.89, 28: 0.78, 29: 0.67, 30: 0.56, 31: 0.44, 32: 0.33,
    33: 0.20,
  };
  return factors[Math.round(temp)] ?? 0.2; // Default to 0.2 if temp is somehow out of range
}

function getHydrationGrowthFactor(hydration: number): number {
  const level = hydration * 100;
  if (level > 80) return 0.50;
  if (level > 70) return 0.60;
  if (level > 60) return 0.70;
  if (level > 50) return 0.80;
  if (level > 40) return 1.00;
  if (level > 30) return 0.95;
  if (level > 20) return 0.60;
  if (level > 10) return 0.15;
  return 0.00;
}

function updateDehydrationAndWithering(state: GameState, elapsedHours: number) {
  const { weather } = state.environment;

  // If it's raining, the plant is fully hydrated.
  if (weather?.isRaining) {
    return { newHydration: 1, newTimeAtZeroHydration: 0, newStructure: state.plant.structure };
  }

  let dehydrationRate = DEHYDRATION_RATE_PER_HOUR;
  if (weather) {
    const tempMultiplier = 1 + (weather.temperature - DEHYDRATION_TEMP_BASE) * DEHYDRATION_TEMP_FACTOR;
    dehydrationRate *= Math.max(0.5, tempMultiplier); // Don't let it go below half rate or get too extreme
  }

  let newHydration = state.plant.hydration - (dehydrationRate * elapsedHours);
  newHydration = Math.max(0, newHydration);

  let newTimeAtZeroHydration = state.plant.timeAtZeroHydration;
  let newStructure = [...state.plant.structure];

  if (newHydration <= 0) {
    newTimeAtZeroHydration += elapsedHours;

    const totalParts = newStructure.length;
    if (totalParts > 0) {
      const numAlreadyWithered = newStructure.filter(p => p.withered).length;
      const numThatShouldBeWithered = Math.floor(newTimeAtZeroHydration / WITHER_RATE_PER_PART_HOURS);
      const numToWitherThisTick = Math.max(0, numThatShouldBeWithered - numAlreadyWithered);

      if (numToWitherThisTick > 0) {
        const nonWitheredParts = newStructure.filter(p => !p.withered);
        const partsToWither = nonWitheredParts.slice(-numToWitherThisTick);
        const idsToWither = new Set(partsToWither.map(p => p.id));
        newStructure = newStructure.map(p =>
          idsToWither.has(p.id) ? { ...p, withered: true } : p
        );
      }
    }
  } else {
    newTimeAtZeroHydration = 0;
  }

  return { newHydration, newTimeAtZeroHydration, newStructure };
}

function updateGrowthAndStructure(state: GameState, elapsedHours: number, currentHydration: number, currentStructure: PlantSegment[], sunIntensity: number) {
  let newGrowth = state.plant.growth;
  let newStructure = [...currentStructure];

  const isAnyPartWithered = newStructure.some(p => p.withered);
  const hydrationFactor = getHydrationGrowthFactor(currentHydration);

  if (!isAnyPartWithered && hydrationFactor > 0) {
    const sunGrowthFactor = 1 + (DAY_GROWTH_MULTIPLIER - 1) * sunIntensity;
    const temp = state.environment.weather?.temperature ?? 20;
    const tempGrowthFactor = getTemperatureGrowthFactor(temp);
    const baseGrowthRate = GROWTH_RATE_PER_HOUR * sunGrowthFactor * tempGrowthFactor * hydrationFactor;
    const growthThisTick = baseGrowthRate * elapsedHours;
    newGrowth += growthThisTick;

    const hasSeed = newStructure.some(s => s.type === 'seed');
    let mainStem = newStructure.find(s => s.type === 'stem');
    const existingLeaves = newStructure.filter(s => s.type === 'leaf');

    if (hasSeed && newGrowth >= GROWTH_THRESHOLDS.Sprout) {
      newStructure = newStructure.filter(s => s.type !== 'seed');
      const newStem = { id: `stem-${Date.now()}`, type: 'stem' as const, x: PLANT_BASE_X, y: PLANT_BASE_Y, width: 4, height: 20, withered: false };
      newStructure.push(newStem);
      mainStem = newStem;
    }

    if (mainStem && mainStem.type === 'stem' && newGrowth >= GROWTH_THRESHOLDS.Sprout && newGrowth < GROWTH_THRESHOLDS.Young) {
      const stemIndex = newStructure.findIndex(s => s.id === mainStem.id);
      let targetHeight = mainStem.height;

      if (newGrowth >= STRUCTURE_GROWTH_POINTS.SPROUT_HEIGHT_1) targetHeight = 30;
      if (newGrowth >= STRUCTURE_GROWTH_POINTS.SPROUT_HEIGHT_2) targetHeight = 40;
      
      const currentStem = newStructure[stemIndex] as StemData;
      newStructure[stemIndex] = { ...currentStem, height: Math.max(currentStem.height, targetHeight) };
      
      if (newGrowth >= STRUCTURE_GROWTH_POINTS.SPROUT_LEAF_1 && existingLeaves.length === 0) {
        const sproutStem = newStructure[stemIndex] as StemData;
        const yPosition = sproutStem.y - sproutStem.height + 5;
        const xPosition = sproutStem.x;
        const newLeaf: LeafData = { id: `leaf-${Date.now()}`, type: 'leaf', x: xPosition, y: yPosition, targetSize: 8, currentSize: 8, angle: Math.PI / 4, withered: false };
        newStructure.push(newLeaf);
      }
    }
    
    if (mainStem && mainStem.type === 'stem' && newGrowth >= GROWTH_THRESHOLDS.Young) {
      const stemIndex = newStructure.findIndex(s => s.id === mainStem.id);

      const oldHeight = mainStem.height;
      let targetHeight = oldHeight;

      const leaves = newStructure.filter(s => s.type === 'leaf') as LeafData[];
      const allLeavesGrown = leaves.length === 4 && leaves.every(l => l.currentSize === l.targetSize);

      if (allLeavesGrown && newGrowth >= GROWTH_THRESHOLDS.Mature) {
        // Mature Stage: Stem Elongation to final height
        const baseHeight = 120;
        const maxHeight = 260; // The final height for a mature plant
        const growthProgress = Math.min(1, (newGrowth - GROWTH_THRESHOLDS.Mature) / (STRUCTURE_GROWTH_POINTS.MATURE_STEM_GROWTH_END - GROWTH_THRESHOLDS.Mature));
        targetHeight = baseHeight + (growthProgress * (maxHeight - baseHeight));
      } else {
        // Young Stage: Stem Growth
        const baseHeight = 40;
        const maxHeight = 120;
        const growthProgress = Math.min(1, (newGrowth - GROWTH_THRESHOLDS.Young) / (STRUCTURE_GROWTH_POINTS.YOUNG_STEM_FULL_HEIGHT - GROWTH_THRESHOLDS.Young));
        targetHeight = baseHeight + (growthProgress * (maxHeight - baseHeight));
      }
      
      const heightGrown = targetHeight - oldHeight;
      if (heightGrown > 0) {
        const currentStem = newStructure[stemIndex] as StemData;
        newStructure[stemIndex] = { ...currentStem, height: Math.max(oldHeight, targetHeight) };
      }

      let currentLeaves = newStructure.filter(s => s.type === 'leaf') as LeafData[];
      const stem = newStructure.find(s => s.type === 'stem') as StemData;

      // If all leaves were plucked, regrow the first one to restart the cycle.
      if (currentLeaves.length === 0 && stem && newGrowth >= STRUCTURE_GROWTH_POINTS.SPROUT_LEAF_1) {
        const yPosition = stem.y - stem.height + 5;
        const xPosition = stem.x;
        const newLeaf: LeafData = { id: `leaf-${Date.now()}`, type: 'leaf', x: xPosition, y: yPosition, targetSize: 8, currentSize: 8, angle: Math.PI / 4, withered: false };
        newStructure.push(newLeaf);
        currentLeaves = newStructure.filter(s => s.type === 'leaf') as LeafData[]; // Refresh leaves array
      }

      if (currentLeaves.length === 1 && currentLeaves[0].currentSize >= 10) {
          const firstLeaf = currentLeaves[0];
          const newLeaf: LeafData = {
              id: `leaf-${Date.now()}`, type: 'leaf', x: stem.x, y: firstLeaf.y,
              targetSize: 12, currentSize: 6, angle: -Math.PI / 4, withered: false
          };
          newStructure.push(newLeaf);
      } else if (currentLeaves.length === 2) {
          const secondLeaf = currentLeaves.find(l => l.angle < 0);
          if (secondLeaf && secondLeaf.currentSize >= 9) {
              const newLeaf: LeafData = {
                  id: `leaf-${Date.now()}`, type: 'leaf', x: stem.x, y: stem.y - (stem.height * 0.33),
                  targetSize: 12, currentSize: 6, angle: -Math.PI / 4, withered: false
              };
              newStructure.push(newLeaf);
          }
      } else if (currentLeaves.length === 3) {
          const topLeaves = currentLeaves.filter(l => Math.abs(l.y - currentLeaves[0].y) < 1);
          const thirdLeaf = currentLeaves.find(l => !topLeaves.some(tl => tl.id === l.id));
          if (thirdLeaf && thirdLeaf.currentSize >= 9) {
              const newLeaf: LeafData = {
                  id: `leaf-${Date.now()}`, type: 'leaf', x: stem.x, y: stem.y - (stem.height * 0.66),
                  targetSize: 12, currentSize: 6, angle: Math.PI / 4, withered: false
              };
              newStructure.push(newLeaf);
          }
      }

      currentLeaves = newStructure.filter(s => s.type === 'leaf') as LeafData[];
      if (currentLeaves.length > 0) {
          const oldTopY = stem.y - oldHeight + 5;
          const oldLowerY = stem.y - oldHeight * 0.33;

          currentLeaves.forEach(leaf => {
              const leafIndex = newStructure.findIndex(s => s.id === leaf.id);
              if (leafIndex === -1) return;

              let updatedLeaf = { ...leaf };

              if (updatedLeaf.targetSize < 12) {
                  updatedLeaf.targetSize = 12;
              }

              if (updatedLeaf.currentSize < updatedLeaf.targetSize) {
                  const leafGrowthAmount = baseGrowthRate * 8;
                  updatedLeaf.currentSize = Math.min(updatedLeaf.targetSize, updatedLeaf.currentSize + (leafGrowthAmount * elapsedHours));
              }

              if (heightGrown > 0) {
                  if (Math.abs(leaf.y - oldTopY) < 1) {
                      updatedLeaf.y = stem.y - stem.height + 5; // Top pair
                  } else if (Math.abs(leaf.y - oldLowerY) < 1) {
                      updatedLeaf.y = stem.y - stem.height * 0.33; // Lower-left
                  } else {
                      updatedLeaf.y = stem.y - stem.height * 0.66; // Upper-right
                  }
              }
              newStructure[leafIndex] = updatedLeaf;
          });
      }
    }
    
    // --- Flowering Stage ---
    if (newGrowth >= GROWTH_THRESHOLDS.Flowering) {
        const flowerThresholds = [STRUCTURE_GROWTH_POINTS.FLOWER_1, STRUCTURE_GROWTH_POINTS.FLOWER_2, STRUCTURE_GROWTH_POINTS.FLOWER_3];
        const existingFlowers = newStructure.filter(s => s.type === 'flower').length;
        const stem = newStructure.find(s => s.type === 'stem') as StemData;
        if (stem && existingFlowers < flowerThresholds.length && newGrowth >= flowerThresholds[existingFlowers]) {
            const i = existingFlowers;
            const yPos = stem.y - stem.height + (i * 40) + 20;
            const xPos = stem.x + ((i % 2 === 0) ? -25 : 25);
            const newFlower: FlowerData = { id: `flower-${Date.now()}`, type: 'flower', x: xPos, y: yPos, size: 10, withered: false };
            newStructure.push(newFlower);
        }
    }

    // --- Harvestable Stage (Buds) ---
    if (newGrowth >= GROWTH_THRESHOLDS.Harvestable) {
        const leaves = newStructure.filter(s => s.type === 'leaf') as LeafData[];
        const existingBuds = newStructure.filter(s => s.type === 'bud') as BudData[];
        const budThresholds = [STRUCTURE_GROWTH_POINTS.BUD_1, STRUCTURE_GROWTH_POINTS.BUD_2, STRUCTURE_GROWTH_POINTS.BUD_3, STRUCTURE_GROWTH_POINTS.BUD_4];
        
        if (existingBuds.length < budThresholds.length && newGrowth >= budThresholds[existingBuds.length]) {
             const leafToGrowBudOn = leaves[existingBuds.length % leaves.length];
             const existingBudForThisLeaf = existingBuds.some(bud => bud.leafId === leafToGrowBudOn.id);

             if (!existingBudForThisLeaf) {
                const budX = leafToGrowBudOn.x;
                const budY = leafToGrowBudOn.y;
                const budAngle = leafToGrowBudOn.angle;
                const newBud: BudData = { id: `bud-${Date.now()}`, type: 'bud', x: budX, y: budY, size: 3, withered: false, leafId: leafToGrowBudOn.id, angle: budAngle };
                newStructure.push(newBud);
             }
        }
    }
  }
  return { newGrowth, newStructure };
}

function updateState(
  currentGrowth: number, 
  currentStructure: PlantSegment[]
) {
  let newGrowth = currentGrowth;
  
  // --- Growth Regression on structural loss ---
  const existingLeaves = currentStructure.filter(s => s.type === 'leaf').length;
  const existingFlowers = currentStructure.filter(s => s.type === 'flower').length;
  
  // This logic handles regressing the growth score if parts are plucked.
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_3 && existingFlowers < 3) newGrowth = STRUCTURE_GROWTH_POINTS.FLOWER_2;
  else if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_2 && existingFlowers < 2) newGrowth = STRUCTURE_GROWTH_POINTS.FLOWER_1;
  else if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_1 && existingFlowers < 1) newGrowth = GROWTH_THRESHOLDS.Flowering;

  const allLeavesFullyGrown = currentStructure.filter(s => s.type === 'leaf' && (s as LeafData).currentSize === (s as LeafData).targetSize).length === 4;
  if (newGrowth >= GROWTH_THRESHOLDS.Mature && !allLeavesFullyGrown) {
      newGrowth = GROWTH_THRESHOLDS.Young;
  }

  // --- Stage Updates Based on Growth ---
  let newStage = (Object.keys(GROWTH_THRESHOLDS) as PlantStage[])
    .reverse()
    .find(stage => newGrowth >= GROWTH_THRESHOLDS[stage]) ?? 'Seed';
    
  if (currentStructure.length > 0 && currentStructure.every(p => p.withered)) {
    newStage = 'Dead';
  }

  // --- Cap Final Growth ---
  const allBuds = currentStructure.filter(p => p.type === 'bud');
  if (allBuds.length >= 4) {
      newGrowth = Math.min(newGrowth, GROWTH_THRESHOLDS.Harvestable);
  }

  return { newGrowth, newStage };
}

export function updateGame(state: GameState, sunIntensity: number): GameState | null {
  const now = new Date();
  const elapsedHours = (now.getTime() - state.lastUpdate.getTime()) / (1000 * 60 * 60);

  const { newHydration, newTimeAtZeroHydration, newStructure: witheredStructure } = updateDehydrationAndWithering(state, elapsedHours);

  const { newGrowth: growthAfterUpdate, newStructure } = updateGrowthAndStructure(state, elapsedHours, newHydration, witheredStructure, sunIntensity);

  // If the plant is already dead, it stays dead.
  if (state.plant.stage === 'Dead') {
    return state;
  }
  
  const { newGrowth, newStage } = updateState(growthAfterUpdate, newStructure);

  return {
    ...state,
    plant: {
      ...state.plant,
      hydration: newHydration,
      growth: newGrowth,
      stage: newStage,
      timeAtZeroHydration: newTimeAtZeroHydration,
      structure: newStructure,
    },
    lastUpdate: now,
  };
} 