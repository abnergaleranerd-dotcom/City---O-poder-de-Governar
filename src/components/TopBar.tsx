import React from 'react';
import {
  Camera,
  Cloud,
  Eye,
  EyeOff,
  FastForward,
  Moon,
  Newspaper,
  Pause,
  Play,
  SkipForward,
  Sliders,
  Sun,
} from 'lucide-react';
import { DEVELOPMENT_LEVELS, SpeedValue, TimePreset } from '../types/game';
import { CameraPresetId, useGameStore } from '../store/useGameStore';

const MONTH_NAMES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const PRESET_BADGE: Record<TimePreset, string> = {
  relaxed: 'Relaxado',
  balanced: 'Equilibrado',
  strategic: 'Estratégico',
};

const CAMERA_PRESETS: { id: CameraPresetId; label: string; title: string }[] = [
  { id: 'aerial', label: 'Aéreo', title: 'Visão Aérea Estratégica' },
  { id: 'neighborhood', label: 'Bairro', title: 'Enquadramento de Bairro' },
  { id: 'close', label: 'Próxima', title: 'Aproximação de Rua (Modo Drone)' },
  { id: 'contemplative', label: 'Contemp.', title: 'Ângulo Panorâmico Contemplativo' },
];

export const TopBar: React.FC = () => {
  const cityName = useGameStore((s) => s.cityName);
  const treasury = useGameStore((s) => s.economy.treasury);
  const debt = useGameStore((s) => s.economy.debt);
  const monthlyNet = useGameStore((s) => s.economy.lastMonthlyNet);
  const population = useGameStore((s) => s.indicators.population);
  const popularity = useGameStore((s) => s.indicators.popularity);
  const developmentLevel = useGameStore((s) => s.developmentLevel);
  const day = useGameStore((s) => s.day);
  const month = useGameStore((s) => s.month);
  const year = useGameStore((s) => s.year);
  const hourOfDay = useGameStore((s) => s.hourOfDay);
  const speed = useGameStore((s) => s.speed);
  const timeConfig = useGameStore((s) => s.timeConfig);
  const zenMode = useGameStore((s) => s.zenMode);
  const activeCameraPreset = useGameStore((s) => s.activeCameraPreset);
  const graphicsQuality = useGameStore((s) => s.graphicsQuality);
  const activeEvent = useGameStore((s) => s.activeEvent);
  const endGameReport = useGameStore((s) => s.endGameReport);

  const setSpeed = useGameStore((s) => s.setSpeed);
  const advanceToNextDay = useGameStore((s) => s.advanceToNextDay);
  const advanceToMonthEnd = useGameStore((s) => s.advanceToMonthEnd);
  const toggleZenMode = useGameStore((s) => s.toggleZenMode);
  const setShowNewspaperModal = useGameStore((s) => s.setShowNewspaperModal);
  const setShowCloudModal = useGameStore((s) => s.setShowCloudModal);
  const setShowSettingsModal = useGameStore((s) => s.setShowSettingsModal);
  const setCameraPreset = useGameStore((s) => s.setCameraPreset);

  const levelInfo = DEVELOPMENT_LEVELS.find((d) => d.level === developmentLevel) || DEVELOPMENT_LEVELS[0];
  const isNight = hourOfDay < 5.8 || hourOfDay >= 18.8;
  const hh = String(Math.floor(hourOfDay)).padStart(2, '0');
  const mm = String(Math.floor((hourOfDay % 1) * 60)).padStart(2, '0');
  const canFastSkip = !activeEvent && !endGameReport;

  if (zenMode) {
    return (
      <div className="fixed top-3 right-3 z-20 pointer-events-auto">
        <button
          onClick={toggleZenMode}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F2F0E8] border border-[#CBC5B5] text-xs font-semibold text-[#283B49] hover:border-[#496B57] shadow-md transition-colors"
        >
          <Eye className="w-4 h-4 text-[#496B57]" />
          <span>Exibir Controles (H)</span>
        </button>
      </div>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-20 pointer-events-auto bg-[#F2F0E8] border-b border-[#CBC5B5] px-2.5 py-1.5 flex items-center justify-between gap-2 text-[#283B49] shadow-sm">
      {/* Brand & City Identity */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        <span className="font-display font-bold text-xs tracking-wide text-[#283B49] whitespace-nowrap">
          CITY TYCOON 4D
        </span>
        <span className="text-[#CBC5B5]" aria-hidden="true">|</span>
        <div className="flex items-center gap-1 text-[11px] whitespace-nowrap truncate">
          <span className="font-semibold text-[#283B49] truncate max-w-[110px]">{cityName}</span>
          <span className="hidden xl:inline text-[#536877]">
            · Nv.{levelInfo.level} {levelInfo.name}
          </span>
        </div>
      </div>

      {/* Live Municipal Telemetry */}
      <div className="flex items-center gap-2.5 lg:gap-3.5 shrink-0 text-[11px]">
        <div className="whitespace-nowrap">
          <span className="text-[#536877] mr-1">Caixa:</span>
          <span className="font-mono-num font-semibold text-[#496B57]">
            R$ {treasury.toLocaleString('pt-BR')}
          </span>
          {debt > 0 && (
            <span className="font-mono-num text-[#B43B3B] ml-1">
              (-R$ {debt.toLocaleString('pt-BR')})
            </span>
          )}
        </div>

        <div className="hidden lg:block whitespace-nowrap">
          <span className="text-[#536877] mr-1">Saldo/mês:</span>
          <span
            className={`font-mono-num font-semibold ${
              monthlyNet >= 0 ? 'text-[#496B57]' : 'text-[#B43B3B]'
            }`}
          >
            {monthlyNet >= 0 ? '+' : ''}R$ {monthlyNet.toLocaleString('pt-BR')}
          </span>
        </div>

        <div className="whitespace-nowrap">
          <span className="text-[#536877] mr-1">Pop:</span>
          <span className="font-mono-num font-semibold text-[#283B49]">
            {population.toLocaleString('pt-BR')}
          </span>
        </div>

        <div className="whitespace-nowrap">
          <span className="text-[#536877] mr-1">Aprov:</span>
          <span
            className={`font-mono-num font-semibold ${
              popularity >= 60
                ? 'text-[#3B6D8C]'
                : popularity >= 38
                ? 'text-[#A77642]'
                : 'text-[#B43B3B]'
            }`}
          >
            {popularity}%
          </span>
        </div>
      </div>

      {/* Time Controls, Camera Presets & Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center gap-1 text-[11px] text-[#283B49] font-mono-num whitespace-nowrap pr-0.5">
          {isNight ? (
            <Moon className="w-3.5 h-3.5 text-[#3B6D8C]" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-[#A77642]" />
          )}
          <span>
            D{day}·{MONTH_NAMES[(month - 1) % 12]}·A{year} {hh}:{mm}
          </span>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center bg-[#E6E2D6] border border-[#CBC5B5] rounded p-0.5">
          <button
            onClick={() => setSpeed(0)}
            title="Pausar simulação (Espaço)"
            className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
              speed === 0
                ? 'bg-[#283B49] text-[#F2F0E8] font-semibold'
                : 'text-[#283B49] hover:bg-[#D8D3C4]'
            }`}
          >
            <Pause className="w-3 h-3" />
          </button>
          {([0.5, 1, 2, 4, 8] as SpeedValue[]).map((spd) => (
            <button
              key={spd}
              onClick={() => setSpeed(spd)}
              title={`Velocidade ${spd}x (${timeConfig.secondsPerDay}s/dia base)`}
              className={`px-1 py-0.5 text-[10px] font-mono-num rounded transition-colors whitespace-nowrap ${
                speed === spd
                  ? 'bg-[#496B57] text-[#F2F0E8] font-semibold'
                  : 'text-[#283B49] hover:bg-[#D8D3C4]'
              }`}
            >
              {spd === 1 ? (
                <Play className="w-2.5 h-2.5 inline mr-0.5" />
              ) : spd > 1 ? (
                <FastForward className="w-2.5 h-2.5 inline mr-0.5" />
              ) : null}
              {spd}x
            </button>
          ))}
        </div>

        {/* Quick Skip Day / Month */}
        <div className="flex items-center bg-[#E6E2D6] border border-[#CBC5B5] rounded p-0.5">
          <button
            disabled={!canFastSkip}
            onClick={advanceToNextDay}
            title="Avançar para o próximo dia (07:00)"
            className="px-1.5 py-0.5 text-[10px] font-mono-num text-[#283B49] hover:bg-[#D8D3C4] disabled:opacity-40 rounded transition-colors whitespace-nowrap"
          >
            +1d
          </button>
          <button
            disabled={!canFastSkip}
            onClick={advanceToMonthEnd}
            title="Avançar para o fechamento do mês"
            className="flex items-center gap-0.5 px-1 py-0.5 text-[10px] text-[#283B49] hover:bg-[#D8D3C4] disabled:opacity-40 rounded transition-colors whitespace-nowrap"
          >
            <SkipForward className="w-3 h-3" />
          </button>
        </div>

        {/* Camera Presets */}
        <div className="hidden md:flex items-center bg-[#E6E2D6] border border-[#CBC5B5] rounded p-0.5">
          <Camera className="w-3 h-3 text-[#536877] mx-1 shrink-0" />
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setCameraPreset(preset.id)}
              title={preset.title}
              className={`px-1.5 py-0.5 text-[10px] rounded transition-colors whitespace-nowrap ${
                activeCameraPreset === preset.id
                  ? 'bg-[#283B49] text-[#F2F0E8] font-semibold'
                  : 'text-[#283B49] hover:bg-[#D8D3C4]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSettingsModal(true)}
          title={`Ritmo ${PRESET_BADGE[timeConfig.preset]} (${timeConfig.secondsPerDay}s/dia) · Gráficos ${graphicsQuality.toUpperCase()}`}
          className="flex items-center gap-1 px-1.5 py-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] font-medium text-[#283B49] transition-colors whitespace-nowrap"
        >
          <Sliders className="w-3.5 h-3.5 text-[#A77642]" />
          <span className="hidden xl:inline">Config</span>
        </button>

        <button
          onClick={() => setShowNewspaperModal(true)}
          title="Jornal Cidade News"
          className="flex items-center gap-1 px-1.5 py-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] font-medium text-[#283B49] transition-colors whitespace-nowrap"
        >
          <Newspaper className="w-3.5 h-3.5 text-[#496B57]" />
          <span className="hidden xl:inline">Jornal</span>
        </button>

        <button
          onClick={() => setShowCloudModal(true)}
          title="Salvar e Gerenciar Cidades"
          className="flex items-center gap-1 px-1.5 py-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] font-medium text-[#283B49] transition-colors whitespace-nowrap"
        >
          <Cloud className="w-3.5 h-3.5 text-[#3B6D8C]" />
          <span className="hidden lg:inline">Salvar</span>
        </button>

        <button
          onClick={toggleZenMode}
          title="Modo Cinema / Ocultar Interface (H)"
          className="p-1 rounded bg-[#E6E2D6] border border-[#CBC5B5] text-[#283B49] hover:bg-[#D8D3C4] transition-colors"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
