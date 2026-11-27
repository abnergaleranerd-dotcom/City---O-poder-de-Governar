export type BuildingCategory =
  | 'infra'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'public'
  | 'leisure';

export type BuildingTypeId =
  | 'rua'
  | 'avenida'
  | 'rede_energia'
  | 'saneamento'
  | 'casa_popular'
  | 'casa_media'
  | 'condominio'
  | 'predio_residencial'
  | 'padaria'
  | 'mercado'
  | 'restaurante'
  | 'loja'
  | 'shopping'
  | 'fabrica_pequena'
  | 'galpao'
  | 'centro_logistico'
  | 'industria'
  | 'prefeitura'
  | 'escola'
  | 'hospital'
  | 'posto_saude'
  | 'delegacia'
  | 'bombeiros'
  | 'centro_profissionalizante'
  | 'praca'
  | 'parque'
  | 'estadio'
  | 'centro_esportivo';

export interface BuildingDefinition {
  id: BuildingTypeId;
  name: string;
  category: BuildingCategory;
  cost: number;
  monthlyMaintenance: number;
  monthlyRevenue: number;
  housingCapacity: number;
  jobsProvided: number;
  powerProvided: number;
  powerDemand: number;
  waterProvided: number;
  waterDemand: number;
  pollution: number;
  safetyBonus: number;
  healthBonus: number;
  educationBonus: number;
  happinessBonus: number;
  landValueBoost: number;
  unlockLevel: number;
  radius: number;
  isRoad?: boolean;
  isPublicAsset?: boolean;
  description: string;
}

export type TerrainType = 'grass' | 'fertile' | 'waterfront' | 'hill';

export type TileOwnerType = 'public' | 'available' | 'private' | 'occupied';

export type ZoningType = 'none' | 'residential' | 'commercial' | 'industrial' | 'mixed' | 'civic' | 'green';

export type BuildingLifecycleStage =
  | 'planned'
  | 'construction_site'
  | 'under_construction'
  | 'operational'
  | 'remodeling'
  | 'abandoned';

export interface PlacedBuilding {
  id: string;
  type: BuildingTypeId;
  level: 1 | 2 | 3;
  rotation: number; // 0, 1, 2, 3 (90 deg steps)
  ownerType: 'public' | 'private';
  ownerName: string;
  powered: boolean;
  watered: boolean;
  connectedRoad: boolean;
  builtAtDay: number;
  condition: number; // 0-100
  constructionStage?: BuildingLifecycleStage;
  constructionProgress?: number; // 0-100
  occupantIds?: string[];
  entranceTile?: { x: number; z: number };
  variantSeed?: number;
  zone?: ZoningType;
}

export interface TileConflict {
  id: string;
  title: string;
  groupName: string;
  severity: number; // 1-3
  daysActive: number;
  type: 'occupation' | 'dispute' | 'protest';
}

export interface TileData {
  x: number;
  z: number;
  terrain: TerrainType;
  ownerType: TileOwnerType;
  ownerName: string;
  landValue: number;
  road: 'none' | 'rua' | 'avenida';
  hasPower: boolean;
  hasWater: boolean;
  plannedDistrict: boolean;
  concessionActive: boolean;
  building: PlacedBuilding | null;
  crimeRisk: number; // 0-100
  pollution: number; // 0-100
  healthCoverage: number; // 0-100
  educationCoverage: number; // 0-100
  safetyCoverage: number; // 0-100
  leisureCoverage: number; // 0-100
  trafficLoad: number; // 0-100
  conflict: TileConflict | null;
  zone?: ZoningType;
  busStop?: boolean;
}

export type CitizenState =
  | 'idle'
  | 'commuting'
  | 'working'
  | 'studying'
  | 'shopping'
  | 'seeking_job'
  | 'seeking_home'
  | 'protesting';

export type CitizenBehaviorState =
  | 'Sleeping'
  | 'AtHome'
  | 'PreparingForWork'
  | 'WalkingToDestination'
  | 'WaitingForTransport'
  | 'RidingTransport'
  | 'Driving'
  | 'CrossingStreet'
  | 'Working'
  | 'Studying'
  | 'Shopping'
  | 'Eating'
  | 'Exercising'
  | 'Socializing'
  | 'SeekingJob'
  | 'SeekingHome'
  | 'ReceivingMedicalCare'
  | 'Protesting'
  | 'ReturningHome'
  | 'WaitingForPath';

