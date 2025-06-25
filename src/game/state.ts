// src/game/state.ts

export type PlantStage = 
  | 'Soil'
  | 'Seed' 
  | 'Sprout' 
  | 'Young' 
  | 'Mature' 
  | 'Flowering'
  | 'Harvestable'
  | 'Withering';

export type StemData = {
  id: string;
  type: 'stem';
  x: number;
  y: number;
  height: number;
  width: number;
  withered: boolean;
};

export type LeafData = {
  id: string;
  type: 'leaf';
  x: number; // The x-coordinate where the leaf is attached
  y: number; // The y-coordinate where the leaf is attached
  size: number;
  angle: number; // The angle of the leaf in radians
  withered: boolean;
};

export type FlowerData = {
  id: string;
  type: 'flower';
  x: number;
  y: number;
  size: number;
  withered: boolean;
};

export type BudData = {
  id: string;
  type: 'bud';
  x: number;
  y: number;
  size: number;
  withered: boolean;
  leafId: string; // Reference to which leaf this bud is attached to
};

export type PlantSegment = StemData | LeafData | FlowerData | BudData;

export interface PlantState {
  stage: PlantStage;
  growth: number; // A continuously increasing value representing overall plant maturity (0 to infinity)
  hydration: number; // A value from 0 to 1
  lastWatered: Date | null;
  timeAtZeroHydration: number; // in hours
  structure: PlantSegment[];
}

export interface GameState {
  plant: PlantState;
  lastUpdate: Date;
  teaLeavesHarvested: number;
}

export const initialGameState: GameState = {
  plant: {
    stage: 'Soil',
    growth: 0,
    hydration: 0.5,
    lastWatered: null,
    timeAtZeroHydration: 0,
    structure: [],
  },
  lastUpdate: new Date(),
  teaLeavesHarvested: 0,
}; 