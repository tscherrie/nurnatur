import type { GameState, PlantStage } from './state';
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

export const GROWTH_HYDRATION_THRESHOLD = 0.4; // Plant only grows if hydration is above 40%

const REAL_GROWTH_RATE_PER_HOUR = 0.1; // Takes 10 hours of good hydration to grow to next stage
const DEBUG_GROWTH_RATE_PER_HOUR = REAL_GROWTH_RATE_PER_HOUR * 3600; // ~10 seconds in debug
const GROWTH_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_GROWTH_RATE_PER_HOUR : REAL_GROWTH_RATE_PER_HOUR;

const REAL_DEHYDRATION_RATE_PER_HOUR = 0.02; // Plant loses 2% hydration per hour
// In debug mode, we speed this up significantly to be 2% per second
const DEBUG_DEHYDRATION_RATE_PER_HOUR = REAL_DEHYDRATION_RATE_PER_HOUR * 3600; 

const DEHYDRATION_RATE_PER_HOUR = IS_DEBUG_MODE ? DEBUG_DEHYDRATION_RATE_PER_HOUR : REAL_DEHYDRATION_RATE_PER_HOUR;

export function updateGame(state: GameState): GameState {
  const now = new Date();
  const elapsedHours = (now.getTime() - state.lastUpdate.getTime()) / (1000 * 60 * 60);

  // --- Dehydration ---
  let newHydration = state.plant.hydration - (DEHYDRATION_RATE_PER_HOUR * elapsedHours);
  newHydration = Math.max(0, newHydration);

  // --- Growth ---
  let newGrowth = state.plant.growth;
  let newStage = state.plant.stage;
  let newStructure = [...state.plant.structure]; // Always work with a copy

  if (state.plant.hydration > GROWTH_HYDRATION_THRESHOLD && STAGE_PROGRESSION[state.plant.stage]) {
    newGrowth += (GROWTH_RATE_PER_HOUR * elapsedHours);

    // Update structure based on growth *within* a stage
    const mainStem = newStructure.find(s => s.type === 'stem');

    if (state.plant.stage === 'Young' && mainStem) {
        const baseHeight = 20;
        const growthHeight = 40;
        const newHeight = baseHeight + (newGrowth * growthHeight);
        newStructure = newStructure.map(s => s.type === 'stem' ? {...s, height: newHeight} : s);

    } else if (state.plant.stage === 'Mature' && mainStem) {
        const growthPerLeaf = 1 / 4; // We want to grow 4 leaves in this stage
        const existingLeaves = newStructure.filter(s => s.type === 'leaf').length;

        if (existingLeaves < 4 && newGrowth >= (existingLeaves + 1) * growthPerLeaf) {
             const yPos = mainStem.y - (mainStem.height * (0.2 + (existingLeaves * 0.2)));
             const xPos = mainStem.x;
             const angle = (existingLeaves % 2 === 0) ? -Math.PI / 4 : Math.PI / 4;
             newStructure = [...newStructure, { type: 'leaf', x: xPos, y: yPos, size: 8, angle }];
        }
    } else if (state.plant.stage === 'Flowering' && mainStem) {
        const growthPerFlower = 1 / 3; // We want to grow 3 flowers
        const existingFlowers = newStructure.filter(s => s.type === 'flower').length;

        if (existingFlowers < 3 && newGrowth >= (existingFlowers + 1) * growthPerFlower) {
            const yPos = mainStem.y - mainStem.height + (existingFlowers * 15);
            const xPos = mainStem.x + ((existingFlowers % 2 === 0) ? -10 : 10);
            newStructure = [...newStructure, { type: 'flower', x: xPos, y: yPos, size: 5 }];
        }
    }
  }

  // --- Stage Progression ---
  let stageCompleted = false;
  if (state.plant.stage === 'Mature') {
    // Mature stage is complete when it has 4 leaves.
    if (newStructure.filter(s => s.type === 'leaf').length >= 4) {
      stageCompleted = true;
    }
  } else if (state.plant.stage === 'Flowering') {
    // Flowering stage is complete when it has 3 flowers.
    if (newStructure.filter(s => s.type === 'flower').length >= 3) {
      stageCompleted = true;
    }
  } else if (newGrowth >= 1) {
    // Other stages are complete when growth reaches 100%.
    stageCompleted = true;
  }

  if (stageCompleted) {
    const nextStage = STAGE_PROGRESSION[state.plant.stage];
    if (nextStage) {
      newStage = nextStage;
      newGrowth = 0; // Reset growth for the new stage

      // Initialize or modify structure for the *new* stage
      if (newStage === 'Young') {
        newStructure = [{ type: 'stem', x: PLANT_BASE_X, y: PLANT_BASE_Y, width: 4, height: 20 }];
      }
      if (newStage === 'Mature') {
        newStructure = newStructure.map(s => s.type === 'stem' ? {...s, width: 6} : s);
      }

    } else {
      newGrowth = 1; // Cap growth at 100% if no next stage
    }
  }

  const newState = {
    ...state,
    plant: {
      ...state.plant,
      hydration: newHydration,
      growth: newGrowth,
      stage: newStage,
      structure: newStructure,
    },
    lastUpdate: now,
  };

  return newState;
} 