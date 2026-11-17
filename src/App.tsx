import React, { useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  Bookmark,
  Compass,
  Home,
  Map as MapIcon,
  MessageSquareText,
  WifiOff,
} from 'lucide-react';
import { AdvisorChatView } from './components/AdvisorChatView';
import { ExcursionDetailView } from './components/ExcursionDetailView';
import { HomeView } from './components/HomeView';
import { PortDetailView } from './components/PortDetailView';
import { PortMapView } from './components/PortMapView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SavedListView } from './components/SavedListView';
import { DEFAULT_CRUISE_STOPS, MAIN_DAY_PORT_IDS } from './data/cruiseData';
import { CURATED_EXCURSIONS } from './data/excursions';
import { useOnlineStatus } from './hooks/usePWA';
import { fetchMapsRuntimeConfig } from './services/apiClient';
import { offlineDb } from './services/offlineDb';
import { CruiseStop, Excursion, MainTab } from './types';

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [stops, setStops] = useState<CruiseStop[]>(DEFAULT_CRUISE_STOPS);
  const [selectedPortId, setSelectedPortId] = useState<string>('la-gomera');
  const [excursions, setExcursions] = useState<Excursion[]>(CURATED_EXCURSIONS);
  const [savedExcursions, setSavedExcursions] = useState<Excursion[]>([]);
  const [detailExcursion, setDetailExcursion] = useState<Excursion | null>(null);
  const [mapExcursion, setMapExcursion] = useState<Excursion | null>(null);
  const [discussedExcursion, setDiscussedExcursion] = useState<Excursion | null>(null);
  const [advisorInitialPrompt, setAdvisorInitialPrompt] = useState<string | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Listen for Google Maps quota / auth events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Hydrate persisted stops, saved excursions, cached route calculations & Maps runtime config
  useEffect(() => {
    let active = true;
    const init = async () => {
      const [loadedStops, loadedSaved, loadedCached] = await Promise.all([
        offlineDb.loadCruiseStops(DEFAULT_CRUISE_STOPS),
        offlineDb.getSavedExcursions(),
        offlineDb.getCachedExcursions(),
      ]);

      if (!active) return;
      setStops(loadedStops);
      setSavedExcursions(loadedSaved);

      if (loadedCached.length > 0) {
        const cachedById: Record<string, Excursion> = {};
        for (const c of loadedCached) cachedById[c.id] = c;
        setExcursions((prev) => prev.map((item) => cachedById[item.id] || item));
      }

      if (!mapsApiKey) {
        const cfg = await fetchMapsRuntimeConfig();
        if (active && cfg.apiKey) {
          setMapsApiKey(cfg.apiKey);
        }
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, [mapsApiKey]);

  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedPortId) || stops[1],
    [stops, selectedPortId]
  );

  // Determine next upcoming port based on current date, defaulting to first day destination (La Gomera)
  const nextPort = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const upcoming = stops.find(
      (s) => !s.isSeaDay && !s.isEmbarkationOnly && s.dateISO >= todayISO
    );
    return upcoming || stops.find((s) => s.id === 'la-gomera') || stops[0];
  }, [stops]);

  const savedIds = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of savedExcursions) map[s.id] = true;
    return map;
  }, [savedExcursions]);

  const handleUpdateStopTimes = async (
    stopId: string,
    arrivalTime: string | null,
    departureTime: string | null
  ) => {
    const updated = stops.map((s) =>
      s.id === stopId ? { ...s, arrivalTime, departureTime } : s
    );
    setStops(updated);
    const target = updated.find((s) => s.id === stopId);
    if (target) await offlineDb.saveCruiseStop(target);
  };

  const handleResetStopTimes = async (stopId: string) => {
    const def = DEFAULT_CRUISE_STOPS.find((s) => s.id === stopId);
    if (!def) return;
    setStops((prev) => prev.map((s) => (s.id === stopId ? def : s)));
    await offlineDb.saveCruiseStop(def);
  };

  const handleToggleSaveExcursion = async (excursion: Excursion) => {
    if (savedIds[excursion.id]) {
      setSavedExcursions((prev) => prev.filter((e) => e.id !== excursion.id));
      await offlineDb.removeSavedExcursion(excursion.id);
    } else {
      setSavedExcursions((prev) => [...prev, excursion]);
      await offlineDb.saveExcursion(excursion);
    }
  };

  const handleExcursionUpdated = async (updated: Excursion) => {
    setExcursions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setDetailExcursion((prev) => (prev?.id === updated.id ? updated : prev));
    setMapExcursion((prev) => (prev?.id === updated.id ? updated : prev));
    if (savedIds[updated.id]) {
      setSavedExcursions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      await offlineDb.saveExcursion(updated);
    }
    await offlineDb.cacheExcursion(updated);
  };

  const openPort = (stop: CruiseStop) => {
    setSelectedPortId(stop.id);
    setDetailExcursion(null);
    setActiveTab('ports');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openExcursionDetail = (excursion: Excursion) => {
    setSelectedPortId(excursion.portId);
    setDetailExcursion(excursion);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openExcursionOnMap = (excursion: Excursion) => {
    setSelectedPortId(excursion.portId);
    setMapExcursion(excursion);
    setDetailExcursion(null);
    setActiveTab('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const discussExcursionWithAI = (excursion: Excursion) => {
    setSelectedPortId(excursion.portId);
    setDiscussedExcursion(excursion);
    setDetailExcursion(null);
    setAdvisorInitialPrompt(
      `Bitte bewerte für uns den Ausflug „${excursion.title}“ (${excursion.mode === 'BICYCLE' ? 'Leihfahrrad' : 'zu Fuß'}, ca. ${excursion.distanceKm.toFixed(1).replace('.', ',')} km, ${excursion.totalDurationMinutes} Min.). Passt er zu unserer Liegezeit und gibt es aktuelle Hinweise oder Alternativen?`
    );
    setActiveTab('advisor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const askAdvisorAboutPort = (stop: CruiseStop, promptText?: string) => {
    setSelectedPortId(stop.id);
    setDiscussedExcursion(null);
    if (promptText) setAdvisorInitialPrompt(promptText);
    setActiveTab('advisor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const mapPorts = useMemo(
    () => stops.filter((s) => MAIN_DAY_PORT_IDS.includes(s.id) || s.id === 'gran-canaria-start'),
    [stops]
  );

  const mapStop = useMemo(
    () => mapPorts.find((s) => s.id === selectedPortId) || mapPorts[1] || mapPorts[0],
    [mapPorts, selectedPortId]
  );

  const mapPortExcursions = useMemo(
    () => excursions.filter((e) => e.portId === mapStop.id),
    [excursions, mapStop.id]
  );

  const navItems: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: 'Startseite', icon: <Home className="w-5 h-5" /> },
    { id: 'ports', label: 'Häfen', icon: <Anchor className="w-5 h-5" /> },
    { id: 'map', label: 'Karte', icon: <MapIcon className="w-5 h-5" /> },
    { id: 'advisor', label: 'KI-Berater', icon: <MessageSquareText className="w-5 h-5" /> },
    { id: 'saved', label: 'Merkliste', icon: <Bookmark className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#142634]">
      {/* Demo Key Quota Banner (Case A Requirement) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation Bar (Strict 3-Zone Contract on Desktop, Compact <= 48px on Mobile) */}
      <header className="sticky top-0 z-30 bg-[#F7F6F2]/95 backdrop-blur-md border-b border-[#E2DDD2]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 md:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setDetailExcursion(null);
              setActiveTab('home');
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-[#142634] whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Compass className="w-5 h-5 text-[#0B5D7A] shrink-0" />
            <span>Kanaren Entdecker</span>
          </button>

          {/* Zone 2: 5 single-line text nav links (Desktop) */}
          <nav aria-label="Hauptnavigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-[#526473]">
            {navItems.map((item) => {
              const isActive = !detailExcursion && activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDetailExcursion(null);
                    setActiveTab(item.id);
                  }}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    isActive
                      ? 'text-[#0B5D7A] border-[#0B5D7A] font-semibold'
                      : 'border-transparent hover:text-[#142634]'
                  }`}
                >
                  {item.label}
                  {item.id === 'saved' && savedExcursions.length > 0
                    ? ` (${savedExcursions.length})`
                    : ''}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Non-intrusive Offline Bar */}
      {!isOnline && (
        <div className="bg-[#EFECE4] border-b border-[#D9D2C5] px-4 py-1.5 text-xs text-[#324656]">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
            <span>
              Offline-Modus: Gespeicherte Ausflüge, Wegpunkte und Liegezeiten sind weiterhin nutzbar.
            </span>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        {detailExcursion ? (
          <ExcursionDetailView
            stop={stops.find((s) => s.id === detailExcursion.portId) || selectedStop}
            excursion={detailExcursion}
            isSaved={Boolean(savedIds[detailExcursion.id])}
            isOnline={isOnline}
            onBack={() => setDetailExcursion(null)}
            onToggleSave={(exc) => void handleToggleSaveExcursion(exc)}
            onOpenOnMap={openExcursionOnMap}
            onDiscussWithAI={discussExcursionWithAI}
            onExcursionUpdated={(upd) => void handleExcursionUpdated(upd)}
          />
        ) : activeTab === 'home' ? (
          <HomeView
            stops={stops}
            nextPort={nextPort}
            excursions={excursions}
            onOpenPort={openPort}
            onSelectExcursion={openExcursionDetail}
            onOpenAdvisor={() => askAdvisorAboutPort(nextPort)}
          />
        ) : activeTab === 'ports' ? (
          <PortDetailView
            stops={stops}
            selectedStop={selectedStop}
            onSelectStop={(s) => setSelectedPortId(s.id)}
            onUpdateStopTimes={(id, a, d) => void handleUpdateStopTimes(id, a, d)}
            onResetStopTimes={(id) => void handleResetStopTimes(id)}
            excursions={excursions}
            mapsApiKey={mapsApiKey}
            isOnline={isOnline}
            onSelectExcursion={openExcursionDetail}
            onExcursionUpdated={(upd) => void handleExcursionUpdated(upd)}
            onAskAdvisorAboutPort={askAdvisorAboutPort}
          />
        ) : activeTab === 'map' ? (
          <div className="space-y-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-[#142634]">
                  Kartenansicht &amp; Routenplanung
                </h1>
                <p className="text-xs text-[#526473] mt-0.5">
                  Kreuzfahrthafen, echte Fuß- und Radrouten, Zwischenziele sowie Rückweg zum Schiff.
                </p>
              </div>
              <select
                aria-label="Hafen auf der Karte wählen"
                value={mapStop.id}
                onChange={(e) => {
                  setSelectedPortId(e.target.value);
                  setMapExcursion(null);
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-[#D9D2C5] bg-white text-sm font-medium text-[#142634]"
              >
                {mapPorts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.island} – {p.portName}
                  </option>
                ))}
              </select>
            </div>

            <PortMapView
              mapsApiKey={mapsApiKey}
              isOnline={isOnline}
              stop={mapStop}
              excursions={mapPortExcursions}
              selectedExcursion={
                mapExcursion && mapExcursion.portId === mapStop.id
                  ? mapExcursion
                  : mapPortExcursions[0] || null
              }
              onSelectExcursion={(exc) => setMapExcursion(exc)}
              onExcursionUpdated={(upd) => void handleExcursionUpdated(upd)}
            />
          </div>
        ) : activeTab === 'advisor' ? (
          <AdvisorChatView
            stops={stops}
            selectedStop={selectedStop}
            onSelectStop={(s) => setSelectedPortId(s.id)}
            discussedExcursion={discussedExcursion}
            onClearDiscussedExcursion={() => setDiscussedExcursion(null)}
            initialPrompt={advisorInitialPrompt}
            onConsumeInitialPrompt={() => setAdvisorInitialPrompt(null)}
            isOnline={isOnline}
          />
        ) : (
          <SavedListView
            stops={stops}
            savedExcursions={savedExcursions}
            isOnline={isOnline}
            onSelectExcursion={openExcursionDetail}
            onOpenOnMap={openExcursionOnMap}
            onRemoveSaved={(id) => {
              const target = savedExcursions.find((e) => e.id === id);
              if (target) void handleToggleSaveExcursion(target);
            }}
          />
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar (5 Tabs, Thumb Zone, <= 60px) */}
      <nav
        aria-label="Mobile Hauptnavigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2DDD2] pb-safe"
      >
        <div className="grid grid-cols-5 h-[58px] items-center">
          {navItems.map((item) => {
            const isActive = !detailExcursion && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDetailExcursion(null);
                  setActiveTab(item.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-[#0B5D7A] font-semibold' : 'text-[#526473]'
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {item.id === 'saved' && savedExcursions.length > 0 && (
                    <span className="absolute -top-1 -right-2 text-[9px] font-bold text-[#0B5D7A] tabular-nums">
                      {savedExcursions.length}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[68px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
