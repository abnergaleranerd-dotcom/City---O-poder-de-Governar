import React, { useMemo } from 'react';
import {
  ArrowUpCircle,
  Briefcase,
  Bus,
  Camera,
  Car,
  Gavel,
  Home,
  MapPin,
  Move,
  Route,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  BUILDING_CATALOG,
  BuildingLifecycleStage,
  CitizenBehaviorState,
  CitizenPersonality,
  CitizenScheduleProfile,
  ZoningType,
} from '../types/game';
import { useGameStore } from '../store/useGameStore';
import { getTile } from '../simulation/tickEngine';
import { getBuildingThumbnails } from '../engine/buildingThumbnails';
import { getNextCommitmentText } from '../simulation/agents/citizenSchedule';
import { getResidenceCapacity } from '../simulation/agents/householdEngine';

const STATE_LABELS: Record<string, string> = {
  idle: 'Em descanso',
  commuting: 'Em deslocamento',
  working: 'Trabalhando',
  studying: 'Na escola / curso',
  shopping: 'No comércio local',
  seeking_job: 'Procurando emprego',
  seeking_home: 'Buscando moradia',
  protesting: 'Participando de manifestação',
};

const BEHAVIOR_LABELS: Record<CitizenBehaviorState, string> = {
  Sleeping: 'Dormindo em casa',
  AtHome: 'Em casa',
  PreparingForWork: 'Preparando-se para sair',
  WalkingToDestination: 'Caminhando pela calçada',
  WaitingForTransport: 'Aguardando ônibus no ponto',
  RidingTransport: 'Viajando de ônibus',
  Driving: 'Dirigindo veículo',
  CrossingStreet: 'Atravessando faixa de pedestres',
  Working: 'Em expediente de trabalho',
  Studying: 'Em aula / formação',
  Shopping: 'Fazendo compras',
  Eating: 'Fazendo refeição',
  Exercising: 'Praticando exercício',
  Socializing: 'Conversando com vizinhos',
  SeekingJob: 'Procurando emprego',
  SeekingHome: 'Buscando moradia',
  ReceivingMedicalCare: 'Em atendimento médico',
  Protesting: 'Em manifestação cívica',
  ReturningHome: 'Retornando para casa',
  WaitingForPath: 'Recalculando rota urbana',
};

const PERSONALITY_LABELS: Record<CitizenPersonality, string> = {
  sociavel: 'Sociável',
  reservado: 'Reservado(a)',
  organizado: 'Organizado(a)',
  aventureiro: 'Aventureiro(a)',
  trabalhador: 'Trabalhador(a)',
  tranquilo: 'Tranquilo(a)',
  ambicioso: 'Ambicioso(a)',
  comunitario: 'Comunitário(a)',
};

const SCHEDULE_LABELS: Record<CitizenScheduleProfile, string> = {
  crianca: 'Criança',
  estudante: 'Estudante',
  universitario: 'Universitário(a)',
  clt: 'Comercial / CLT',
  comerciante: 'Comerciante',
  empresario: 'Empresário(a)',
  autonomo: 'Autônomo(a)',
  desempregado: 'Em busca de vaga',
  aposentado: 'Aposentado(a)',
  saude: 'Plantão de Saúde',
  servidor: 'Servidor Público',
};

const ZONE_LABELS: Record<ZoningType, string> = {
  none: 'Sem zoneamento',
  residential: 'Zona Residencial',
  commercial: 'Zona Comercial',
  industrial: 'Zona Industrial',
  mixed: 'Uso Misto',
  civic: 'Equipamento Cívico',
  green: 'Área Verde / Lazer',
};

const STAGE_LABELS: Record<BuildingLifecycleStage, string> = {
  planned: 'Planejado',
  construction_site: 'Canteiro de Obras',
  under_construction: 'Em Construção',
  operational: 'Operacional',
  remodeling: 'Em Reforma',
  abandoned: 'Abandonado',
};

const TERRAIN_LABELS: Record<string, string> = {
  grass: 'Planície Urbana',
  fertile: 'Solo Fértil',
  waterfront: 'Orla Marítima / Fluvial',
  hill: 'Colina Residencial',
};

function parseTileKey(key: string | null | undefined): { x: number; z: number } | null {
  if (!key) return null;
  const parts = key.split(',').map(Number);
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  return { x: parts[0], z: parts[1] };
}

