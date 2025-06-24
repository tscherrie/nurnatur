import React, { useState, useEffect, useRef } from 'react';
import type { GameState } from './game/state';
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

function Game({ gameState, setGameState }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCanvasClick = () => {
    if (gameState.plant.stage === 'Soil') {
      setGameState(prevState => {
        const newState = {
          ...prevState,
          plant: {
            ...prevState.plant,
            stage: 'Seed' as const,
          },
        };
        saveGame(newState);
        return newState;
      });
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- Drawing ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Soil (placeholder)
    const soilColor = `hsl(30, 30%, ${30 + (1 - gameState.plant.hydration) * 40}%)`;
    ctx.fillStyle = soilColor;
    ctx.fillRect(0, SOIL_LEVEL, canvas.width, GAME_HEIGHT - SOIL_LEVEL);


    if (gameState.plant.stage === 'Soil') {
      // 2. Draw 'Click to Plant' text
      ctx.fillStyle = '#ffffff';
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
        if (segment.type === 'stem') {
          ctx.fillStyle = '#66bb6a';
          // Draw the stem growing upwards from its base y-coordinate
          ctx.fillRect(segment.x - (segment.width / 2), segment.y - segment.height, segment.width, segment.height);
        } else if (segment.type === 'leaf') {
            ctx.save();
            ctx.translate(segment.x, segment.y);
            ctx.rotate(segment.angle);
            
            ctx.fillStyle = '#4caf50'; // A darker leaf green
            ctx.beginPath();
            // The leaf is drawn offset from its attachment point for a more natural look
            ctx.ellipse(segment.size, 0, segment.size, segment.size / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else if (segment.type === 'flower') {
            ctx.fillStyle = '#ffeb3b'; // A bright yellow
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segment.size, 0, Math.PI * 2);
            ctx.fill();

            // Add a small center to the flower
            ctx.fillStyle = '#c8b900';
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segment.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
      });
    }
    
    // 4. Draw UI
    ctx.fillStyle = '#333';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Hydration: ${(gameState.plant.hydration * 100).toFixed(0)}%`, 10, 20);

    if (gameState.plant.stage !== 'Soil') {
      const growthStopped = gameState.plant.hydration <= GROWTH_HYDRATION_THRESHOLD;
      ctx.fillText(`Growth: ${(gameState.plant.growth * 100).toFixed(0)}%`, 10, 40);

      if (growthStopped && gameState.plant.stage !== 'Flowering') {
        ctx.fillStyle = 'red';
        ctx.fillText('Needs Water!', 100, 40);
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