export type CitizenPersonality =
  | 'sociavel'
  | 'reservado'
  | 'organizado'
  | 'aventureiro'
  | 'trabalhador'
  | 'tranquilo'
  | 'ambicioso'
  | 'comunitario';

export type CitizenScheduleProfile =
  | 'crianca'
  | 'estudante'
  | 'universitario'
  | 'clt'
  | 'comerciante'
  | 'empresario'
  | 'autonomo'
  | 'desempregado'
  | 'aposentado'
  | 'saude'
  | 'servidor';

export type CitizenAnimState =
  | 'Idle'
  | 'WalkSlow'
  | 'Walk'
  | 'WalkFast'
  | 'Run'
  | 'Sit'
  | 'StandUp'
  | 'Talk'
  | 'Wait'
  | 'Shop'
  | 'Work';

export type TransportMode = 'walk' | 'bus' | 'car';

export interface PathPoint {
  x: number;
  z: number;
}

export interface CitizenAgent {
  id: string;
  name: string;
  age: number;
  profession: string;
  education: 'Básico' | 'Médio' | 'Superior';
  income: number;
  employedAtId: string | null;
  employedAtName: string | null;
  homeTileKey: string | null;
  health: number; // 0-100
  happiness: number; // 0-100
  needs: {
    housing: number; // 0-100 (100 = satisfied)
    job: number;
    health: number;
    education: number;
    safety: number;
    energy?: number;
    hunger?: number;
    leisure?: number;
    transport?: number;
  };
  state: CitizenState;
  opinion: number; // 0-100 approval of mayor
  thought: string;
  // 3D spatial movement state (tile coordinates)
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  shirtColor: number;
  // Living World & Intelligent NPC extensions (optional for legacy save compatibility)
  birthDay?: number;
  birthYear?: number;
  householdId?: string | null;
  residenceBuildingId?: string | null;
  balance?: number;
  monthlyExpenses?: number;
  jobSatisfaction?: number;
  personality?: CitizenPersonality;
  scheduleProfile?: CitizenScheduleProfile;
  staggerMinutes?: number;
  behaviorState?: CitizenBehaviorState;
  intent?: string;
  activity?: string;
  movementState?: 'stopped' | 'walking' | 'jogging' | 'riding' | 'driving' | 'waiting';
  animState?: CitizenAnimState;
  transportMode?: TransportMode;
  insideBuildingId?: string | null;
  targetBuildingId?: string | null;
  activityUntilHour?: number;
  activityMinDurationHours?: number;
  yaw?: number;
  currentSpeed?: number;
  path?: PathPoint[];
  pathIndex?: number;
  blockedTicks?: number;
  unreachableCount?: number;
  decisionCooldown?: number;
  talkingWithId?: string | null;
  history?: string[];
  // Sprint 1 — Continuous Collision, Trail & Interaction Spot fields
  lastValidX?: number;
  lastValidZ?: number;
  lastCollisionAt?: number;
  blockedReason?: string;
  trailHistory?: PathPoint[];
  occupiedSpotId?: string | null;
  sittingYaw?: number;
  appearanceSeed?: number;
  // Quality & Natural Life — Render interpolation & explicit bench FSM phase
  prevX?: number;
  prevZ?: number;
  prevYaw?: number;
  benchPhase?: 'approaching' | 'turning' | 'sitting' | 'standing_up' | null;
  benchTimer?: number;
  unmetDemandCategory?: 'health' | 'education' | 'food' | 'work' | 'housing' | 'leisure' | null;
}

export interface Household {
  id: string;
  surname: string;
  residenceBuildingId: string | null;
  homeTileKey: string | null;
  memberIds: string[];
  monthlyRent: number;
  happiness: number;
}

export interface Workplace {
  buildingId: string;
  tileKey: string;
  type: BuildingTypeId;
  name: string;
  capacity: number;
  workerIds: string[];
  requiredEducation: 'Básico' | 'Médio' | 'Superior';
  averageWage: number;
  operational: boolean;
}

export type SignalPhase = 'NS_GREEN' | 'NS_YELLOW' | 'EW_GREEN' | 'EW_YELLOW' | 'PED_CROSS';

export interface TrafficSignalNode {
  tileKey: string;
  x: number;
  z: number;
  phase: SignalPhase;
  timer: number;
}

