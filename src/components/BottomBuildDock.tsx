import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Hammer,
  Landmark,
  Move,
  MousePointer,
  RotateCw,
  Route,
  Trash2,
  Undo2,
  Zap,
} from 'lucide-react';
import {
  BUILDING_CATALOG,
  BuildingCategory,
  DEVELOPMENT_LEVELS,
} from '../types/game';
import { evaluateBuildPlacement, useGameStore } from '../store/useGameStore';
import { getBuildingThumbnails } from '../engine/buildingThumbnails';

const CATEGORIES: { id: BuildingCategory; label: string }[] = [
  { id: 'infra', label: 'Vias e Redes' },
  { id: 'residential', label: 'Residencial' },
  { id: 'commercial', label: 'Comercial' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'public', label: 'Serviços Públicos' },
  { id: 'leisure', label: 'Lazer e Urbanismo' },
];

export const BottomBuildDock: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [category, setCategory] = useState<BuildingCategory>('residential');

  const zenMode = useGameStore((s) => s.zenMode);
  const activeTool = useGameStore((s) => s.activeTool);
  const selectedBuildType = useGameStore((s) => s.selectedBuildType);
  const hoveredTileCoords = useGameStore((s) => s.hoveredTileCoords);
  const tiles = useGameStore((s) => s.tiles);
  const treasury = useGameStore((s) => s.economy.treasury);
  const developmentLevel = useGameStore((s) => s.developmentLevel);
  const manualBuildRotated = useGameStore((s) => s.manualBuildRotated);
  const buildRotation = useGameStore((s) => s.buildRotation);
  const buildUndoCount = useGameStore((s) => s.buildUndoStack.length);

  const setActiveTool = useGameStore((s) => s.setActiveTool);
  const rotateBuildPreview = useGameStore((s) => s.rotateBuildPreview);
  const undoLastBuild = useGameStore((s) => s.undoLastBuild);

  const thumbnails = useMemo(() => getBuildingThumbnails(), []);

  if (zenMode) return null;

  const items = Object.values(BUILDING_CATALOG).filter((b) => b.category === category);

  const placementEval =
    activeTool === 'build' && selectedBuildType && hoveredTileCoords
      ? evaluateBuildPlacement(
          tiles,
          hoveredTileCoords.x,
          hoveredTileCoords.z,
          selectedBuildType,
          treasury,
          developmentLevel,
          manualBuildRotated,
          buildRotation,
        )
      : null;

  return (
    <div className="fixed bottom-11 left-1/2 -translate-x-1/2 z-20 max-w-[min(92vw,860px)] w-auto pointer-events-none flex flex-col items-center gap-2">
      {/* Contextual Floating Placement Preview Card */}
      {placementEval && (
        <div
          className={`pointer-events-none bg-[#F2F0E8] border-2 rounded-lg px-3.5 py-2 shadow-lg text-[#283B49] min-w-[300px] max-w-[440px] ${
            placementEval.valid ? 'border-[#496B57]' : 'border-[#B43B3B]'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              {placementEval.valid ? (
                <CheckCircle2 className="w-4 h-4 text-[#496B57] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#B43B3B] shrink-0" />
              )}
              <span className="font-display font-bold text-xs truncate">
                {placementEval.name} · ({hoveredTileCoords!.x}, {hoveredTileCoords!.z})
              </span>
            </div>
            <span className="font-mono-num text-xs font-bold text-[#283B49] shrink-0">
              R$ {placementEval.totalCost.toLocaleString('pt-BR')}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {placementEval.valid ? (
              <span className="text-[#496B57] font-semibold">{placementEval.impactSummary}</span>
            ) : (
              <span className="text-[#B43B3B] font-semibold">{placementEval.reason}</span>
            )}
            {placementEval.landCost > 0 && (
              <span className="font-mono-num text-[#536877]">
                (Lote: R$ {placementEval.landCost.toLocaleString('pt-BR')})
              </span>
            )}
          </div>

          {!placementEval.isRoad && (
            <div className="mt-1 pt-1 border-t border-[#CBC5B5] flex items-center justify-between gap-3 text-[10px] font-mono-num">
              <div className="flex items-center gap-2.5">
                <span className={`flex items-center gap-0.5 ${placementEval.hasPower ? 'text-[#496B57]' : 'text-[#A77642]'}`}>
                  <Zap className="w-3 h-3" />
                  {placementEval.hasPower ? 'Energia OK' : 'Sem rede'}
                </span>
                <span className={`flex items-center gap-0.5 ${placementEval.hasWater ? 'text-[#3B6D8C]' : 'text-[#A77642]'}`}>
                  <Droplets className="w-3 h-3" />
                  {placementEval.hasWater ? 'Água OK' : 'Sem água'}
                </span>
                <span className={`flex items-center gap-0.5 ${placementEval.hasRoadAccess ? 'text-[#496B57]' : 'text-[#A77642]'}`}>
                  <Route className="w-3 h-3" />
                  {placementEval.hasRoadAccess ? 'Via OK' : 'Sem via'}
                </span>
              </div>
              <span className="text-[#536877]">
                {placementEval.monthlyRevenue > 0
                  ? `+R$ ${placementEval.monthlyRevenue}/mês`
                  : placementEval.monthlyCost > 0
                  ? `-R$ ${placementEval.monthlyCost}/mês`
                  : 'Sem taxa mensal'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Unified Construction Menu */}
      {expanded && (
        <div className="pointer-events-auto w-full bg-[#F2F0E8] border border-[#CBC5B5] rounded-t-lg shadow-xl overflow-hidden text-[#283B49]">
          <div className="px-2.5 py-1.5 border-b border-[#CBC5B5] bg-[#E6E2D6] flex items-center justify-between gap-2 overflow-x-auto hud-scroll">
            <div className="flex items-center gap-1 shrink-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    category === cat.id
                      ? 'bg-[#283B49] text-[#F2F0E8]'
                      : 'text-[#283B49] hover:bg-[#D8D3C4]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 shrink-0 pl-2 border-l border-[#CBC5B5]">
              <button
                onClick={() => setActiveTool('select', null)}
                title="Inspecionar (Esc)"
                className={`p-1.5 rounded text-[11px] transition-colors ${
                  activeTool === 'select'
                    ? 'bg-[#496B57] text-[#F2F0E8]'
                    : 'bg-[#F2F0E8] text-[#283B49] hover:bg-[#D8D3C4]'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveTool('move', null)}
                title="Mover Construção"
                className={`p-1.5 rounded text-[11px] transition-colors ${
                  activeTool === 'move'
                    ? 'bg-[#D2A97B] text-[#283B49]'
                    : 'bg-[#F2F0E8] text-[#283B49] hover:bg-[#D8D3C4]'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveTool('demolish', null)}
                title="Demolir (com confirmação)"
                className={`p-1.5 rounded text-[11px] transition-colors ${
                  activeTool === 'demolish'
                    ? 'bg-[#B43B3B] text-[#F2F0E8]'
                    : 'bg-[#F2F0E8] text-[#283B49] hover:bg-[#D8D3C4]'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveTool('buy_land', null)}
                title="Comprar Terreno"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  activeTool === 'buy_land'
                    ? 'bg-[#496B57] text-[#F2F0E8]'
                    : 'bg-[#F2F0E8] text-[#283B49] hover:bg-[#D8D3C4]'
                }`}
              >
                <Landmark className="w-3 h-3 inline mr-1" />
                Lote
              </button>
              <button
                disabled={buildUndoCount === 0}
                onClick={undoLastBuild}
                title="Desfazer última obra do turno (Ctrl+Z)"
                className="px-2 py-1 rounded bg-[#F2F0E8] hover:bg-[#D8D3C4] disabled:opacity-40 text-[#283B49] text-[11px] font-semibold whitespace-nowrap border border-[#CBC5B5]"
              >
                <Undo2 className="w-3 h-3 inline mr-1" />
                Desfazer{buildUndoCount > 0 ? ` (${buildUndoCount})` : ''}
              </button>
              {activeTool === 'build' && (
                <button
                  onClick={rotateBuildPreview}
                  title="Girar Edificação (R)"
                  className="px-2 py-1 rounded bg-[#D2A97B] hover:bg-[#C49663] text-[#283B49] text-[11px] font-semibold whitespace-nowrap"
                >
                  <RotateCw className="w-3 h-3 inline mr-1" />
                  Girar (R)
                </button>
              )}
              <button
                onClick={() => setExpanded(false)}
                title="Recolher menu de obras"
                className="p-1 rounded text-[#536877] hover:text-[#283B49]"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-2.5 py-2 flex items-stretch gap-2 overflow-x-auto hud-scroll">
            {items.map((b) => {
              const locked = developmentLevel < b.unlockLevel;
              const isSelected = activeTool === 'build' && selectedBuildType === b.id;
              const reqLevel = DEVELOPMENT_LEVELS.find((l) => l.level === b.unlockLevel);
              const thumb = thumbnails[b.id];

              return (
                <button
                  key={b.id}
                  disabled={locked}
                  onClick={() => setActiveTool('build', b.id)}
                  title={`${b.name} — ${b.description}`}
                  className={`shrink-0 w-34 rounded border p-1.5 text-left transition-colors flex flex-col justify-between ${
                    locked
                      ? 'bg-[#E6E2D6]/60 border-[#CBC5B5] opacity-55 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#496B57]/12 border-[#496B57] ring-1 ring-[#496B57]'
                      : 'bg-[#F2F0E8] border-[#CBC5B5] hover:border-[#283B49]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-11 h-11 rounded bg-[#283B49] border border-[#CBC5B5] shrink-0 overflow-hidden flex items-center justify-center">
                      {thumb ? (
                        <img src={thumb} alt={b.name} className="w-full h-full object-contain" />
                      ) : (
                        <Hammer className="w-4 h-4 text-[#D2A97B]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#283B49] leading-tight line-clamp-2">
                        {b.name}
                      </div>
                      <div className="font-mono-num text-[10px] font-semibold text-[#496B57] mt-0.5">
                        R$ {b.cost.toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 pt-1 border-t border-[#CBC5B5] text-[10px] text-[#536877] font-mono-num truncate">
                    {locked
                      ? `Nível ${b.unlockLevel} (${reqLevel?.name})`
                      : b.housingCapacity > 0
                      ? `+${b.housingCapacity} moradias`
                      : b.jobsProvided > 0
                      ? `+${b.jobsProvided} vagas`
                      : b.powerProvided > 0
                      ? `+${b.powerProvided} energia`
                      : b.waterProvided > 0
                      ? `+${b.waterProvided} água`
                      : b.happinessBonus > 0
                      ? `+${b.happinessBonus} lazer`
                      : b.isRoad
                      ? 'Via conectada'
                      : 'Serviço urbano'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="pointer-events-auto flex items-center gap-2 px-4 py-1.5 rounded-t-lg bg-[#F2F0E8] border border-b-0 border-[#CBC5B5] text-xs font-semibold text-[#283B49] hover:border-[#496B57] shadow-lg"
        >
          <Hammer className="w-3.5 h-3.5 text-[#496B57]" />
          <span>Obras e Construção</span>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
