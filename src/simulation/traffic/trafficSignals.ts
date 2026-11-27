import { SignalPhase, TrafficSignalNode } from '../../types/game';
import { RoadGraph } from '../navigation/roadGraph';

const PHASE_DURATION: Record<SignalPhase, number> = {
  NS_GREEN: 9.0,
  NS_YELLOW: 2.0,
  EW_GREEN: 9.0,
  EW_YELLOW: 2.0,
  PED_CROSS: 2.5,
};

const NEXT_PHASE: Record<SignalPhase, SignalPhase> = {
  NS_GREEN: 'NS_YELLOW',
  NS_YELLOW: 'EW_GREEN',
  EW_GREEN: 'EW_YELLOW',
  EW_YELLOW: 'PED_CROSS',
  PED_CROSS: 'NS_GREEN',
};

export function reconcileTrafficSignals(
  graph: RoadGraph,
  existing: TrafficSignalNode[],
): TrafficSignalNode[] {
  const byKey = new Map(existing.map((s) => [s.tileKey, s]));
  const result: TrafficSignalNode[] = [];

  for (let i = 0; i < graph.signalCandidates.length; i++) {
    const cand = graph.signalCandidates[i];
    const prev = byKey.get(cand.tileKey);
    if (prev) {
      result.push(prev);
    } else {
      const initialPhase: SignalPhase = i % 2 === 0 ? 'NS_GREEN' : 'EW_GREEN';
      result.push({
        tileKey: cand.tileKey,
        x: cand.x,
        z: cand.z,
        phase: initialPhase,
        timer: (i * 1.7) % PHASE_DURATION[initialPhase],
      });
    }
  }
  return result;
}

export function stepTrafficSignals(signals: TrafficSignalNode[], physicalDt: number): void {
  if (physicalDt <= 0) return;
  for (const sig of signals) {
    sig.timer += physicalDt;
    const limit = PHASE_DURATION[sig.phase];
    if (sig.timer >= limit) {
      sig.timer -= limit;
      sig.phase = NEXT_PHASE[sig.phase];
    }
  }
}

export function getSignalAspectForDirection(
  signal: TrafficSignalNode | undefined,
  moveDx: number,
  moveDz: number,
): 'green' | 'yellow' | 'red' {
  if (!signal) return 'green';
  const isNS = Math.abs(moveDz) >= Math.abs(moveDx);
  if (signal.phase === 'PED_CROSS') return 'red';
  if (isNS) {
    if (signal.phase === 'NS_GREEN') return 'green';
    if (signal.phase === 'NS_YELLOW') return 'yellow';
    return 'red';
  } else {
    if (signal.phase === 'EW_GREEN') return 'green';
    if (signal.phase === 'EW_YELLOW') return 'yellow';
    return 'red';
  }
}