export type VehicleRole = 'commuter' | 'cargo' | 'bus' | 'police' | 'ambulance' | 'fire';

export interface RoadVehicleSim {
  id: string;
  role: VehicleRole;
  color: number;
  x: number;
  z: number;
  yaw: number;
  speed: number; // world/tile units per second
  maxSpeed: number;
  originTileKey: string;
  destTileKey: string;
  path: PathPoint[];
  pathIndex: number;
  waitingAtSignal: boolean;
  waitingForCrosswalk: boolean;
  braking: boolean;
  stoppedTime: number;
  lineId?: string;
  passengerIds?: string[];
  passengerCapacity?: number;
  incidentTileKey?: string | null;
  returningToBase?: boolean;
  driverCitizenId?: string | null;
  prevX?: number;
  prevZ?: number;
  prevYaw?: number;
}

export interface TransitLine {
  id: string;
  name: string;
  color: number;
  stopTileKeys: string[];
  waitingByStop: Record<string, string[]>;
  activeBusIds: string[];
}

export interface EmergencyDispatch {
  id: string;
  kind: 'ambulance' | 'fire' | 'police';
  stationTileKey: string;
  targetTileKey: string;
  vehicleId: string;
  status: 'en_route' | 'on_scene' | 'returning';
  timer: number;
  description: string;
}

export type SpeedValue = 0 | 0.5 | 1 | 2 | 4 | 8;

export type TimePreset = 'relaxed' | 'balanced' | 'strategic';

export interface GameTimeConfig {
  secondsPerDay: number; // 60..300 (default 180)
  preset: TimePreset;
  npcSpeedMultiplier: number; // 0.5..2.0
  trafficIntensity: number; // 0.2..1.5
  pedestrianDensity: number; // 0.2..1.5
  vegetationDensity: number; // 0.2..1.5
  cameraSpeed: number; // 0.4..2.0
  ambientAudioEnabled: boolean;
  ambientVolume: number; // 0..1
  debugOverlay: boolean;
  creativeInstantBuild: boolean;
}

export interface CitySimulationStats {
  fps: number;
  simStepMs: number;
  activeNpcs: number;
  insideBuildingNpcs: number;
  blockedNpcs: number;
  activeVehicles: number;
  busPassengers: number;
  pedestrianNodes: number;
  roadNodes: number;
  cachedRoutes: number;
  collisionHits?: number;
  worldObjects?: number;
}

export type ThematicMapMode =
  | 'normal'
  | 'landValue'
  | 'safety'
  | 'traffic'
  | 'pollution'
  | 'education'
  | 'health'
  | 'employment'
  | 'happiness'
  | 'coverage';

export type InteractionTool =
  | 'select'
  | 'build'
  | 'move'
  | 'demolish'
  | 'buy_land'
  | 'sell_land';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type CameraMode = 'strategic' | 'drone' | 'follow';

export interface EconomyState {
  treasury: number;
  debt: number;
  iptuRate: number; // 0.5% to 4.0%
  issRate: number; // 1.0% to 6.0%
  itbiRate: number; // 1.0% to 5.0%
  budgetHealth: number; // 0.4 to 1.8 multiplier
  budgetEducation: number;
  budgetSafety: number;
  budgetTransit: number;
  budgetSocial: number;
  lastMonthlyRevenue: number;
  lastMonthlyExpense: number;
  lastMonthlyNet: number;
  settledItbiThisMonth?: number;
  revenueBreakdown: {
    iptu: number;
    iss: number;
    itbi: number;
    transfers: number;
    servicesAndConcessions: number;
  };
  expenseBreakdown: {
    payroll: number;
    health: number;
    education: number;
    safety: number;
    transitAndInfra: number;
    socialPrograms: number;
    debtInterest: number;
  };
}

export interface CityIndicators {
  population: number;
  jobsTotal: number;
  employed: number;
  unemploymentRate: number;
  housingCapacity: number;
  housingDeficit: number;
  popularity: number;
  safety: number;
  health: number;
  education: number;
  housingIndex: number;
  mobility: number;
  qualityOfLife: number;
  pollution: number;
  economicDevelopment: number;
  inequality: number;
  unmetNeeds?: {
    health: number;
    education: number;
    food: number;
    work: number;
    housing: number;
    leisure: number;
  };
}

