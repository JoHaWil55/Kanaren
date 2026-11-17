import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  Check,
  Clock,
  CloudRain,
  Compass,
  Edit3,
  ExternalLink,
  Footprints,
  Globe,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Wind,
} from 'lucide-react';
import {
  BikeRentalStation,
  CruiseStop,
  Excursion,
  PortResearchResult,
  PortWeather,
} from '../types';
import {
  fetchPortWeather,
  runLivePortResearch,
  searchRealBikeRentals,
} from '../services/apiClient';
import { offlineDb } from '../services/offlineDb';
import { calculateSafetySchedule, formatDurationGerman } from '../utils/timeSafety';
import { PortMapView } from './PortMapView';
import { VerificationLabel } from './VerificationBadge';

interface PortDetailViewProps {
  stops: CruiseStop[];
  selectedStop: CruiseStop;
  onSelectStop: (stop: CruiseStop) => void;
  onUpdateStopTimes: (stopId: string, arrival: string | null, departure: string | null) => void;
  onResetStopTimes: (stopId: string) => void;
  excursions: Excursion[];
  mapsApiKey: string;
  isOnline: boolean;
  onSelectExcursion: (excursion: Excursion) => void;
  onExcursionUpdated: (updated: Excursion) => void;
  onAskAdvisorAboutPort: (stop: CruiseStop, promptText?: string) => void;
}