export const RightInspector: React.FC = () => {
  const zenMode = useGameStore((s) => s.zenMode);
  const tiles = useGameStore((s) => s.tiles);
  const citizens = useGameStore((s) => s.citizens);
  const households = useGameStore((s) => s.households);
  const workplaces = useGameStore((s) => s.workplaces);
  const day = useGameStore((s) => s.day);
  const hourOfDay = useGameStore((s) => s.hourOfDay);
  const selectedTileCoords = useGameStore((s) => s.selectedTileCoords);
  const selectedCitizenId = useGameStore((s) => s.selectedCitizenId);
  const followedCitizenId = useGameStore((s) => s.followedCitizenId);
  const followedVehicleId = useGameStore((s) => s.followedVehicleId);
  const showCitizenRoute = useGameStore((s) => s.showCitizenRoute);

  const selectCitizen = useGameStore((s) => s.selectCitizen);
  const followCitizen = useGameStore((s) => s.followCitizen);
  const followVehicle = useGameStore((s) => s.followVehicle);
  const setShowCitizenRoute = useGameStore((s) => s.setShowCitizenRoute);
  const sendCameraCommand = useGameStore((s) => s.sendCameraCommand);
  const toggleBusStop = useGameStore((s) => s.toggleBusStop);
  const upgradeBuilding = useGameStore((s) => s.upgradeBuilding);
  const startMoveBuilding = useGameStore((s) => s.startMoveBuilding);
  const requestDemolition = useGameStore((s) => s.requestDemolition);
  const buyLand = useGameStore((s) => s.buyLand);
  const sellLand = useGameStore((s) => s.sellLand);
  const grantConcession = useGameStore((s) => s.grantConcession);
  const togglePlannedDistrict = useGameStore((s) => s.togglePlannedDistrict);
  const openAuction = useGameStore((s) => s.openAuction);
  const resolveLandConflict = useGameStore((s) => s.resolveLandConflict);

  const thumbnails = useMemo(() => getBuildingThumbnails(), []);

  if (zenMode) return null;

  const citizen = selectedCitizenId ? citizens.find((c) => c.id === selectedCitizenId) : null;
  const tile = selectedTileCoords ? getTile(tiles, selectedTileCoords.x, selectedTileCoords.z) : null;

  if (!citizen && !tile && !followedVehicleId) return null;

  const citizenHousehold = citizen?.householdId
    ? households.find((h) => h.id === citizen.householdId) || null
    : null;
  const familyMembers = citizenHousehold
    ? citizens.filter((m) => m.id !== citizen?.id && citizenHousehold.memberIds.includes(m.id))
    : [];
  const citizenWorkplace = citizen?.employedAtId
    ? workplaces.find((w) => w.buildingId === citizen.employedAtId) || null
    : null;
  const homeCoords = parseTileKey(citizen?.homeTileKey);
  const workCoords = parseTileKey(citizenWorkplace?.tileKey);

  return (
    <aside className="fixed top-12 right-3 bottom-48 z-20 w-80 pointer-events-none flex flex-col justify-start">
      <div className="pointer-events-auto max-h-full bg-[#F2F0E8] border border-[#CBC5B5] rounded-lg shadow-xl flex flex-col overflow-hidden text-[#283B49]">
        {followedVehicleId && !citizen && !tile ? (
          <div className="p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[#3B6D8C]" />
                <span className="font-display font-semibold">Câmera em Trânsito</span>
              </div>
              <button
                onClick={() => followVehicle(null)}
                className="text-[#536877] hover:text-[#283B49]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#536877]">
              Acompanhando veículo em circulação pelas vias da cidade em tempo real.
            </p>
            <button
              onClick={() => followVehicle(null)}
              className="w-full py-1.5 rounded bg-[#283B49] hover:bg-[#354E61] text-[#F2F0E8] font-semibold"
            >
              Sair do Acompanhamento (Esc)
            </button>
          </div>
        ) : citizen ? (
          <>
            <div className="px-3.5 py-2.5 bg-[#283B49] text-[#F2F0E8] flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-[#8FB7CE] shrink-0" />
                <h2 className="font-display text-sm font-semibold truncate">
                  {citizen.name}
                </h2>
              </div>
              <button
                onClick={() => {
                  followCitizen(null);
                  selectCitizen(null);
                }}
                className="text-[#D2A97B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 overflow-y-auto hud-scroll space-y-3 text-xs">
              <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 italic">
                &ldquo;{citizen.thought}&rdquo;
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() =>
                    followCitizen(followedCitizenId === citizen.id ? null : citizen.id)
                  }
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded font-semibold transition-colors ${
                    followedCitizenId === citizen.id
                      ? 'bg-[#D2A97B] text-[#283B49]'
                      : 'bg-[#283B49] hover:bg-[#354E61] text-[#F2F0E8]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{followedCitizenId === citizen.id ? 'Seguindo' : 'Seguir'}</span>
                </button>
                <button
                  onClick={() => setShowCitizenRoute(!showCitizenRoute)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded font-semibold border transition-colors ${
                    showCitizenRoute
                      ? 'bg-[#496B57] border-[#496B57] text-[#F2F0E8]'
                      : 'bg-[#E6E2D6] border-[#CBC5B5] text-[#283B49] hover:border-[#283B49]'
                  }`}
                >
                  <Route className="w-3.5 h-3.5" />
                  <span>{showCitizenRoute ? 'Ocultar Rota' : 'Ver Rota 3D'}</span>
                </button>
              </div>

              {(homeCoords || workCoords) && (
                <div className="grid grid-cols-2 gap-1.5">
                  {homeCoords && (
                    <button
                      onClick={() => sendCameraCommand({ type: 'focus_tile', x: homeCoords.x, z: homeCoords.z })}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#496B57] font-medium"
                    >
                      <Home className="w-3 h-3 text-[#496B57]" />
                      <span>Ir p/ Casa</span>
                    </button>
                  )}
                  {workCoords && (
                    <button
                      onClick={() => sendCameraCommand({ type: 'focus_tile', x: workCoords.x, z: workCoords.z })}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#3B6D8C] font-medium"
                    >
                      <Briefcase className="w-3 h-3 text-[#3B6D8C]" />
                      <span>Ir p/ Trabalho</span>
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-1.5 bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5">
                <div className="flex justify-between gap-2">
                  <span className="text-[#536877]">Atividade:</span>
                  <span className="text-[#496B57] font-semibold text-right">
                    {(citizen.behaviorState && BEHAVIOR_LABELS[citizen.behaviorState]) ||
                      STATE_LABELS[citizen.state] ||
                      citizen.state}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[#536877]">Próximo Compromisso:</span>
                  <span className="text-[#3B6D8C] font-medium text-right">
                    {getNextCommitmentText(citizen, hourOfDay, day)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Rotina / Perfil:</span>
                  <span>{SCHEDULE_LABELS[citizen.scheduleProfile ?? 'clt']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Personalidade:</span>
                  <span>{PERSONALITY_LABELS[citizen.personality ?? 'organizado']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Transporte:</span>
                  <span>
                    {citizen.transportMode === 'bus'
                      ? 'Ônibus Urbano'
                      : citizen.transportMode === 'car'
                      ? 'Veículo Particular'
                      : 'A pé'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Idade / Nascimento:</span>
                  <span className="font-mono-num">
                    {citizen.age} anos · D{citizen.birthDay ?? 1}/A{citizen.birthYear ?? 1}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Profissão:</span>
                  <span className="text-right">{citizen.profession} · {citizen.education}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Renda / Reserva:</span>
                  <span className="font-mono-num font-semibold text-[#496B57]">
                    R$ {citizen.income.toLocaleString('pt-BR')} / R$ {(citizen.balance ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Emprego:</span>
                  <span className="text-right">{citizen.employedAtName || 'Desempregado(a)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Residência:</span>
                  <span className="font-mono-num">
                    {citizen.homeTileKey ? `Lote (${citizen.homeTileKey})` : 'Sem moradia fixa'}
                  </span>
                </div>
                {citizen.insideBuildingId && (
                  <div className="flex justify-between text-[11px] text-[#496B57] font-semibold">
                    <span>Localização atual:</span>
                    <span>No interior de edifício</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5">
                <div className="font-semibold">Necessidades & Bem-estar</div>
                {(
                  [
                    ['Felicidade Geral', citizen.happiness],
                    ['Opinião sobre Prefeitura', citizen.opinion],
                    ['Energia / Descanso', citizen.needs.energy ?? 80],
                    ['Alimentação', citizen.needs.hunger ?? 80],
                    ['Lazer e Convivência', citizen.needs.leisure ?? 70],
                    ['Saúde', citizen.health],
                    ['Moradia', citizen.needs.housing],
                    ['Emprego', citizen.needs.job],
                    ['Transporte', citizen.needs.transport ?? 75],
                    ['Segurança do Bairro', citizen.needs.safety],
                  ] as const
                ).map(([label, val]) => {
                  const rounded = Math.round(val);
                  return (
                    <div key={label} className="space-y-0.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#536877]">{label}</span>
                        <span className="font-mono-num font-semibold">{rounded}%</span>
                      </div>
                      <div className="h-1.5 bg-[#D4CFC2] rounded overflow-hidden">
                        <div
                          className={`h-full ${
                            rounded >= 65 ? 'bg-[#496B57]' : rounded >= 40 ? 'bg-[#D2A97B]' : 'bg-[#B43B3B]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {citizenHousehold && (
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#A77642]" />
                      Família {citizenHousehold.surname}
                    </span>
                    <span className="text-[11px] font-mono-num text-[#536877]">
                      Aluguel R$ {citizenHousehold.monthlyRent.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {familyMembers.length === 0 ? (
                    <p className="text-[11px] text-[#536877]">Mora sozinho(a) nesta residência.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {familyMembers.map((fm) => (
                        <button
                          key={fm.id}
                          onClick={() => selectCitizen(fm.id)}
                          className="px-2 py-1 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] text-[#3B6D8C] font-medium"
                        >
                          {fm.name} ({fm.age}a)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {citizen.history && citizen.history.length > 0 && (
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1">
                  <div className="font-semibold">Histórico Pessoal</div>
                  <ul className="space-y-1 text-[11px] text-[#536877]">
                    {citizen.history.slice(-4).reverse().map((entry, idx) => (
                      <li key={idx} className="leading-snug">• {entry}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : tile ? (
          <>
            <div className="px-3.5 py-2.5 bg-[#283B49] text-[#F2F0E8] flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">
                Terreno ({tile.x}, {tile.z})
              </h2>
              <button
                onClick={() => useGameStore.setState({ selectedTileCoords: null })}
                className="text-[#D2A97B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 overflow-y-auto hud-scroll space-y-3 text-xs">
              <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#536877]">Geografia:</span>
                  <span>{TERRAIN_LABELS[tile.terrain]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Zoneamento:</span>
                  <span className="text-[#3B6D8C] font-semibold">
                    {ZONE_LABELS[tile.zone ?? 'none']}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Titularidade:</span>
                  <span className="font-semibold">{tile.ownerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Valor Imobiliário:</span>
                  <span className="font-mono-num text-[#496B57] font-semibold">
                    R$ {tile.landValue.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Infraestrutura:</span>
                  <span>
                    {tile.hasPower ? 'Energia OK' : 'Sem Energia'} · {tile.hasWater ? 'Água OK' : 'Sem Água'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#536877]">Segurança / Poluição:</span>
                  <span className="font-mono-num">
                    {tile.safetyCoverage}% / {tile.pollution}
                  </span>
                </div>
              </div>

              {tile.road !== 'none' && (
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Bus className="w-3.5 h-3.5 text-[#3B6D8C]" />
                      {tile.road === 'avenida' ? 'Avenida Urbana' : 'Rua Local'}
                    </span>
                    <span className="text-[11px] font-mono-num text-[#536877]">
                      Tráfego: {tile.trafficLoad}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => toggleBusStop(tile.x, tile.z)}
                      className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded font-semibold transition-colors ${
                        tile.busStop
                          ? 'bg-[#3B6D8C] text-[#F2F0E8]'
                          : 'bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49]'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      <span>{tile.busStop ? 'Remover Ponto' : 'Ponto Ônibus'}</span>
                    </button>
                    <button
                      onClick={() => requestDemolition(tile.x, tile.z)}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-[#F2F0E8] border border-[#B43B3B]/60 text-[#B43B3B] hover:bg-[#B43B3B]/10 font-semibold"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Demolir Via</span>
                    </button>
                  </div>
                </div>
              )}

              {tile.building && (
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-2.5">
                  {(() => {
                    const b = tile.building!;
                    const def = BUILDING_CATALOG[b.type];
                    const upgradeCost = Math.round(def.cost * 0.75 * b.level);
                    const thumb = thumbnails[b.type];
                    const stage = b.constructionStage ?? 'operational';
                    const progress = Math.round(b.constructionProgress ?? 100);
                    const occupants = (b.occupantIds ?? [])
                      .map((id) => citizens.find((c) => c.id === id))
                      .filter((c): c is NonNullable<typeof c> => Boolean(c));
                    const workplace = workplaces.find((w) => w.buildingId === b.id);
                    const resCap = getResidenceCapacity(tile);
                    const residents = resCap > 0
                      ? citizens.filter((c) => c.residenceBuildingId === b.id)
                      : [];

                    return (
                      <>
                        <div className="flex items-center gap-2.5">
                          {thumb && (
                            <img
                              src={thumb}
                              alt={def.name}
                              className="w-11 h-11 rounded bg-[#283B49] border border-[#CBC5B5] shrink-0 object-contain"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold truncate">{def.name}</span>
                              <span className="font-mono-num text-[#A77642] font-semibold shrink-0">
                                Nv.{b.level}/3
                              </span>
                            </div>
                            <div className="text-[11px] text-[#536877] mt-0.5">
                              {stage !== 'operational'
                                ? `${STAGE_LABELS[stage]} (${progress}%)`
                                : b.powered && b.watered && b.connectedRoad
                                ? 'Operando normalmente'
                                : `Pendências: ${!b.powered ? 'Energia ' : ''}${!b.watered ? 'Água ' : ''}${!b.connectedRoad ? 'Via' : ''}`}
                            </div>
                          </div>
                        </div>

                        {stage !== 'operational' && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-[#A77642] font-semibold">Progresso da Obra</span>
                              <span className="font-mono-num">{progress}%</span>
                            </div>
                            <div className="h-1.5 bg-[#D4CFC2] rounded overflow-hidden">
                              <div
                                className="h-full bg-[#D2A97B]"
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#536877]">Conservação / Capacidade:</span>
                          <span className="font-mono-num font-medium">
                            {Math.round(b.condition)}% ·{' '}
                            {def.housingCapacity > 0
                              ? `${residents.length}/${resCap} moradores`
                              : workplace
                              ? `${workplace.workerIds.length}/${workplace.capacity} vagas`
                              : `${def.jobsProvided} vagas`}
                          </span>
                        </div>

                        {residents.length > 0 && (
                          <div className="pt-1 border-t border-[#CBC5B5] space-y-1">
                            <div className="text-[11px] text-[#536877]">Moradores:</div>
                            <div className="flex flex-wrap gap-1">
                              {residents.slice(0, 6).map((r) => (
                                <button
                                  key={r.id}
                                  onClick={() => selectCitizen(r.id)}
                                  className="px-1.5 py-0.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] text-[#3B6D8C] font-medium"
                                >
                                  {r.name.split(' ')[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {workplace && workplace.workerIds.length > 0 && (
                          <div className="pt-1 border-t border-[#CBC5B5] space-y-1">
                            <div className="text-[11px] text-[#536877]">Equipe contratada:</div>
                            <div className="flex flex-wrap gap-1">
                              {workplace.workerIds.slice(0, 6).map((wid) => {
                                const w = citizens.find((c) => c.id === wid);
                                if (!w) return null;
                                return (
                                  <button
                                    key={wid}
                                    onClick={() => selectCitizen(wid)}
                                    className="px-1.5 py-0.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#496B57] text-[11px] text-[#496B57] font-medium"
                                  >
                                    {w.name.split(' ')[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="pt-1 border-t border-[#CBC5B5] space-y-1">
                          <div className="text-[11px] text-[#536877]">
                            No interior agora ({occupants.length}):
                          </div>
                          {occupants.length === 0 ? (
                            <div className="text-[11px] text-[#536877]">Nenhum cidadão dentro no momento.</div>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {occupants.slice(0, 8).map((occ) => (
                                <button
                                  key={occ.id}
                                  onClick={() => selectCitizen(occ.id)}
                                  className="px-1.5 py-0.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49] text-[11px] text-[#A77642] font-medium"
                                >
                                  {occ.name.split(' ')[0]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <button
                            disabled={b.level >= 3}
                            onClick={() => upgradeBuilding(tile.x, tile.z)}
                            className="flex flex-col items-center p-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#496B57] disabled:opacity-40 text-[11px] font-medium"
                          >
                            <ArrowUpCircle className="w-3.5 h-3.5 text-[#496B57] mb-0.5" />
                            <span>{b.level >= 3 ? 'Máx' : `R$ ${(upgradeCost / 1000).toFixed(0)}k`}</span>
                          </button>
                          <button
                            onClick={() => startMoveBuilding(tile.x, tile.z)}
                            className="flex flex-col items-center p-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#3B6D8C] text-[11px] font-medium"
                          >
                            <Move className="w-3.5 h-3.5 text-[#3B6D8C] mb-0.5" />
                            <span>Mover</span>
                          </button>
                          <button
                            onClick={() => requestDemolition(tile.x, tile.z)}
                            className="flex flex-col items-center p-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#B43B3B] text-[#B43B3B] text-[11px] font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5 mb-0.5" />
                            <span>Demolir</span>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {tile.conflict && (
                <div className="bg-[#D2A97B]/20 border border-[#A77642] rounded p-2.5 space-y-2">
                  <div className="font-semibold text-[#7A5124]">{tile.conflict.title}</div>
                  <p className="text-[11px]">
                    Representação: {tile.conflict.groupName} · Ativo há {tile.conflict.daysActive} dias.
                  </p>
                  <div className="space-y-1">
                    <button
                      onClick={() => resolveLandConflict(tile.x, tile.z, 'mediate')}
                      className="w-full py-1.5 rounded bg-[#496B57] hover:bg-[#3A5645] text-[#F2F0E8] font-semibold"
                    >
                      Mediar e Regularizar (R$ 45.000)
                    </button>
                    <button
                      onClick={() => resolveLandConflict(tile.x, tile.z, 'housing')}
                      className="w-full py-1.5 rounded bg-[#3B6D8C] hover:bg-[#2F5973] text-[#F2F0E8] font-semibold"
                    >
                      Construir Moradia Popular (R$ 95.000)
                    </button>
                    <button
                      onClick={() => resolveLandConflict(tile.x, tile.z, 'legal')}
                      className="w-full py-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49] font-medium"
                    >
                      Encaminhar à Justiça (R$ 15.000)
                    </button>
                  </div>
                </div>
              )}

              {!tile.building && tile.road === 'none' && !tile.conflict && (
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                  <div className="font-semibold">Operações Imobiliárias</div>
                  {tile.ownerType !== 'public' ? (
                    <button
                      disabled={tile.ownerType === 'occupied'}
                      onClick={() => buyLand(tile.x, tile.z)}
                      className="w-full py-1.5 rounded bg-[#496B57] hover:bg-[#3A5645] disabled:opacity-45 text-[#F2F0E8] font-semibold"
                    >
                      Comprar Terreno (R$ {tile.landValue.toLocaleString('pt-BR')})
                    </button>
                  ) : tile.terrain === 'waterfront' ? (
                    <div className="text-[11px] text-[#536877] py-1">
                      Área de orla preservada como patrimônio público e lazer.
                    </div>
                  ) : (
                    <>
                      <button
                        disabled={tile.concessionActive}
                        onClick={() => sellLand(tile.x, tile.z)}
                        className="w-full py-1.5 rounded bg-[#D2A97B] hover:bg-[#C49663] disabled:opacity-45 text-[#283B49] font-semibold"
                      >
                        Vender Lote (+R$ {Math.round(tile.landValue * 1.15).toLocaleString('pt-BR')})
                      </button>
                      <button
                        disabled={tile.concessionActive}
                        onClick={() => openAuction(tile.x, tile.z)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-[#283B49] hover:bg-[#354E61] disabled:opacity-45 text-[#F2F0E8] font-semibold"
                      >
                        <Gavel className="w-3.5 h-3.5" />
                        <span>Realizar Leilão Imobiliário</span>
                      </button>
                      <button
                        disabled={tile.concessionActive}
                        onClick={() => grantConcession(tile.x, tile.z)}
                        className="w-full py-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#283B49] disabled:opacity-45 font-medium"
                      >
                        {tile.concessionActive
                          ? 'Concessão Ativa'
                          : `Conceder p/ Empreendimento (+R$ ${Math.round(tile.landValue * 0.45).toLocaleString('pt-BR')})`}
                      </button>
                    </>
                  )}
                  <button
                    disabled={tile.plannedDistrict}
                    onClick={() => togglePlannedDistrict(tile.x, tile.z)}
                    className="w-full py-1.5 rounded bg-[#F2F0E8] border border-[#CBC5B5] hover:border-[#496B57] disabled:opacity-55 font-medium"
                  >
                    {tile.plannedDistrict ? 'Setor Bairro Planejado Ativo' : 'Declarar Bairro Planejado (R$ 25.000)'}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
};
