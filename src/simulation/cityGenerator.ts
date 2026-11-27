import {
  Achievement,
  BUILDING_CATALOG,
  BuildingTypeId,
  CitizenAgent,
  CityBill,
  CityIndicators,
  Councilor,
  EconomyState,
  GRID_SIZE,
  NewsArticle,
  PoliticsState,
  TerrainType,
  TileData,
} from '../types/game';
import { computeBuildingAccess, computeFacingRoadRotation } from './navigation/obstacleSystem';
import { assignPersonality, assignScheduleProfile } from './agents/citizenSchedule';
import { inferBuildingZone } from './urban/zoningEngine';

const FIRST_NAMES = [
  'Lucas', 'Mariana', 'Gabriel', 'Camila', 'Rafael', 'Juliana', 'Mateus', 'Larissa',
  'Bruno', 'Beatriz', 'Thiago', 'Fernanda', 'Gustavo', 'Amanda', 'Felipe', 'Carolina',
  'Rodrigo', 'Patrícia', 'Pedro', 'Aline', 'Leonardo', 'Letícia', 'Eduardo', 'Renata',
  'Henrique', 'Vanessa', 'Daniel', 'Bianca', 'Vinícius', 'Natália', 'André', 'Helena',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida',
  'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha',
  'Ribeiro', 'Alves', 'Monteiro', 'Mendes', 'Barros', 'Freitas', 'Cardoso', 'Ramos',
];

const PROFESSIONS: Record<'Básico' | 'Médio' | 'Superior', string[]> = {
  Básico: ['Auxiliar de Produção', 'Padeiro(a)', 'Atendente', 'Pedreiro(a)', 'Motorista'],
  Médio: ['Técnico(a) Administrativo', 'Vendedor(a)', 'Operador(a) Logístico', 'Enfermeiro(a)', 'Professor(a)'],
  Superior: ['Engenheiro(a)', 'Médico(a)', 'Analista Fiscal', 'Arquiteto(a)', 'Gestor(a) Público'],
};

const SHIRT_COLORS = [
  0x38bdf8, 0xf59e0b, 0x10b981, 0xf43f5e, 0xa855f7, 0xf97316, 0x14b8a6, 0xeab308,
];

export function randomName(seedIndex?: number): string {
  const f = FIRST_NAMES[seedIndex !== undefined ? seedIndex % FIRST_NAMES.length : Math.floor(Math.random() * FIRST_NAMES.length)];
  const l = LAST_NAMES[seedIndex !== undefined ? (seedIndex * 7 + 3) % LAST_NAMES.length : Math.floor(Math.random() * LAST_NAMES.length)];
  return `${f} ${l}`;
}

