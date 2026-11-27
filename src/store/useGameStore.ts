import { create } from 'zustand';
import {
  Achievement,
  BUILDING_CATALOG,
  BuildingLifecycleStage,
  BuildingTypeId,
  CameraMode,
  CitizenAgent,
  CitizenState,
  CityBill,
  CityIndicators,
  CitySimulationStats,
  Councilor,
  DecisionLogEntry,
  DEVELOPMENT_LEVELS,
  EconomyState,
  EmergencyDispatch,
  EndGameOutcome,
  EndGameReport,
  GameEvent,
  GameEventChoice,
  GameTimeConfig,
  GraphicsQuality,
  GRID_SIZE,
  Household,
  InteractionTool,
  NewsArticle,
  PlacedBuilding,
  PoliticsState,
  RoadVehicleSim,
  SpeedValue,
  TerrainType,
  ThematicMapMode,
  TileConflict,
  TileData,
  TileOwnerType,
  TimePreset,
  TrafficSignalNode,
  TransitLine,
  Workplace,
  ZoningType,
} from '../types/game';
import {
  createInitialAchievements,
  createInitialCitizens,
  createInitialEconomy,
  createInitialIndicators,
  createInitialNews,
  createInitialPolitics,
  createInitialTiles,
} from '../simulation/cityGenerator';
import {
  buildEndGameReport,
  getTile,
  processMonthlyCycle,
  recomputeCityGridMetrics,
  updateCitizenAttributesAndThoughts,
} from '../simulation/tickEngine';
import { clearCityLocal, loadCityLocalSafe, saveCityLocal } from '../services/persistence';
import { detectGraphicsCapabilities } from '../engine/graphicsConfig';
import {
  applyTimePreset,
  createDefaultTimeConfig,
  FIXED_SIM_DT,
  SimulationClock,
} from '../simulation/core/simulationClock';
import { SimulationScheduler } from '../simulation/core/simulationScheduler';
import { UrbanNavigationCache } from '../simulation/navigation/routeCache';
import { computeBuildingAccess, computeFacingRoadRotation } from '../simulation/navigation/obstacleSystem';
import {
  normalizeCitizensForLivingWorld,
  stepCitizenEcosystem,
} from '../simulation/agents/citizenEngine';
import { reconcileHouseholds } from '../simulation/agents/householdEngine';
import { reconcileWorkplaces } from '../simulation/agents/employmentEngine';
import {
  createInitialTrafficState,
  stepTrafficEngine,
  TrafficSystemState,
} from '../simulation/traffic/trafficEngine';
import { initializeBuildingLifecycle, stepBuildingLifecycles } from '../simulation/urban/buildingLifecycle';
import { inferBuildingZone } from '../simulation/urban/zoningEngine';

const navCache = new UrbanNavigationCache();
const simClock = new SimulationClock();
const simScheduler = new SimulationScheduler();
simScheduler.register('needs', 0.85);
simScheduler.register('stats', 0.45);

const trafficSystemRuntime: TrafficSystemState = createInitialTrafficState();
let citizenBatchCursor = 0;

export function getNavigationCache(): UrbanNavigationCache {
  return navCache;
}

export type LeftTabId =
  | 'admin'
  | 'economy'
  | 'politics'
  | 'planning'
  | 'indicators';

export type CameraPresetId = 'aerial' | 'neighborhood' | 'close' | 'contemplative';

export interface CameraCommand {
  type:
    | 'focus_tile'
    | 'follow_citizen'
    | 'reset'
    | 'preset'
    | 'rotate_left'
    | 'rotate_right'
    | 'tilt_up'
    | 'tilt_down'
    | 'zoom_in'
    | 'zoom_out';
  preset?: CameraPresetId;
  x?: number;
  z?: number;
  citizenId?: string;
  nonce: number;
}

export interface BuildUndoEntry {
  kind: 'road' | 'building';
  x: number;
  z: number;
  buildingId: string | null;
  buildingType: BuildingTypeId;
  roadBefore: TileData['road'];
  roadAfter: TileData['road'];
  ownerTypeBefore: TileData['ownerType'];
  ownerNameBefore: string;
  concessionBefore: boolean;
  totalCostPaid: number;
  builtDay: number;
  builtMonth: number;
  builtYear: number;
}

export interface BuildPlacementEvaluation {
  valid: boolean;
  reason: string | null;
  buildType: BuildingTypeId;
  name: string;
  isRoad: boolean;
  totalCost: number;
  landCost: number;
  buildCost: number;
  monthlyCost: number;
  monthlyRevenue: number;
  hasPower: boolean;
  hasWater: boolean;
  hasRoadAccess: boolean;
  impactSummary: string;
  effectiveRotation: number;
}

export function evaluateBuildPlacement(
  tiles: TileData[],
  x: number,
  z: number,
  buildType: BuildingTypeId,
  treasury: number,
  developmentLevel: number,
  manualRotated: boolean,
  buildRotation: number,
): BuildPlacementEvaluation {
  const def = BUILDING_CATALOG[buildType];
  const tile = getTile(tiles, x, z);

  const emptyEval: BuildPlacementEvaluation = {
    valid: false,
    reason: 'Terreno fora dos limites do mapa.',
    buildType,
    name: def?.name ?? buildType,
    isRoad: Boolean(def?.isRoad),
    totalCost: def?.cost ?? 0,
    landCost: 0,
    buildCost: def?.cost ?? 0,
    monthlyCost: def?.monthlyMaintenance ?? 0,
    monthlyRevenue: def?.monthlyRevenue ?? 0,
    hasPower: false,
    hasWater: false,
    hasRoadAccess: false,
    impactSummary: '',
    effectiveRotation: buildRotation,
  };

  if (!def || !tile) return emptyEval;

  const isRoad = Boolean(def.isRoad);
  const landCost =
    !isRoad && tile.ownerType === 'available' ? Math.round(tile.landValue * 0.65) : 0;
  const totalCost = def.cost + landCost;
  const hasAdjacentRoad = [
    getTile(tiles, x + 1, z),
    getTile(tiles, x - 1, z),
    getTile(tiles, x, z + 1),
    getTile(tiles, x, z - 1),
  ].some((n) => Boolean(n && n.road !== 'none'));

  const effectiveRotation = isRoad
    ? 0
    : manualRotated
    ? buildRotation
    : computeFacingRoadRotation(tiles, x, z, buildRotation);

  const impactParts: string[] = [];
  if (def.housingCapacity > 0) impactParts.push(`+${def.housingCapacity} moradias`);
  if (def.jobsProvided > 0) impactParts.push(`+${def.jobsProvided} vagas`);
  if (def.powerProvided > 0) impactParts.push(`+${def.powerProvided} energia`);
  if (def.waterProvided > 0) impactParts.push(`+${def.waterProvided} água`);
  if (def.happinessBonus > 0) impactParts.push(`+${def.happinessBonus} lazer`);
  if (def.safetyBonus > 0) impactParts.push(`+${def.safetyBonus} seg.`);
  if (def.healthBonus > 0) impactParts.push(`+${def.healthBonus} saúde`);
  if (def.educationBonus > 0) impactParts.push(`+${def.educationBonus} educ.`);
  if (isRoad) impactParts.push('Conexão viária');
  const impactSummary = impactParts.join(' · ') || 'Infraestrutura urbana';

  let reason: string | null = null;
  if (developmentLevel < def.unlockLevel) {
    const reqName = DEVELOPMENT_LEVELS.find((d) => d.level === def.unlockLevel)?.name || '';
    reason = `Desbloqueado no nível ${def.unlockLevel} (${reqName}).`;
  } else if (tile.conflict) {
    reason = 'Resolva o conflito fundiário antes de construir.';
  } else if (isRoad) {
    const roadType = def.id === 'avenida' ? 'avenida' : 'rua';
    if (tile.building) {
      reason = 'Demolir o imóvel antes de pavimentar este lote.';
    } else if (tile.road === roadType) {
      reason = 'Via deste padrão já instalada aqui.';
    } else if (treasury < def.cost) {
      reason = 'Orçamento público insuficiente.';
    }
  } else if (tile.building || tile.road !== 'none') {
    reason = 'Este terreno já está ocupado.';
  } else if (tile.terrain === 'waterfront' && def.category !== 'leisure') {
    reason = 'Área de orla reservada para praças, parques e lazer.';
  } else if (def.id === 'prefeitura' && tiles.some((t) => t.building?.type === 'prefeitura')) {
    reason = 'A cidade já possui uma Prefeitura Municipal.';
  } else if (treasury < totalCost) {
    reason = `Saldo insuficiente (necessário R$ ${totalCost.toLocaleString('pt-BR')}).`;
  }

  return {
    valid: reason === null,
    reason,
    buildType,
    name: def.name,
    isRoad,
    totalCost,
    landCost,
    buildCost: def.cost,
    monthlyCost: def.monthlyMaintenance,
    monthlyRevenue: def.monthlyRevenue,
    hasPower: tile.hasPower || def.powerProvided > 0,
    hasWater: tile.hasWater || def.waterProvided > 0,
    hasRoadAccess: isRoad || hasAdjacentRoad,
    impactSummary,
    effectiveRotation,
  };
}

export interface ToastNotice {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface GameState {
  cityName: string;
  day: number;
  month: number;
  year: number;
  hourOfDay: number; // 0..24
  dayAccumulator: number;
  speed: SpeedValue;
  timeConfig: GameTimeConfig;
  developmentLevel: number;
  hadDebtBefore: boolean;

  tiles: TileData[];
  citizens: CitizenAgent[];
  households: Household[];
  workplaces: Workplace[];
  trafficSignals: TrafficSignalNode[];
  transitLines: TransitLine[];
  vehicles: RoadVehicleSim[];
  dispatches: EmergencyDispatch[];
  economy: EconomyState;
  indicators: CityIndicators;
  politics: PoliticsState;
  news: NewsArticle[];
  achievements: Achievement[];
  decisionLogs: DecisionLogEntry[];

  activeEvent: GameEvent | null;
  endGameReport: EndGameReport | null;
  auctionTile: { x: number; z: number } | null;

  // UI & Interaction State
  activeTool: InteractionTool;
  selectedBuildType: BuildingTypeId | null;
  buildRotation: number; // 0..3
  manualBuildRotated: boolean;
  moveSourceTile: { x: number; z: number } | null;
  selectedTileCoords: { x: number; z: number } | null;
  hoveredTileCoords: { x: number; z: number } | null;
  pendingDemolition: { x: number; z: number } | null;
  buildUndoStack: BuildUndoEntry[];
  selectedCitizenId: string | null;
  followedCitizenId: string | null;
  showCitizenRoute: boolean;
  thematicMode: ThematicMapMode;
  activeLeftTab: LeftTabId | null;
  zenMode: boolean;
  showNewspaperModal: boolean;
  showCloudModal: boolean;
  showSettingsModal: boolean;
  graphicsQuality: GraphicsQuality;
  recommendedQuality: GraphicsQuality;
  cameraMode: CameraMode;
  activeCameraPreset: CameraPresetId;
  followedVehicleId: string | null;
  cameraFocusTile: { x: number; z: number };
  cameraCommand: CameraCommand | null;
  toast: ToastNotice | null;
  gridVersion: number; // increments when 3D tile meshes need sync
  thematicVersion: number; // increments when thematic tile colors need sync
  simAlpha: number; // 0..1 interpolation alpha for 60 FPS visual smoothing
  simStats: CitySimulationStats;

  // Actions
  advanceSimulation: (dtSeconds: number) => void;
  setSpeed: (speed: SpeedValue) => void;
  setTimeConfig: (partial: Partial<GameTimeConfig>) => void;
  setTimePreset: (preset: TimePreset) => void;
  advanceToNextDay: () => void;
  advanceToMonthEnd: () => void;
  reportRenderFps: (fps: number) => void;
  setShowCitizenRoute: (show: boolean) => void;
  toggleBusStop: (x: number, z: number) => void;
  setActiveTool: (tool: InteractionTool, buildType?: BuildingTypeId | null) => void;
  setHoveredTileCoords: (coords: { x: number; z: number } | null) => void;
  rotateBuildPreview: () => void;
  undoLastBuild: () => void;
  setThematicMode: (mode: ThematicMapMode) => void;
  setActiveLeftTab: (tab: LeftTabId | null) => void;
  toggleZenMode: () => void;
  setShowNewspaperModal: (open: boolean) => void;
  setShowCloudModal: (open: boolean) => void;
  setShowSettingsModal: (open: boolean) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setCameraMode: (mode: CameraMode) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  followVehicle: (vehicleId: string | null) => void;
  setCameraFocusTile: (x: number, z: number) => void;

  selectTile: (x: number, z: number) => void;
  selectCitizen: (citizenId: string | null) => void;
  followCitizen: (citizenId: string | null) => void;
  sendCameraCommand: (cmd: Omit<CameraCommand, 'nonce'>) => void;

  interactWithTile: (x: number, z: number) => void;
  upgradeBuilding: (x: number, z: number) => void;
  startMoveBuilding: (x: number, z: number) => void;
  requestDemolition: (x: number, z: number) => void;
  confirmDemolition: () => void;
  cancelDemolition: () => void;
  demolishAt: (x: number, z: number) => void;

