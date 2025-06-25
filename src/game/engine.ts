import type { GameState, PlantStage, LeafData, FlowerData, BudData, PlantSegment } from './state';
import { initialGameState } from './state';
import { IS_DEBUG_MODE } from './debug';
import { PLANT_BASE_X, PLANT_BASE_Y } from './constants';

const STORAGE_KEY = 'nurnatur-game-state';

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
    };
    
    // Dates are not automatically converted from JSON, so we need to parse them back
    if (migratedState.plant.lastWatered) {
      migratedState.plant.lastWatered = new Date(migratedState.plant.lastWatered);
    }
    migratedState.lastUpdate = new Date(migratedState.lastUpdate);

    return migratedState;
  } catch (error) {
    console.error("Could not load game state, starting a new game.", error);
    return initialGameState;
  }
}

const STAGE_PROGRESSION: Partial<Record<PlantStage, PlantStage>> = {
  Seed: 'Sprout',
  Sprout: 'Young',
  Young: 'Mature',
  Mature: 'Flowering',
  Flowering: 'Harvestable',
};

// Growth thresholds for different milestones
const GROWTH_THRESHOLDS: Record<PlantStage, number> = {
  Seed: 0,
  Sprout: 1,
  Young: 2,
  Mature: 3,
  Flowering: 4,
  Harvestable: 5,
  Withering: Infinity, // A special case
};

// Structure-specific growth points
const STRUCTURE_GROWTH_POINTS = {
  STEM_FULL_HEIGHT: 2.5,
  LEAF_1: 3.2,
  LEAF_2: 3.4,
  LEAF_3: 3.6,
  LEAF_4: 3.8,
  FLOWER_1: 4.2,
  FLOWER_2: 4.4,
  FLOWER_3: 4.6,
};

export const GROWTH_HYDRATION_THRESHOLD = 0.4; // Plant only grows if hydration is above 40%

const REAL_GROWTH_RATE_PER_HOUR = 0.1; // Takes 10 hours of good hydration to grow to next stage
const DEBUG_GROWTH_RATE_PER_HOUR = REAL_GROWTH_RATE_PER_HOUR * 3600; // ~10 seconds in debug
const GROWTH_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_GROWTH_RATE_PER_HOUR : REAL_GROWTH_RATE_PER_HOUR;

const REAL_DEHYDRATION_RATE_PER_HOUR = 0.02; // Plant loses 2% hydration per hour
// In debug mode, we speed this up significantly to be 2% per second
const DEBUG_DEHYDRATION_RATE_PER_HOUR = REAL_DEHYDRATION_RATE_PER_HOUR * 3600; 

const DEHYDRATION_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_DEHYDRATION_RATE_PER_HOUR : REAL_DEHYDRATION_RATE_PER_HOUR;

const REAL_DEATH_TIMER_HOURS = 24;
const DEBUG_DEATH_TIMER_HOURS = 30 / 3600; // 30 seconds
const DEATH_TIMER_HOURS = IS_DEBUG_MODE ? DEBUG_DEATH_TIMER_HOURS : REAL_DEATH_TIMER_HOURS;

const DAY_GROWTH_MULTIPLIER = 1.5; // Plants grow up to 50% faster during the day
const DEHYDRATION_TEMP_BASE = 20; // Celsius
const DEHYDRATION_TEMP_FACTOR = 0.05; // 5% change in dehydration per degree above/below base