export function createCitizenAgent(
  index: number,
  homeTileKey: string | null,
  workBuildingId: string | null,
  workBuildingName: string | null,
  startX: number,
  startZ: number,
  residenceBuildingId: string | null = null,
): CitizenAgent {
  const roll = (index * 17) % 10;
  const education: 'Básico' | 'Médio' | 'Superior' =
    roll < 4 ? 'Básico' : roll < 8 ? 'Médio' : 'Superior';
  const profList = PROFESSIONS[education];
  const profession = profList[index % profList.length];
  const baseIncome = education === 'Básico' ? 1850 : education === 'Médio' ? 3400 : 7200;
  const age = index % 11 === 0 ? 12 + (index % 5) : index % 14 === 0 ? 66 + (index % 10) : 19 + ((index * 11) % 44);
  const effectiveWorkId = age >= 18 && age < 64 ? workBuildingId : null;
  const effectiveWorkName = effectiveWorkId ? workBuildingName : null;

  const baseAgent: CitizenAgent = {
    id: `cit_${index}_${Date.now().toString(36)}`,
    name: randomName(index),
    age,
    profession: age <= 17 ? 'Estudante' : age >= 64 ? 'Aposentado(a)' : profession,
    education,
    income: effectiveWorkId ? baseIncome + ((index * 137) % 900) : age >= 64 ? 1900 : 0,
    employedAtId: effectiveWorkId,
    employedAtName: effectiveWorkName,
    homeTileKey,
    residenceBuildingId,
    health: 78 + (index % 18),
    happiness: 68 + (index % 18),
    needs: {
      housing: homeTileKey ? 82 : 25,
      job: effectiveWorkId ? 85 : age >= 18 && age < 64 ? 20 : 80,
      health: 75,
      education: 65,
      safety: 72,
      energy: 78 + (index % 15),
      hunger: 72 + (index % 16),
      leisure: 66 + (index % 14),
      transport: 74,
    },
    state: effectiveWorkId ? 'commuting' : age <= 17 ? 'studying' : 'idle',
    opinion: 70,
    thought: effectiveWorkId
      ? 'A cidade tem potencial para crescer com planejamento.'
      : age <= 17
      ? 'Seguindo minha rotina de estudos.'
      : 'Aproveitando o dia pelo bairro.',
    x: startX,
    z: startZ,
    targetX: startX,
    targetZ: startZ,
    speed: 0.9 + ((index % 5) * 0.14),
    shirtColor: SHIRT_COLORS[index % SHIRT_COLORS.length],
    birthDay: ((index * 7) % 30) + 1,
    birthYear: Math.max(1, 1 - age),
    balance: 450 + ((index * 211) % 1800),
    monthlyExpenses: 850 + ((index * 97) % 900),
    jobSatisfaction: effectiveWorkId ? 74 : 45,
    personality: assignPersonality(index),
    staggerMinutes: ((index * 13) % 50) - 25,
    behaviorState: 'WalkingToDestination',
    movementState: 'stopped',
    animState: 'Idle',
    transportMode: 'walk',
    insideBuildingId: null,
    targetBuildingId: null,
    yaw: (index % 4) * (Math.PI / 2),
    currentSpeed: 0,
    decisionCooldown: (index % 5) * 0.12,
    appearanceSeed: index * 7919 + 17,
    history: ['Morador(a) fundador(a) de Nova Aurora.'],
  };

  baseAgent.scheduleProfile = assignScheduleProfile(baseAgent, index);
  return baseAgent;
}