  buyLand: (x: number, z: number) => void;
  sellLand: (x: number, z: number) => void;
  grantConcession: (x: number, z: number) => void;
  togglePlannedDistrict: (x: number, z: number) => void;
  openAuction: (x: number, z: number) => void;
  closeAuction: () => void;
  completeAuction: (x: number, z: number, bidAmount: number, buyerName: string) => void;
  resolveLandConflict: (x: number, z: number, method: 'mediate' | 'housing' | 'legal') => void;

  updateTaxRates: (partial: Partial<Pick<EconomyState, 'iptuRate' | 'issRate' | 'itbiRate'>>) => void;
  updateBudgets: (
    partial: Partial<
      Pick<EconomyState, 'budgetHealth' | 'budgetEducation' | 'budgetSafety' | 'budgetTransit' | 'budgetSocial'>
    >,
  ) => void;

  proposeBill: (billId: string) => void;
  negotiateCouncil: () => void;
  resolveEventChoice: (choiceId: string) => void;
  resignMayor: () => void;
  startNewCity: (cityName?: string, mayorName?: string) => void;

  exportSnapshot: () => Record<string, unknown>;
  importSnapshot: (snapshot: Record<string, unknown>) => boolean;
  showToast: (text: string, tone?: ToastNotice['tone']) => void;
  clearToast: () => void;
}

function buildLivingWorldRuntime(
  tiles: TileData[],
  citizens: CitizenAgent[],
  indicators: CityIndicators,
  economy: EconomyState,
  timeConfig: GameTimeConfig,
  year: number,
  day: number,
) {
  normalizeCitizensForLivingWorld(citizens, year, day);
  const households = reconcileHouseholds(tiles, citizens, []);
  const workplaces = reconcileWorkplaces(tiles, citizens);
  navCache.ensureFresh(tiles, 1);
  trafficSystemRuntime.vehicles = [];
  trafficSystemRuntime.signals = [];
  trafficSystemRuntime.transitLines = [];
  trafficSystemRuntime.dispatches = [];
  stepTrafficEngine(trafficSystemRuntime, tiles, citizens, navCache, 0.05, timeConfig);

  const simStats: CitySimulationStats = {
    fps: 60,
    simStepMs: 0.4,
    activeNpcs: citizens.length,
    insideBuildingNpcs: citizens.filter((c) => Boolean(c.insideBuildingId)).length,
    blockedNpcs: citizens.filter((c) => c.behaviorState === 'WaitingForPath').length,
    activeVehicles: trafficSystemRuntime.vehicles.length,
    busPassengers: trafficSystemRuntime.vehicles.reduce(
      (acc, v) => acc + (v.passengerIds?.length ?? 0),
      0,
    ),
    pedestrianNodes: navCache.pedestrianGraph.nodes.size,
    roadNodes: navCache.roadGraph.nodes.size,
    cachedRoutes: navCache.cacheCount,
    collisionHits: navCache.worldRegistry.collisionHits,
    worldObjects: navCache.worldRegistry.objects.length,
  };

  void indicators;
  void economy;

  return {
    households,
    workplaces,
    trafficSignals: trafficSystemRuntime.signals,
    transitLines: trafficSystemRuntime.transitLines,
    vehicles: trafficSystemRuntime.vehicles,
    dispatches: trafficSystemRuntime.dispatches,
    simStats,
  };
}

export function buildFreshCityState(cityName = 'Nova Aurora', mayorName = 'Prefeito(a) Silva') {
  const tiles = createInitialTiles();
  const economy = createInitialEconomy();
  const politics = createInitialPolitics();
  politics.mayorName = mayorName;
  const indicators = createInitialIndicators();
  recomputeCityGridMetrics(tiles, economy, politics);
  const citizens = createInitialCitizens(tiles);
  updateCitizenAttributesAndThoughts(citizens, tiles, indicators, economy);
  const timeConfig = createDefaultTimeConfig();
  const runtime = buildLivingWorldRuntime(tiles, citizens, indicators, economy, timeConfig, 1, 1);

  return {
    cityName,
    day: 1,
    month: 1,
    year: 1,
    hourOfDay: 9.0,
    dayAccumulator: 0,
    speed: 1 as SpeedValue,
    timeConfig,
    developmentLevel: 1,
    hadDebtBefore: false,
    tiles,
    citizens,
    ...runtime,
    economy,
    indicators,
    politics,
    news: createInitialNews(),
    achievements: createInitialAchievements(),
    decisionLogs: [{ day: 1, year: 1, text: `Fundação administrativa de ${cityName}.` }],
    activeEvent: null as GameEvent | null,
    endGameReport: null as EndGameReport | null,
    auctionTile: null as { x: number; z: number } | null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const VALID_TERRAINS = new Set<TerrainType>(['grass', 'fertile', 'waterfront', 'hill']);
const VALID_OWNER_TYPES = new Set<TileOwnerType>(['public', 'available', 'private', 'occupied']);
const VALID_ROADS = new Set<TileData['road']>(['none', 'rua', 'avenida']);
const VALID_CONFLICT_TYPES = new Set<TileConflict['type']>(['occupation', 'dispute', 'protest']);
const VALID_CITIZEN_STATES = new Set<CitizenState>([
  'idle',
  'commuting',
  'working',
  'studying',
  'shopping',
  'seeking_job',
  'seeking_home',
  'protesting',
]);
const VALID_EDUCATIONS = new Set<CitizenAgent['education']>(['Básico', 'Médio', 'Superior']);
const VALID_ALIGNMENTS = new Set<Councilor['alignment']>(['base', 'centro', 'oposicao']);
const VALID_BILL_STATUS = new Set<CityBill['status']>(['available', 'approved', 'rejected']);
const VALID_EVENT_TYPES = new Set<GameEvent['type']>(['positive', 'negative', 'political', 'land_conflict']);
const VALID_OUTCOMES = new Set<EndGameOutcome>(['election_loss', 'impeached', 'resigned', 'collapsed']);
const VALID_NEWS_CATEGORIES = new Set<NewsArticle['category']>([
  'Economia',
  'Política',
  'Cidade',
  'Segurança',
  'Habitação',
  'Social',
]);

function isValidBuildingType(val: unknown): val is BuildingTypeId {
  return typeof val === 'string' && Object.prototype.hasOwnProperty.call(BUILDING_CATALOG, val);
}

export function isTileEligibleForPublicSale(tile: TileData | null): tile is TileData {
  if (!tile) return false;
  return (
    tile.ownerType === 'public' &&
    !tile.building &&
    tile.road === 'none' &&
    !tile.conflict &&
    !tile.concessionActive &&
    tile.terrain !== 'waterfront'
  );
}

const VALID_LIFECYCLE_STAGES = new Set<BuildingLifecycleStage>([
  'planned',
  'construction_site',
  'under_construction',
  'operational',
  'remodeling',
  'abandoned',
]);
const VALID_ZONES = new Set<ZoningType>([
  'none',
  'residential',
  'commercial',
  'industrial',
  'mixed',
  'civic',
  'green',
]);

function validatePlacedBuilding(raw: unknown): PlacedBuilding | null {
  if (!isPlainObject(raw)) return null;
  if (!isValidBuildingType(raw.type)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (raw.level !== 1 && raw.level !== 2 && raw.level !== 3) return null;
  if (!isFiniteNum(raw.rotation)) return null;
  if (raw.ownerType !== 'public' && raw.ownerType !== 'private') return null;

  return {
    id: raw.id.slice(0, 120),
    type: raw.type,
    level: raw.level,
    rotation: ((Math.round(raw.rotation) % 4) + 4) % 4,
    ownerType: raw.ownerType,
    ownerName: typeof raw.ownerName === 'string' && raw.ownerName.trim() ? raw.ownerName.slice(0, 80) : 'Proprietário',
    powered: Boolean(raw.powered),
    watered: Boolean(raw.watered),
    connectedRoad: Boolean(raw.connectedRoad),
    builtAtDay: isFiniteNum(raw.builtAtDay) ? Math.max(1, Math.round(raw.builtAtDay)) : 1,
    condition: isFiniteNum(raw.condition) ? clampNum(Math.round(raw.condition), 0, 100) : 100,
    constructionStage: VALID_LIFECYCLE_STAGES.has(raw.constructionStage as BuildingLifecycleStage)
      ? (raw.constructionStage as BuildingLifecycleStage)
      : 'operational',
    constructionProgress: isFiniteNum(raw.constructionProgress)
      ? clampNum(Math.round(raw.constructionProgress), 0, 100)
      : 100,
    occupantIds: Array.isArray(raw.occupantIds)
      ? raw.occupantIds.filter((id): id is string => typeof id === 'string').slice(0, 40)
      : [],
    variantSeed: isFiniteNum(raw.variantSeed) ? Math.round(raw.variantSeed) : undefined,
    zone: VALID_ZONES.has(raw.zone as ZoningType) ? (raw.zone as ZoningType) : undefined,
  };
}

function validateConflict(raw: unknown): TileConflict | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  if (typeof raw.groupName !== 'string' || !raw.groupName.trim()) return null;
  if (!VALID_CONFLICT_TYPES.has(raw.type as TileConflict['type'])) return null;
  if (!isFiniteNum(raw.severity) || !isFiniteNum(raw.daysActive)) return null;

  return {
    id: raw.id.slice(0, 120),
    title: raw.title.slice(0, 140),
    groupName: raw.groupName.slice(0, 120),
    severity: clampNum(Math.round(raw.severity), 1, 3),
    daysActive: Math.max(0, Math.round(raw.daysActive)),
    type: raw.type as TileConflict['type'],
  };
}

function validateTile(raw: unknown, expectedX: number, expectedZ: number): TileData | null {
  if (!isPlainObject(raw)) return null;
  if (!isFiniteNum(raw.x) || !isFiniteNum(raw.z)) return null;
  if (raw.x !== expectedX || raw.z !== expectedZ) return null;
  if (!VALID_TERRAINS.has(raw.terrain as TerrainType)) return null;
  if (!VALID_OWNER_TYPES.has(raw.ownerType as TileOwnerType)) return null;
  if (!VALID_ROADS.has(raw.road as TileData['road'])) return null;
  if (!isFiniteNum(raw.landValue) || raw.landValue < 0) return null;

  let building: PlacedBuilding | null = null;
  if (raw.building !== null && raw.building !== undefined) {
    building = validatePlacedBuilding(raw.building);
    if (!building) return null;
    if (raw.road !== 'none') return null; // Invalid coexistence of road and building
  }

  let conflict: TileConflict | null = null;
  if (raw.conflict !== null && raw.conflict !== undefined) {
    conflict = validateConflict(raw.conflict);
    if (!conflict) return null;
  }

  return {
    x: expectedX,
    z: expectedZ,
    terrain: raw.terrain as TerrainType,
    ownerType: raw.ownerType as TileOwnerType,
    ownerName:
      typeof raw.ownerName === 'string' && raw.ownerName.trim()
        ? raw.ownerName.slice(0, 80)
        : raw.ownerType === 'public'
        ? 'Prefeitura Municipal'
        : 'Loteamento Urbano',
    landValue: Math.round(raw.landValue),
    road: raw.road as TileData['road'],
    hasPower: Boolean(raw.hasPower),
    hasWater: Boolean(raw.hasWater),
    plannedDistrict: Boolean(raw.plannedDistrict),
    concessionActive: Boolean(raw.concessionActive),
    building,
    crimeRisk: isFiniteNum(raw.crimeRisk) ? clampNum(Math.round(raw.crimeRisk), 0, 100) : 15,
    pollution: isFiniteNum(raw.pollution) ? clampNum(Math.round(raw.pollution), 0, 100) : 0,
    healthCoverage: isFiniteNum(raw.healthCoverage) ? clampNum(Math.round(raw.healthCoverage), 0, 100) : 30,
    educationCoverage: isFiniteNum(raw.educationCoverage) ? clampNum(Math.round(raw.educationCoverage), 0, 100) : 30,
    safetyCoverage: isFiniteNum(raw.safetyCoverage) ? clampNum(Math.round(raw.safetyCoverage), 0, 100) : 40,
    leisureCoverage: isFiniteNum(raw.leisureCoverage) ? clampNum(Math.round(raw.leisureCoverage), 0, 100) : 30,
    trafficLoad: isFiniteNum(raw.trafficLoad) ? clampNum(Math.round(raw.trafficLoad), 0, 100) : 0,
    conflict,
    zone: VALID_ZONES.has(raw.zone as ZoningType) ? (raw.zone as ZoningType) : undefined,
    busStop: typeof raw.busStop === 'boolean' ? raw.busStop : false,
  };
}

function validateEconomy(raw: unknown): EconomyState | null {
  if (!isPlainObject(raw)) return null;
  const reqNums = [
    'treasury',
    'debt',
    'iptuRate',
    'issRate',
    'itbiRate',
    'budgetHealth',
    'budgetEducation',
    'budgetSafety',
    'budgetTransit',
    'budgetSocial',
    'lastMonthlyRevenue',
    'lastMonthlyExpense',
    'lastMonthlyNet',
  ] as const;
  for (const key of reqNums) {
    if (!isFiniteNum(raw[key])) return null;
  }
  if ((raw.debt as number) < 0) return null;
  if (raw.settledItbiThisMonth !== undefined && (!isFiniteNum(raw.settledItbiThisMonth) || raw.settledItbiThisMonth < 0)) {
    return null;
  }

  if (!isPlainObject(raw.revenueBreakdown) || !isPlainObject(raw.expenseBreakdown)) return null;
  const revKeys = ['iptu', 'iss', 'itbi', 'transfers', 'servicesAndConcessions'] as const;
  for (const k of revKeys) {
    if (!isFiniteNum(raw.revenueBreakdown[k]) || (raw.revenueBreakdown[k] as number) < 0) return null;
  }
  const expKeys = [
    'payroll',
    'health',
    'education',
    'safety',
    'transitAndInfra',
    'socialPrograms',
    'debtInterest',
  ] as const;
  for (const k of expKeys) {
    if (!isFiniteNum(raw.expenseBreakdown[k]) || (raw.expenseBreakdown[k] as number) < 0) return null;
  }

  return {
    treasury: Math.max(0, Math.round(raw.treasury as number)),
    debt: Math.max(0, Math.round(raw.debt as number)),
    iptuRate: clampNum(Number((raw.iptuRate as number).toFixed(2)), 0.5, 4.0),
    issRate: clampNum(Number((raw.issRate as number).toFixed(2)), 1.0, 6.0),
    itbiRate: clampNum(Number((raw.itbiRate as number).toFixed(2)), 1.0, 5.0),
    budgetHealth: clampNum(Number((raw.budgetHealth as number).toFixed(2)), 0.4, 1.8),
    budgetEducation: clampNum(Number((raw.budgetEducation as number).toFixed(2)), 0.4, 1.8),
    budgetSafety: clampNum(Number((raw.budgetSafety as number).toFixed(2)), 0.4, 1.8),
    budgetTransit: clampNum(Number((raw.budgetTransit as number).toFixed(2)), 0.4, 1.8),
    budgetSocial: clampNum(Number((raw.budgetSocial as number).toFixed(2)), 0.4, 1.8),
    lastMonthlyRevenue: Math.max(0, Math.round(raw.lastMonthlyRevenue as number)),
    lastMonthlyExpense: Math.max(0, Math.round(raw.lastMonthlyExpense as number)),
    lastMonthlyNet: Math.round(raw.lastMonthlyNet as number),
    settledItbiThisMonth: isFiniteNum(raw.settledItbiThisMonth)
      ? Math.max(0, Math.round(raw.settledItbiThisMonth))
      : 0,
    revenueBreakdown: {
      iptu: Math.round(raw.revenueBreakdown.iptu as number),
      iss: Math.round(raw.revenueBreakdown.iss as number),
      itbi: Math.round(raw.revenueBreakdown.itbi as number),
      transfers: Math.round(raw.revenueBreakdown.transfers as number),
      servicesAndConcessions: Math.round(raw.revenueBreakdown.servicesAndConcessions as number),
    },
    expenseBreakdown: {
      payroll: Math.round(raw.expenseBreakdown.payroll as number),
      health: Math.round(raw.expenseBreakdown.health as number),
      education: Math.round(raw.expenseBreakdown.education as number),
      safety: Math.round(raw.expenseBreakdown.safety as number),
      transitAndInfra: Math.round(raw.expenseBreakdown.transitAndInfra as number),
      socialPrograms: Math.round(raw.expenseBreakdown.socialPrograms as number),
      debtInterest: Math.round(raw.expenseBreakdown.debtInterest as number),
    },
  };
}

function validateIndicators(raw: unknown): CityIndicators | null {
  if (!isPlainObject(raw)) return null;
  const keys = [
    'population',
    'jobsTotal',
    'employed',
    'unemploymentRate',
    'housingCapacity',
    'housingDeficit',
    'popularity',
    'safety',
    'health',
    'education',
    'housingIndex',
    'mobility',
    'qualityOfLife',
    'pollution',
    'economicDevelopment',
    'inequality',
  ] as const;
  for (const k of keys) {
    if (!isFiniteNum(raw[k])) return null;
  }
  if ((raw.population as number) < 0 || (raw.jobsTotal as number) < 0 || (raw.employed as number) < 0) {
    return null;
  }

  return {
    population: Math.max(0, Math.round(raw.population as number)),
    jobsTotal: Math.max(0, Math.round(raw.jobsTotal as number)),
    employed: Math.max(0, Math.round(raw.employed as number)),
    unemploymentRate: clampNum(Number((raw.unemploymentRate as number).toFixed(1)), 0, 100),
    housingCapacity: Math.max(0, Math.round(raw.housingCapacity as number)),
    housingDeficit: Math.max(0, Math.round(raw.housingDeficit as number)),
    popularity: clampNum(Math.round(raw.popularity as number), 0, 100),
    safety: clampNum(Math.round(raw.safety as number), 0, 100),
    health: clampNum(Math.round(raw.health as number), 0, 100),
    education: clampNum(Math.round(raw.education as number), 0, 100),
    housingIndex: clampNum(Math.round(raw.housingIndex as number), 0, 100),
    mobility: clampNum(Math.round(raw.mobility as number), 0, 100),
    qualityOfLife: clampNum(Math.round(raw.qualityOfLife as number), 0, 100),
    pollution: clampNum(Math.round(raw.pollution as number), 0, 100),
    economicDevelopment: clampNum(Math.round(raw.economicDevelopment as number), 0, 100),
    inequality: clampNum(Math.round(raw.inequality as number), 0, 100),
  };
}

function validatePolitics(raw: unknown): PoliticsState | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.mayorName !== 'string' || !raw.mayorName.trim()) return null;
  if (typeof raw.viceMayorName !== 'string' || !raw.viceMayorName.trim()) return null;
  if (!isFiniteNum(raw.councilSupport) || !isFiniteNum(raw.nextElectionYear) || !isFiniteNum(raw.termsServed)) {
    return null;
  }
  if (!Array.isArray(raw.councilors) || raw.councilors.length === 0) return null;
  const councilors: Councilor[] = [];
  for (const c of raw.councilors) {
    if (!isPlainObject(c)) return null;
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      typeof c.party !== 'string' ||
      !VALID_ALIGNMENTS.has(c.alignment as Councilor['alignment']) ||
      !isFiniteNum(c.support)
    ) {
      return null;
    }
    councilors.push({
      id: c.id.slice(0, 64),
      name: c.name.slice(0, 80),
      party: c.party.slice(0, 20),
      alignment: c.alignment as Councilor['alignment'],
      support: clampNum(Math.round(c.support), 0, 100),
    });
  }