export interface Councilor {
  id: string;
  name: string;
  party: string;
  alignment: 'base' | 'centro' | 'oposicao';
  support: number; // 0-100
}

export interface CityBill {
  id: string;
  title: string;
  description: string;
  cost: number;
  monthlyCost: number;
  popularityEffect: number;
  safetyEffect?: number;
  educationEffect?: number;
  healthEffect?: number;
  housingEffect?: number;
  economyEffect?: number;
  status: 'available' | 'approved' | 'rejected';
}

export interface ImpeachmentState {
  active: boolean;
  stage: 0 | 1 | 2 | 3 | 4; // 0=none, 1=denuncia, 2=investigacao, 3=defesa, 4=votacao
  reason: string;
  daysInStage: number;
  supportNeededToSurvive: number;
}

export interface PoliticsState {
  mayorName: string;
  viceMayorName: string;
  councilSupport: number; // 0-100
  councilors: Councilor[];
  bills: CityBill[];
  impeachment: ImpeachmentState;
  nextElectionYear: number;
  termsServed: number;
  activePolicies: string[];
}

export interface NewsArticle {
  id: string;
  day: number;
  month: number;
  year: number;
  category: 'Economia' | 'Política' | 'Cidade' | 'Segurança' | 'Habitação' | 'Social';
  headline: string;
  summary: string;
}