export function createInitialTiles(): TileData[] {
  const tiles: TileData[] = [];
  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      let terrain: TerrainType = 'grass';
      if (z >= 21 || (z === 20 && x >= 6 && x <= 18)) {
        terrain = 'waterfront';
      } else if (x <= 2 && z <= 3) {
        terrain = 'hill';
      } else if (x >= 18 && z <= 4) {
        terrain = 'hill';
      } else if ((x >= 4 && x <= 8 && z >= 15 && z <= 19) || (x >= 16 && x <= 20 && z >= 14 && z <= 18)) {
        terrain = 'fertile';
      }

      const isCore = x >= 8 && x <= 15 && z >= 8 && z <= 15;
      const baseValue =
        terrain === 'waterfront' ? 42000 : terrain === 'fertile' ? 26000 : terrain === 'hill' ? 20000 : 24000;

      tiles.push({
        x,
        z,
        terrain,
        ownerType: isCore ? 'public' : 'available',
        ownerName: isCore ? 'Prefeitura Municipal' : 'Loteamento Urbano',
        landValue: baseValue + (isCore ? 12000 : 0),
        road: 'none',
        hasPower: false,
        hasWater: false,
        plannedDistrict: false,
        concessionActive: false,
        building: null,
        crimeRisk: 14,
        pollution: 2,
        healthCoverage: 35,
        educationCoverage: 30,
        safetyCoverage: 45,
        leisureCoverage: 35,
        trafficLoad: 10,
        conflict: null,
      });
    }
  }

  const setTile = (x: number, z: number) => tiles[z * GRID_SIZE + x];

  // Starter roads & avenues cross with continuous neighborhood loops
  for (let i = 8; i <= 15; i++) {
    setTile(i, 11).road = 'avenida';
    setTile(11, i).road = 'avenida';
  }
  for (let i = 9; i <= 14; i++) {
    setTile(i, 9).road = 'rua';
    setTile(i, 13).road = 'rua';
  }
  setTile(9, 10).road = 'rua';
  setTile(9, 12).road = 'rua';
  setTile(14, 10).road = 'rua';
  setTile(14, 12).road = 'rua';

  // Strategic starter bus stops along main avenues
  setTile(9, 11).busStop = true;
  setTile(13, 11).busStop = true;
  setTile(11, 9).busStop = true;
  setTile(11, 13).busStop = true;

  const placeStarter = (
    x: number,
    z: number,
    type: BuildingTypeId,
    ownerType: 'public' | 'private',
    ownerName: string,
    idSuffix: string,
  ) => {
    const t = setTile(x, z);
    t.ownerType = ownerType;
    t.ownerName = ownerName;
    const facingRot = computeFacingRoadRotation(tiles, x, z, 0);
    t.building = {
      id: `b_${type}_${idSuffix}`,
      type,
      level: 1,
      rotation: facingRot,
      ownerType,
      ownerName,
      powered: true,
      watered: true,
      connectedRoad: true,
      builtAtDay: 1,
      condition: 100,
      constructionStage: 'operational',
      constructionProgress: 100,
      occupantIds: [],
      variantSeed: x * 41 + z * 83,
    };
    const access = computeBuildingAccess(tiles, t);
    t.building.entranceTile = access.adjacentRoadTile ?? { x, z };
    t.zone = inferBuildingZone(t);
    t.building.zone = t.zone;
  };

  // Starter City Hall & Essential Infrastructure
  placeStarter(10, 10, 'prefeitura', 'public', 'Prefeitura Municipal', 'init_pref');
  placeStarter(8, 9, 'rede_energia', 'public', 'Autarquia de Energia', 'init_pow');
  placeStarter(8, 13, 'saneamento', 'public', 'Saneamento Municipal', 'init_wat');
  placeStarter(12, 12, 'praca', 'public', 'Prefeitura Municipal', 'init_praca');

  // Starter Housing (capacity: 5*32 + 48 = 208 for 150 initial citizens)
  placeStarter(10, 8, 'casa_popular', 'private', 'Família Ferreira', 'init_h1');
  placeStarter(12, 8, 'casa_popular', 'private', 'Família Souza', 'init_h2');
  placeStarter(13, 8, 'casa_popular', 'private', 'Família Lima', 'init_h3');
  placeStarter(10, 14, 'casa_popular', 'private', 'Família Rocha', 'init_h4');
  placeStarter(12, 14, 'casa_popular', 'private', 'Família Costa', 'init_h5');
  placeStarter(13, 10, 'casa_media', 'private', 'Família Oliveira', 'init_h6');

  // Starter Commerce & Light Industry (oriented toward street, industry at sector edge)
  placeStarter(12, 10, 'padaria', 'private', 'Panificadora Aurora', 'init_c1');
  placeStarter(14, 14, 'fabrica_pequena', 'private', 'Metalúrgica Vale Verde', 'init_i1');

  return tiles;
}

export function createInitialCitizens(tiles: TileData[]): CitizenAgent[] {
  const homes = tiles.filter((t) => t.building && BUILDING_CATALOG[t.building.type].housingCapacity > 0);
  const workplaces = tiles.filter((t) => t.building && BUILDING_CATALOG[t.building.type].jobsProvided > 0);

  const agents: CitizenAgent[] = [];
  for (let i = 0; i < 36; i++) {
    const home = homes[i % homes.length];
    const homeKey = `${home.x},${home.z}`;
    const hasJob = i < 30 && workplaces.length > 0;
    const work = hasJob ? workplaces[i % workplaces.length] : null;
    const access = computeBuildingAccess(tiles, home);
    const roadDirX = access.adjacentRoadTile ? access.adjacentRoadTile.x - home.x : 0;
    const roadDirZ = access.adjacentRoadTile ? access.adjacentRoadTile.z - home.z : 1;
    // Tangent parallel to the sidewalk curb so jitter never pushes into fences or asphalt
    const tanX = -roadDirZ;
    const tanZ = roadDirX;
    const tangentJitter = ((i % 5) - 2) * 0.055;
    const agent = createCitizenAgent(
      i,
      homeKey,
      work?.building?.id || null,
      work ? BUILDING_CATALOG[work.building!.type].name : null,
      access.sidewalkPoint.x + tanX * tangentJitter,
      access.sidewalkPoint.z + tanZ * tangentJitter,
      home.building?.id || null,
    );
    agent.yaw = Math.atan2(tanX || 1, tanZ || 0);
    agents.push(agent);
  }
  return agents;
}