  if (!Array.isArray(raw.bills)) return null;
  const bills: CityBill[] = [];
  for (const b of raw.bills) {
    if (!isPlainObject(b)) return null;
    if (
      typeof b.id !== 'string' ||
      typeof b.title !== 'string' ||
      typeof b.description !== 'string' ||
      !isFiniteNum(b.cost) ||
      !isFiniteNum(b.monthlyCost) ||
      !isFiniteNum(b.popularityEffect) ||
      !VALID_BILL_STATUS.has(b.status as CityBill['status'])
    ) {
      return null;
    }
    bills.push({
      id: b.id.slice(0, 64),
      title: b.title.slice(0, 120),
      description: b.description.slice(0, 300),
      cost: Math.max(0, Math.round(b.cost)),
      monthlyCost: Math.max(0, Math.round(b.monthlyCost)),
      popularityEffect: Math.round(b.popularityEffect),
      safetyEffect: isFiniteNum(b.safetyEffect) ? Math.round(b.safetyEffect) : undefined,
      educationEffect: isFiniteNum(b.educationEffect) ? Math.round(b.educationEffect) : undefined,
      healthEffect: isFiniteNum(b.healthEffect) ? Math.round(b.healthEffect) : undefined,
      housingEffect: isFiniteNum(b.housingEffect) ? Math.round(b.housingEffect) : undefined,
      economyEffect: isFiniteNum(b.economyEffect) ? Math.round(b.economyEffect) : undefined,
      status: b.status as CityBill['status'],
    });
  }

  if (!isPlainObject(raw.impeachment)) return null;
  const imp = raw.impeachment;
  if (
    typeof imp.active !== 'boolean' ||
    (imp.stage !== 0 && imp.stage !== 1 && imp.stage !== 2 && imp.stage !== 3 && imp.stage !== 4) ||
    typeof imp.reason !== 'string' ||
    !isFiniteNum(imp.daysInStage) ||
    !isFiniteNum(imp.supportNeededToSurvive)
  ) {
    return null;
  }

  if (!Array.isArray(raw.activePolicies) || raw.activePolicies.some((p) => typeof p !== 'string')) {
    return null;
  }

  return {
    mayorName: raw.mayorName.slice(0, 80),
    viceMayorName: raw.viceMayorName.slice(0, 80),
    councilSupport: clampNum(Math.round(raw.councilSupport), 0, 100),
    councilors,
    bills,
    impeachment: {
      active: imp.active,
      stage: imp.stage,
      reason: imp.reason.slice(0, 260),
      daysInStage: Math.max(0, Math.round(imp.daysInStage)),
      supportNeededToSurvive: clampNum(Math.round(imp.supportNeededToSurvive), 1, 100),
    },
    nextElectionYear: Math.max(1, Math.round(raw.nextElectionYear)),
    termsServed: Math.max(0, Math.round(raw.termsServed)),
    activePolicies: raw.activePolicies.map((p) => (p as string).slice(0, 64)),
  };
}

function validateCitizens(raw: unknown, tiles: TileData[]): CitizenAgent[] | null {
  if (raw === undefined) return createInitialCitizens(tiles);
  if (!Array.isArray(raw)) return null;
  const result: CitizenAgent[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    if (
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      !isFiniteNum(item.age) ||
      typeof item.profession !== 'string' ||
      !VALID_EDUCATIONS.has(item.education as CitizenAgent['education']) ||
      !isFiniteNum(item.income) ||
      !isFiniteNum(item.health) ||
      !isFiniteNum(item.happiness) ||
      !isPlainObject(item.needs) ||
      !VALID_CITIZEN_STATES.has(item.state as CitizenState) ||
      !isFiniteNum(item.opinion) ||
      typeof item.thought !== 'string' ||
      !isFiniteNum(item.x) ||
      !isFiniteNum(item.z) ||
      !isFiniteNum(item.targetX) ||
      !isFiniteNum(item.targetZ) ||
      !isFiniteNum(item.speed) ||
      !isFiniteNum(item.shirtColor)
    ) {
      return null;
    }
    const n = item.needs;
    if (
      !isFiniteNum(n.housing) ||
      !isFiniteNum(n.job) ||
      !isFiniteNum(n.health) ||
      !isFiniteNum(n.education) ||
      !isFiniteNum(n.safety)
    ) {
      return null;
    }
    result.push({
      id: item.id.slice(0, 80),
      name: item.name.slice(0, 80),
      age: clampNum(Math.round(item.age), 8, 110),
      profession: item.profession.slice(0, 80),
      education: item.education as CitizenAgent['education'],
      income: Math.max(0, Math.round(item.income)),
      employedAtId: typeof item.employedAtId === 'string' ? item.employedAtId.slice(0, 120) : null,
      employedAtName: typeof item.employedAtName === 'string' ? item.employedAtName.slice(0, 80) : null,
      homeTileKey: typeof item.homeTileKey === 'string' ? item.homeTileKey.slice(0, 20) : null,
      residenceBuildingId:
        typeof item.residenceBuildingId === 'string' ? item.residenceBuildingId.slice(0, 120) : null,
      householdId: typeof item.householdId === 'string' ? item.householdId.slice(0, 120) : null,
      health: clampNum(Math.round(item.health), 0, 100),
      happiness: clampNum(Math.round(item.happiness), 0, 100),
      needs: {
        housing: clampNum(Math.round(n.housing), 0, 100),
        job: clampNum(Math.round(n.job), 0, 100),
        health: clampNum(Math.round(n.health), 0, 100),
        education: clampNum(Math.round(n.education), 0, 100),
        safety: clampNum(Math.round(n.safety), 0, 100),
        energy: isFiniteNum(n.energy) ? clampNum(Math.round(n.energy), 0, 100) : 78,
        hunger: isFiniteNum(n.hunger) ? clampNum(Math.round(n.hunger), 0, 100) : 76,
        leisure: isFiniteNum(n.leisure) ? clampNum(Math.round(n.leisure), 0, 100) : 68,
        transport: isFiniteNum(n.transport) ? clampNum(Math.round(n.transport), 0, 100) : 74,
      },
      state: item.state as CitizenState,
      opinion: clampNum(Math.round(item.opinion), 0, 100),
      thought: item.thought.slice(0, 200),
      x: clampNum(item.x, 0, GRID_SIZE - 1),
      z: clampNum(item.z, 0, GRID_SIZE - 1),
      targetX: clampNum(item.targetX, 0, GRID_SIZE - 1),
      targetZ: clampNum(item.targetZ, 0, GRID_SIZE - 1),
      speed: clampNum(item.speed, 0.2, 4.0),
      shirtColor: Math.round(item.shirtColor),
      insideBuildingId: typeof item.insideBuildingId === 'string' ? item.insideBuildingId.slice(0, 120) : null,
      balance: isFiniteNum(item.balance) ? Math.max(0, Math.round(item.balance)) : undefined,
      birthDay: isFiniteNum(item.birthDay) ? clampNum(Math.round(item.birthDay), 1, 30) : undefined,
      birthYear: isFiniteNum(item.birthYear) ? Math.max(1, Math.round(item.birthYear)) : undefined,
      yaw: isFiniteNum(item.yaw) ? item.yaw : 0,
      history: Array.isArray(item.history)
        ? item.history.filter((h): h is string => typeof h === 'string').slice(-8)
        : undefined,
    });
  }
  return result;
}