export const PortDetailView: React.FC<PortDetailViewProps> = ({
  stops,
  selectedStop,
  onSelectStop,
  onUpdateStopTimes,
  onResetStopTimes,
  excursions,
  mapsApiKey,
  isOnline,
  onSelectExcursion,
  onExcursionUpdated,
  onAskAdvisorAboutPort,
}) => {
  const [editingTimes, setEditingTimes] = useState(false);
  const [arrInput, setArrInput] = useState(selectedStop.arrivalTime || '');
  const [depInput, setDepInput] = useState(selectedStop.departureTime || '');

  const [weather, setWeather] = useState<PortWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [bikeRentals, setBikeRentals] = useState<BikeRentalStation[]>([]);
  const [bikeSearched, setBikeSearched] = useState(false);
  const [bikeLoading, setBikeLoading] = useState(false);
  const [bikeError, setBikeError] = useState<string | null>(null);

  const [research, setResearch] = useState<PortResearchResult | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const [showMapPanel, setShowMapPanel] = useState(false);

  useEffect(() => {
    setEditingTimes(false);
    setArrInput(selectedStop.arrivalTime || '');
    setDepInput(selectedStop.departureTime || '');
    setBikeError(null);
    setResearchError(null);
    setWeatherError(null);

    let cancelled = false;

    const loadCachedAndFresh = async () => {
      const [cachedW, cachedBikes, cachedRes] = await Promise.all([
        offlineDb.getWeather(selectedStop.id),
        offlineDb.getBikeRentals(selectedStop.id),
        offlineDb.getPortResearch(selectedStop.id),
      ]);

      if (!cancelled) {
        setWeather(cachedW || null);
        setBikeRentals(cachedBikes?.stations || []);
        setBikeSearched(Boolean(cachedBikes));
        setResearch(cachedRes || null);
      }

      if (isOnline && !selectedStop.isSeaDay) {
        setWeatherLoading(true);
        try {
          const freshWeather = await fetchPortWeather(selectedStop);
          if (!cancelled) {
            setWeather(freshWeather);
            void offlineDb.saveWeather(freshWeather);
          }
        } catch (err) {
          if (!cancelled) {
            setWeatherError(
              err instanceof Error ? err.message : 'Aktuelle Wetterdaten konnten nicht geladen werden.'
            );
          }
        } finally {
          if (!cancelled) setWeatherLoading(false);
        }
      }
    };

    void loadCachedAndFresh();
    return () => {
      cancelled = true;
    };
  }, [selectedStop, isOnline]);

  const handleSaveTimes = () => {
    const cleanArr = arrInput.trim() ? arrInput.trim() : null;
    const cleanDep = depInput.trim() ? depInput.trim() : null;
    onUpdateStopTimes(selectedStop.id, cleanArr, cleanDep);
    setEditingTimes(false);
  };

  const handleSearchBikes = async () => {
    if (!isOnline) {
      setBikeError('Keine Internetverbindung. Für die Live-Suche nach Fahrradverleihern ist Internet nötig.');
      return;
    }
    setBikeLoading(true);
    setBikeError(null);
    try {
      const stations = await searchRealBikeRentals(selectedStop);
      setBikeRentals(stations);
      setBikeSearched(true);
      await offlineDb.saveBikeRentals(selectedStop.id, stations);
    } catch (err) {
      setBikeError(
        err instanceof Error ? err.message : 'Fahrradverleih-Suche derzeit nicht erreichbar.'
      );
    } finally {
      setBikeLoading(false);
    }
  };

  const handleRunResearch = async () => {
    if (!isOnline) {
      setResearchError('Keine Internetverbindung. Live-Recherche erfordert Internet.');
      return;
    }
    setResearchLoading(true);
    setResearchError(null);
    try {
      const result = await runLivePortResearch(selectedStop);
      setResearch(result);
      await offlineDb.savePortResearch(result);
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : 'Live-Recherche fehlgeschlagen.');
    } finally {
      setResearchLoading(false);
    }
  };

  const portExcursions = excursions.filter((e) => e.portId === selectedStop.id);

  return (
    <div className="space-y-6 pb-6">
      {/* Horizontal Port Selector */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {stops.map((s) => {
          const isActive = s.id === selectedStop.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStop(s)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium transition whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-[#0B5D7A] text-white border-[#0B5D7A]'
                  : 'bg-white text-[#142634] border-[#E2DDD2] hover:bg-[#EFECE4]'
              }`}
            >
              <span>{s.dateDisplay.slice(0, 5)} · {s.island}</span>
            </button>
          );
        })}
      </div>

      {/* Port Hero Header & Editable Berth Times */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[#E2DDD2]">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-5 relative aspect-[4/3] lg:aspect-auto bg-[#DFD8CA]">
            <img
              src={selectedStop.heroImage}
              alt={`${selectedStop.portName}, ${selectedStop.island}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#526473] tabular-nums">
                <span>Tag {selectedStop.dayNumber}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedStop.dateDisplay}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedStop.terminalName}</span>
              </div>
              <h1 className="mt-1.5 text-2xl font-bold text-[#142634]">
                {selectedStop.island}: {selectedStop.portName}
              </h1>
              <p className="mt-2 text-sm text-[#324656] leading-relaxed">
                {selectedStop.harborInfo}
              </p>
            </div>

            {/* Berth Times + Inline Editor */}
            <div className="rounded-xl bg-[#F7F6F2] border border-[#E2DDD2] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#142634]">
                  <Clock className="w-4 h-4 text-[#0B5D7A]" />
                  <span>
                    {selectedStop.isSeaDay
                      ? 'Seetag ohne Hafenanlauf'
                      : `Liegezeit: ${selectedStop.arrivalTime ? `Ankunft ${selectedStop.arrivalTime} Uhr` : 'Einschiffung'} · ${selectedStop.departureTime ? `Abfahrt ${selectedStop.departureTime} Uhr` : 'Ausschiffung'}`}
                  </span>
                </div>
                {!selectedStop.isSeaDay && (
                  <button
                    type="button"
                    onClick={() => setEditingTimes((v) => !v)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-[#0B5D7A] hover:bg-white inline-flex items-center gap-1.5 transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{editingTimes ? 'Abbrechen' : 'Liegezeit bearbeiten'}</span>
                  </button>
                )}
              </div>

              {editingTimes && (
                <div className="pt-2 border-t border-[#E2DDD2] grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <label className="text-xs text-[#526473] block">
                    Ankunft (HH:MM)
                    <input
                      type="time"
                      value={arrInput}
                      onChange={(e) => setArrInput(e.target.value)}
                      className="mt-1 w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D9D2C5] bg-white text-sm text-[#142634] tabular-nums"
                    />
                  </label>
                  <label className="text-xs text-[#526473] block">
                    Abfahrt (HH:MM)
                    <input
                      type="time"
                      value={depInput}
                      onChange={(e) => setDepInput(e.target.value)}
                      className="mt-1 w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D9D2C5] bg-white text-sm text-[#142634] tabular-nums"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTimes}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#0B5D7A] text-white text-xs font-medium inline-flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Speichern</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onResetStopTimes(selectedStop.id);
                        setEditingTimes(false);
                      }}
                      title="Auf Standardzeiten zurücksetzen"
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-[#D9D2C5] bg-white text-[#526473] flex items-center justify-center"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-[#526473]">
                Hinweis: Die verbindlichen Zeiten vor Reiseantritt anhand der AIDA-Reiseunterlagen kontrollieren.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Weather & Suitability Section */}
      {!selectedStop.isSeaDay && (
        <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#142634]">
                Wetter &amp; Ausflugseignung
              </h2>
              <p className="text-xs text-[#526473] mt-0.5">
                {weather
                  ? `${weather.isForecastForCruiseDate ? `Vorhersage für ${weather.forecastDateLabel}` : `Aktuelles Hafenwetter (${weather.forecastDateLabel})`} · Quelle: ${weather.sourceName}`
                  : 'Wetterdaten für Hafenbereich'}
              </p>
            </div>
            {weatherLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#526473]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Aktualisiere…</span>
              </span>
            )}
          </div>

          {weatherError && !weather && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              {weatherError}
            </div>
          )}

          {weather && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="text-xs text-[#526473]">Temperatur</p>
                  <p className="text-xl font-bold text-[#142634] tabular-nums mt-0.5">
                    {weather.currentTempC} °C
                  </p>
                  <p className="text-xs text-[#324656] mt-0.5">{weather.weatherLabel}</p>
                </div>
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="text-xs text-[#526473] flex items-center gap-1">
                    <CloudRain className="w-3.5 h-3.5 text-[#0B5D7A]" />
                    <span>Regenrisiko</span>
                  </p>
                  <p className="text-xl font-bold text-[#142634] tabular-nums mt-0.5">
                    {weather.precipProbMax} %
                  </p>
                  <p className="text-xs text-[#324656] mt-0.5">Tagesmaximum</p>
                </div>
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="text-xs text-[#526473] flex items-center gap-1">
                    <Wind className="w-3.5 h-3.5 text-[#0B5D7A]" />
                    <span>Wind</span>
                  </p>
                  <p className="text-xl font-bold text-[#142634] tabular-nums mt-0.5">
                    {weather.windSpeedKmh} km/h
                  </p>
                  <p className="text-xs text-[#324656] mt-0.5 tabular-nums">
                    Böen bis {weather.windGustsKmh} km/h
                  </p>
                </div>
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="text-xs text-[#526473]">Rad-Empfehlung</p>
                  <p
                    className={`text-sm font-semibold mt-1 ${
                      weather.cyclingAdvice.level === 'abgeraten'
                        ? 'text-red-700'
                        : weather.cyclingAdvice.level === 'eingeschraenkt'
                        ? 'text-[#B45309]'
                        : 'text-[#1E7A6D]'
                    }`}
                  >
                    {weather.cyclingAdvice.level === 'abgeraten'
                      ? 'Nicht empfohlen'
                      : weather.cyclingAdvice.level === 'eingeschraenkt'
                      ? 'Eingeschränkt'
                      : 'Gut geeignet'}
                  </p>
                  <p className="text-xs text-[#324656] mt-0.5 line-clamp-2">
                    {weather.cyclingAdvice.level === 'abgeraten'
                      ? 'Spaziergang bevorzugen'
                      : 'Küstenwege prüfbar'}
                  </p>
                </div>
              </div>

              {/* Hourly development bar */}
              {weather.hourlyWindow.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[#526473] mb-2">
                    Wetterentwicklung während des Landgangs
                  </p>
                  <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-1">
                    {weather.hourlyWindow.map((h) => (
                      <div
                        key={h.timeISO}
                        className="min-w-[82px] rounded-xl border border-[#EFECE4] bg-[#F7F6F2] px-2.5 py-2 text-center text-xs tabular-nums shrink-0"
                      >
                        <p className="font-semibold text-[#142634]">{h.hourLabel}</p>
                        <p className="text-sm font-bold text-[#0B5D7A] mt-0.5">{h.tempC} °C</p>
                        <p className="text-[11px] text-[#526473] mt-0.5">
                          {h.windKmh} km/h
                        </p>
                        <p className="text-[11px] text-[#526473]">{h.precipProb}% Regen</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(weather.cyclingAdvice.level === 'abgeraten' || !weather.walkingAdvice.suitable) && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-sm text-amber-950">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
                    <span>
                      {weather.cyclingAdvice.level === 'abgeraten'
                        ? weather.cyclingAdvice.message
                        : weather.walkingAdvice.message}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAdvisorAboutPort(
                        selectedStop,
                        `Das Wetter in ${selectedStop.portName} (${selectedStop.island}) zeigt ${weather.currentTempC} °C, ${weather.weatherLabel}, Wind bis ${weather.windSpeedKmh} km/h und ${weather.precipProbMax}% Regenrisiko. Welche wetterangepassten Ausflüge zu Fuß empfiehlst du?`
                      )
                    }
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#B45309] text-white text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    Alternativen mit KI finden
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Curated Excursion Proposals */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#142634]">
              Ausflugsvorschläge für {selectedStop.island}
            </h2>
            <p className="text-xs text-[#526473] mt-0.5">
              Max. 3 Std. Gesamtdauer · Zu Fuß oder gemütliches Leihfahrrad · Start &amp; Ziel am Terminal
            </p>
          </div>
          {!selectedStop.isSeaDay && (
            <button
              type="button"
              onClick={() => setShowMapPanel((v) => !v)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D9D2C5] bg-white text-sm font-medium text-[#142634] hover:bg-[#EFECE4] transition"
            >
              {showMapPanel ? 'Hafenkarte ausblenden' : 'Hafenkarte anzeigen'}
            </button>
          )}
        </div>

        {showMapPanel && !selectedStop.isSeaDay && (
          <PortMapView
            mapsApiKey={mapsApiKey}
            isOnline={isOnline}
            stop={selectedStop}
            excursions={portExcursions}
            selectedExcursion={portExcursions[0] || null}
            onSelectExcursion={onSelectExcursion}
            onExcursionUpdated={onExcursionUpdated}
          />
        )}

        {portExcursions.length === 0 ? (
          <div className="rounded-2xl border border-[#E2DDD2] bg-white p-6 text-sm text-[#526473]">
            Für diesen Tag sind keine Landgänge vorgesehen. Nutze den KI-Reiseberater, um deine nächsten Hafenstopps vorzubereiten.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portExcursions.map((exc) => {
              const safety = calculateSafetySchedule(selectedStop, exc);
              const windWarning =
                exc.mode === 'BICYCLE' && weather?.cyclingAdvice.level === 'abgeraten';

              return (
                <button
                  key={exc.id}
                  type="button"
                  onClick={() => onSelectExcursion(exc)}
                  className="text-left rounded-2xl border border-[#E2DDD2] bg-white overflow-hidden hover:border-[#0B5D7A] transition flex flex-col justify-between group"
                >
                  <div>
                    <div className="relative aspect-[16/9] bg-[#DFD8CA]">
                      <img
                        src={exc.image}
                        alt={exc.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-[#526473] tabular-nums">
                        {exc.mode === 'BICYCLE' ? (
                          <Bike className="w-3.5 h-3.5 text-[#0B5D7A]" />
                        ) : (
                          <Footprints className="w-3.5 h-3.5 text-[#0B5D7A]" />
                        )}
                        <span>{exc.mode === 'BICYCLE' ? 'Leihfahrrad' : 'Zu Fuß'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{exc.distanceKm.toFixed(1).replace('.', ',')} km</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDurationGerman(exc.totalDurationMinutes)}</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#142634] leading-snug">
                        {exc.title}
                      </h3>
                      <p className="text-xs text-[#526473] line-clamp-2">{exc.subtitle}</p>
                      {windWarning && (
                        <p className="text-xs font-medium text-red-700 pt-1">
                          Windhinweis: Aktuell eher Spaziergang statt Radtour empfohlen.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3 border-t border-[#EFECE4] flex items-center justify-between text-xs tabular-nums">
                    <span
                      className={
                        safety.status === 'kritisch'
                          ? 'text-red-700 font-medium'
                          : safety.status === 'knapp'
                          ? 'text-[#B45309] font-medium'
                          : 'text-[#1E7A6D] font-medium'
                      }
                    >
                      Rückkehr ca. {safety.estimatedReturnTime} Uhr
                    </span>
                    <VerificationLabel status={exc.distanceStatus} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Real Bike Rental Live Search Section */}
      {!selectedStop.isSeaDay && (
        <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#142634] flex items-center gap-2">
                <Bike className="w-4 h-4 text-[#0B5D7A]" />
                <span>Fahrradverleih in Hafennähe (Live-Suche)</span>
              </h2>
              <p className="text-xs text-[#526473] mt-0.5">
                {selectedStop.cyclingFriendlyNote}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSearchBikes()}
              disabled={bikeLoading || !isOnline}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65] disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0 transition"
            >
              {bikeLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>{bikeSearched ? 'Verleiher aktualisieren' : 'Reale Verleiher suchen'}</span>
            </button>
          </div>

          {bikeError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              {bikeError}
            </div>
          )}

          {!bikeSearched && !bikeLoading && (
            <p className="text-sm text-[#526473]">
              Es werden ausschließlich real existierende Anbieter über Google Places geladen – keine erfundenen Stationen. Tippe auf „Reale Verleiher suchen“, um aktuelle Stationen rund um {selectedStop.portName} abzurufen.
            </p>
          )}

          {bikeSearched && bikeRentals.length === 0 && !bikeError && (
            <div className="rounded-xl bg-[#F7F6F2] border border-[#E2DDD2] p-4 text-sm text-[#324656]">
              Kein geeigneter Fahrradverleih in unmittelbarer Hafennähe gefunden. Wir empfehlen für {selectedStop.island} einen der entspannten Spaziergänge direkt ab Terminal.
            </div>
          )}

          {bikeRentals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bikeRentals.map((station) => (
                <div
                  key={station.id}
                  className="rounded-xl border border-[#E2DDD2] bg-[#F7F6F2] p-4 space-y-2.5 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-[#142634]">{station.name}</h3>
                      <p className="text-xs text-[#526473] mt-0.5">
                        {station.distanceFromTerminalText}
                      </p>
                    </div>
                    <VerificationLabel status={station.sourceStatus} />
                  </div>

                  <p className="text-xs text-[#324656] flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#0B5D7A]" />
                    <span>{station.address}</span>
                  </p>

                  <div className="text-xs text-[#324656] space-y-1">
                    <p>
                      <strong>Öffnungszeiten:</strong> {station.openingHours}{' '}
                      <VerificationLabel status={station.openingHoursStatus} className="ml-1" />
                    </p>
                    <p className="flex items-center gap-1.5 flex-wrap">
                      <Phone className="w-3.5 h-3.5 text-[#0B5D7A]" />
                      <span>{station.phone}</span>
                      <VerificationLabel status={station.phoneStatus} />
                    </p>
                    <p className="flex items-center gap-1.5 flex-wrap">
                      <Globe className="w-3.5 h-3.5 text-[#0B5D7A]" />
                      {station.websiteStatus === 'verifiziert' ? (
                        <a
                          href={station.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0B5D7A] hover:underline truncate max-w-[220px]"
                        >
                          {station.website}
                        </a>
                      ) : (
                        <span>{station.website}</span>
                      )}
                      <VerificationLabel status={station.websiteStatus} />
                    </p>
                    <p>
                      <strong>Fahrradtypen:</strong> {station.bikeTypes.join(', ')}
                    </p>
                    <p>
                      <strong>Mietpreise:</strong> {station.priceEstimate}{' '}
                      <VerificationLabel status={station.priceStatus} className="ml-1" />
                    </p>
                  </div>

                  {station.googleMapsUri && (
                    <a
                      href={station.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0B5D7A] hover:underline pt-1"
                    >
                      <span>Eintrag auf Google Maps ansehen</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Live Gemini Search Grounding Research */}
      {!selectedStop.isSeaDay && (
        <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#142634] flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#0B5D7A]" />
                <span>Aktuelle Internetrecherche für {selectedStop.portName}</span>
              </h2>
              <p className="text-xs text-[#526473] mt-0.5">
                Prüft mit Gemini &amp; Google-Suche Öffnungszeiten, Eintrittspreise, Wegeverhältnisse und Baustellen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRunResearch()}
              disabled={researchLoading || !isOnline}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#0B5D7A] text-[#0B5D7A] text-sm font-medium hover:bg-[#0B5D7A]/5 disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0 transition"
            >
              {researchLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{research ? 'Recherche aktualisieren' : 'Live recherchieren'}</span>
            </button>
          </div>

          {researchError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              {researchError}
            </div>
          )}

          {research && (
            <div className="space-y-4 pt-2 border-t border-[#EFECE4]">
              <p className="text-sm text-[#324656] leading-relaxed">{research.summary}</p>

              {research.highlights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {research.highlights.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#E2DDD2] bg-[#F7F6F2] p-3.5 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-[#142634]">{item.name}</p>
                        <VerificationLabel status={item.status} />
                      </div>
                      <p className="text-[#324656]">{item.detail}</p>
                      <p className="text-[#526473]">
                        <strong>Öffnungszeiten:</strong> {item.openingHours}
                      </p>
                      <p className="text-[#526473]">
                        <strong>Eintritt:</strong> {item.entryFee}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="font-semibold text-[#142634]">Wegeverhältnisse &amp; Baustellen</p>
                  <p className="text-[#324656] mt-1">{research.pathAndConstructionNote}</p>
                </div>
                <div className="rounded-xl bg-[#F7F6F2] p-3.5">
                  <p className="font-semibold text-[#142634]">Fahrradverleih-Hinweis</p>
                  <p className="text-[#324656] mt-1">{research.bikeRentalNote}</p>
                </div>
              </div>

              {research.sources.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#526473] mb-1.5">Recherchierte Quellen:</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {research.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0B5D7A] hover:underline inline-flex items-center gap-1"
                      >
                        <span>{src.title}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