export function createInitialEconomy(): EconomyState {
  return {
    treasury: 5000000,
    debt: 0,
    iptuRate: 1.4,
    issRate: 2.5,
    itbiRate: 2.0,
    budgetHealth: 1.0,
    budgetEducation: 1.0,
    budgetSafety: 1.0,
    budgetTransit: 1.0,
    budgetSocial: 1.0,
    lastMonthlyRevenue: 86500,
    lastMonthlyExpense: 52400,
    lastMonthlyNet: 34100,
    settledItbiThisMonth: 0,
    revenueBreakdown: {
      iptu: 18500,
      iss: 14000,
      itbi: 6000,
      transfers: 42000,
      servicesAndConcessions: 6000,
    },
    expenseBreakdown: {
      payroll: 22000,
      health: 7500,
      education: 7500,
      safety: 6400,
      transitAndInfra: 5000,
      socialPrograms: 4000,
      debtInterest: 0,
    },
  };
}

export function createInitialIndicators(): CityIndicators {
  return {
    population: 150,
    jobsTotal: 145,
    employed: 88,
    unemploymentRate: 5.4,
    housingCapacity: 208,
    housingDeficit: 0,
    popularity: 70,
    safety: 68,
    health: 64,
    education: 58,
    housingIndex: 78,
    mobility: 72,
    qualityOfLife: 69,
    pollution: 9,
    economicDevelopment: 42,
    inequality: 28,
  };
}

export function createInitialPolitics(): PoliticsState {
  const councilors: Councilor[] = [
    { id: 'v1', name: 'Vereadora Clara Mendes', party: 'PUD', alignment: 'base', support: 82 },
    { id: 'v2', name: 'Vereador Marcos Tavares', party: 'PUD', alignment: 'base', support: 78 },
    { id: 'v3', name: 'Vereador João Batista', party: 'MSB', alignment: 'base', support: 74 },
    { id: 'v4', name: 'Vereadora Renata Nogueira', party: 'MSB', alignment: 'base', support: 71 },
    { id: 'v5', name: 'Vereador Sérgio Prado', party: 'PCD', alignment: 'centro', support: 60 },
    { id: 'v6', name: 'Vereadora Lúcia Ferraz', party: 'PCD', alignment: 'centro', support: 58 },
    { id: 'v7', name: 'Vereador André Queiroz', party: 'AVN', alignment: 'centro', support: 55 },
    { id: 'v8', name: 'Vereador Paulo Rezende', party: 'AVN', alignment: 'centro', support: 52 },
    { id: 'v9', name: 'Vereadora Helena Duarte', party: 'OPM', alignment: 'oposicao', support: 32 },
    { id: 'v10', name: 'Vereador Ricardo Borges', party: 'OPM', alignment: 'oposicao', support: 28 },
    { id: 'v11', name: 'Vereador Otávio Pires', party: 'FRL', alignment: 'oposicao', support: 25 },
  ];

  const bills: CityBill[] = [
    {
      id: 'bill_lights',
      title: 'Programa Cidade Iluminada (LED)',
      description: 'Instala iluminação pública inteligente nas vias, aumentando segurança noturna.',
      cost: 95000,
      monthlyCost: 2200,
      popularityEffect: 4,
      safetyEffect: 9,
      status: 'available',
    },
    {
      id: 'bill_housing_sub',
      title: 'Subsídio Habitacional Popular',
      description: 'Auxílio aluguel e incentivo para regularização fundiária e moradias acessíveis.',
      cost: 120000,
      monthlyCost: 4800,
      popularityEffect: 6,
      housingEffect: 10,
      status: 'available',
    },
    {
      id: 'bill_tech_incentive',
      title: 'Lei de Incentivo Comercial e ISS Zero Inicial',
      description: 'Atrai novos empreendimentos privados e acelera a abertura de vagas.',
      cost: 80000,
      monthlyCost: 1500,
      popularityEffect: 3,
      economyEffect: 12,
      status: 'available',
    },
    {
      id: 'bill_preventive_health',
      title: 'Agentes Comunitários de Saúde & Prevenção',
      description: 'Expande atendimento preventivo nos bairros e reduz risco de surtos.',
      cost: 110000,
      monthlyCost: 4200,
      popularityEffect: 5,
      healthEffect: 12,
      status: 'available',
    },
    {
      id: 'bill_school_full',
      title: 'Escola em Tempo Integral e Qualificação',
      description: 'Amplia vagas escolares, refeições e cursos técnicos para jovens.',
      cost: 145000,
      monthlyCost: 5600,
      popularityEffect: 6,
      educationEffect: 14,
      safetyEffect: 4,
      status: 'available',
    },
    {
      id: 'bill_guarda',
      title: 'Plano Municipal de Prevenção e Guarda Comunitária',
      description: 'Mediação comunitária, patrulhamento preventivo e recuperação de espaços públicos.',
      cost: 130000,
      monthlyCost: 5100,
      popularityEffect: 4,
      safetyEffect: 14,
      status: 'available',
    },
  ];

  return {
    mayorName: 'Prefeito(a) Silva',
    viceMayorName: 'Vice-Prefeito Alencar',
    councilSupport: 64,
    councilors,
    bills,
    impeachment: {
      active: false,
      stage: 0,
      reason: '',
      daysInStage: 0,
      supportNeededToSurvive: 42,
    },
    nextElectionYear: 4,
    termsServed: 0,
    activePolicies: [],
  };
}