function validateGameEvent(raw: unknown): GameEvent | null {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return null;
  if (
    typeof raw.id !== 'string' ||
    !raw.id.trim() ||
    typeof raw.title !== 'string' ||
    !raw.title.trim() ||
    typeof raw.description !== 'string' ||
    !VALID_EVENT_TYPES.has(raw.type as GameEvent['type']) ||
    !Array.isArray(raw.choices) ||
    raw.choices.length === 0
  ) {
    return null;
  }

  let tileX: number | undefined;
  let tileZ: number | undefined;
  if (raw.tileX !== undefined || raw.tileZ !== undefined) {
    if (!isFiniteNum(raw.tileX) || !isFiniteNum(raw.tileZ)) return null;
    if (raw.tileX < 0 || raw.tileX >= GRID_SIZE || raw.tileZ < 0 || raw.tileZ >= GRID_SIZE) return null;
    tileX = Math.round(raw.tileX);
    tileZ = Math.round(raw.tileZ);
  }

  const choices: GameEventChoice[] = [];
  for (const ch of raw.choices) {
    if (!isPlainObject(ch)) return null;
    if (
      typeof ch.id !== 'string' ||
      !ch.id.trim() ||
      typeof ch.label !== 'string' ||
      !ch.label.trim() ||
      !isFiniteNum(ch.cost) ||
      typeof ch.description !== 'string' ||
      !isPlainObject(ch.effects)
    ) {
      return null;
    }
    const ef = ch.effects;
    choices.push({
      id: ch.id.slice(0, 64),
      label: ch.label.slice(0, 140),
      cost: Math.max(0, Math.round(ch.cost)),
      description: ch.description.slice(0, 260),
      effects: {
        popularity: isFiniteNum(ef.popularity) ? Math.round(ef.popularity) : undefined,
        treasury: isFiniteNum(ef.treasury) ? Math.round(ef.treasury) : undefined,
        safety: isFiniteNum(ef.safety) ? Math.round(ef.safety) : undefined,
        health: isFiniteNum(ef.health) ? Math.round(ef.health) : undefined,
        education: isFiniteNum(ef.education) ? Math.round(ef.education) : undefined,
        pollution: isFiniteNum(ef.pollution) ? Math.round(ef.pollution) : undefined,
        councilSupport: isFiniteNum(ef.councilSupport) ? Math.round(ef.councilSupport) : undefined,
        economy: isFiniteNum(ef.economy) ? Math.round(ef.economy) : undefined,
        resolveConflictTile: typeof ef.resolveConflictTile === 'boolean' ? ef.resolveConflictTile : undefined,
      },
    });
  }

  return {
    id: raw.id.slice(0, 80),
    title: raw.title.slice(0, 140),
    description: raw.description.slice(0, 400),
    type: raw.type as GameEvent['type'],
    tileX,
    tileZ,
    choices,
  };
}

function validateEndGameReport(raw: unknown): EndGameReport | null {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return null;
  if (
    !VALID_OUTCOMES.has(raw.outcome as EndGameOutcome) ||
    typeof raw.title !== 'string' ||
    typeof raw.reason !== 'string' ||
    !isFiniteNum(raw.yearsServed) ||
    !isFiniteNum(raw.finalPopulation) ||
    !isFiniteNum(raw.finalTreasury) ||
    !isFiniteNum(raw.finalDebt) ||
    !isFiniteNum(raw.finalPopularity) ||
    !isFiniteNum(raw.qualityOfLife) ||
    !isFiniteNum(raw.economicDevelopment) ||
    typeof raw.legacySummary !== 'string' ||
    !Array.isArray(raw.highlights)
  ) {
    return null;
  }
  return {
    outcome: raw.outcome as EndGameOutcome,
    title: raw.title.slice(0, 120),
    reason: raw.reason.slice(0, 300),
    yearsServed: Math.max(0, Math.round(raw.yearsServed)),
    finalPopulation: Math.max(0, Math.round(raw.finalPopulation)),
    finalTreasury: Math.round(raw.finalTreasury),
    finalDebt: Math.max(0, Math.round(raw.finalDebt)),
    finalPopularity: clampNum(Math.round(raw.finalPopularity), 0, 100),
    qualityOfLife: clampNum(Math.round(raw.qualityOfLife), 0, 100),
    economicDevelopment: clampNum(Math.round(raw.economicDevelopment), 0, 100),
    legacySummary: raw.legacySummary.slice(0, 500),
    highlights: raw.highlights.filter((h): h is string => typeof h === 'string').slice(0, 12),
  };
}

export function hydrateFromSnapshot(snap: unknown) {
  if (!isPlainObject(snap)) return null;
  if (!Array.isArray(snap.tiles) || snap.tiles.length !== GRID_SIZE * GRID_SIZE) {
    return null;
  }

  const tiles: TileData[] = [];
  for (let i = 0; i < snap.tiles.length; i++) {
    const expectedX = i % GRID_SIZE;
    const expectedZ = Math.floor(i / GRID_SIZE);
    const validated = validateTile(snap.tiles[i], expectedX, expectedZ);
    if (!validated) return null;
    tiles.push(validated);
  }

  const economy = validateEconomy(snap.economy);
  if (!economy) return null;

  const indicators = validateIndicators(snap.indicators);
  if (!indicators) return null;

  const politics = validatePolitics(snap.politics);
  if (!politics) return null;

  const citizens = validateCitizens(snap.citizens, tiles);
  if (!citizens) return null;

  if (!isFiniteNum(snap.day) || !isFiniteNum(snap.month) || !isFiniteNum(snap.year)) return null;
  const day = clampNum(Math.round(snap.day), 1, 30);
  const month = clampNum(Math.round(snap.month), 1, 12);
  const year = clampNum(Math.round(snap.year), 1, 9999);
  const hourOfDay = isFiniteNum(snap.hourOfDay) ? clampNum(snap.hourOfDay, 0, 23.999) : 9;
  const dayAccumulator = isFiniteNum(snap.dayAccumulator) && snap.dayAccumulator >= 0 ? snap.dayAccumulator : 0;
  const developmentLevel = isFiniteNum(snap.developmentLevel)
    ? clampNum(Math.round(snap.developmentLevel), 1, DEVELOPMENT_LEVELS.length)
    : 1;

  let activeEvent: GameEvent | null = null;
  if (snap.activeEvent !== null && snap.activeEvent !== undefined) {
    activeEvent = validateGameEvent(snap.activeEvent);
    if (!activeEvent) return null;
  }

  let endGameReport: EndGameReport | null = null;
  if (snap.endGameReport !== null && snap.endGameReport !== undefined) {
    endGameReport = validateEndGameReport(snap.endGameReport);
    if (!endGameReport) return null;
  }

  let auctionTile: { x: number; z: number } | null = null;
  if (isPlainObject(snap.auctionTile) && isFiniteNum(snap.auctionTile.x) && isFiniteNum(snap.auctionTile.z)) {
    const ax = Math.round(snap.auctionTile.x);
    const az = Math.round(snap.auctionTile.z);
    if (isTileEligibleForPublicSale(getTile(tiles, ax, az))) {
      auctionTile = { x: ax, z: az };
    }
  }

  // Validate news
  const news: NewsArticle[] = [];
  if (snap.news !== undefined) {
    if (!Array.isArray(snap.news)) return null;
    for (const item of snap.news.slice(0, 40)) {
      if (!isPlainObject(item)) return null;
      if (
        typeof item.id !== 'string' ||
        !isFiniteNum(item.day) ||
        !isFiniteNum(item.month) ||
        !isFiniteNum(item.year) ||
        !VALID_NEWS_CATEGORIES.has(item.category as NewsArticle['category']) ||
        typeof item.headline !== 'string' ||
        typeof item.summary !== 'string'
      ) {
        return null;
      }
      news.push({
        id: item.id.slice(0, 80),
        day: clampNum(Math.round(item.day), 1, 30),
        month: clampNum(Math.round(item.month), 1, 12),
        year: clampNum(Math.round(item.year), 1, 9999),
        category: item.category as NewsArticle['category'],
        headline: item.headline.slice(0, 180),
        summary: item.summary.slice(0, 360),
      });
    }
  } else {
    news.push(...createInitialNews());
  }

  // Validate & preserve achievements merged against canonical catalog
  const baseAchievements = createInitialAchievements();
  if (snap.achievements !== undefined) {
    if (!Array.isArray(snap.achievements)) return null;
    const savedById = new Map<string, { unlocked: boolean; unlockedAtYear?: number }>();
    for (const a of snap.achievements) {
      if (!isPlainObject(a) || typeof a.id !== 'string' || typeof a.unlocked !== 'boolean') {
        return null;
      }
      savedById.set(a.id, {
        unlocked: a.unlocked,
        unlockedAtYear: isFiniteNum(a.unlockedAtYear) ? Math.round(a.unlockedAtYear) : undefined,
      });
    }
    for (const ach of baseAchievements) {
      const saved = savedById.get(ach.id);
      if (saved) {
        ach.unlocked = saved.unlocked;
        if (saved.unlocked && saved.unlockedAtYear !== undefined) {
          ach.unlockedAtYear = saved.unlockedAtYear;
        }
      }
    }
  }

  // Validate & preserve administrative decision logs
  const decisionLogs: DecisionLogEntry[] = [];
  if (snap.decisionLogs !== undefined) {
    if (!Array.isArray(snap.decisionLogs)) return null;
    for (const d of snap.decisionLogs) {
      if (!isPlainObject(d) || !isFiniteNum(d.day) || !isFiniteNum(d.year) || typeof d.text !== 'string') {
        return null;
      }
      decisionLogs.push({
        day: clampNum(Math.round(d.day), 1, 30),
        year: clampNum(Math.round(d.year), 1, 9999),
        text: d.text.slice(0, 240),
      });
    }
  }

  const validSpeed: SpeedValue =
    snap.speed === 0 ||
    snap.speed === 0.5 ||
    snap.speed === 1 ||
    snap.speed === 2 ||
    snap.speed === 4 ||
    snap.speed === 8
      ? (snap.speed as SpeedValue)
      : 1;

  const baseTime = createDefaultTimeConfig();
  const rawTc = isPlainObject(snap.timeConfig) ? snap.timeConfig : {};
  const preset: TimePreset =
    rawTc.preset === 'relaxed' || rawTc.preset === 'balanced' || rawTc.preset === 'strategic'
      ? rawTc.preset
      : baseTime.preset;
  const timeConfig: GameTimeConfig = {
    secondsPerDay: isFiniteNum(rawTc.secondsPerDay)
      ? clampNum(Math.round(rawTc.secondsPerDay), 60, 300)
      : baseTime.secondsPerDay,
    preset,
    npcSpeedMultiplier: isFiniteNum(rawTc.npcSpeedMultiplier)
      ? clampNum(Number(rawTc.npcSpeedMultiplier.toFixed(2)), 0.5, 2.0)
      : baseTime.npcSpeedMultiplier,
    trafficIntensity: isFiniteNum(rawTc.trafficIntensity)
      ? clampNum(Number(rawTc.trafficIntensity.toFixed(2)), 0.2, 1.5)
      : baseTime.trafficIntensity,
    pedestrianDensity: isFiniteNum(rawTc.pedestrianDensity)
      ? clampNum(Number(rawTc.pedestrianDensity.toFixed(2)), 0.2, 1.5)
      : baseTime.pedestrianDensity,
    vegetationDensity: isFiniteNum(rawTc.vegetationDensity)
      ? clampNum(Number(rawTc.vegetationDensity.toFixed(2)), 0.2, 1.5)
      : baseTime.vegetationDensity,
    cameraSpeed: isFiniteNum(rawTc.cameraSpeed)
      ? clampNum(Number(rawTc.cameraSpeed.toFixed(2)), 0.4, 2.0)
      : baseTime.cameraSpeed,
    ambientAudioEnabled:
      typeof rawTc.ambientAudioEnabled === 'boolean'
        ? rawTc.ambientAudioEnabled
        : baseTime.ambientAudioEnabled,
    ambientVolume: isFiniteNum(rawTc.ambientVolume)
      ? clampNum(Number(rawTc.ambientVolume.toFixed(2)), 0, 1)
      : baseTime.ambientVolume,
    debugOverlay: typeof rawTc.debugOverlay === 'boolean' ? rawTc.debugOverlay : false,
    creativeInstantBuild:
      typeof rawTc.creativeInstantBuild === 'boolean' ? rawTc.creativeInstantBuild : false,
  };

  recomputeCityGridMetrics(tiles, economy, politics);
  const runtime = buildLivingWorldRuntime(tiles, citizens, indicators, economy, timeConfig, year, day);

  return {
    cityName:
      typeof snap.cityName === 'string' && snap.cityName.trim()
        ? snap.cityName.trim().slice(0, 80)
        : 'Nova Aurora',
    day,
    month,
    year,
    hourOfDay,
    dayAccumulator,
    speed: endGameReport ? (0 as SpeedValue) : validSpeed,
    timeConfig,
    developmentLevel,
    hadDebtBefore: Boolean(snap.hadDebtBefore),
    tiles,
    citizens,
    ...runtime,
    economy,
    indicators,
    politics,
    news,
    achievements: baseAchievements,
    decisionLogs,
    activeEvent,
    endGameReport,
    auctionTile,
  };
}

