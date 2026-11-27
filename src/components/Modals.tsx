import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Clock,
  Cloud,
  Gavel,
  LogIn,
  LogOut,
  Newspaper,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import { BUILDING_CATALOG, type GraphicsQuality, type TimePreset } from '../types/game';
import { detectGraphicsCapabilities, getQualityProfile } from '../engine/graphicsConfig';
import { auth, firebaseAvailable } from '../firebase';
import {
  CloudCitySummary,
  CloudLegacySummary,
  deleteCityFromCloud,
  loadCitiesFromCloud,
  loadLegaciesFromCloud,
  saveCityLocal,
  saveCityToCloud,
  saveLegacyToCloud,
  signInWithGoogle,
  signOutGoogle,
} from '../services/persistence';
import { useGameStore } from '../store/useGameStore';
import { getTile } from '../simulation/tickEngine';

export const GameModals: React.FC = () => {
  const activeEvent = useGameStore((s) => s.activeEvent);
  const resolveEventChoice = useGameStore((s) => s.resolveEventChoice);

  const pendingDemolition = useGameStore((s) => s.pendingDemolition);
  const confirmDemolition = useGameStore((s) => s.confirmDemolition);
  const cancelDemolition = useGameStore((s) => s.cancelDemolition);

  const showNewspaperModal = useGameStore((s) => s.showNewspaperModal);
  const setShowNewspaperModal = useGameStore((s) => s.setShowNewspaperModal);
  const news = useGameStore((s) => s.news);
  const cityName = useGameStore((s) => s.cityName);
  const indicators = useGameStore((s) => s.indicators);
  const economy = useGameStore((s) => s.economy);

  const showCloudModal = useGameStore((s) => s.showCloudModal);
  const setShowCloudModal = useGameStore((s) => s.setShowCloudModal);
  const exportSnapshot = useGameStore((s) => s.exportSnapshot);
  const importSnapshot = useGameStore((s) => s.importSnapshot);
  const startNewCity = useGameStore((s) => s.startNewCity);
  const showToast = useGameStore((s) => s.showToast);

  const day = useGameStore((s) => s.day);
  const month = useGameStore((s) => s.month);
  const year = useGameStore((s) => s.year);
  const developmentLevel = useGameStore((s) => s.developmentLevel);
  const politics = useGameStore((s) => s.politics);

  const auctionTile = useGameStore((s) => s.auctionTile);
  const tiles = useGameStore((s) => s.tiles);
  const closeAuction = useGameStore((s) => s.closeAuction);
  const completeAuction = useGameStore((s) => s.completeAuction);

  const endGameReport = useGameStore((s) => s.endGameReport);
  const showSettingsModal = useGameStore((s) => s.showSettingsModal);
  const setShowSettingsModal = useGameStore((s) => s.setShowSettingsModal);
  const graphicsQuality = useGameStore((s) => s.graphicsQuality);
  const recommendedQuality = useGameStore((s) => s.recommendedQuality);
  const setGraphicsQuality = useGameStore((s) => s.setGraphicsQuality);
  const timeConfig = useGameStore((s) => s.timeConfig);
  const setTimeConfig = useGameStore((s) => s.setTimeConfig);
  const setTimePreset = useGameStore((s) => s.setTimePreset);

  const gpuCaps = useMemo(() => detectGraphicsCapabilities(), []);

  // Firebase Auth & Cloud state
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [cloudCities, setCloudCities] = useState<CloudCitySummary[]>([]);
  const [cloudLegacies, setCloudLegacies] = useState<CloudLegacySummary[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [slotName, setSlotName] = useState(cityName);
  const [newCityName, setNewCityName] = useState('Nova Aurora');
  const [newMayorName, setNewMayorName] = useState('Prefeito(a) Silva');

  // Auction state
  const [auctionBid, setAuctionBid] = useState(0);
  const [auctionBidder, setAuctionBidder] = useState('Construtora Alvorada');
  const [auctionRound, setAuctionRound] = useState(1);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (showCloudModal && user && firebaseAvailable) {
      setSlotName(cityName);
      void refreshCloudData();
    }
  }, [showCloudModal, user, cityName]);

  useEffect(() => {
    if (auctionTile) {
      const tile = getTile(tiles, auctionTile.x, auctionTile.z);
      const base = tile ? Math.round(tile.landValue * 1.05) : 30000;
      setAuctionBid(base);
      setAuctionBidder('Construtora Alvorada');
      setAuctionRound(1);
    }
  }, [auctionTile, tiles]);

  const refreshCloudData = async () => {
    if (!auth?.currentUser) return;
    setCloudBusy(true);
    setCloudError(null);
    try {
      const [cities, legacies] = await Promise.all([
        loadCitiesFromCloud(),
        loadLegaciesFromCloud(),
      ]);
      setCloudCities(cities);
      setCloudLegacies(legacies);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Erro ao consultar nuvem.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setCloudBusy(true);
    setCloudError(null);
    try {
      await signInWithGoogle();
      await refreshCloudData();
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Falha ao entrar com Google.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSaveCloud = async () => {
    if (!user) return;
    setCloudBusy(true);
    setCloudError(null);
    try {
      const slug = `${user.uid.slice(0, 12)}_${(slotName || cityName).toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await saveCityToCloud({
        slotId: slug,
        cityName: slotName || cityName,
        mayorName: politics.mayorName,
        population: indicators.population,
        treasury: economy.treasury,
        popularity: indicators.popularity,
        day,
        month,
        year,
        developmentLevel,
        stateSnapshot: exportSnapshot(),
      });
      await refreshCloudData();
      showToast('Cidade salva no Firebase Cloud com sucesso!', 'success');
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Erro ao salvar na nuvem.');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleNextAuctionRound = () => {
    const bidders = ['Construtora Alvorada', 'Grupo Atlântico', 'Incorporadora Horizonte', 'Fundo Metrópole'];
    const nextBidder = bidders[(auctionRound + Math.floor(Math.random() * 2)) % bidders.length];
    const increment = Math.round(auctionBid * (0.14 + Math.random() * 0.12));
    setAuctionBid((b) => b + increment);
    setAuctionBidder(nextBidder);
    setAuctionRound((r) => r + 1);
  };

  const handleArchiveLegacy = async () => {
    if (!endGameReport || !user) return;
    setCloudBusy(true);
    try {
      await saveLegacyToCloud({
        cityName,
        mayorName: politics.mayorName,
        outcome: endGameReport.outcome,
        finalPopulation: endGameReport.finalPopulation,
        finalTreasury: endGameReport.finalTreasury,
        finalPopularity: endGameReport.finalPopularity,
        yearsServed: endGameReport.yearsServed,
        summary: endGameReport.legacySummary,
      });
      showToast('Legado administrativo arquivado na nuvem!', 'success');
    } catch {
      showToast('Não foi possível arquivar legado na nuvem.', 'error');
    } finally {
      setCloudBusy(false);
    }
  };

  return (
    <>
      {/* 1. DILEMMA / RANDOM EVENT MODAL */}
      {activeEvent && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="font-display text-base font-bold text-amber-400">
                {activeEvent.title}
              </span>
              <span className="text-xs text-slate-400">Decisão da Prefeitura</span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-200 leading-relaxed">{activeEvent.description}</p>
              <div className="space-y-2.5">
                {activeEvent.choices.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => resolveEventChoice(ch.id)}
                    className="w-full text-left p-3.5 rounded-lg bg-slate-950/80 border border-slate-700 hover:border-amber-400 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{ch.label}</span>
                      <span className="font-mono-num text-xs font-semibold text-amber-400 shrink-0">
                        {ch.cost > 0 ? `Custo: R$ ${ch.cost.toLocaleString('pt-BR')}` : 'Sem custo direto'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{ch.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BANCO IMOBILIÁRIO AUCTION MODAL */}
      {auctionTile && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-amber-400" />
                <h3 className="font-display text-base font-bold text-white">
                  Leilão Imobiliário — Lote ({auctionTile.x}, {auctionTile.z})
                </h3>
              </div>
              <button onClick={closeAuction} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="bg-slate-950 border border-slate-800 rounded p-4 text-center space-y-1">
                <div className="text-xs text-slate-400">Lance Atual · Rodada {auctionRound}/4</div>
                <div className="font-mono-num text-2xl font-bold text-emerald-400">
                  R$ {auctionBid.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-amber-300">Maior oferta: {auctionBidder}</div>
              </div>
              <p className="text-xs text-slate-400">
                Você pode estimular nova rodada de lances entre incorporadoras ou bater o martelo para arrecadar o valor + ITBI.
              </p>
              <div className="flex gap-2">
                {auctionRound < 4 && (
                  <button
                    onClick={handleNextAuctionRound}
                    className="flex-1 py-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs"
                  >
                    Abrir Nova Rodada
                  </button>
                )}
                <button
                  onClick={() => completeAuction(auctionTile.x, auctionTile.z, auctionBid, auctionBidder)}
                  className="flex-1 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
                >
                  Arrematar Venda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. CIDADE NEWS MODAL */}
      {showNewspaperModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-2xl w-full max-h-[85vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Newspaper className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="font-display text-lg font-bold text-white">CIDADE NEWS</h2>
                  <p className="text-xs text-slate-400">
                    Edição de {cityName} · Ano {year} · População {indicators.population.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowNewspaperModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto hud-scroll space-y-4">
              {news.map((item, idx) => (
                <article
                  key={item.id}
                  className={`pb-4 ${idx < news.length - 1 ? 'border-b border-slate-800' : ''}`}
                >
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <span className="text-amber-400 font-medium">{item.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num">
                      Dia {item.day}/{item.month}/Ano {item.year}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-white">{item.headline}</h3>
                  <p className="text-sm text-slate-300 mt-1 leading-relaxed">{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. CLOUD SAVE (FIREBASE) & LOCAL SAVE MODAL */}
      {showCloudModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-2xl w-full max-h-[88vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-sky-400" />
                <h2 className="font-display text-base font-bold text-white">
                  Salvar e Gerenciar Cidades (Local & Firebase)
                </h2>
              </div>
              <button onClick={() => setShowCloudModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto hud-scroll space-y-5 text-sm">
              {/* Local Browser Save */}
              <div className="bg-slate-950 border border-slate-800 rounded p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">Salvamento Local Automático</div>
                  <div className="text-xs text-slate-400">
                    Gravado mensalmente no navegador para retomada imediata.
                  </div>
                </div>
                <button
                  onClick={() => {
                    saveCityLocal(exportSnapshot());
                    showToast('Progresso salvo localmente!', 'success');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar Agora</span>
                </button>
              </div>

              {/* Firebase Cloud Saves */}
              <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">Nuvem Firebase (Firestore)</div>
                    <div className="text-xs text-slate-400">
                      {!firebaseAvailable
                        ? 'Modo local ativo — sincronização em nuvem opcional indisponível.'
                        : user
                        ? `Conectado como ${user.displayName || user.email}`
                        : 'Entre com Google para sincronizar suas cidades na nuvem'}
                    </div>
                  </div>
                  {firebaseAvailable &&
                    (user ? (
                      <button
                        onClick={() => void signOutGoogle()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sair</span>
                      </button>
                    ) : (
                      <button
                        disabled={cloudBusy}
                        onClick={() => void handleGoogleLogin()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Entrar com Google</span>
                      </button>
                    ))}
                </div>

                {cloudError && (
                  <div className="text-xs text-rose-300 bg-rose-950/70 border border-rose-800 rounded p-2">
                    {cloudError}
                  </div>
                )}

                {user && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={slotName}
                        onChange={(e) => setSlotName(e.target.value)}
                        maxLength={60}
                        placeholder="Nome do slot da cidade"
                        className="flex-1 px-3 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                      <button
                        disabled={cloudBusy}
                        onClick={() => void handleSaveCloud()}
                        className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        {cloudBusy ? 'Sincronizando...' : 'Salvar na Nuvem'}
                      </button>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-medium text-slate-400">Cidades Salvas na Nuvem</div>
                      {cloudCities.length === 0 ? (
                        <p className="text-xs text-slate-500">Nenhuma cidade salva na nuvem ainda.</p>
                      ) : (
                        cloudCities.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded bg-slate-900 border border-slate-800"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-white text-xs truncate">{c.cityName}</div>
                              <div className="text-[11px] text-slate-400 font-mono-num">
                                Pop: {c.population.toLocaleString('pt-BR')} · Caixa: R$ {c.treasury.toLocaleString('pt-BR')} · Ano {c.year}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => {
                                  if (importSnapshot(c.stateSnapshot)) {
                                    setShowCloudModal(false);
                                    showToast(`Cidade "${c.cityName}" carregada da nuvem!`, 'success');
                                  }
                                }}
                                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
                              >
                                Carregar
                              </button>
                              <button
                                onClick={() => void deleteCityFromCloud(c.id).then(refreshCloudData)}
                                className="p-1.5 rounded bg-slate-800 hover:bg-rose-900 text-rose-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {cloudLegacies.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-800">
                        <div className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" />
                          <span>Histórico de Mandatos Encerrados</span>
                        </div>
                        {cloudLegacies.map((leg) => (
                          <div key={leg.id} className="text-xs text-slate-300 bg-slate-900 p-2 rounded border border-slate-800">
                            <strong>{leg.cityName}</strong> ({leg.yearsServed} anos) · Pop: {leg.finalPopulation.toLocaleString('pt-BR')} — {leg.summary}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Start New City */}
              <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-2.5">
                <div className="font-semibold text-slate-200">Iniciar Nova Administração</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newCityName}
                    onChange={(e) => setNewCityName(e.target.value)}
                    placeholder="Nome da cidade"
                    className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={newMayorName}
                    onChange={(e) => setNewMayorName(e.target.value)}
                    placeholder="Nome do prefeito(a)"
                    className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>
                <button
                  onClick={() => {
                    startNewCity(newCityName || 'Nova Aurora', newMayorName || 'Prefeito(a) Silva');
                    setShowCloudModal(false);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Fundar Nova Cidade</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. END-OF-TERM / DEFEAT REPORT MODAL */}
      {endGameReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/88 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="text-xs text-rose-400 font-semibold">Fim de Mandato · {cityName}</div>
              <h2 className="font-display text-xl font-bold text-white mt-0.5">{endGameReport.title}</h2>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <p className="text-slate-300 leading-relaxed">{endGameReport.reason}</p>

              <div className="grid grid-cols-2 gap-3 bg-slate-950 border border-slate-800 rounded p-3.5 text-xs">
                <div>
                  <span className="text-slate-400 block">População Final</span>
                  <span className="font-mono-num text-base font-bold text-white">
                    {endGameReport.finalPopulation.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Anos de Gestão</span>
                  <span className="font-mono-num text-base font-bold text-amber-400">
                    {endGameReport.yearsServed} anos
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Caixa / Dívida</span>
                  <span className="font-mono-num text-sm font-semibold text-emerald-400">
                    R$ {endGameReport.finalTreasury.toLocaleString('pt-BR')} / Dív. R$ {endGameReport.finalDebt.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Qualidade de Vida / Popularidade</span>
                  <span className="font-mono-num text-sm font-semibold text-sky-400">
                    {endGameReport.qualityOfLife}/100 · {endGameReport.finalPopularity}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded p-3 text-xs text-slate-300">
                <strong className="text-amber-400 block mb-1">Legado da Administração</strong>
                {endGameReport.legacySummary}
                {endGameReport.highlights.length > 0 && (
                  <ul className="mt-2 space-y-1 text-slate-400 list-disc pl-4">
                    {endGameReport.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {user && (
                  <button
                    disabled={cloudBusy}
                    onClick={() => void handleArchiveLegacy()}
                    className="flex-1 py-2.5 px-4 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                  >
                    Arquivar Legado no Firebase
                  </button>
                )}
                <button
                  onClick={() => startNewCity('Nova Aurora', 'Prefeito(a) Silva')}
                  className="flex-1 py-2.5 px-4 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  Iniciar Nova Cidade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 6. SETTINGS MODAL (TIME, LIVING WORLD, AUDIO & GRAPHICS) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-40 bg-slate-950/78 flex items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-2xl w-full max-h-[88vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h2 className="font-display text-base font-bold text-white">
                  Configurações do Mundo Vivo & Gráficos
                </h2>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto hud-scroll space-y-5 text-xs">
              {/* Temporal Pace Section */}
              <section className="bg-slate-950 border border-slate-800 rounded p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Ritmo Temporal da Cidade
                  </span>
                  <span className="font-mono-num text-amber-300 font-semibold">
                    {timeConfig.secondsPerDay}s / dia (em 1x)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'relaxed', title: 'Relaxado', desc: '300s/dia · Contemplativo' },
                      { id: 'balanced', title: 'Equilibrado', desc: '180s/dia · Padrão' },
                      { id: 'strategic', title: 'Estratégico', desc: '60s/dia · Dinâmico' },
                    ] as { id: TimePreset; title: string; desc: string }[]
                  ).map((preset) => {
                    const active = timeConfig.preset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => setTimePreset(preset.id)}
                        className={`p-2 rounded border text-left transition-colors ${
                          active
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold">{preset.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Ajuste fino: Duração de 1 dia (60s a 300s)</span>
                    <span className="font-mono-num text-slate-200">{timeConfig.secondsPerDay}s</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={300}
                    step={10}
                    value={timeConfig.secondsPerDay}
                    onChange={(e) => setTimeConfig({ secondsPerDay: Number(e.target.value) })}
                    className="w-full accent-amber-400"
                  />
                </label>
              </section>

              {/* Living World Simulation Sliders */}
              <section className="bg-slate-950 border border-slate-800 rounded p-3.5 space-y-3">
                <div className="font-semibold text-white">Simulação Urbana & Câmera</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Velocidade de NPCs</span>
                      <span className="font-mono-num text-slate-200">
                        {timeConfig.npcSpeedMultiplier.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      value={timeConfig.npcSpeedMultiplier}
                      onChange={(e) =>
                        setTimeConfig({ npcSpeedMultiplier: Number(e.target.value) })
                      }
                      className="w-full accent-sky-400"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Densidade de Pedestres</span>
                      <span className="font-mono-num text-slate-200">
                        {Math.round(timeConfig.pedestrianDensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.1}
                      value={timeConfig.pedestrianDensity}
                      onChange={(e) =>
                        setTimeConfig({ pedestrianDensity: Number(e.target.value) })
                      }
                      className="w-full accent-sky-400"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Intensidade do Tráfego</span>
                      <span className="font-mono-num text-slate-200">
                        {Math.round(timeConfig.trafficIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.1}
                      value={timeConfig.trafficIntensity}
                      onChange={(e) =>
                        setTimeConfig({ trafficIntensity: Number(e.target.value) })
                      }
                      className="w-full accent-sky-400"
                    />
                  </label>

                  <label className="block space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Velocidade da Câmera</span>
                      <span className="font-mono-num text-slate-200">
                        {timeConfig.cameraSpeed.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={2.0}
                      step={0.1}
                      value={timeConfig.cameraSpeed}
                      onChange={(e) => setTimeConfig({ cameraSpeed: Number(e.target.value) })}
                      className="w-full accent-sky-400"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-slate-200">Construção Instantânea (Criativo)</span>
                    <input
                      type="checkbox"
                      checked={timeConfig.creativeInstantBuild}
                      onChange={(e) =>
                        setTimeConfig({ creativeInstantBuild: e.target.checked })
                      }
                      className="accent-amber-400"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer">
                    <span className="text-slate-200">Modo Diagnóstico 3D (Grafos)</span>
                    <input
                      type="checkbox"
                      checked={timeConfig.debugOverlay}
                      onChange={(e) => setTimeConfig({ debugOverlay: e.target.checked })}
                      className="accent-emerald-400"
                    />
                  </label>
                </div>
              </section>

              {/* Procedural Ambient Audio */}
              <section className="bg-slate-950 border border-slate-800 rounded p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    Áudio Ambiente Urbano (Procedural)
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-[11px] text-slate-400">
                      {timeConfig.ambientAudioEnabled ? 'Ativo' : 'Silenciado'}
                    </span>
                    <input
                      type="checkbox"
                      checked={timeConfig.ambientAudioEnabled}
                      onChange={(e) =>
                        setTimeConfig({ ambientAudioEnabled: e.target.checked })
                      }
                      className="accent-emerald-400"
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Volume do Ambiente</span>
                    <span className="font-mono-num text-slate-200">
                      {Math.round(timeConfig.ambientVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={timeConfig.ambientVolume}
                    onChange={(e) => setTimeConfig({ ambientVolume: Number(e.target.value) })}
                    className="w-full accent-emerald-400"
                  />
                </label>
              </section>

              {/* Graphics Quality Section */}
              <section className="space-y-2.5">
                <div className="bg-slate-950 border border-slate-800 rounded p-3 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Placa / Renderizador WebGL:</span>
                    <span className="text-slate-200 font-medium truncate max-w-[260px]">
                      {gpuCaps.gpuRenderer}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Perfil Recomendado:</span>
                    <span className="text-emerald-400 font-semibold uppercase">
                      {recommendedQuality}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'low',
                        title: 'Baixa',
                        desc: 'Prioriza fluidez máxima. Sombras simples, 512px, sem vento.',
                      },
                      {
                        id: 'medium',
                        title: 'Média',
                        desc: 'Equilíbrio urbano: sombras 1024px, vento na vegetação e água.',
                      },
                      {
                        id: 'high',
                        title: 'Alta',
                        desc: 'Texturas 1024px, sombras suaves 2048px, vegetação densa.',
                      },
                      {
                        id: 'ultra',
                        title: 'Ultra',
                        desc: 'Sombras 4096px + Bloom seletivo e pós-processamento (GPU dedicada).',
                      },
                    ] as { id: GraphicsQuality; title: string; desc: string }[]
                  ).map((opt) => {
                    const active = graphicsQuality === opt.id;
                    const prof = getQualityProfile(opt.id, gpuCaps.isSoftwareGl);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setGraphicsQuality(opt.id);
                          showToast(`Qualidade gráfica alterada para ${opt.title}.`, 'success');
                        }}
                        className={`text-left p-3 rounded border transition-colors ${
                          active
                            ? 'bg-amber-500/15 border-amber-400'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-sm text-white">
                            {opt.title}
                          </span>
                          {opt.id === recommendedQuality && (
                            <span className="text-[10px] text-emerald-400 font-medium">
                              Recomendado
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">{opt.desc}</p>
                        <div className="mt-2 text-[10px] font-mono-num text-slate-500">
                          Tex {prof.textureSize}px · Sombra {prof.shadowsEnabled ? `${prof.shadowMapSize}px` : 'Off'}
                          {prof.enablePostProcessing ? ' · Bloom' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {gpuCaps.isSoftwareGl && (
                  <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-800/70 rounded p-2.5">
                    Modo de compatibilidade WebGL por software detectado: pós-processamento pesado e sombras caras são desativados automaticamente para manter a cidade estável.
                  </p>
                )}
              </section>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONFIRMED DEMOLITION MODAL */}
      {pendingDemolition && (() => {
        const targetTile = getTile(tiles, pendingDemolition.x, pendingDemolition.z);
        const targetDef = targetTile?.building ? BUILDING_CATALOG[targetTile.building.type] : null;
        const targetLabel = targetDef
          ? targetDef.name
          : targetTile?.road === 'avenida'
          ? 'Avenida Urbana'
          : targetTile?.road === 'rua'
          ? 'Rua Local'
          : 'Estrutura';
        const refund = targetDef ? Math.round(targetDef.cost * 0.25) : 1000;
        return (
          <div className="fixed inset-0 z-50 bg-[#283B49]/70 flex items-center justify-center p-4 pointer-events-auto">
            <div className="max-w-md w-full bg-[#F2F0E8] border border-[#CBC5B5] rounded-lg shadow-2xl overflow-hidden text-[#283B49]">
              <div className="px-5 py-3.5 bg-[#283B49] text-[#F2F0E8] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-[#D2A97B]" />
                  <h3 className="font-display text-sm font-bold">
                    Confirmar Demolição · Lote ({pendingDemolition.x}, {pendingDemolition.z})
                  </h3>
                </div>
                <button onClick={cancelDemolition} className="text-[#D2A97B] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4 text-xs">
                <p className="leading-relaxed">
                  Deseja realmente demolir <strong>{targetLabel}</strong> no lote ({pendingDemolition.x}, {pendingDemolition.z})?
                </p>
                <div className="bg-[#E6E2D6] border border-[#CBC5B5] rounded p-3 flex items-center justify-between">
                  <span className="text-[#536877]">Reaproveitamento de materiais:</span>
                  <span className="font-mono-num font-bold text-[#496B57]">
                    +R$ {refund.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelDemolition}
                    className="flex-1 py-2 rounded bg-[#E6E2D6] border border-[#CBC5B5] hover:border-[#283B49] font-semibold"
                  >
                    Cancelar (Esc)
                  </button>
                  <button
                    onClick={confirmDemolition}
                    className="flex-1 py-2 rounded bg-[#B43B3B] hover:bg-[#992E2E] text-[#F2F0E8] font-semibold"
                  >
                    Confirmar Demolição
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};