export function createInitialAchievements(): Achievement[] {
  return [
    {
      id: 'ach_million',
      title: 'Primeiro Milhão em Superávit',
      description: 'Alcance R$ 6.000.000 em caixa público sem dívidas.',
      unlocked: false,
    },
    {
      id: 'ach_fiscal',
      title: 'Equilíbrio Fiscal',
      description: 'Mantenha superávit mensal positivo com popularidade acima de 70%.',
      unlocked: false,
    },
    {
      id: 'ach_industry',
      title: 'Polo Industrial',
      description: 'Construa ao menos 4 empreendimentos industriais ativos.',
      unlocked: false,
    },
    {
      id: 'ach_education',
      title: 'Excelência em Educação',
      description: 'Atinja índice de Educação acima de 82 pontos.',
      unlocked: false,
    },
    {
      id: 'ach_sustainable',
      title: 'Cidade Sustentável',
      description: 'Qualidade de vida acima de 80 com poluição abaixo de 15.',
      unlocked: false,
    },
    {
      id: 'ach_qol',
      title: 'Alta Qualidade de Vida',
      description: 'Atinja 85+ em Qualidade de Vida e 1.000 habitantes.',
      unlocked: false,
    },
    {
      id: 'ach_recovery',
      title: 'Recuperação Econômica',
      description: 'Supere um período de dívida municipal voltando ao saldo positivo.',
      unlocked: false,
    },
    {
      id: 'ach_reelection',
      title: 'Reeleição Consagrada',
      description: 'Vença uma eleição municipal após 4 anos de mandato.',
      unlocked: false,
    },
  ];
}

export function createInitialNews(): NewsArticle[] {
  return [
    {
      id: 'news_init_1',
      day: 1,
      month: 1,
      year: 1,
      category: 'Política',
      headline: 'Nova gestão assume a Prefeitura com foco em crescimento urbano',
      summary:
        'Com R$ 5 milhões em caixa e 150 moradores iniciais, o município inicia um novo ciclo de planejamento viário, habitação e geração de empregos.',
    },
    {
      id: 'news_init_2',
      day: 1,
      month: 1,
      year: 1,
      category: 'Economia',
      headline: 'Mercado imobiliário abre lotes para expansão planejada',
      summary:
        'Investidores acompanham a valorização dos terrenos próximos à Avenida Central e à Praça Municipal.',
    },
  ];
}
