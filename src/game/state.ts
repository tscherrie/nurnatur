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
  type: 'stem';
  x: number;
  y: number;
  height: number;
  width: number;
};

export type LeafData = {
  type: 'leaf';
  x: number; // The x-coordinate where the leaf is attached
  y: number; // The y-coordinate where the leaf is attached
  size: number;
  angle: number; // The angle of the leaf in radians
};

export type FlowerData = {
  type: 'flower';
  x: number;
  y: number;
  size: number;
};

export type PlantSegment = StemData | LeafData | FlowerData;

export interface PlantState {
  stage: PlantStage;
  growth: number; // A value from 0 to 1 representing growth progress
  hydration: number; // A value from 0 to 1
  lastWatered: Date | null;
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
    structure: [],
  },
  lastUpdate: new Date(),
  teaLeavesHarvested: 0,
}; 