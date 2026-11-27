import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Map,
  Move,
  Newspaper,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { CityMinimap } from './CityMinimap';

export const BottomTicker: React.FC = () => {
  const [showMinimap, setShowMinimap] = useState(true);

  const news = useGameStore((s) => s.news);
  const indicators = useGameStore((s) => s.indicators);
  const impeachment = useGameStore((s) => s.politics.impeachment);
  const tiles = useGameStore((s) => s.tiles);
  const zenMode = useGameStore((s) => s.zenMode);
  const toast = useGameStore((s) => s.toast);
  const activeTool = useGameStore((s) => s.activeTool);
  const selectedBuildType = useGameStore((s) => s.selectedBuildType);

  const sendCameraCommand = useGameStore((s) => s.sendCameraCommand);
  const setShowNewspaperModal = useGameStore((s) => s.setShowNewspaperModal);
  const rotateBuildPreview = useGameStore((s) => s.rotateBuildPreview);
  const setActiveTool = useGameStore((s) => s.setActiveTool);
  const clearToast = useGameStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 3800);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (zenMode) return null;

  const latestNews = news[0];
  const conflictCount = tiles.filter((t) => t.conflict !== null).length;

  const demands: string[] = [];
  if (indicators.housingDeficit > 10) demands.push(`Déficit de ${indicators.housingDeficit} moradias`);
  if (indicators.unemploymentRate > 12) demands.push(`Desemprego em ${indicators.unemploymentRate}%`);
  if (indicators.safety < 50) demands.push('Reforçar segurança');
  if (indicators.health < 50) demands.push('Ampliar saúde');
  if (conflictCount > 0) demands.push(`${conflictCount} conflito(s) fundiário(s)`);
  if (impeachment.active) demands.push(`Impeachment: Etapa ${impeachment.stage}/4`);

  return (
    <>
      {showMinimap && (
        <div className="fixed bottom-12 right-3 z-20 pointer-events-auto hidden md:block">
          <CityMinimap />
        </div>
      )}

      {toast && (
        <div
          className={`fixed top-12 right-1/2 translate-x-1/2 z-30 px-4 py-2 rounded-lg border text-xs font-semibold shadow-lg pointer-events-auto ${
            toast.tone === 'error'
              ? 'bg-[#B43B3B] border-[#8A2929] text-[#F2F0E8]'
              : toast.tone === 'warning'
              ? 'bg-[#D2A97B] border-[#A77642] text-[#283B49]'
              : toast.tone === 'success'
              ? 'bg-[#496B57] border-[#385443] text-[#F2F0E8]'
              : 'bg-[#283B49] border-[#1D2B36] text-[#F2F0E8]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {activeTool !== 'select' && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-[#F2F0E8] border border-[#283B49] text-xs text-[#283B49] pointer-events-auto shadow-md">
          <span>
            Ferramenta:{' '}
            <strong className="text-[#496B57]">
              {activeTool === 'build'
                ? `Construir (${selectedBuildType})`
                : activeTool === 'move'
                ? 'Mover Construção'
                : activeTool === 'demolish'
                ? 'Demolir'
                : activeTool === 'buy_land'
                ? 'Comprar Terreno'
                : 'Vender Terreno'}
            </strong>
          </span>
          {activeTool === 'build' && (
            <button
              onClick={rotateBuildPreview}
              className="px-2 py-0.5 rounded bg-[#E6E2D6] hover:bg-[#D8D3C4] text-[#283B49] font-medium transition-colors"
            >
              Girar (R)
            </button>
          )}
          <button
            onClick={() => setActiveTool('select', null)}
            className="px-2 py-0.5 rounded bg-[#283B49] hover:bg-[#354E61] text-[#F2F0E8] font-medium transition-colors"
          >
            Cancelar (Esc)
          </button>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 z-20 pointer-events-auto bg-[#F2F0E8] border-t border-[#CBC5B5] px-3 py-1.5 flex items-center justify-between gap-3 text-xs text-[#283B49]">
        <button
          onClick={() => setShowNewspaperModal(true)}
          className="flex items-center gap-2 text-left min-w-0 hover:text-[#496B57] transition-colors"
        >
          <Newspaper className="w-3.5 h-3.5 text-[#496B57] shrink-0" />
          <span className="font-semibold text-[#496B57] shrink-0">Cidade News:</span>
          <span className="truncate font-medium">
            {latestNews ? latestNews.headline : 'Acompanhe as notícias da cidade.'}
          </span>
        </button>

        <div className="hidden xl:flex items-center gap-2 shrink-0">
          {demands.length > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-[#A77642]" />
              <span className="text-[#A77642] font-medium truncate max-w-sm">{demands.join(' · ')}</span>
            </>
          ) : (
            <span className="text-[#496B57] font-medium">Serviços urbanos em equilíbrio</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowMinimap((v) => !v)}
            title="Exibir/Ocultar Minimapa Tático"
            className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
              showMinimap
                ? 'bg-[#283B49] border-[#283B49] text-[#F2F0E8]'
                : 'bg-[#E6E2D6] border-[#CBC5B5] text-[#283B49] hover:border-[#283B49]'
            }`}
          >
            <Map className="w-3 h-3" />
            <span>Mapa</span>
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'rotate_left' })}
            title="Girar câmera à esquerda"
            className="p-1.5 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'rotate_right' })}
            title="Girar câmera à direita"
            className="p-1.5 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49]"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'zoom_in' })}
            title="Aproximar"
            className="p-1.5 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'zoom_out' })}
            title="Afastar"
            className="p-1.5 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'tilt_up' })}
            title="Elevar ângulo"
            className="hidden sm:inline-flex items-center px-2 py-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49] font-medium"
          >
            <Move className="w-3 h-3 mr-1" />
            Ângulo+
          </button>
          <button
            onClick={() => sendCameraCommand({ type: 'reset' })}
            title="Centralizar cidade"
            className="px-2 py-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[#283B49] font-medium"
          >
            <Compass className="w-3 h-3 inline mr-1" />
            Centro
          </button>
        </div>
      </footer>
    </>
  );
};
