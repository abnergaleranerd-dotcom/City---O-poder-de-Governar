import React from 'react';
import {
  Activity,
  Award,
  Landmark,
  Layers,
  MapPin,
  MousePointer,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { DEVELOPMENT_LEVELS, ThematicMapMode } from '../types/game';
import { LeftTabId, useGameStore } from '../store/useGameStore';

const THEMATIC_LAYERS: { id: ThematicMapMode; label: string; hint: string }[] = [
  { id: 'normal', label: 'Mapa Normal', hint: 'Visualização realista padrão da cidade' },
  { id: 'landValue', label: 'Valor Imobiliário', hint: 'Verde = alta valorização · Vermelho = baixo valor' },
  { id: 'safety', label: 'Segurança Pública', hint: 'Cobertura de delegacias, iluminação e prevenção' },
  { id: 'traffic', label: 'Trânsito e Mobilidade', hint: 'Carga viária nas ruas e avenidas' },
  { id: 'pollution', label: 'Poluição Ambiental', hint: 'Impacto industrial e áreas verdes' },
  { id: 'health', label: 'Saúde', hint: 'Cobertura de UBS e hospitais' },
  { id: 'education', label: 'Educação', hint: 'Cobertura de escolas e centros técnicos' },
  { id: 'employment', label: 'Polos de Emprego', hint: 'Verde = lotes geradores de vagas' },
  { id: 'happiness', label: 'Felicidade e Lazer', hint: 'Acesso a praças, parques e esportes' },
  { id: 'coverage', label: 'Energia e Saneamento', hint: 'Azul = completo · Âmbar = parcial · Vermelho = sem rede' },
];

export const LeftDock: React.FC = () => {
  const zenMode = useGameStore((s) => s.zenMode);
  const activeLeftTab = useGameStore((s) => s.activeLeftTab);
  const activeTool = useGameStore((s) => s.activeTool);
  const developmentLevel = useGameStore((s) => s.developmentLevel);
  const economy = useGameStore((s) => s.economy);
  const indicators = useGameStore((s) => s.indicators);
  const politics = useGameStore((s) => s.politics);
  const tiles = useGameStore((s) => s.tiles);
  const thematicMode = useGameStore((s) => s.thematicMode);
  const achievements = useGameStore((s) => s.achievements);

  const setActiveLeftTab = useGameStore((s) => s.setActiveLeftTab);
  const setActiveTool = useGameStore((s) => s.setActiveTool);
  const setThematicMode = useGameStore((s) => s.setThematicMode);
  const updateTaxRates = useGameStore((s) => s.updateTaxRates);
  const updateBudgets = useGameStore((s) => s.updateBudgets);
  const proposeBill = useGameStore((s) => s.proposeBill);
  const negotiateCouncil = useGameStore((s) => s.negotiateCouncil);
  const resignMayor = useGameStore((s) => s.resignMayor);
  const sendCameraCommand = useGameStore((s) => s.sendCameraCommand);

  if (zenMode) return null;

  const navTabs: { id: LeftTabId; label: string; icon: React.ReactNode }[] = [
    { id: 'admin', label: 'Admin', icon: <Landmark className="w-4 h-4" /> },
    { id: 'economy', label: 'Economia', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'politics', label: 'Política', icon: <Scale className="w-4 h-4" /> },
    { id: 'planning', label: 'Planej.', icon: <Layers className="w-4 h-4" /> },
    { id: 'indicators', label: 'Índices', icon: <Activity className="w-4 h-4" /> },
  ];

  const publicLots = tiles.filter((t) => t.ownerType === 'public').length;
  const privateLots = tiles.filter((t) => t.ownerType === 'private').length;
  const avgLandValue = Math.round(tiles.reduce((acc, t) => acc + t.landValue, 0) / tiles.length);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <aside className="fixed top-12 left-3 bottom-12 z-20 flex items-start gap-2 pointer-events-none">
      {/* Compact Vertical Governance Rail */}
      <nav className="pointer-events-auto flex flex-col gap-1 bg-[#F2F0E8] border border-[#CBC5B5] rounded-lg p-1.5 shadow-lg">
        <button
          onClick={() => setActiveTool('select', null)}
          title="Selecionar terreno ou cidadão (Esc)"
          className={`flex flex-col items-center justify-center w-14 py-2 rounded text-[11px] font-medium transition-colors ${
            activeTool === 'select'
              ? 'bg-[#496B57] text-[#F2F0E8] font-semibold'
              : 'text-[#283B49] hover:bg-[#E6E2D6]'
          }`}
        >
          <MousePointer className="w-4 h-4 mb-0.5" />
          <span>Inspec.</span>
        </button>

        <div className="h-px bg-[#CBC5B5] my-0.5" />

        {navTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveLeftTab(tab.id)}
            className={`flex flex-col items-center justify-center w-14 py-2 rounded text-[11px] font-medium transition-colors ${
              activeLeftTab === tab.id
                ? 'bg-[#283B49] text-[#F2F0E8] font-semibold'
                : 'text-[#283B49] hover:bg-[#E6E2D6]'
            }`}
          >
            {tab.icon}
            <span className="mt-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Expandable Context Drawer (Default collapsed so >= 80% 3D viewport stays open) */}
      {activeLeftTab && (
        <div className="pointer-events-auto w-80 max-h-full bg-[#F2F0E8] border border-[#CBC5B5] rounded-lg shadow-xl flex flex-col overflow-hidden text-[#283B49]">
          <div className="px-3.5 py-2.5 bg-[#283B49] text-[#F2F0E8] flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">
              {activeLeftTab === 'admin'
                ? 'Administração & Patrimônio'
                : activeLeftTab === 'economy'
                ? 'Economia & Orçamento'
                : activeLeftTab === 'politics'
                ? 'Política & Câmara'
                : activeLeftTab === 'planning'
                ? 'Planejamento & Mapas'
                : 'Indicadores Sociais'}
            </h2>
            <button
              onClick={() => setActiveLeftTab(null)}
              className="text-xs text-[#D2A97B] hover:text-white px-1.5 py-0.5 font-medium"
            >
              Fechar
            </button>
          </div>

          <div className="p-3 overflow-y-auto hud-scroll space-y-3 text-xs">
            {/* 1. ADMINISTRAÇÃO & PATRIMÔNIO */}
            {activeLeftTab === 'admin' && (
              <>
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                  <div className="font-semibold text-[#283B49]">Mercado Imobiliário</div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Valor médio do lote:</span>
                    <span className="font-mono-num text-[#496B57] font-semibold">
                      R$ {avgLandValue.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Terrenos públicos:</span>
                    <span className="font-mono-num font-medium">{publicLots} lotes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Propriedades privadas:</span>
                    <span className="font-mono-num font-medium">{privateLots} lotes</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setActiveTool('buy_land', null)}
                    className={`p-2 rounded border font-semibold transition-colors ${
                      activeTool === 'buy_land'
                        ? 'bg-[#496B57] text-[#F2F0E8] border-[#496B57]'
                        : 'bg-[#E6E2D6] border-[#CBC5B5] text-[#283B49] hover:border-[#283B49]'
                    }`}
                  >
                    Comprar Lote
                  </button>
                  <button
                    onClick={() => setActiveTool('sell_land', null)}
                    className={`p-2 rounded border font-semibold transition-colors ${
                      activeTool === 'sell_land'
                        ? 'bg-[#D2A97B] text-[#283B49] border-[#A77642]'
                        : 'bg-[#E6E2D6] border-[#CBC5B5] text-[#283B49] hover:border-[#283B49]'
                    }`}
                  >
                    Vender Lote
                  </button>
                </div>

                <div className="border-t border-[#CBC5B5] pt-2.5 space-y-2">
                  <p className="font-semibold text-[#283B49]">Setores da Cidade</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: 'Bairro Piloto', x: 11, z: 11 },
                      { label: 'Orla Sul', x: 12, z: 20 },
                      { label: 'Zona Norte', x: 12, z: 4 },
                      { label: 'Polo Leste', x: 19, z: 12 },
                    ].map((loc) => (
                      <button
                        key={loc.label}
                        onClick={() => sendCameraCommand({ type: 'focus_tile', x: loc.x, z: loc.z })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#496B57] text-[#283B49] font-medium"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#496B57]" />
                        <span>{loc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                  <div className="font-semibold text-[#283B49] flex items-center justify-between">
                    <span>Evolução Urbana</span>
                    <span className="font-mono-num text-[11px] text-[#496B57]">
                      Nível {developmentLevel}/{DEVELOPMENT_LEVELS.length}
                    </span>
                  </div>
                  {DEVELOPMENT_LEVELS.map((lvl) => (
                    <div
                      key={lvl.level}
                      className={`flex justify-between text-[11px] ${
                        developmentLevel >= lvl.level
                          ? 'text-[#496B57] font-semibold'
                          : 'text-[#536877]'
                      }`}
                    >
                      <span>
                        {lvl.level}. {lvl.name}
                      </span>
                      <span className="font-mono-num">{lvl.minPop.toLocaleString('pt-BR')} hab.</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <div className="font-semibold text-[#283B49] flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-[#A77642]" />
                      Conquistas
                    </span>
                    <span className="font-mono-num text-[11px] text-[#536877]">
                      {unlockedCount}/{achievements.length}
                    </span>
                  </div>
                  {achievements.map((a) => (
                    <div
                      key={a.id}
                      className={`p-2 rounded border ${
                        a.unlocked
                          ? 'bg-[#496B57]/12 border-[#496B57]/60'
                          : 'bg-[#E6E2D6] border-[#CBC5B5]'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`font-semibold ${a.unlocked ? 'text-[#496B57]' : 'text-[#283B49]'}`}>
                          {a.title}
                        </span>
                        {a.unlocked && (
                          <span className="text-[10px] font-mono-num text-[#496B57]">
                            Ano {a.unlockedAtYear}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#536877] mt-0.5">{a.description}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 2. ECONOMIA & ORÇAMENTO */}
            {activeLeftTab === 'economy' && (
              <>
                <div className="space-y-2 bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5">
                  <div className="font-semibold text-[#283B49]">Alíquotas Tributárias</div>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span>IPTU (Imóveis)</span>
                      <span className="font-mono-num font-semibold text-[#496B57]">
                        {economy.iptuRate.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={4.0}
                      step={0.1}
                      value={economy.iptuRate}
                      onChange={(e) => updateTaxRates({ iptuRate: Number(e.target.value) })}
                      className="w-full accent-[#496B57]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span>ISS (Serviços e Comércio)</span>
                      <span className="font-mono-num font-semibold text-[#496B57]">
                        {economy.issRate.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={6.0}
                      step={0.1}
                      value={economy.issRate}
                      onChange={(e) => updateTaxRates({ issRate: Number(e.target.value) })}
                      className="w-full accent-[#496B57]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span>ITBI (Transações Imobiliárias)</span>
                      <span className="font-mono-num font-semibold text-[#496B57]">
                        {economy.itbiRate.toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={5.0}
                      step={0.1}
                      value={economy.itbiRate}
                      onChange={(e) => updateTaxRates({ itbiRate: Number(e.target.value) })}
                      className="w-full accent-[#496B57]"
                    />
                  </label>
                </div>

                <div className="space-y-2 bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5">
                  <div className="font-semibold text-[#283B49]">Orçamento das Secretarias</div>
                  {(
                    [
                      ['budgetHealth', 'Saúde'],
                      ['budgetEducation', 'Educação'],
                      ['budgetSafety', 'Segurança Municipal'],
                      ['budgetTransit', 'Transporte e Vias'],
                      ['budgetSocial', 'Assistência Social'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block space-y-0.5">
                      <div className="flex justify-between text-[11px]">
                        <span>{label}</span>
                        <span className="font-mono-num font-semibold text-[#3B6D8C]">
                          {Math.round(economy[key] * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={1.7}
                        step={0.1}
                        value={economy[key]}
                        onChange={(e) => updateBudgets({ [key]: Number(e.target.value) })}
                        className="w-full accent-[#3B6D8C]"
                      />
                    </label>
                  ))}
                </div>

                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1 text-[11px]">
                  <div className="font-semibold text-[#496B57]">
                    Receitas (R$ {economy.lastMonthlyRevenue.toLocaleString('pt-BR')})
                  </div>
                  <div className="flex justify-between">
                    <span>IPTU</span>
                    <span className="font-mono-num">R$ {economy.revenueBreakdown.iptu.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ISS</span>
                    <span className="font-mono-num">R$ {economy.revenueBreakdown.iss.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ITBI e Concessões</span>
                    <span className="font-mono-num">
                      R$ {(economy.revenueBreakdown.itbi + economy.revenueBreakdown.servicesAndConcessions).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transferências</span>
                    <span className="font-mono-num">R$ {economy.revenueBreakdown.transfers.toLocaleString('pt-BR')}</span>
                  </div>

                  <div className="font-semibold text-[#B43B3B] pt-2">
                    Despesas (R$ {economy.lastMonthlyExpense.toLocaleString('pt-BR')})
                  </div>
                  <div className="flex justify-between">
                    <span>Folha + Manutenção</span>
                    <span className="font-mono-num">R$ {economy.expenseBreakdown.payroll.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saúde e Educação</span>
                    <span className="font-mono-num">
                      R$ {(economy.expenseBreakdown.health + economy.expenseBreakdown.education).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Segurança, Vias e Social</span>
                    <span className="font-mono-num">
                      R$ {(economy.expenseBreakdown.safety + economy.expenseBreakdown.transitAndInfra + economy.expenseBreakdown.socialPrograms).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {economy.expenseBreakdown.debtInterest > 0 && (
                    <div className="flex justify-between text-[#B43B3B]">
                      <span>Juros da Dívida</span>
                      <span className="font-mono-num">R$ {economy.expenseBreakdown.debtInterest.toLocaleString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 3. POLÍTICA & CÂMARA */}
            {activeLeftTab === 'politics' && (
              <>
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Prefeitura:</span>
                    <span className="font-semibold">{politics.mayorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Vice-Prefeitura:</span>
                    <span>{politics.viceMayorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Apoio na Câmara:</span>
                    <span
                      className={`font-mono-num font-semibold ${
                        politics.councilSupport >= 50 ? 'text-[#496B57]' : 'text-[#B43B3B]'
                      }`}
                    >
                      {politics.councilSupport}% ({politics.councilors.filter((c) => c.support >= 50).length}/11)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Próxima Eleição:</span>
                    <span className="font-mono-num font-semibold text-[#A77642]">
                      Dez / Ano {politics.nextElectionYear}
                    </span>
                  </div>
                  <button
                    onClick={negotiateCouncil}
                    className="w-full mt-1 py-1.5 px-2.5 rounded bg-[#283B49] hover:bg-[#354E61] text-[#F2F0E8] font-semibold transition-colors"
                  >
                    Articular Apoio na Câmara (R$ 55.000)
                  </button>
                </div>

                {politics.impeachment.active && (
                  <div className="bg-[#B43B3B]/10 border border-[#B43B3B] rounded p-2.5 space-y-1">
                    <div className="font-semibold text-[#B43B3B]">
                      Processo de Impeachment — Etapa {politics.impeachment.stage}/4
                    </div>
                    <p className="text-[11px]">{politics.impeachment.reason}</p>
                    <p className="text-[11px] text-[#A77642] font-medium">
                      Recupere apoio acima de 54% e popularidade acima de 42% para arquivar.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="font-semibold">Projetos de Lei na Câmara</div>
                  {politics.bills.map((bill) => (
                    <div
                      key={bill.id}
                      className="p-2 rounded bg-[#E6E2D6] border border-[#CBC5B5] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{bill.title}</span>
                        <span className="font-mono-num font-semibold text-[#A77642] shrink-0">
                          R$ {bill.cost.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#536877]">{bill.description}</p>
                      {bill.status === 'available' ? (
                        <button
                          onClick={() => proposeBill(bill.id)}
                          className="w-full py-1 rounded bg-[#496B57] hover:bg-[#3A5645] text-[#F2F0E8] font-semibold transition-colors"
                        >
                          Enviar para Votação
                        </button>
                      ) : (
                        <div
                          className={`text-[11px] font-semibold ${
                            bill.status === 'approved' ? 'text-[#496B57]' : 'text-[#B43B3B]'
                          }`}
                        >
                          {bill.status === 'approved' ? 'Aprovado e em vigor' : 'Rejeitado em plenário'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={resignMayor}
                  className="w-full py-2 rounded bg-[#E6E2D6] border border-[#B43B3B]/60 text-[#B43B3B] hover:bg-[#B43B3B]/10 font-semibold transition-colors"
                >
                  Renunciar ao Mandato
                </button>
              </>
            )}

            {/* 4. PLANEJAMENTO & CAMADAS TEMÁTICAS */}
            {activeLeftTab === 'planning' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#536877] pb-1">
                  Ative camadas para avaliar cobertura de redes, mobilidade, zoneamento e valorização urbana.
                </p>
                {THEMATIC_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    onClick={() => setThematicMode(layer.id)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      thematicMode === layer.id
                        ? 'bg-[#283B49] text-[#F2F0E8] border-[#283B49]'
                        : 'bg-[#E6E2D6] border-[#CBC5B5] text-[#283B49] hover:border-[#496B57]'
                    }`}
                  >
                    <div className="font-semibold">{layer.label}</div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        thematicMode === layer.id ? 'text-[#8FB7CE]' : 'text-[#536877]'
                      }`}
                    >
                      {layer.hint}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 5. INDICADORES SOCIAIS */}
            {activeLeftTab === 'indicators' && (
              <div className="space-y-2.5">
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-2">
                  <div className="font-semibold text-[#283B49]">Panorama da Cidade</div>
                  {(
                    [
                      ['Qualidade de Vida', indicators.qualityOfLife, false],
                      ['Segurança', indicators.safety, false],
                      ['Saúde', indicators.health, false],
                      ['Educação', indicators.education, false],
                      ['Habitação', indicators.housingIndex, false],
                      ['Mobilidade', indicators.mobility, false],
                      ['Desenv. Econômico', indicators.economicDevelopment, false],
                      ['Poluição', indicators.pollution, true],
                      ['Desigualdade', indicators.inequality, true],
                    ] as const
                  ).map(([lbl, val, inverse]) => {
                    const num = Math.round(val);
                    const good = inverse ? num <= 30 : num >= 65;
                    const mid = inverse ? num <= 55 : num >= 40;
                    const barColor = good
                      ? 'bg-[#496B57]'
                      : mid
                      ? 'bg-[#D2A97B]'
                      : 'bg-[#B43B3B]';
                    return (
                      <div key={lbl} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#536877]">{lbl}</span>
                          <span className="font-mono-num font-semibold">{num}%</span>
                        </div>
                        <div className="h-1.5 bg-[#D4CFC2] rounded overflow-hidden">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${Math.min(100, Math.max(0, num))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-2.5 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Empregados / Vagas:</span>
                    <span className="font-mono-num font-semibold">
                      {indicators.employed} / {indicators.jobsTotal}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Taxa de Desemprego:</span>
                    <span className="font-mono-num font-semibold text-[#A77642]">
                      {indicators.unemploymentRate}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#536877]">Capacidade Habitacional:</span>
                    <span className="font-mono-num font-semibold">
                      {indicators.housingCapacity} vagas (Déficit {indicators.housingDeficit})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