// New constant: How many hours of zero hydration it takes for one plant part to wither.
const REAL_WITHER_RATE_PER_PART_HOURS = 4;
const DEBUG_WITHER_RATE_PER_PART_HOURS = 5 / 3600; // 5 seconds per part in debug
const WITHER_RATE_PER_PART_HOURS = IS_DEBUG_MODE ? DEBUG_WITHER_RATE_PER_PART_HOURS : REAL_WITHER_RATE_PER_PART_HOURS;

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

  if (!isAnyPartWithered && currentHydration > GROWTH_HYDRATION_THRESHOLD) {
    // The growth multiplier is now a mix of the base rate and the boost from sun intensity
    const growthMultiplier = 1 + (DAY_GROWTH_MULTIPLIER - 1) * sunIntensity;
    const growthRate = GROWTH_RATE_PER_HOUR * growthMultiplier;
    newGrowth += (growthRate * elapsedHours);

    const mainStem = newStructure.find(s => s.type === 'stem');

    if (newGrowth >= GROWTH_THRESHOLDS.Young && !mainStem) {
      const newStem = { id: `stem-${Date.now()}`, type: 'stem' as const, x: PLANT_BASE_X, y: PLANT_BASE_Y, width: 4, height: 20, withered: false };
      newStructure.push(newStem);
    }

    if (mainStem && newGrowth >= GROWTH_THRESHOLDS.Young) {
      const baseHeight = 20;
      const maxHeight = 60;
      const growthProgress = Math.min(1, (newGrowth - GROWTH_THRESHOLDS.Young) / (STRUCTURE_GROWTH_POINTS.STEM_FULL_HEIGHT - GROWTH_THRESHOLDS.Young));
      const targetHeight = baseHeight + (growthProgress * (maxHeight - baseHeight));
      const stemIndex = newStructure.findIndex(s => s.id === mainStem.id);
      if (stemIndex !== -1) {
        const currentStem = newStructure[stemIndex];
        if (currentStem.type === 'stem') {
          newStructure[stemIndex] = { ...currentStem, height: Math.max(currentStem.height, targetHeight) };
        }
      }
    }

    if (mainStem && newGrowth >= GROWTH_THRESHOLDS.Mature) {
      const stemIndex = newStructure.findIndex(s => s.id === mainStem.id);
      if (stemIndex !== -1) {
        const currentStem = newStructure[stemIndex];
        if (currentStem.type === 'stem') {
          newStructure[stemIndex] = { ...currentStem, width: 6 };
        }
      }
    }

    const leafThresholds = [STRUCTURE_GROWTH_POINTS.LEAF_1, STRUCTURE_GROWTH_POINTS.LEAF_2, STRUCTURE_GROWTH_POINTS.LEAF_3, STRUCTURE_GROWTH_POINTS.LEAF_4];
    const existingLeaves = newStructure.filter(s => s.type === 'leaf').length;
    if (mainStem && existingLeaves < leafThresholds.length && newGrowth >= leafThresholds[existingLeaves]) {
        const i = existingLeaves;
        const side = (i % 2 === 0) ? -1 : 1;
        const yPosition = mainStem.y - (mainStem.height * (0.2 + (Math.floor(i / 2) * 0.25)));
        const angle = side * Math.PI / 4;
        const newLeaf: LeafData = { id: `leaf-${Date.now()}`, type: 'leaf', x: mainStem.x, y: yPosition, size: 8, angle, withered: false };
        newStructure.push(newLeaf);
    }

    const flowerThresholds = [STRUCTURE_GROWTH_POINTS.FLOWER_1, STRUCTURE_GROWTH_POINTS.FLOWER_2, STRUCTURE_GROWTH_POINTS.FLOWER_3];
    const existingFlowers = newStructure.filter(s => s.type === 'flower').length;
     if (mainStem && existingFlowers < flowerThresholds.length && newGrowth >= flowerThresholds[existingFlowers]) {
        const i = existingFlowers;
        const yPos = mainStem.y - mainStem.height + (i * 15);
        const xPos = mainStem.x + ((i % 2 === 0) ? -10 : 10);
        const newFlower: FlowerData = { id: `flower-${Date.now()}`, type: 'flower', x: xPos, y: yPos, size: 5, withered: false };
        newStructure.push(newFlower);
    }

    if (newGrowth >= GROWTH_THRESHOLDS.Harvestable) {
        const leaves = newStructure.filter(s => s.type === 'leaf') as LeafData[];
        const existingBuds = newStructure.filter(s => s.type === 'bud') as BudData[];
        const leavesWithoutBuds = leaves.filter(leaf => !existingBuds.some(bud => bud.leafId === leaf.id));
        
        if (leavesWithoutBuds.length > 0) {
            const CHANCE_TO_GROW_BUD_PER_HOUR = IS_DEBUG_MODE ? 0.5 * 3600 : 0.5;
            if (Math.random() < CHANCE_TO_GROW_BUD_PER_HOUR * elapsedHours) {
                const leafToGrowBudOn = leavesWithoutBuds[0];
                const leafOffset = leafToGrowBudOn.angle > 0 ? leafToGrowBudOn.size : -leafToGrowBudOn.size;
                const budX = leafToGrowBudOn.x + Math.cos(leafToGrowBudOn.angle) * leafOffset;
                const budY = leafToGrowBudOn.y + Math.sin(leafToGrowBudOn.angle) * leafOffset;
                const newBud: BudData = { id: `bud-${Date.now()}`, type: 'bud', x: budX, y: budY, size: 3, withered: false, leafId: leafToGrowBudOn.id };
                newStructure.push(newBud);
            }
        }
    }
  }
  return { newGrowth, newStructure };
}