export interface GameEventChoice {
  id: string;
  label: string;
  cost: number;
  description: string;
  effects: {
    popularity?: number;
    treasury?: number;
    safety?: number;
    health?: number;
    education?: number;
    pollution?: number;
    councilSupport?: number;
    economy?: number;
    resolveConflictTile?: boolean;
  };
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  type: 'positive' | 'negative' | 'political' | 'land_conflict';
  tileX?: number;
  tileZ?: number;
  choices: GameEventChoice[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAtYear?: number;
}

export interface DecisionLogEntry {
  day: number;
  year: number;
  text: string;
}

export type EndGameOutcome = 'election_loss' | 'impeached' | 'resigned' | 'collapsed';

export interface EndGameReport {
  outcome: EndGameOutcome;
  title: string;
  reason: string;
  yearsServed: number;
  finalPopulation: number;
  finalTreasury: number;
  finalDebt: number;
  finalPopularity: number;
  qualityOfLife: number;
  economicDevelopment: number;
  legacySummary: string;
  highlights: string[];
}

export const GRID_SIZE = 24;
export const TILE_WORLD_SIZE = 2;

export const DEVELOPMENT_LEVELS = [
  { level: 1, name: 'Vila', minPop: 0 },
  { level: 2, name: 'Município', minPop: 300 },
  { level: 3, name: 'Cidade Pequena', minPop: 750 },
  { level: 4, name: 'Cidade Média', minPop: 1600 },
  { level: 5, name: 'Metrópole', minPop: 3200 },
  { level: 6, name: 'Capital Econômica', minPop: 6000 },
] as const;

export const BUILDING_CATALOG: Record<BuildingTypeId, BuildingDefinition> = {
  rua: {
    id: 'rua',
    name: 'Rua Pavimentada',
    category: 'infra',
    cost: 4500,
    monthlyMaintenance: 180,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 0,
    powerProvided: 0,
    powerDemand: 0,
    waterProvided: 0,
    waterDemand: 0,
    pollution: 1,
    safetyBonus: 0,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 1,
    landValueBoost: 4500,
    unlockLevel: 1,
    radius: 1,
    isRoad: true,
    isPublicAsset: true,
    description: 'Via urbana básica para circulação de cidadãos, acesso a lotes e valorização local.',
  },
  avenida: {
    id: 'avenida',
    name: 'Avenida Dupla',
    category: 'infra',
    cost: 12000,
    monthlyMaintenance: 520,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 0,
    powerProvided: 0,
    powerDemand: 2,
    waterProvided: 0,
    waterDemand: 0,
    pollution: 2,
    safetyBonus: 4,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 3,
    landValueBoost: 14000,
    unlockLevel: 1,
    radius: 2,
    isRoad: true,
    isPublicAsset: true,
    description: 'Eixo viário de alta capacidade com canteiro central e iluminação pública.',
  },
  rede_energia: {
    id: 'rede_energia',
    name: 'Subestação Elétrica',
    category: 'infra',
    cost: 75000,
    monthlyMaintenance: 4200,
    monthlyRevenue: 2400,
    housingCapacity: 0,
    jobsProvided: 12,
    powerProvided: 140,
    powerDemand: 0,
    waterProvided: 0,
    waterDemand: 4,
    pollution: 4,
    safetyBonus: 2,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 0,
    landValueBoost: -3000,
    unlockLevel: 1,
    radius: 8,
    isPublicAsset: true,
    description: 'Fornece energia elétrica estável para o funcionamento de casas, comércios e fábricas.',
  },
  saneamento: {
    id: 'saneamento',
    name: 'Estação de Saneamento',
    category: 'infra',
    cost: 82000,
    monthlyMaintenance: 4600,
    monthlyRevenue: 2600,
    housingCapacity: 0,
    jobsProvided: 14,
    powerProvided: 0,
    powerDemand: 10,
    waterProvided: 150,
    waterDemand: 0,
    pollution: -6,
    safetyBonus: 0,
    healthBonus: 8,
    educationBonus: 0,
    happinessBonus: 4,
    landValueBoost: 3000,
    unlockLevel: 1,
    radius: 8,
    isPublicAsset: true,
    description: 'Tratamento de água e esgoto que reduz poluição e previne doenças urbanas.',
  },
  casa_popular: {
    id: 'casa_popular',
    name: 'Casa Popular',
    category: 'residential',
    cost: 32000,
    monthlyMaintenance: 250,
    monthlyRevenue: 1100,
    housingCapacity: 32,
    jobsProvided: 0,
    powerProvided: 0,
    powerDemand: 4,
    waterProvided: 0,
    waterDemand: 5,
    pollution: 1,
    safetyBonus: 0,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 2,
    landValueBoost: 2000,
    unlockLevel: 1,
    radius: 1,
    description: 'Moradia acessível para famílias trabalhadoras, reduzindo déficit habitacional.',
  },
  casa_media: {
    id: 'casa_media',
    name: 'Casa de Médio Padrão',
    category: 'residential',
    cost: 68000,
    monthlyMaintenance: 400,
    monthlyRevenue: 2900,
    housingCapacity: 48,
    jobsProvided: 0,
    powerProvided: 0,
    powerDemand: 7,
    waterProvided: 0,
    waterDemand: 8,
    pollution: 1,
    safetyBonus: 1,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 4,
    landValueBoost: 8000,
    unlockLevel: 1,
    radius: 2,
    description: 'Residência familiar com boa arrecadação de IPTU e valorização de vizinhança.',
  },
  condominio: {
    id: 'condominio',
    name: 'Condomínio Residencial',
    category: 'residential',
    cost: 165000,
    monthlyMaintenance: 900,
    monthlyRevenue: 7800,
    housingCapacity: 120,
    jobsProvided: 8,
    powerProvided: 0,
    powerDemand: 16,
    waterProvided: 0,
    waterDemand: 18,
    pollution: 2,
    safetyBonus: 4,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 6,
    landValueBoost: 22000,
    unlockLevel: 2,
    radius: 3,
    description: 'Conjunto habitacional planejado com área comum e alta densidade residencial.',
  },
  predio_residencial: {
    id: 'predio_residencial',
    name: 'Prédio Residencial',
    category: 'residential',
    cost: 290000,
    monthlyMaintenance: 1400,
    monthlyRevenue: 15500,
    housingCapacity: 240,
    jobsProvided: 12,
    powerProvided: 0,
    powerDemand: 28,
    waterProvided: 0,
    waterDemand: 30,
    pollution: 3,
    safetyBonus: 2,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 5,
    landValueBoost: 30000,
    unlockLevel: 3,
    radius: 3,
    description: 'Edifício vertical de apartamentos para grandes centros urbanos.',
  },
  padaria: {
    id: 'padaria',
    name: 'Padaria do Bairro',
    category: 'commercial',
    cost: 48000,
    monthlyMaintenance: 350,
    monthlyRevenue: 3400,
    housingCapacity: 0,
    jobsProvided: 18,
    powerProvided: 0,
    powerDemand: 6,
    waterProvided: 0,
    waterDemand: 6,
    pollution: 1,
    safetyBonus: 1,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 5,
    landValueBoost: 7000,
    unlockLevel: 1,
    radius: 3,
    description: 'Comércio local essencial que gera empregos iniciais e bem-estar nos bairros.',
  },
  mercado: {
    id: 'mercado',
    name: 'Mercado Municipal',
    category: 'commercial',
    cost: 95000,
    monthlyMaintenance: 600,
    monthlyRevenue: 6900,
    housingCapacity: 0,
    jobsProvided: 36,
    powerProvided: 0,
    powerDemand: 10,
    waterProvided: 0,
    waterDemand: 9,
    pollution: 2,
    safetyBonus: 1,
    healthBonus: 1,
    educationBonus: 0,
    happinessBonus: 7,
    landValueBoost: 13000,
    unlockLevel: 1,
    radius: 4,
    description: 'Abastece os bairros com alimentos e fortalece o ISS comercial.',
  },
  restaurante: {
    id: 'restaurante',
    name: 'Restaurante',
    category: 'commercial',
    cost: 115000,
    monthlyMaintenance: 750,
    monthlyRevenue: 8800,
    housingCapacity: 0,
    jobsProvided: 42,
    powerProvided: 0,
    powerDemand: 11,
    waterProvided: 0,
    waterDemand: 10,
    pollution: 2,
    safetyBonus: 2,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 10,
    landValueBoost: 16000,
    unlockLevel: 2,
    radius: 4,
    description: 'Gastronomia e lazer noturno que impulsionam turismo e receita de ISS.',
  },
  loja: {
    id: 'loja',
    name: 'Galeria de Lojas',
    category: 'commercial',
    cost: 145000,
    monthlyMaintenance: 850,
    monthlyRevenue: 11500,
    housingCapacity: 0,
    jobsProvided: 55,
    powerProvided: 0,
    powerDemand: 14,
    waterProvided: 0,
    waterDemand: 8,
    pollution: 2,
    safetyBonus: 2,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 8,
    landValueBoost: 20000,
    unlockLevel: 2,
    radius: 4,
    description: 'Varejo diversificado com forte criação de empregos no setor de serviços.',
  },
  shopping: {
    id: 'shopping',
    name: 'Shopping Center',
    category: 'commercial',
    cost: 460000,
    monthlyMaintenance: 2400,
    monthlyRevenue: 36000,
    housingCapacity: 0,
    jobsProvided: 180,
    powerProvided: 0,
    powerDemand: 42,
    waterProvided: 0,
    waterDemand: 32,
    pollution: 5,
    safetyBonus: 5,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 18,
    landValueBoost: 55000,
    unlockLevel: 4,
    radius: 6,
    description: 'Grande polo comercial e de entretenimento que transforma a economia da região.',
  },
  fabrica_pequena: {
    id: 'fabrica_pequena',
    name: 'Pequena Fábrica',
    category: 'industrial',
    cost: 88000,
    monthlyMaintenance: 600,
    monthlyRevenue: 7600,
    housingCapacity: 0,
    jobsProvided: 52,
    powerProvided: 0,
    powerDemand: 14,
    waterProvided: 0,
    waterDemand: 10,
    pollution: 14,
    safetyBonus: 0,
    healthBonus: -2,
    educationBonus: 0,
    happinessBonus: -2,
    landValueBoost: -8000,
    unlockLevel: 1,
    radius: 4,
    description: 'Manufatura leve com geração expressiva de empregos operacionais.',
  },
  galpao: {
    id: 'galpao',
    name: 'Galpão Industrial',
    category: 'industrial',
    cost: 140000,
    monthlyMaintenance: 900,
    monthlyRevenue: 12400,
    housingCapacity: 0,
    jobsProvided: 85,
    powerProvided: 0,
    powerDemand: 20,
    waterProvided: 0,
    waterDemand: 12,
    pollution: 18,
    safetyBonus: 0,
    healthBonus: -2,
    educationBonus: 0,
    happinessBonus: -3,
    landValueBoost: -10000,
    unlockLevel: 2,
    radius: 4,
    description: 'Estrutura modular para produção e estocagem industrial.',
  },
  centro_logistico: {
    id: 'centro_logistico',
    name: 'Centro Logístico',
    category: 'industrial',
    cost: 240000,
    monthlyMaintenance: 1400,
    monthlyRevenue: 21500,
    housingCapacity: 0,
    jobsProvided: 135,
    powerProvided: 0,
    powerDemand: 26,
    waterProvided: 0,
    waterDemand: 14,
    pollution: 16,
    safetyBonus: 1,
    healthBonus: -1,
    educationBonus: 0,
    happinessBonus: -1,
    landValueBoost: -5000,
    unlockLevel: 3,
    radius: 5,
    description: 'Hub de distribuição regional conectado às principais avenidas da cidade.',
  },
  industria: {
    id: 'industria',
    name: 'Complexo Industrial',
    category: 'industrial',
    cost: 420000,
    monthlyMaintenance: 2500,
    monthlyRevenue: 41000,
    housingCapacity: 0,
    jobsProvided: 250,
    powerProvided: 0,
    powerDemand: 48,
    waterProvided: 0,
    waterDemand: 36,
    pollution: 36,
    safetyBonus: 0,
    healthBonus: -5,
    educationBonus: 0,
    happinessBonus: -6,
    landValueBoost: -24000,
    unlockLevel: 4,
    radius: 6,
    description: 'Indústria pesada de alto rendimento fiscal e centenas de vagas, exigindo controle ambiental.',
  },
  prefeitura: {
    id: 'prefeitura',
    name: 'Prefeitura Municipal',
    category: 'public',
    cost: 250000,
    monthlyMaintenance: 6500,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 45,
    powerProvided: 0,
    powerDemand: 15,
    waterProvided: 0,
    waterDemand: 12,
    pollution: 0,
    safetyBonus: 8,
    healthBonus: 2,
    educationBonus: 2,
    happinessBonus: 6,
    landValueBoost: 35000,
    unlockLevel: 1,
    radius: 7,
    isPublicAsset: true,
    description: 'Sede do Poder Executivo municipal. Centraliza a administração pública e serviços civis.',
  },
  posto_saude: {
    id: 'posto_saude',
    name: 'Posto de Saúde (UBS)',
    category: 'public',
    cost: 95000,
    monthlyMaintenance: 5500,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 24,
    powerProvided: 0,
    powerDemand: 8,
    waterProvided: 0,
    waterDemand: 10,
    pollution: 0,
    safetyBonus: 0,
    healthBonus: 28,
    educationBonus: 2,
    happinessBonus: 8,
    landValueBoost: 12000,
    unlockLevel: 1,
    radius: 6,
    isPublicAsset: true,
    description: 'Atendimento médico primário e prevenção sanitária para os moradores da região.',
  },
  escola: {
    id: 'escola',
    name: 'Escola Municipal',
    category: 'public',
    cost: 125000,
    monthlyMaintenance: 7200,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 34,
    powerProvided: 0,
    powerDemand: 10,
    waterProvided: 0,
    waterDemand: 12,
    pollution: 0,
    safetyBonus: 4,
    healthBonus: 2,
    educationBonus: 36,
    happinessBonus: 10,
    landValueBoost: 18000,
    unlockLevel: 1,
    radius: 7,
    isPublicAsset: true,
    description: 'Eleva a escolaridade, amplia oportunidades profissionais e valoriza o bairro.',
  },
  delegacia: {
    id: 'delegacia',
    name: 'Delegacia & Guarda',
    category: 'public',
    cost: 135000,
    monthlyMaintenance: 8400,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 38,
    powerProvided: 0,
    powerDemand: 10,
    waterProvided: 0,
    waterDemand: 8,
    pollution: 0,
    safetyBonus: 42,
    healthBonus: 0,
    educationBonus: 0,
    happinessBonus: 6,
    landValueBoost: 16000,
    unlockLevel: 1,
    radius: 7,
    isPublicAsset: true,
    description: 'Amplia a segurança pública, reduz ocorrências e protege o comércio local.',
  },
  bombeiros: {
    id: 'bombeiros',
    name: 'Corpo de Bombeiros',
    category: 'public',
    cost: 140000,
    monthlyMaintenance: 7800,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 32,
    powerProvided: 0,
    powerDemand: 9,
    waterProvided: 0,
    waterDemand: 14,
    pollution: 0,
    safetyBonus: 24,
    healthBonus: 8,
    educationBonus: 0,
    happinessBonus: 6,
    landValueBoost: 14000,
    unlockLevel: 2,
    radius: 8,
    isPublicAsset: true,
    description: 'Resposta rápida a incêndios, enchentes e emergências civis.',
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital Geral',
    category: 'public',
    cost: 340000,
    monthlyMaintenance: 18500,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 120,
    powerProvided: 0,
    powerDemand: 32,
    waterProvided: 0,
    waterDemand: 34,
    pollution: 1,
    safetyBonus: 2,
    healthBonus: 65,
    educationBonus: 6,
    happinessBonus: 16,
    landValueBoost: 28000,
    unlockLevel: 3,
    radius: 10,
    isPublicAsset: true,
    description: 'Alta complexidade hospitalar com ampla cobertura regional e redução de epidemias.',
  },
  centro_profissionalizante: {
    id: 'centro_profissionalizante',
    name: 'Centro Profissionalizante',
    category: 'public',
    cost: 210000,
    monthlyMaintenance: 11000,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 48,
    powerProvided: 0,
    powerDemand: 16,
    waterProvided: 0,
    waterDemand: 14,
    pollution: 0,
    safetyBonus: 6,
    healthBonus: 0,
    educationBonus: 48,
    happinessBonus: 12,
    landValueBoost: 24000,
    unlockLevel: 3,
    radius: 9,
    isPublicAsset: true,
    description: 'Qualifica mão de obra para indústrias e serviços, elevando renda e emprego.',
  },
  praca: {
    id: 'praca',
    name: 'Praça Arborizada',
    category: 'leisure',
    cost: 38000,
    monthlyMaintenance: 1100,
    monthlyRevenue: 0,
    housingCapacity: 0,
    jobsProvided: 4,
    powerProvided: 0,
    powerDemand: 2,
    waterProvided: 0,
    waterDemand: 3,
    pollution: -6,
    safetyBonus: 6,
    healthBonus: 4,
    educationBonus: 0,
    happinessBonus: 14,
    landValueBoost: 15000,
    unlockLevel: 1,
    radius: 4,
    isPublicAsset: true,
    description: 'Espaço de convivência comunitária que melhora o clima e valoriza os lotes vizinhos.',
  },
  parque: {
    id: 'parque',
    name: 'Parque Ecológico',
    category: 'leisure',
    cost: 110000,
    monthlyMaintenance: 3200,
    monthlyRevenue: 800,
    housingCapacity: 0,
    jobsProvided: 12,
    powerProvided: 0,
    powerDemand: 3,
    waterProvided: 0,
    waterDemand: 6,
    pollution: -16,
    safetyBonus: 8,
    healthBonus: 10,
    educationBonus: 2,
    happinessBonus: 24,
    landValueBoost: 28000,
    unlockLevel: 2,
    radius: 6,
    isPublicAsset: true,
    description: 'Grande área verde que combate a poluição urbana e eleva a qualidade de vida.',
  },
  centro_esportivo: {
    id: 'centro_esportivo',
    name: 'Centro Esportivo',
    category: 'leisure',
    cost: 165000,
    monthlyMaintenance: 5400,
    monthlyRevenue: 1500,
    housingCapacity: 0,
    jobsProvided: 22,
    powerProvided: 0,
    powerDemand: 10,
    waterProvided: 0,
    waterDemand: 10,
    pollution: -4,
    safetyBonus: 12,
    healthBonus: 12,
    educationBonus: 4,
    happinessBonus: 22,
    landValueBoost: 24000,
    unlockLevel: 3,
    radius: 7,
    isPublicAsset: true,
    description: 'Quadras e ginásio comunitário que promovem saúde, prevenção social e lazer.',
  },
  estadio: {
    id: 'estadio',
    name: 'Estádio Municipal',
    category: 'leisure',
    cost: 490000,
    monthlyMaintenance: 14000,
    monthlyRevenue: 16000,
    housingCapacity: 0,
    jobsProvided: 85,
    powerProvided: 0,
    powerDemand: 36,
    waterProvided: 0,
    waterDemand: 24,
    pollution: 2,
    safetyBonus: 8,
    healthBonus: 4,
    educationBonus: 0,
    happinessBonus: 36,
    landValueBoost: 48000,
    unlockLevel: 5,
    radius: 10,
    isPublicAsset: true,
    description: 'Arena de grande porte para eventos esportivos, turismo e forte impulso na popularidade.',
  },
};

export interface CitySaveDocument {
  ownerId: string;
  cityName: string;
  mayorName: string;
  population: number;
  treasury: number;
  popularity: number;
  day: number;
  month: number;
  year: number;
  developmentLevel: number;
  stateSnapshot: Record<string, unknown>;
}
