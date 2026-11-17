import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Bookmark,
  BookmarkCheck,
  Clock,
  ExternalLink,
  Footprints,
  Loader2,
  Map as MapIcon,
  MessageSquareText,
  Mountain,
  Navigation,
  ShieldCheck,
} from 'lucide-react';
import { CruiseStop, Excursion } from '../types';
import {
  buildGoogleMapsExcursionUrl,
  calculateSafetySchedule,
  formatDurationGerman,
  getSuggestedStartTime,
} from '../utils/timeSafety';
import { computeLiveRoute } from '../services/apiClient';
import { VerificationLabel } from './VerificationBadge';

interface ExcursionDetailViewProps {
  stop: CruiseStop;
  excursion: Excursion;
  isSaved: boolean;
  isOnline: boolean;
  onBack: () => void;
  onToggleSave: (excursion: Excursion) => void;
  onOpenOnMap: (excursion: Excursion) => void;
  onDiscussWithAI: (excursion: Excursion) => void;
  onExcursionUpdated: (updated: Excursion) => void;
}

export const ExcursionDetailView: React.FC<ExcursionDetailViewProps> = ({
  stop,
  excursion,
  isSaved,
  isOnline,
  onBack,
  onToggleSave,
  onOpenOnMap,
  onDiscussWithAI,
  onExcursionUpdated,
}) => {
  const [plannedStart, setPlannedStart] = useState<string>(() => getSuggestedStartTime(stop));
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const safety = useMemo(
    () => calculateSafetySchedule(stop, excursion, plannedStart),
    [stop, excursion, plannedStart]
  );

  const mapsUrl = useMemo(() => buildGoogleMapsExcursionUrl(excursion), [excursion]);

  const handleVerifyLiveRoute = async () => {
    if (!isOnline) {
      setVerifyError('Keine Internetverbindung. Live-Routenprüfung erfordert Internet.');
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const result = await computeLiveRoute(excursion);
      const km = Math.round((result.distanceMeters / 1000) * 10) / 10;
      const movingMin = Math.max(5, Math.round(result.durationSeconds / 60));
      const staySum = excursion.waypoints.reduce((acc, w) => acc + w.stayMinutes, 0);
      const updated: Excursion = {
        ...excursion,
        distanceKm: km,
        distanceStatus: 'verifiziert',
        movingMinutes: movingMin,
        totalDurationMinutes: Math.min(movingMin + staySum, 180),
        encodedPolyline: result.encodedPolyline,
        elevation: result.elevationSummary
          ? { ...result.elevationSummary, status: 'verifiziert' }
          : excursion.elevation,
        lastVerifiedAt: new Date().toISOString(),
        isLiveComputed: true,
      };
      onExcursionUpdated(updated);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Routenprüfung fehlgeschlagen.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Top Back Navigation */}
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-[#0B5D7A] hover:text-[#083B52] transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Zurück zu {stop.island}</span>
      </button>

      {/* Hero Photo + Headline */}
      <div className="rounded-2xl overflow-hidden bg-white border border-[#E2DDD2]">
        <div className="relative aspect-video sm:aspect-[21/9] bg-[#DFD8CA]">
          {!imgFailed ? (
            <img
              src={excursion.image}
              alt={excursion.title}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0B5D7A]/20 to-[#EFECE4] text-[#0B5D7A]">
              <Navigation className="w-10 h-10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/90">
              <span>{stop.island}</span>
              <span aria-hidden="true">·</span>
              <span>{excursion.mode === 'BICYCLE' ? 'Leihfahrrad' : 'Zu Fuß'}</span>
              <span aria-hidden="true">·</span>
              <span>{excursion.isRoundTrip ? 'Rundweg ab/bis Schiff' : 'Strecke ab Terminal'}</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold leading-snug">
              {excursion.title}
            </h1>
          </div>
        </div>

        {/* Key Metrics Strip */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-[#EFECE4]">
          <div>
            <p className="text-xs text-[#526473]">Strecke</p>
            <p className="text-base font-semibold text-[#142634] tabular-nums mt-0.5">
              {excursion.distanceKm.toFixed(1).replace('.', ',')} km
            </p>
            <VerificationLabel status={excursion.distanceStatus} className="mt-0.5" />
          </div>
          <div>
            <p className="text-xs text-[#526473]">Gesamtdauer (max. 3 Std.)</p>
            <p className="text-base font-semibold text-[#142634] tabular-nums mt-0.5">
              {formatDurationGerman(excursion.totalDurationMinutes)}
            </p>
            <p className="text-xs text-[#526473] tabular-nums">
              inkl. {excursion.terminalTransferMinutes} Min. Hafenzugang
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Anspruch</p>
            <p className="text-base font-semibold text-[#142634] mt-0.5">
              {excursion.difficulty}
            </p>
            <p className="text-xs text-[#526473] flex items-center gap-1">
              {excursion.mode === 'BICYCLE' ? (
                <Bike className="w-3.5 h-3.5 text-[#0B5D7A]" />
              ) : (
                <Footprints className="w-3.5 h-3.5 text-[#0B5D7A]" />
              )}
              <span>{excursion.mode === 'BICYCLE' ? 'Gemütlich per Rad' : 'Entspannt zu Fuß'}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Höhenunterschied</p>
            <p className="text-base font-semibold text-[#142634] tabular-nums mt-0.5">
              +{excursion.elevation.totalAscentMeters} m / -{excursion.elevation.totalDescentMeters} m
            </p>
            <VerificationLabel status={excursion.elevation.status} className="mt-0.5" />
          </div>
        </div>

        {/* Primary Action Buttons (Touch >= 44px) */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => onOpenOnMap(excursion)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65] inline-flex items-center justify-center gap-2 transition"
          >
            <MapIcon className="w-4 h-4 shrink-0" />
            <span>Route anzeigen</span>
          </button>

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D9D2C5] bg-white text-[#142634] text-sm font-medium hover:bg-[#EFECE4] inline-flex items-center justify-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4 shrink-0 text-[#0B5D7A]" />
            <span>Google Maps öffnen</span>
          </a>

          <button
            type="button"
            onClick={() => onToggleSave(excursion)}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition ${
              isSaved
                ? 'bg-[#1E7A6D]/10 border-[#1E7A6D] text-[#1E7A6D]'
                : 'border-[#D9D2C5] bg-white text-[#142634] hover:bg-[#EFECE4]'
            }`}
          >
            {isSaved ? (
              <BookmarkCheck className="w-4 h-4 shrink-0" />
            ) : (
              <Bookmark className="w-4 h-4 shrink-0 text-[#0B5D7A]" />
            )}
            <span>{isSaved ? 'Gespeichert' : 'Ausflug speichern'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDiscussWithAI(excursion)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D9D2C5] bg-[#F7F6F2] text-[#142634] text-sm font-medium hover:bg-[#EFECE4] inline-flex items-center justify-center gap-2 transition"
          >
            <MessageSquareText className="w-4 h-4 shrink-0 text-[#0B5D7A]" />
            <span>Mit KI besprechen</span>
          </button>
        </div>
      </div>

      {/* Live Route Verification Banner */}
      <div className="rounded-2xl border border-[#E2DDD2] bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[#142634] flex items-center gap-2">
            <Mountain className="w-4 h-4 text-[#0B5D7A]" />
            <span>Tatsächliche Wegstrecke &amp; Höhenmeter prüfen</span>
          </h2>
          <p className="text-xs text-[#526473] mt-1">
            {excursion.isLiveComputed
              ? `Zuletzt über Google Routes & Elevation API verifiziert.`
              : 'Berechnet die echte begeh- bzw. radelbare Route sowie Steigungen live über Google Maps.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleVerifyLiveRoute()}
          disabled={isVerifying || !isOnline}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#0B5D7A] text-[#0B5D7A] text-sm font-medium hover:bg-[#0B5D7A]/5 disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0 transition"
        >
          {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          <span>{excursion.isLiveComputed ? 'Erneut prüfen' : 'Live verifizieren'}</span>
        </button>
      </div>

      {verifyError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {verifyError}
        </div>
      )}

      {/* Time Planning & Ship Return Safety Section */}
      <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#142634] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0B5D7A]" />
              <span>Zeitplanung &amp; Rückkehrsicherheit</span>
            </h2>
            <p className="text-xs text-[#526473] mt-0.5">
              Verbindliche Reserve: mindestens 90 Minuten vor Schiffsabfahrt wieder am Terminal.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-[#142634]">
            <span className="text-xs text-[#526473]">Startzeit:</span>
            <input
              type="time"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
              className="min-h-[44px] px-3 py-1.5 rounded-xl border border-[#D9D2C5] bg-[#F7F6F2] text-sm font-medium tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-[#EFECE4] text-sm">
          <div>
            <p className="text-xs text-[#526473]">Ankunft Schiff</p>
            <p className="font-semibold text-[#142634] tabular-nums mt-0.5">
              {safety.arrivalTime ? `${safety.arrivalTime} Uhr` : 'Einschiffung'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Abfahrt Schiff</p>
            <p className="font-semibold text-[#142634] tabular-nums mt-0.5">
              {safety.departureTime ? `${safety.departureTime} Uhr` : '–'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Verfügbare Hafenzeit</p>
            <p className="font-semibold text-[#142634] tabular-nums mt-0.5">
              {safety.availablePortMinutes !== null
                ? formatDurationGerman(safety.availablePortMinutes)
                : 'Ganztägig'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Geplante Startzeit</p>
            <p className="font-semibold text-[#142634] tabular-nums mt-0.5">
              {safety.plannedStartTime} Uhr
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Geschätzte Rückkehr</p>
            <p className="font-semibold text-[#142634] tabular-nums mt-0.5">
              {safety.estimatedReturnTime} Uhr
              {safety.uncertaintyBufferMinutes > 0 && (
                <span className="block text-[11px] font-normal text-[#526473]">
                  inkl. +{safety.uncertaintyBufferMinutes} Min. Schätzpuffer
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#526473]">Zeitreserve vor Abfahrt</p>
            <p
              className={`font-semibold tabular-nums mt-0.5 ${
                safety.status === 'kritisch'
                  ? 'text-red-700'
                  : safety.status === 'knapp'
                  ? 'text-[#B45309]'
                  : 'text-[#1E7A6D]'
              }`}
            >
              {safety.remainingBufferMinutes !== null
                ? `${formatDurationGerman(safety.remainingBufferMinutes)} (Spätestens ${safety.latestSafeReturnTime} Uhr)`
                : 'Unbekannt'}
            </p>
          </div>
        </div>

        {safety.warningMessage ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5 text-sm text-amber-950">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
            <span>{safety.warningMessage}</span>
          </div>
        ) : (
          <div className="rounded-xl border border-[#1E7A6D]/25 bg-[#1E7A6D]/5 p-3.5 flex items-start gap-2.5 text-sm text-[#142634]">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#1E7A6D]" />
            <span>
              Sicherer Zeitplan: Mindestens 90 Minuten Reserve bis zur Abfahrt um {stop.departureTime} Uhr eingehalten.
            </span>
          </div>
        )}
      </section>

      {/* Description, Costs, Pros & Cons */}
      <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#142634]">Beschreibung &amp; Einschätzung</h2>
          <p className="mt-2 text-sm text-[#324656] leading-relaxed">{excursion.description}</p>
        </div>

        <div className="border-t border-[#EFECE4] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#142634]">Kosten</h3>
            <VerificationLabel status={excursion.costStatus} />
          </div>
          <p className="text-sm text-[#324656] mt-1">{excursion.estimatedCostText}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-[#EFECE4] pt-4">
          <div>
            <h3 className="text-sm font-semibold text-[#1E7A6D]">Vorteile</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-[#324656] list-disc list-inside">
              {excursion.pros.map((pro, i) => (
                <li key={i}>{pro}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#B45309]">Worauf achten</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-[#324656] list-disc list-inside">
              {excursion.cons.map((con, i) => (
                <li key={i}>{con}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl bg-[#F7F6F2] p-4 border border-[#E2DDD2]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0B5D7A]">
            Persönliche Empfehlung
          </p>
          <p className="text-sm text-[#142634] mt-1">{excursion.recommendationNote}</p>
        </div>
      </section>

      {/* Waypoints */}
      <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
        <h2 className="text-base font-semibold text-[#142634]">
          Zwischenziele &amp; Öffnungszeiten
        </h2>
        <ol className="divide-y divide-[#EFECE4]">
          {excursion.waypoints.map((wp, idx) => (
            <li key={wp.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-[#EFECE4] text-[#0B5D7A] font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-[#142634]">{wp.name}</p>
                  <span className="text-xs text-[#526473] tabular-nums">
                    {wp.category} · ca. {wp.stayMinutes} Min.
                  </span>
                </div>
                <p className="text-sm text-[#324656]">{wp.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#526473]">
                  <span>Öffnungszeiten: {wp.openingHours || 'Vor Ort prüfen'}</span>
                  <span aria-hidden="true">·</span>
                  <VerificationLabel status={wp.openingHoursStatus} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Sources */}
      <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold text-[#142634]">Quellenangaben &amp; Datenstand</h2>
        <ul className="space-y-2 text-sm">
          {excursion.sources.map((src, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F7F6F2] pb-2 last:border-none last:pb-0">
              <div>
                {src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0B5D7A] hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <span>{src.title}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="font-medium text-[#142634]">{src.title}</span>
                )}
                {src.note && <p className="text-xs text-[#526473] mt-0.5">{src.note}</p>}
              </div>
              <VerificationLabel status={src.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