function updateState(
  state: GameState, 
  currentGrowth: number, 
  currentStructure: PlantSegment[]
) {
  let newGrowth = currentGrowth;
  
  // --- Growth Regression on structural loss ---
  const healthyLeaves = currentStructure.filter(s => s.type === 'leaf' && !s.withered).length;
  const healthyFlowers = currentStructure.filter(s => s.type === 'flower' && !s.withered).length;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.LEAF_4 && healthyLeaves < 4) newGrowth = STRUCTURE_GROWTH_POINTS.LEAF_3;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.LEAF_3 && healthyLeaves < 3) newGrowth = STRUCTURE_GROWTH_POINTS.LEAF_2;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.LEAF_2 && healthyLeaves < 2) newGrowth = STRUCTURE_GROWTH_POINTS.LEAF_1;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.LEAF_1 && healthyLeaves < 1) newGrowth = GROWTH_THRESHOLDS.Young;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_3 && healthyFlowers < 3) newGrowth = STRUCTURE_GROWTH_POINTS.FLOWER_2;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_2 && healthyFlowers < 2) newGrowth = STRUCTURE_GROWTH_POINTS.FLOWER_1;
  if (newGrowth >= STRUCTURE_GROWTH_POINTS.FLOWER_1 && healthyFlowers < 1) newGrowth = GROWTH_THRESHOLDS.Flowering;

  // --- Stage Updates Based on Growth ---
  const newStage = (Object.keys(GROWTH_THRESHOLDS) as PlantStage[])
    .reverse()
    .find(stage => newGrowth >= GROWTH_THRESHOLDS[stage]) ?? 'Seed';

  // --- Cap Final Growth ---
  const allLeaves = currentStructure.filter(p => p.type === 'leaf');
  const allBuds = currentStructure.filter(p => p.type === 'bud');
  if (allLeaves.length === 4 && allBuds.length >= 4) {
      if (allLeaves.every(leaf => allBuds.some(bud => bud.leafId === leaf.id))) {
          newGrowth = Math.min(newGrowth, GROWTH_THRESHOLDS.Harvestable);
      }
  }

  return { newGrowth, newStage };
}

export function updateGame(state: GameState, sunIntensity: number): GameState | null {
  const now = new Date();
  const elapsedHours = (now.getTime() - state.lastUpdate.getTime()) / (1000 * 60 * 60);

  const { newHydration, newTimeAtZeroHydration, newStructure: witheredStructure } = updateDehydrationAndWithering(state, elapsedHours);

  const { newGrowth: growthAfterUpdate, newStructure } = updateGrowthAndStructure(state, elapsedHours, newHydration, witheredStructure, sunIntensity);

  const allPartsWithered = newStructure.length > 0 && newStructure.every(p => p.withered);
  if (allPartsWithered) {
    console.log("All plant parts withered. Resetting game.");
    return null;
  }

  const { newGrowth, newStage } = updateState(state, growthAfterUpdate, newStructure);

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