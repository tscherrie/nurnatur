import React, { useState, useEffect, useRef } from 'react';
import type { GameState, LeafData, BudData } from './game/state';
import { initialGameState } from './game/state';
import { loadGame, saveGame, updateGame, GROWTH_HYDRATION_THRESHOLD } from './game/engine';
import { IS_DEBUG_MODE } from './game/debug';
import { GAME_WIDTH, GAME_HEIGHT, SOIL_LEVEL } from './game/constants';

function App() {
  const [gameState, setGameState] = useState<GameState>(loadGame());

  const handleWaterPlant = () => {
    // Prevent watering if there's no seed planted
    if (gameState.plant.stage === 'Soil') return;

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

  useEffect(() => {
    const timer = setInterval(() => {
      setGameState(prevState => {
        // Only update if the game has started (seed is planted)
        if (prevState.plant.stage === 'Soil') return prevState;
        
        const newState = updateGame(prevState);
        
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
  }, []);

  return (
    <div className="App">
      {IS_DEBUG_MODE && <div style={{ position: 'fixed', top: 0, left: 0, background: 'red', color: 'white', padding: '2px 5px', fontSize: '10px', zIndex: 100 }}>DEBUG</div>}
      <header className="App-header">
        <h1>Nur Natur</h1>
        <button onClick={handleWaterPlant} disabled={gameState.plant.stage === 'Soil'}>
          Water Plant
        </button>
      </header>
      <main>
        <Game gameState={gameState} setGameState={setGameState} />
      </main>
      </div>
  );
}

interface GameProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
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

function Game({ gameState, setGameState }: GameProps) {
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

    if (gameState.plant.stage === 'Soil') {
      // (logic for planting the seed)
      setGameState(prevState => {
        const newState = {
          ...prevState,
          plant: { ...prevState.plant, stage: 'Seed' as const },
        };
        saveGame(newState);
        return newState;
      });
    } else if (gameState.plant.stage === 'Harvestable') {
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

    // --- Drawing ---
    const isWithering = gameState.plant.stage === 'Withering';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Soil (placeholder)
    const soilColor = `hsl(30, 30%, ${30 + (1 - gameState.plant.hydration) * 40}%)`;
    ctx.fillStyle = soilColor;
    ctx.fillRect(0, SOIL_LEVEL, canvas.width, GAME_HEIGHT - SOIL_LEVEL);


    if (gameState.plant.stage === 'Soil') {
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
    
    // 4. Draw UI
    ctx.fillStyle = '#000000';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Stage: ${gameState.plant.stage}`, 10, 30);
    ctx.fillText(`Growth: ${(gameState.plant.growth).toFixed(1)}`, 10, 50);
    ctx.fillText(`Hydration: ${(gameState.plant.hydration * 100).toFixed(0)}%`, 10, 70);
    ctx.fillText(`Tea Buds Harvested: ${gameState.teaLeavesHarvested}`, 10, 90);

    if (gameState.plant.stage !== 'Soil') {
      const isAnyPartWithered = gameState.plant.structure.some(p => p.withered);
      if (isAnyPartWithered) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('Prune withered parts!', 10, 110);
      } else if (gameState.plant.hydration <= GROWTH_HYDRATION_THRESHOLD) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('Needs water!', 10, 110);
      }
    }
  }, [gameState]);


  return (
    <canvas 
      ref={canvasRef} 
      id="game-canvas" 
      width={GAME_WIDTH} 
      height={GAME_HEIGHT}
      onClick={handleCanvasClick}
      style={{ cursor: gameState.plant.stage === 'Soil' ? 'pointer' : 'default' }}
    ></canvas>
  );
}

export default App;
