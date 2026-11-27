import React, { useEffect, useRef } from 'react';
import { BUILDING_CATALOG, GRID_SIZE } from '../types/game';
import { useGameStore } from '../store/useGameStore';

export const CityMinimap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiles = useGameStore((s) => s.tiles);
  const gridVersion = useGameStore((s) => s.gridVersion);
  const cameraFocusTile = useGameStore((s) => s.cameraFocusTile);
  const selectedTileCoords = useGameStore((s) => s.selectedTileCoords);
  const sendCameraCommand = useGameStore((s) => s.sendCameraCommand);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 144;
    const cell = size / GRID_SIZE;
    ctx.clearRect(0, 0, size, size);

    for (let z = 0; z < GRID_SIZE; z++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = tiles[z * GRID_SIZE + x];
        let col = '#3f6237';
        if (tile.terrain === 'waterfront') col = '#1d6f8a';
        else if (tile.terrain === 'hill') col = '#4c6344';
        else if (tile.terrain === 'fertile') col = '#4b753f';

        if (tile.road === 'avenida') col = '#1e293b';
        else if (tile.road === 'rua') col = '#334155';

        if (tile.building) {
          const cat = BUILDING_CATALOG[tile.building.type].category;
          if (cat === 'residential') col = '#eab308';
          else if (cat === 'commercial') col = '#38bdf8';
          else if (cat === 'industrial') col = '#94a3b8';
          else if (cat === 'public') col = '#14b8a6';
          else if (cat === 'leisure') col = '#22c55e';
          else col = '#f97316';
        } else if (tile.conflict) {
          col = '#ef4444';
        }

        ctx.fillStyle = col;
        ctx.fillRect(x * cell, z * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    // Selected tile highlight
    if (selectedTileCoords) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        selectedTileCoords.x * cell,
        selectedTileCoords.z * cell,
        cell,
        cell,
      );
    }

    // Camera viewport reticle
    const cx = (cameraFocusTile.x + 0.5) * cell;
    const cz = (cameraFocusTile.z + 0.5) * cell;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 14, cz - 14, 28, 28);
  }, [tiles, gridVersion, cameraFocusTile, selectedTileCoords]);

  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE)));
    const nz = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE)));
    sendCameraCommand({ type: 'focus_tile', x: nx, z: nz });
  };

  return (
    <div className="bg-[#F2F0E8] border border-[#CBC5B5] rounded-lg p-1.5 shadow-xl text-[#283B49]">
      <div className="flex items-center justify-between px-1 pb-1 text-[10px] text-[#536877] font-semibold tracking-wide uppercase">
        <span>Mapa Tático</span>
        <span className="font-mono-num text-[#283B49]">
          {cameraFocusTile.x},{cameraFocusTile.z}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={144}
        height={144}
        onClick={handleMapClick}
        title="Clique para mover a câmera para esta região"
        className="w-36 h-36 rounded border border-[#CBC5B5] cursor-crosshair block"
      />
    </div>
  );
};
