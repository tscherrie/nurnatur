// src/game/state.ts

export type PlantStage = 
  | 'Seed'
  | 'Sprout' 
  | 'Young' 
  | 'Mature' 
  | 'Flowering'
  | 'Harvestable'
  | 'Withering';

export type BaseSegment = {
  id: string;
  x: number;
  y: number;
  withered: boolean;
};

export type StemData = BaseSegment & {
  type: 'stem';
  height: number;
  width: number;
};

export type LeafData = BaseSegment & {
  type: 'leaf';
  size: number;
  angle: number; // The angle of the leaf in radians
};

export type FlowerData = BaseSegment & {
  type: 'flower';
  size: number;
};

export type BudData = BaseSegment & {
  type: 'bud';
  size: number;
  leafId: string; // Reference to which leaf this bud is attached to
};

export type PlantSegment = StemData | LeafData | FlowerData | BudData;

export interface PlantState {
  stage: PlantStage;
  growth: number; // A continuously increasing value representing overall plant maturity (0 to infinity)
  hydration: number; // A value from 0 to 1
  timeAtZeroHydration: number; // in hours
  structure: PlantSegment[];
}

interface EnvironmentState {
  isDay: boolean;
  weather: {
    temperature: number;
    isRaining: boolean;
  } | null;
  userLocation: string | null;
  sunrise: string | null;
  sunset: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface GameState {
  plant: PlantState;
  lastUpdate: Date;
  teaLeavesHarvested: number;
  environment: EnvironmentState;
}

export const initialGameState: GameState = {
  plant: {
    stage: 'Seed',
    growth: 0,
    hydration: 0.5,
    timeAtZeroHydration: 0,
    structure: [],
  },
  lastUpdate: new Date(),
  teaLeavesHarvested: 0,
  environment: {
    isDay: true,
    weather: null,
    userLocation: null,
    sunrise: null,
    sunset: null,
    latitude: null,
    longitude: null,
  },
}; 