const localBootCheck = loadCityLocalSafe();
const hydratedLocal =
  localBootCheck.status === 'ok' && localBootCheck.snapshot
    ? hydrateFromSnapshot(localBootCheck.snapshot)
    : null;
const hadCorruptedLocalSave =
  localBootCheck.status === 'corrupted' ||
  (localBootCheck.status === 'ok' && hydratedLocal === null);

if (hadCorruptedLocalSave) {
  clearCityLocal();
}

const bootState = hydratedLocal || buildFreshCityState();
const detectedCaps = detectGraphicsCapabilities();
const GFX_STORAGE_KEY = 'city_tycoon_4d_gfx_v1';
const savedGraphicsQuality = (() => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(GFX_STORAGE_KEY);
    if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'ultra') {
      return raw as GraphicsQuality;
    }
    return null;
  } catch {
    return null;
  }
})();

export const useGameStore = create<GameState>((set, get) => ({
  ...bootState,

  activeTool: 'select',
  selectedBuildType: null,
  buildRotation: 0,
  manualBuildRotated: false,
  moveSourceTile: null,
  selectedTileCoords: null,
  hoveredTileCoords: null,
  pendingDemolition: null,
  buildUndoStack: [],
  selectedCitizenId: null,
  followedCitizenId: null,
  showCitizenRoute: true,
  thematicMode: 'normal',
  activeLeftTab: null,
  zenMode: false,
  showNewspaperModal: false,
  showCloudModal: false,
  showSettingsModal: false,
  graphicsQuality: savedGraphicsQuality ?? detectedCaps.recommendedQuality,
  recommendedQuality: detectedCaps.recommendedQuality,
  cameraMode: 'strategic',
  activeCameraPreset: 'aerial',
  followedVehicleId: null,
  cameraFocusTile: { x: 12, z: 12 },
  cameraCommand: null,
  toast: hadCorruptedLocalSave
    ? {
        id: 'corrupted_save_recovery',
        text: 'Salvamento local corrompido detectado. Uma nova administração segura foi iniciada.',
        tone: 'warning',
      }
    : null,
  gridVersion: 1,
  thematicVersion: 1,
  simAlpha: 0,

  showToast: (text, tone = 'info') => {
    set({ toast: { id: `${Date.now()}_${Math.random()}`, text, tone } });
  },

  clearToast: () => set({ toast: null }),

  setSpeed: (speed) => set({ speed }),

  setTimeConfig: (partial) =>
    set((s) => ({
      timeConfig: {
        ...s.timeConfig,
        ...partial,
        secondsPerDay:
          partial.secondsPerDay !== undefined
            ? clampNum(Math.round(partial.secondsPerDay), 60, 300)
            : s.timeConfig.secondsPerDay,
      },
    })),

  setTimePreset: (preset) =>
    set((s) => ({
      timeConfig: applyTimePreset(s.timeConfig, preset),
    })),

  setShowCitizenRoute: (showCitizenRoute) => set({ showCitizenRoute }),

  reportRenderFps: (fps) =>
    set((s) => ({
      simStats: {
        ...s.simStats,
        fps: Math.round(s.simStats.fps * 0.8 + fps * 0.2),
      },
    })),

  toggleBusStop: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile || tile.road === 'none') {
      state.showToast('Pontos de ônibus só podem ser instalados em ruas ou avenidas.', 'warning');
      return;
    }
    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.busStop = !target.busStop;
    trafficSystemRuntime.transitLines = [];
    set((s) => ({
      tiles,
      gridVersion: s.gridVersion + 1,
    }));
    state.showToast(
      target.busStop ? 'Ponto de ônibus ativado neste trecho.' : 'Ponto de ônibus removido.',
      'info',
    );
  },

  setActiveTool: (tool, buildType = null) =>
    set({
      activeTool: tool,
      selectedBuildType: buildType,
      moveSourceTile: null,
      manualBuildRotated: false,
    }),

  setHoveredTileCoords: (hoveredTileCoords) => set({ hoveredTileCoords }),

  rotateBuildPreview: () =>
    set((s) => ({
      buildRotation: (s.buildRotation + 1) % 4,
      manualBuildRotated: true,
    })),

  undoLastBuild: () => {
    const state = get();
    if (state.buildUndoStack.length === 0) {
      state.showToast('Nenhuma obra recente disponível para desfazer.', 'info');
      return;
    }
    const entry = state.buildUndoStack[state.buildUndoStack.length - 1];
    const remainingStack = state.buildUndoStack.slice(0, -1);

    if (
      entry.builtDay !== state.day ||
      entry.builtMonth !== state.month ||
      entry.builtYear !== state.year
    ) {
      set({ buildUndoStack: [] });
      state.showToast('Prazo de desfazimento encerrado após virada de dia.', 'warning');
      return;
    }

    const tile = getTile(state.tiles, entry.x, entry.z);
    if (!tile) {
      set({ buildUndoStack: remainingStack });
      return;
    }

    if (entry.kind === 'building') {
      if (
        !tile.building ||
        tile.building.id !== entry.buildingId ||
        tile.building.level !== 1 ||
        tile.concessionActive
      ) {
        set({ buildUndoStack: remainingStack });
        state.showToast('Obra já modificada ou ocupada não pode ser desfeita.', 'warning');
        return;
      }
    } else {
      if (tile.building || tile.road !== entry.roadAfter || tile.busStop) {
        set({ buildUndoStack: remainingStack });
        state.showToast('Trecho viário já alterado não pode ser desfeito.', 'warning');
        return;
      }
    }

    const tiles = state.tiles.map((t) => ({
      ...t,
      building: t.building ? { ...t.building } : null,
    }));
    const target = tiles[entry.z * GRID_SIZE + entry.x];
    target.building = null;
    target.road = entry.roadBefore;
    target.busStop = false;
    target.zone = 'none';
    target.ownerType = entry.ownerTypeBefore;
    target.ownerName = entry.ownerNameBefore;
    target.concessionActive = entry.concessionBefore;

    const economy = {
      ...state.economy,
      treasury: state.economy.treasury + entry.totalCostPaid,
    };
    const grid = recomputeCityGridMetrics(tiles, economy, state.politics);
    const updatedCitizens = state.citizens.map((c) => {
      if (entry.buildingId && c.insideBuildingId === entry.buildingId) {
        return { ...c, insideBuildingId: null, path: [], pathIndex: 0 };
      }
      return { ...c };
    });
    const households = reconcileHouseholds(tiles, updatedCitizens, state.households);
    const workplaces = reconcileWorkplaces(tiles, updatedCitizens);

    set((s) => ({
      tiles,
      citizens: updatedCitizens,
      households,
      workplaces,
      economy,
      indicators: {
        ...s.indicators,
        housingCapacity: grid.housingCapacity,
        jobsTotal: grid.jobsTotal,
        safety: grid.avgSafety,
        health: grid.avgHealth,
        education: grid.avgEducation,
        pollution: grid.avgPollution,
      },
      buildUndoStack: remainingStack,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(
      `Obra desfeita (+R$ ${entry.totalCostPaid.toLocaleString('pt-BR')} estornados).`,
      'info',
    );
  },

  setThematicMode: (thematicMode) => set({ thematicMode }),

  setActiveLeftTab: (tab) =>
    set((s) => ({
      activeLeftTab: s.activeLeftTab === tab ? null : tab,
    })),

  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),

  setShowNewspaperModal: (showNewspaperModal) => set({ showNewspaperModal }),

  setShowCloudModal: (showCloudModal) => set({ showCloudModal }),

  setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),

  setGraphicsQuality: (graphicsQuality) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GFX_STORAGE_KEY, graphicsQuality);
      }
    } catch {
      // Ignore storage write errors
    }
    set({ graphicsQuality });
  },

  setCameraMode: (cameraMode) =>
    set((s) => ({
      cameraMode,
      followedCitizenId: cameraMode === 'follow' ? s.followedCitizenId : null,
      followedVehicleId: cameraMode === 'follow' ? s.followedVehicleId : null,
    })),

  setCameraPreset: (preset) =>
    set((s) => ({
      activeCameraPreset: preset,
      cameraMode: preset === 'aerial' ? 'strategic' : 'drone',
      followedCitizenId: null,
      followedVehicleId: null,
      cameraCommand: { type: 'preset', preset, nonce: Date.now() },
    })),

  followVehicle: (vehicleId) =>
    set((s) => ({
      followedVehicleId: vehicleId,
      followedCitizenId: vehicleId ? null : s.followedCitizenId,
      cameraMode: vehicleId ? 'follow' : s.cameraMode === 'follow' ? 'strategic' : s.cameraMode,
    })),

  setCameraFocusTile: (x, z) => set({ cameraFocusTile: { x, z } }),

  selectTile: (x, z) =>
    set((s) => ({
      selectedTileCoords: { x, z },
      selectedCitizenId: null,
      followedCitizenId: null,
      followedVehicleId: null,
      cameraMode: s.cameraMode === 'follow' ? 'strategic' : s.cameraMode,
    })),

  selectCitizen: (citizenId) =>
    set({
      selectedCitizenId: citizenId,
      selectedTileCoords: null,
    }),

  followCitizen: (citizenId) =>
    set((s) => ({
      followedCitizenId: citizenId,
      followedVehicleId: null,
      selectedCitizenId: citizenId ?? s.selectedCitizenId,
      cameraMode: citizenId ? 'follow' : s.cameraMode === 'follow' ? 'strategic' : s.cameraMode,
      cameraCommand: citizenId
        ? { type: 'follow_citizen', citizenId, nonce: Date.now() }
        : s.cameraCommand,
    })),

  sendCameraCommand: (cmd) =>
    set((s) => ({
      followedCitizenId: null,
      followedVehicleId: null,
      cameraMode: s.cameraMode === 'follow' ? 'strategic' : s.cameraMode,
      cameraCommand: { ...cmd, nonce: Date.now() },
    })),

  advanceToNextDay: () => {
    const state = get();
    if (state.endGameReport || state.activeEvent) return;
    const hoursToAdvance = state.hourOfDay < 7 ? 7 - state.hourOfDay : 24 - state.hourOfDay + 7;
    stepBuildingLifecycles(state.tiles, hoursToAdvance, state.timeConfig.creativeInstantBuild);
    const nextDay = state.day + 1;
    if (nextDay <= 30) {
      set((s) => ({
        day: nextDay,
        hourOfDay: 7.0,
        dayAccumulator: 0,
        buildUndoStack: [],
        gridVersion: s.gridVersion + 1,
      }));
      return;
    }
    get().advanceToMonthEnd();
  },

  advanceToMonthEnd: () => {
    const state = get();
    if (state.endGameReport || state.activeEvent) return;
    const remainingDays = Math.max(1, 31 - state.day);
    stepBuildingLifecycles(
      state.tiles,
      remainingDays * 24,
      state.timeConfig.creativeInstantBuild,
    );
    let month = state.month + 1;
    let year = state.year;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const hadDebtBefore = state.hadDebtBefore || state.economy.debt > 0;
    const result = processMonthlyCycle({
      tiles: state.tiles,
      economy: state.economy,
      indicators: state.indicators,
      politics: state.politics,
      citizens: state.citizens,
      achievements: state.achievements,
      developmentLevel: state.developmentLevel,
      decisionLogs: state.decisionLogs,
      day: 1,
      month,
      year,
      cityName: state.cityName,
      hadDebtBefore,
    });
    const updatedNews = [...result.newsToAdd, ...state.news].slice(0, 40);
    set((s) => ({
      day: 1,
      month,
      year,
      dayAccumulator: 0,
      hourOfDay: 8.0,
      hadDebtBefore,
      tiles: result.tiles,
      economy: result.economy,
      indicators: result.indicators,
      politics: result.politics,
      citizens: result.citizens,
      news: updatedNews,
      achievements: result.achievements,
      developmentLevel: result.developmentLevel,
      decisionLogs: result.decisionLogs,
      activeEvent: result.triggeredEvent ?? s.activeEvent,
      endGameReport: result.endGameReport ?? s.endGameReport,
      buildUndoStack: [],
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    saveCityLocal(get().exportSnapshot());
  },

  advanceSimulation: (dtSeconds) => {
    const state = get();
    if (state.speed === 0 || state.endGameReport || state.activeEvent || dtSeconds <= 0) return;

    const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    navCache.ensureFresh(state.tiles, state.gridVersion, state.citizens, trafficSystemRuntime.vehicles);

    // Fixed-timestep simulation accumulation (20 Hz deterministic steps + alpha interpolation)
    const clockStep = simClock.step(dtSeconds, state.speed, state.timeConfig);
    if (clockStep.fixedSteps === 0) {
      if (Math.abs(clockStep.alpha - state.simAlpha) > 0.005) {
        set({ simAlpha: clockStep.alpha });
      }
      return;
    }

    const calendarHoursDelta = clockStep.calendarHoursDelta;
    const stepCalendarHours = calendarHoursDelta / clockStep.fixedSteps;
    const stepPhysicalDt = FIXED_SIM_DT * clockStep.physicalScale;
    const totalPhysicalDt = clockStep.physicalDt;
    const calendarSimSeconds = clockStep.fixedSteps * FIXED_SIM_DT * state.speed;

    const dueChannels = simScheduler.advance(totalPhysicalDt);
    const runNeedsAndStructure = dueChannels.has('needs');

    const safeSecondsPerDay = clampNum(state.timeConfig.secondsPerDay || 180, 60, 300);
    let newAcc = state.dayAccumulator + calendarSimSeconds;
    const newHour = (state.hourOfDay + calendarHoursDelta) % 24;

    // 1. Building construction lifecycle progression
    const anyBuiltCompleted = stepBuildingLifecycles(
      state.tiles,
      calendarHoursDelta,
      state.timeConfig.creativeInstantBuild,
    );

    // 2. Fixed-step NPC ecosystem & road traffic (snapshotting prev coordinates before final step for interpolation)
    const nextCitizens = state.citizens;
    let ecoHouseholds = state.households;
    let ecoWorkplaces = state.workplaces;

    for (let step = 0; step < clockStep.fixedSteps; step++) {
      for (let i = 0; i < nextCitizens.length; i++) {
        const c = nextCitizens[i];
        c.prevX = c.x;
        c.prevZ = c.z;
        c.prevYaw = c.yaw;
      }
      for (let i = 0; i < trafficSystemRuntime.vehicles.length; i++) {
        const v = trafficSystemRuntime.vehicles[i];
        v.prevX = v.x;
        v.prevZ = v.z;
        v.prevYaw = v.yaw;
      }

      const stepHour = (state.hourOfDay + stepCalendarHours * (step + 1)) % 24;
      const ecoStep = stepCitizenEcosystem({
        tiles: state.tiles,
        citizens: nextCitizens,
        households: ecoHouseholds,
        workplaces: ecoWorkplaces,
        navCache,
        hourOfDay: stepHour,
        day: state.day,
        year: state.year,
        physicalDt: stepPhysicalDt,
        calendarHoursDelta: stepCalendarHours,
        timeConfig: state.timeConfig,
        indicators: state.indicators,
        economy: state.economy,
        batchCursor: citizenBatchCursor,
        runNeedsAndStructure: runNeedsAndStructure && step === 0,
        vehicles: trafficSystemRuntime.vehicles,
      });
      ecoHouseholds = ecoStep.households;
      ecoWorkplaces = ecoStep.workplaces;
      citizenBatchCursor = ecoStep.nextBatchCursor;

      stepTrafficEngine(
        trafficSystemRuntime,
        state.tiles,
        nextCitizens,
        navCache,
        stepPhysicalDt,
        state.timeConfig,
      );
    }

    let nextIndicators = state.indicators;
    if (runNeedsAndStructure) {
      const unmetCounts = { health: 0, education: 0, food: 0, work: 0, housing: 0, leisure: 0 };
      for (let i = 0; i < nextCitizens.length; i++) {
        const u = nextCitizens[i].unmetDemandCategory;
        if (u) unmetCounts[u] += 1;
      }
      nextIndicators = {
        ...state.indicators,
        unmetNeeds: unmetCounts,
      };
    }

    const tEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const simStepMs = Number((tEnd - tStart).toFixed(2));
    const simStats: CitySimulationStats = dueChannels.has('stats')
      ? {
          fps: state.simStats.fps,
          simStepMs,
          activeNpcs: nextCitizens.length,
          insideBuildingNpcs: nextCitizens.filter((c) => Boolean(c.insideBuildingId)).length,
          blockedNpcs: nextCitizens.filter((c) => c.behaviorState === 'WaitingForPath').length,
          activeVehicles: trafficSystemRuntime.vehicles.length,
          busPassengers: trafficSystemRuntime.vehicles.reduce(
            (acc, v) => acc + (v.passengerIds?.length ?? 0),
            0,
          ),
          pedestrianNodes: navCache.pedestrianGraph.nodes.size,
          roadNodes: navCache.roadGraph.nodes.size,
          cachedRoutes: navCache.cacheCount,
          collisionHits: navCache.worldRegistry.collisionHits,
          worldObjects: navCache.worldRegistry.objects.length,
        }
      : state.simStats;

    if (newAcc < safeSecondsPerDay) {
      set((s) => ({
        dayAccumulator: newAcc,
        hourOfDay: newHour,
        simAlpha: clockStep.alpha,
        indicators: nextIndicators,
        households: ecoHouseholds,
        workplaces: ecoWorkplaces,
        trafficSignals: trafficSystemRuntime.signals,
        transitLines: trafficSystemRuntime.transitLines,
        vehicles: trafficSystemRuntime.vehicles,
        dispatches: trafficSystemRuntime.dispatches,
        simStats,
        gridVersion: anyBuiltCompleted ? s.gridVersion + 1 : s.gridVersion,
      }));
      return;
    }

    newAcc -= safeSecondsPerDay;
    let day = state.day + 1;
    let month = state.month;
    let year = state.year;

    if (day <= 30) {
      set((s) => ({
        day,
        dayAccumulator: newAcc,
        hourOfDay: newHour,
        simAlpha: clockStep.alpha,
        indicators: nextIndicators,
        households: ecoHouseholds,
        workplaces: ecoWorkplaces,
        trafficSignals: trafficSystemRuntime.signals,
        transitLines: trafficSystemRuntime.transitLines,
        vehicles: trafficSystemRuntime.vehicles,
        dispatches: trafficSystemRuntime.dispatches,
        simStats,
        gridVersion: anyBuiltCompleted ? s.gridVersion + 1 : s.gridVersion,
      }));
      return;
    }

    // Monthly closure!
    day = 1;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }

    const hadDebtBefore = state.hadDebtBefore || state.economy.debt > 0;
    const result = processMonthlyCycle({
      tiles: state.tiles,
      economy: state.economy,
      indicators: nextIndicators,
      politics: state.politics,
      citizens: nextCitizens,
      achievements: state.achievements,
      developmentLevel: state.developmentLevel,
      decisionLogs: state.decisionLogs,
      day,
      month,
      year,
      cityName: state.cityName,
      hadDebtBefore,
    });

    const reconciledHouseholds = reconcileHouseholds(result.tiles, result.citizens, ecoHouseholds);
    const reconciledWorkplaces = reconcileWorkplaces(result.tiles, result.citizens);
    const updatedNews = [...result.newsToAdd, ...state.news].slice(0, 40);

    set((s) => ({
      day,
      month,
      year,
      dayAccumulator: newAcc,
      hourOfDay: newHour,
      hadDebtBefore,
      tiles: result.tiles,
      economy: result.economy,
      indicators: result.indicators,
      politics: result.politics,
      citizens: result.citizens,
      households: reconciledHouseholds,
      workplaces: reconciledWorkplaces,
      trafficSignals: trafficSystemRuntime.signals,
      transitLines: trafficSystemRuntime.transitLines,
      vehicles: trafficSystemRuntime.vehicles,
      dispatches: trafficSystemRuntime.dispatches,
      simStats,
      news: updatedNews,
      achievements: result.achievements,
      developmentLevel: result.developmentLevel,
      decisionLogs: result.decisionLogs,
      activeEvent: result.triggeredEvent ?? s.activeEvent,
      endGameReport: result.endGameReport ?? s.endGameReport,
      buildUndoStack: [],
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
      toast: result.developmentChangedTo
        ? {
            id: `lvl_${Date.now()}`,
            text: `Cidade evoluiu para: ${result.developmentChangedTo}! Novas construções desbloqueadas.`,
            tone: 'success',
          }
        : s.toast,
    }));

    // Auto-save locally every month
    const latest = get();
    saveCityLocal(latest.exportSnapshot());
  },

  interactWithTile: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;

    if (state.activeTool === 'select') {
      state.selectTile(x, z);
      return;
    }

    if (state.activeTool === 'demolish') {
      state.requestDemolition(x, z);
      return;
    }

    if (state.activeTool === 'buy_land') {
      state.buyLand(x, z);
      return;
    }

    if (state.activeTool === 'sell_land') {
      state.sellLand(x, z);
      return;
    }

    if (state.activeTool === 'move') {
      if (!state.moveSourceTile) {
        if (tile.building && tile.building.type !== 'prefeitura') {
          set({ moveSourceTile: { x, z } });
          state.showToast('Selecione o terreno de destino para mover a construção.', 'info');
        } else {
          state.showToast('Selecione um edifício válido para mover.', 'warning');
        }
        return;
      }
      const src = state.moveSourceTile;
      if (src.x === x && src.z === z) {
        set({ moveSourceTile: null });
        return;
      }
      const srcTile = getTile(state.tiles, src.x, src.z);
      if (!srcTile || !srcTile.building) {
        set({ moveSourceTile: null });
        return;
      }
      if (tile.building || tile.road !== 'none' || tile.terrain === 'waterfront' || tile.conflict) {
        state.showToast('Terreno de destino inválido ou ocupado.', 'error');
        return;
      }
      const moveFee = 6000;
      if (state.economy.treasury < moveFee) {
        state.showToast('Saldo insuficiente para custo de realocação (R$ 6.000).', 'error');
        return;
      }
      const tiles = state.tiles.map((t) => ({
        ...t,
        building: t.building ? { ...t.building } : null,
      }));
      const sTile = tiles[src.z * GRID_SIZE + src.x];
      const dTile = tiles[z * GRID_SIZE + x];
      dTile.building = sTile.building;
      dTile.ownerType = sTile.ownerType;
      dTile.ownerName = sTile.ownerName;
      dTile.concessionActive = false;
      sTile.building = null;
      sTile.concessionActive = false;
      const economy = { ...state.economy, treasury: state.economy.treasury - moveFee };
      recomputeCityGridMetrics(tiles, economy, state.politics);
      set((s) => ({
        tiles,
        economy,
        moveSourceTile: null,
        selectedTileCoords: { x, z },
        gridVersion: s.gridVersion + 1,
        thematicVersion: s.thematicVersion + 1,
      }));
      state.showToast('Construção realocada com sucesso!', 'success');
      return;
    }

    if (state.activeTool === 'build' && state.selectedBuildType) {
      const def = BUILDING_CATALOG[state.selectedBuildType];
      if (!def) return;

      if (state.developmentLevel < def.unlockLevel) {
        const reqName = DEVELOPMENT_LEVELS.find((d) => d.level === def.unlockLevel)?.name || '';
        state.showToast(`Desbloqueado no nível ${def.unlockLevel} (${reqName}).`, 'warning');
        return;
      }

      if (tile.conflict) {
        state.showToast('Resolva o conflito fundiário neste terreno antes de construir.', 'warning');
        return;
      }

      if (def.isRoad) {
        const roadType = def.id === 'avenida' ? 'avenida' : 'rua';
        if (tile.building) {
          state.showToast('Demolir o imóvel antes de pavimentar este lote.', 'error');
          return;
        }
        if (tile.road === roadType) return;
        if (state.economy.treasury < def.cost) {
          state.showToast('Orçamento público insuficiente.', 'error');
          return;
        }
        const undoEntry: BuildUndoEntry = {
          kind: 'road',
          x,
          z,
          buildingId: null,
          buildingType: def.id,
          roadBefore: tile.road,
          roadAfter: roadType,
          ownerTypeBefore: tile.ownerType,
          ownerNameBefore: tile.ownerName,
          concessionBefore: tile.concessionActive,
          totalCostPaid: def.cost,
          builtDay: state.day,
          builtMonth: state.month,
          builtYear: state.year,
        };
        const tiles = state.tiles.map((t) => ({ ...t }));
        const target = tiles[z * GRID_SIZE + x];
        target.road = roadType;
        target.ownerType = 'public';
        target.ownerName = 'Via Pública';
        target.concessionActive = false;
        const economy = { ...state.economy, treasury: state.economy.treasury - def.cost };
        recomputeCityGridMetrics(tiles, economy, state.politics);
        set((s) => ({
          tiles,
          economy,
          buildUndoStack: [...s.buildUndoStack.slice(-14), undoEntry],
          gridVersion: s.gridVersion + 1,
          thematicVersion: s.thematicVersion + 1,
        }));
        return;
      }

      // Building placement
      if (tile.building || tile.road !== 'none') {
        state.showToast('Este terreno já está ocupado.', 'error');
        return;
      }

      if (tile.terrain === 'waterfront' && def.category !== 'leisure') {
        state.showToast('Área de orla reservada para praças, parques e lazer.', 'warning');
        return;
      }

      if (def.id === 'prefeitura' && state.tiles.some((t) => t.building?.type === 'prefeitura')) {
        state.showToast('A cidade já possui uma Prefeitura Municipal.', 'warning');
        return;
      }

      const landAcquisitionCost = tile.ownerType === 'available' ? Math.round(tile.landValue * 0.65) : 0;
      const totalCost = def.cost + landAcquisitionCost;

      if (state.economy.treasury < totalCost) {
        state.showToast(
          `Saldo insuficiente (necessário R$ ${totalCost.toLocaleString('pt-BR')}).`,
          'error',
        );
        return;
      }

      const undoOwnerBefore = tile.ownerType;
      const undoOwnerNameBefore = tile.ownerName;
      const undoConcessionBefore = tile.concessionActive;

      const tiles = state.tiles.map((t) => ({
        ...t,
        building: t.building ? { ...t.building } : null,
      }));
      const target = tiles[z * GRID_SIZE + x];
      const isPublic = Boolean(def.isPublicAsset);
      target.ownerType = isPublic ? 'public' : 'private';
      target.ownerName = isPublic ? 'Prefeitura Municipal' : 'Empreendimento Privado';
      target.concessionActive = false;
      const autoRotation = state.manualBuildRotated
        ? state.buildRotation
        : computeFacingRoadRotation(tiles, x, z, state.buildRotation);
      const placed = initializeBuildingLifecycle(
        {
          id: `b_${def.id}_${x}_${z}_${Date.now().toString(36)}`,
          type: def.id,
          level: 1,
          rotation: autoRotation,
          ownerType: isPublic ? 'public' : 'private',
          ownerName: target.ownerName,
          powered: target.hasPower,
          watered: target.hasWater,
          connectedRoad: true,
          builtAtDay: (state.year - 1) * 360 + (state.month - 1) * 30 + state.day,
          condition: 100,
          occupantIds: [],
          variantSeed: x * 41 + z * 83 + state.day,
        },
        state.timeConfig.creativeInstantBuild,
      );
      target.building = placed;
      const access = computeBuildingAccess(tiles, target);
      target.building.entranceTile = access.adjacentRoadTile ?? { x, z };
      target.zone = inferBuildingZone(target);
      target.building.zone = target.zone;

      const undoEntry: BuildUndoEntry = {
        kind: 'building',
        x,
        z,
        buildingId: placed.id,
        buildingType: def.id,
        roadBefore: tile.road,
        roadAfter: tile.road,
        ownerTypeBefore: undoOwnerBefore,
        ownerNameBefore: undoOwnerNameBefore,
        concessionBefore: undoConcessionBefore,
        totalCostPaid: totalCost,
        builtDay: state.day,
        builtMonth: state.month,
        builtYear: state.year,
      };

      const economy = {
        ...state.economy,
        treasury: state.economy.treasury - totalCost,
      };

      const grid = recomputeCityGridMetrics(tiles, economy, state.politics);
      const updatedCitizens = state.citizens.map((c) => ({ ...c }));
      const households = reconcileHouseholds(tiles, updatedCitizens, state.households);
      const workplaces = reconcileWorkplaces(tiles, updatedCitizens);
      const indicators = {
        ...state.indicators,
        housingCapacity: grid.housingCapacity,
        jobsTotal: grid.jobsTotal,
        safety: grid.avgSafety,
        health: grid.avgHealth,
        education: grid.avgEducation,
        pollution: grid.avgPollution,
      };

      set((s) => ({
        tiles,
        citizens: updatedCitizens,
        households,
        workplaces,
        economy,
        indicators,
        buildUndoStack: [...s.buildUndoStack.slice(-14), undoEntry],
        selectedTileCoords: { x, z },
        gridVersion: s.gridVersion + 1,
        thematicVersion: s.thematicVersion + 1,
      }));
      state.showToast(`${def.name} construído!`, 'success');
    }
  },

  upgradeBuilding: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile || !tile.building) return;
    if (tile.building.level >= 3) {
      state.showToast('Edifício já está no nível máximo (Nível 3).', 'info');
      return;
    }
    const def = BUILDING_CATALOG[tile.building.type];
    const upgradeCost = Math.round(def.cost * 0.75 * tile.building.level);
    if (state.economy.treasury < upgradeCost) {
      state.showToast(`Saldo insuficiente (R$ ${upgradeCost.toLocaleString('pt-BR')}).`, 'error');
      return;
    }
    const tiles = state.tiles.map((t) => ({
      ...t,
      building: t.building ? { ...t.building } : null,
    }));
    const target = tiles[z * GRID_SIZE + x];
    if (target.building) {
      target.building.level = (target.building.level + 1) as 1 | 2 | 3;
    }
    const economy = { ...state.economy, treasury: state.economy.treasury - upgradeCost };
    const grid = recomputeCityGridMetrics(tiles, economy, state.politics);
    set((s) => ({
      tiles,
      economy,
      indicators: {
        ...s.indicators,
        housingCapacity: grid.housingCapacity,
        jobsTotal: grid.jobsTotal,
      },
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(`${def.name} evoluído para o Nível ${target.building!.level}!`, 'success');
  },

  startMoveBuilding: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile?.building) return;
    if (tile.building.type === 'prefeitura') {
      state.showToast('A Prefeitura Municipal é um marco histórico fixo.', 'warning');
      return;
    }
    set({
      activeTool: 'move',
      selectedBuildType: null,
      moveSourceTile: { x, z },
    });
    state.showToast('Clique em um lote vazio para mover o imóvel.', 'info');
  },

  requestDemolition: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;
    if (tile.building?.type === 'prefeitura') {
      state.showToast('Não é possível demolir a Prefeitura Municipal.', 'error');
      return;
    }
    if (!tile.building && tile.road === 'none') {
      state.showToast('Nada para demolir neste terreno.', 'info');
      return;
    }
    set({ pendingDemolition: { x, z } });
  },

  confirmDemolition: () => {
    const state = get();
    const pending = state.pendingDemolition;
    set({ pendingDemolition: null });
    if (!pending) return;
    state.demolishAt(pending.x, pending.z);
  },

  cancelDemolition: () => set({ pendingDemolition: null }),

  demolishAt: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;
    if (tile.building?.type === 'prefeitura') {
      state.showToast('Não é possível demolir a Prefeitura Municipal.', 'error');
      return;
    }
    if (!tile.building && tile.road === 'none') {
      state.showToast('Nada para demolir neste terreno.', 'info');
      return;
    }
    const refund = tile.building
      ? Math.round(BUILDING_CATALOG[tile.building.type].cost * 0.25)
      : 1000;
    const tiles = state.tiles.map((t) => ({
      ...t,
      building: t.building ? { ...t.building } : null,
    }));
    const target = tiles[z * GRID_SIZE + x];
    const demolishedBuildingId = target.building?.id ?? null;
    target.building = null;
    target.road = 'none';
    target.busStop = false;
    target.zone = 'none';
    const economy = { ...state.economy, treasury: state.economy.treasury + refund };
    recomputeCityGridMetrics(tiles, economy, state.politics);
    const updatedCitizens = state.citizens.map((c) => {
      if (demolishedBuildingId && c.insideBuildingId === demolishedBuildingId) {
        return { ...c, insideBuildingId: null, path: [], pathIndex: 0 };
      }
      return { ...c };
    });
    const households = reconcileHouseholds(tiles, updatedCitizens, state.households);
    const workplaces = reconcileWorkplaces(tiles, updatedCitizens);
    trafficSystemRuntime.transitLines = [];
    set((s) => ({
      tiles,
      citizens: updatedCitizens,
      households,
      workplaces,
      economy,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(`Demolição concluída (+R$ ${refund.toLocaleString('pt-BR')} reaproveitados).`, 'info');
  },

  buyLand: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;
    if (tile.ownerType === 'public') {
      state.showToast('Este terreno já pertence à Prefeitura.', 'info');
      return;
    }
    if (tile.ownerType === 'occupied' || tile.building || tile.road !== 'none') {
      state.showToast('Não é possível comprar terrenos já ocupados ou edificados.', 'warning');
      return;
    }
    if (tile.conflict) {
      state.showToast('Resolva o conflito fundiário neste terreno antes de adquiri-lo.', 'warning');
      return;
    }
    const price = Math.round(tile.landValue);
    if (!Number.isFinite(price) || price <= 0) {
      state.showToast('Valor imobiliário inválido para aquisição.', 'error');
      return;
    }
    if (state.economy.treasury < price) {
      state.showToast('Saldo insuficiente para adquirir o terreno.', 'error');
      return;
    }
    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.ownerType = 'public';
    target.ownerName = 'Prefeitura Municipal';
    target.concessionActive = false;
    const economy = { ...state.economy, treasury: state.economy.treasury - price };
    recomputeCityGridMetrics(tiles, economy, state.politics);
    set((s) => ({
      tiles,
      economy,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(`Terreno (${x}, ${z}) adquirido por R$ ${price.toLocaleString('pt-BR')}.`, 'success');
  },

  sellLand: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;
    if (tile.ownerType !== 'public') {
      state.showToast('Apenas terrenos pertencentes à Prefeitura podem ser vendidos.', 'warning');
      return;
    }
    if (tile.building || tile.road !== 'none') {
      state.showToast('Apenas terrenos públicos vazios e sem vias podem ser vendidos.', 'warning');
      return;
    }
    if (tile.conflict) {
      state.showToast('Resolva o conflito fundiário antes de vender este lote.', 'warning');
      return;
    }
    if (tile.concessionActive) {
      state.showToast('Este terreno já possui uma concessão ativa.', 'warning');
      return;
    }
    if (tile.terrain === 'waterfront') {
      state.showToast('Áreas de orla são patrimônio público inalienável.', 'warning');
      return;
    }
    const salePrice = Math.round(tile.landValue * 1.15);
    const itbi = Math.round(salePrice * (state.economy.itbiRate / 100));
    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.ownerType = 'private';
    target.ownerName = 'Investidor Privado';
    target.concessionActive = true;
    const economy = {
      ...state.economy,
      treasury: state.economy.treasury + salePrice + itbi,
      settledItbiThisMonth: (state.economy.settledItbiThisMonth || 0) + itbi,
    };
    set((s) => ({
      tiles,
      economy,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(
      `Lote vendido por R$ ${salePrice.toLocaleString('pt-BR')} (+R$ ${itbi.toLocaleString('pt-BR')} ITBI).`,
      'success',
    );
  },

  grantConcession: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;
    if (tile.ownerType !== 'public') {
      state.showToast('Concessões só podem ser outorgadas em terrenos públicos.', 'warning');
      return;
    }
    if (tile.concessionActive) {
      state.showToast('Este lote já possui concessão urbana ativa.', 'warning');
      return;
    }
    if (tile.building || tile.road !== 'none') {
      state.showToast('Selecione um terreno público sem construção ou via para conceder.', 'warning');
      return;
    }
    if (tile.conflict) {
      state.showToast('Resolva o conflito fundiário antes de conceder o terreno.', 'warning');
      return;
    }
    if (tile.terrain === 'waterfront') {
      state.showToast('Áreas de orla não podem ser concedidas à iniciativa privada.', 'warning');
      return;
    }
    const fee = Math.round(tile.landValue * 0.45);
    if (!Number.isFinite(fee) || fee <= 0) return;

    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.concessionActive = true;
    target.ownerType = 'private';
    target.ownerName = 'Concessionária Urbana';
    const economy = { ...state.economy, treasury: state.economy.treasury + fee };
    set((s) => ({
      tiles,
      economy,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(
      `Concessão aprovada! Taxa de R$ ${fee.toLocaleString('pt-BR')} recebida e desenvolvimento privado ativado.`,
      'success',
    );
  },

  togglePlannedDistrict: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile) return;

    const minX = Math.max(0, x - 1);
    const maxX = Math.min(GRID_SIZE - 1, x + 1);
    const minZ = Math.max(0, z - 1);
    const maxZ = Math.min(GRID_SIZE - 1, z + 1);

    let unplannedInSector = 0;
    for (let tz = minZ; tz <= maxZ; tz++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!state.tiles[tz * GRID_SIZE + tx].plannedDistrict) {
          unplannedInSector++;
        }
      }
    }

    if (tile.plannedDistrict || unplannedInSector === 0) {
      state.showToast('Este setor já está declarado como Bairro Planejado.', 'info');
      return;
    }

    const cost = 25000;
    if (state.economy.treasury < cost) {
      state.showToast('Necessário R$ 25.000 para declarar Bairro Planejado.', 'error');
      return;
    }

    const tiles = state.tiles.map((t) => ({ ...t }));
    for (let tz = minZ; tz <= maxZ; tz++) {
      for (let tx = minX; tx <= maxX; tx++) {
        tiles[tz * GRID_SIZE + tx].plannedDistrict = true;
      }
    }
    const economy = { ...state.economy, treasury: state.economy.treasury - cost };
    recomputeCityGridMetrics(tiles, economy, state.politics);
    set((s) => ({
      tiles,
      economy,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast('Setor declarado Bairro Planejado (valorização imobiliária +25%)!', 'success');
  },

  openAuction: (x, z) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!isTileEligibleForPublicSale(tile)) {
      state.showToast(
        'Leilão disponível apenas para terrenos públicos livres, sem concessão, sem conflito e fora da orla.',
        'warning',
      );
      return;
    }
    set({ auctionTile: { x, z } });
  },

  closeAuction: () => set({ auctionTile: null }),

  completeAuction: (x, z, bidAmount, buyerName) => {
    const state = get();
    if (!state.auctionTile || state.auctionTile.x !== x || state.auctionTile.z !== z) {
      state.showToast('Não há leilão ativo para este terreno.', 'error');
      return;
    }

    const tile = getTile(state.tiles, x, z);
    if (!isTileEligibleForPublicSale(tile)) {
      set({ auctionTile: null });
      state.showToast('Este terreno não está mais elegível para leilão.', 'error');
      return;
    }

    const cleanBuyer = typeof buyerName === 'string' ? buyerName.trim().slice(0, 80) : '';
    if (cleanBuyer.length < 2) {
      state.showToast('Informe um comprador válido para concluir o leilão.', 'error');
      return;
    }

    const minBid = Math.round(tile.landValue);
    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      state.showToast(
        `Lance inválido. O lance mínimo é de R$ ${minBid.toLocaleString('pt-BR')}.`,
        'error',
      );
      return;
    }

    const finalBid = Math.round(bidAmount);
    const itbi = Math.round(finalBid * (state.economy.itbiRate / 100));
    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.ownerType = 'private';
    target.ownerName = cleanBuyer;
    target.concessionActive = true;
    const economy = {
      ...state.economy,
      treasury: state.economy.treasury + finalBid + itbi,
      settledItbiThisMonth: (state.economy.settledItbiThisMonth || 0) + itbi,
    };
    const newsItem: NewsArticle = {
      id: `news_auc_${Date.now()}`,
      day: state.day,
      month: state.month,
      year: state.year,
      category: 'Economia',
      headline: `Leilão público arremata lote (${x},${z}) por R$ ${finalBid.toLocaleString('pt-BR')}`,
      summary: `${cleanBuyer} venceu a disputa imobiliária e planeja novos investimentos no setor.`,
    };
    set((s) => ({
      tiles,
      economy,
      auctionTile: null,
      decisionLogs: [
        ...s.decisionLogs,
        {
          day: s.day,
          year: s.year,
          text: `Leilão do lote (${x},${z}) arrematado por ${cleanBuyer} (R$ ${finalBid.toLocaleString('pt-BR')}).`,
        },
      ],
      news: [newsItem, ...s.news].slice(0, 40),
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast(`Leilão concluído! +R$ ${(finalBid + itbi).toLocaleString('pt-BR')}.`, 'success');
  },

  resolveLandConflict: (x, z, method) => {
    const state = get();
    const tile = getTile(state.tiles, x, z);
    if (!tile || !tile.conflict) return;

    const costs = { mediate: 45000, housing: 95000, legal: 15000 };
    const cost = costs[method];
    if (state.economy.treasury < cost) {
      state.showToast('Orçamento insuficiente para esta medida.', 'error');
      return;
    }

    const tiles = state.tiles.map((t) => ({ ...t }));
    const target = tiles[z * GRID_SIZE + x];
    target.conflict = null;

    let popDelta = 0;
    let headline = '';
    if (method === 'housing') {
      target.ownerType = 'public';
      target.ownerName = 'Programa Habitacional';
      target.building = {
        id: `b_hab_${x}_${z}_${Date.now().toString(36)}`,
        type: 'casa_popular',
        level: 1,
        rotation: 0,
        ownerType: 'private',
        ownerName: 'Cooperativa Habitacional',
        powered: target.hasPower,
        watered: target.hasWater,
        connectedRoad: true,
        builtAtDay: state.day,
        condition: 100,
      };
      popDelta = 6;
      headline = 'Prefeitura entrega moradias populares e encerra disputa fundiária com acordo';
    } else if (method === 'mediate') {
      target.ownerType = 'public';
      popDelta = 4;
      headline = 'Mesa de mediação regulariza área ocupada com apoio comunitário';
    } else {
      popDelta = -4;
      headline = 'Disputa de terreno segue para decisão judicial após impasse';
    }

    const economy = { ...state.economy, treasury: state.economy.treasury - cost };
    recomputeCityGridMetrics(tiles, economy, state.politics);
    set((s) => ({
      tiles,
      economy,
      indicators: {
        ...s.indicators,
        popularity: Math.max(5, Math.min(99, s.indicators.popularity + popDelta)),
      },
      news: [
        {
          id: `news_conf_${Date.now()}`,
          day: state.day,
          month: state.month,
          year: state.year,
          category: 'Habitação' as const,
          headline,
          summary: `Caso do lote (${x}, ${z}) recebeu encaminhamento administrativo da Prefeitura.`,
        },
        ...s.news,
      ].slice(0, 40),
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
    state.showToast('Conflito fundiário encaminhado.', 'success');
  },

  updateTaxRates: (partial) =>
    set((s) => ({
      economy: { ...s.economy, ...partial },
    })),

  updateBudgets: (partial) =>
    set((s) => {
      const economy = { ...s.economy, ...partial };
      const tiles = s.tiles.map((t) => ({ ...t }));
      recomputeCityGridMetrics(tiles, economy, s.politics);
      return {
        economy,
        tiles,
        thematicVersion: s.thematicVersion + 1,
      };
    }),

  proposeBill: (billId) => {
    const state = get();
    const bill = state.politics.bills.find((b) => b.id === billId && b.status === 'available');
    if (!bill) return;
    if (state.economy.treasury < bill.cost) {
      state.showToast(`Caixa insuficiente (custo: R$ ${bill.cost.toLocaleString('pt-BR')}).`, 'error');
      return;
    }

    const approved = state.politics.councilSupport >= 48;
    const bills = state.politics.bills.map((b) =>
      b.id === billId ? { ...b, status: approved ? ('approved' as const) : ('rejected' as const) } : b,
    );

    if (!approved) {
      set((s) => ({
        politics: { ...s.politics, bills },
        news: [
          {
            id: `news_bill_rej_${Date.now()}`,
            day: state.day,
            month: state.month,
            year: state.year,
            category: 'Política' as const,
            headline: `Câmara rejeita projeto "${bill.title}" por falta de base aliada`,
            summary: 'Vereadores cobram articulação política antes de novas votações.',
          },
          ...s.news,
        ].slice(0, 40),
      }));
      state.showToast('Projeto rejeitado na Câmara! Negocie apoio político primeiro.', 'error');
      return;
    }

    const economy = { ...state.economy, treasury: state.economy.treasury - bill.cost };
    const politics = {
      ...state.politics,
      bills,
      activePolicies: [...state.politics.activePolicies, bill.id],
    };
    const indicators = {
      ...state.indicators,
      popularity: Math.min(99, state.indicators.popularity + bill.popularityEffect),
      safety: Math.min(100, state.indicators.safety + (bill.safetyEffect || 0)),
      education: Math.min(100, state.indicators.education + (bill.educationEffect || 0)),
      health: Math.min(100, state.indicators.health + (bill.healthEffect || 0)),
      housingIndex: Math.min(100, state.indicators.housingIndex + (bill.housingEffect || 0)),
      economicDevelopment: Math.min(100, state.indicators.economicDevelopment + (bill.economyEffect || 0)),
    };
    const tiles = state.tiles.map((t) => ({ ...t }));
    recomputeCityGridMetrics(tiles, economy, politics);

    set((s) => ({
      economy,
      politics,
      indicators,
      tiles,
      thematicVersion: s.thematicVersion + 1,
      decisionLogs: [
        ...s.decisionLogs,
        { day: s.day, year: s.year, text: `Projeto de Lei aprovado: ${bill.title}.` },
      ],
      news: [
        {
          id: `news_bill_ok_${Date.now()}`,
          day: state.day,
          month: state.month,
          year: state.year,
          category: 'Política' as const,
          headline: `Câmara aprova "${bill.title}" com apoio da maioria`,
          summary: bill.description,
        },
        ...s.news,
      ].slice(0, 40),
    }));
    state.showToast(`Projeto "${bill.title}" aprovado pela Câmara!`, 'success');
  },

  negotiateCouncil: () => {
    const state = get();
    const cost = 55000;
    if (state.economy.treasury < cost) {
      state.showToast('Saldo insuficiente para obras de articulação distrital (R$ 55.000).', 'error');
      return;
    }
    const councilors = state.politics.councilors.map((c) => ({
      ...c,
      support: Math.min(96, c.support + (c.alignment === 'oposicao' ? 4 : 9)),
    }));
    const newSupport = Math.round(councilors.reduce((a, c) => a + c.support, 0) / councilors.length);
    set((s) => ({
      economy: { ...s.economy, treasury: s.economy.treasury - cost },
      politics: { ...s.politics, councilors, councilSupport: newSupport },
    }));
    state.showToast(`Apoio na Câmara Municipal elevado para ${newSupport}%.`, 'success');
  },

  resolveEventChoice: (choiceId) => {
    const state = get();
    const evt = state.activeEvent;
    if (!evt) return;
    const choice = evt.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    if (choice.cost > 0 && state.economy.treasury < choice.cost) {
      state.showToast('Caixa insuficiente para custear esta opção.', 'error');
      return;
    }

    const tiles = state.tiles.map((t) => ({ ...t }));
    if (choice.effects.resolveConflictTile && evt.tileX !== undefined && evt.tileZ !== undefined) {
      const t = getTile(tiles, evt.tileX, evt.tileZ);
      if (t) t.conflict = null;
    }

    const economy = {
      ...state.economy,
      treasury: Math.max(0, state.economy.treasury + (choice.effects.treasury || 0)),
    };
    const indicators = {
      ...state.indicators,
      popularity: Math.max(5, Math.min(99, state.indicators.popularity + (choice.effects.popularity || 0))),
      safety: Math.max(5, Math.min(100, state.indicators.safety + (choice.effects.safety || 0))),
      health: Math.max(5, Math.min(100, state.indicators.health + (choice.effects.health || 0))),
      education: Math.max(5, Math.min(100, state.indicators.education + (choice.effects.education || 0))),
      economicDevelopment: Math.max(
        5,
        Math.min(100, state.indicators.economicDevelopment + (choice.effects.economy || 0)),
      ),
    };
    const politics = {
      ...state.politics,
      councilSupport: Math.max(
        10,
        Math.min(98, state.politics.councilSupport + (choice.effects.councilSupport || 0)),
      ),
    };

    recomputeCityGridMetrics(tiles, economy, politics);

    set((s) => ({
      tiles,
      economy,
      indicators,
      politics,
      activeEvent: null,
      decisionLogs: [
        ...s.decisionLogs,
        { day: s.day, year: s.year, text: `${evt.title}: ${choice.label}.` },
      ],
      news: [
        {
          id: `news_evt_${Date.now()}`,
          day: s.day,
          month: s.month,
          year: s.year,
          category: (evt.type === 'land_conflict' ? 'Habitação' : evt.type === 'political' ? 'Política' : 'Cidade') as NewsArticle['category'],
          headline: `${evt.title} — Prefeitura decide: ${choice.label}`,
          summary: choice.description,
        },
        ...s.news,
      ].slice(0, 40),
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
    }));
  },

  resignMayor: () => {
    const s = get();
    const report = buildEndGameReport('resigned', s.indicators, s.economy, s.politics, s.year, s.decisionLogs);
    set({ endGameReport: report, speed: 0 });
  },

  startNewCity: (cityName = 'Nova Aurora', mayorName = 'Prefeito(a) Silva') => {
    clearCityLocal();
    simClock.reset();
    const fresh = buildFreshCityState(cityName, mayorName);
    set((s) => ({
      ...fresh,
      selectedTileCoords: null,
      hoveredTileCoords: null,
      pendingDemolition: null,
      buildUndoStack: [],
      selectedCitizenId: null,
      followedCitizenId: null,
      activeTool: 'select',
      selectedBuildType: null,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
      cameraCommand: { type: 'reset', nonce: Date.now() },
    }));
  },

  exportSnapshot: () => {
    const s = get();
    return {
      version: 3,
      cityName: s.cityName,
      day: s.day,
      month: s.month,
      year: s.year,
      hourOfDay: s.hourOfDay,
      dayAccumulator: s.dayAccumulator,
      speed: s.speed,
      timeConfig: s.timeConfig,
      developmentLevel: s.developmentLevel,
      hadDebtBefore: s.hadDebtBefore,
      tiles: s.tiles,
      citizens: s.citizens,
      economy: s.economy,
      indicators: s.indicators,
      politics: s.politics,
      news: s.news,
      achievements: s.achievements,
      decisionLogs: s.decisionLogs,
      activeEvent: s.activeEvent,
      endGameReport: s.endGameReport,
      auctionTile: s.auctionTile,
    };
  },

  importSnapshot: (snapshot) => {
    const hydrated = hydrateFromSnapshot(snapshot);
    if (!hydrated) {
      get().showToast('Salvamento inválido ou corrompido. Restauração cancelada.', 'error');
      return false;
    }
    simClock.reset();
    set((s) => ({
      ...hydrated,
      selectedTileCoords: null,
      hoveredTileCoords: null,
      pendingDemolition: null,
      buildUndoStack: [],
      selectedCitizenId: null,
      followedCitizenId: null,
      gridVersion: s.gridVersion + 1,
      thematicVersion: s.thematicVersion + 1,
      cameraCommand: { type: 'reset', nonce: Date.now() },
    }));
    saveCityLocal(get().exportSnapshot());
    return true;
  },
}));
