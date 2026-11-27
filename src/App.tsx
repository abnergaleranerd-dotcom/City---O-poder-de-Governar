import { ErrorBoundary } from './components/ErrorBoundary';
import { CityViewport } from './engine/CityViewport';
import { TopBar } from './components/TopBar';
import { LeftDock } from './components/LeftDock';
import { RightInspector } from './components/RightInspector';
import { BottomBuildDock } from './components/BottomBuildDock';
import { BottomTicker } from './components/BottomTicker';
import { GameModals } from './components/Modals';
import { useGameStore } from './store/useGameStore';

function DiagnosticsHud() {
  const debugOverlay = useGameStore((s) => s.timeConfig.debugOverlay);
  const zenMode = useGameStore((s) => s.zenMode);
  const simStats = useGameStore((s) => s.simStats);
  if (!debugOverlay || zenMode) return null;

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#F2F0E8] border border-[#496B57] rounded px-3 py-1.5 text-[11px] font-mono-num text-[#283B49] flex flex-wrap items-center gap-3 shadow-md">
      <span className="text-[#496B57] font-bold">DIAGNÓSTICO</span>
      <span>FPS: {simStats.fps}</span>
      <span>Sim: {simStats.simStepMs.toFixed(2)}ms</span>
      <span>
        NPCs: {simStats.activeNpcs} rua / {simStats.insideBuildingNpcs} edif. / {simStats.blockedNpcs} rota
      </span>
      <span>Veículos: {simStats.activeVehicles} (Bus pax: {simStats.busPassengers})</span>
      <span>
        Grafos: {simStats.pedestrianNodes} calç. / {simStats.roadNodes} viário / {simStats.cachedRoutes} cache
      </span>
      <span>
        Colisões: {simStats.collisionHits ?? 0} ({simStats.worldObjects ?? 0} objs)
      </span>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
        {/* Dedicated Three.js 3D WebGL Canvas Mount */}
        <div className="absolute inset-0 z-0">
          <CityViewport />
        </div>

        {/* Strategy HUD Layers */}
        <TopBar />
        <DiagnosticsHud />
        <LeftDock />
        <RightInspector />
        <BottomBuildDock />
        <BottomTicker />
        <GameModals />
      </main>
    </ErrorBoundary>
  );
}
