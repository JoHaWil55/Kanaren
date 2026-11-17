import React from 'react';
import {
  Anchor,
  ArrowRight,
  Bike,
  Clock,
  Footprints,
  MessageSquareText,
  Ship,
} from 'lucide-react';
import { CRUISE_META } from '../data/cruiseData';
import { CruiseStop, Excursion } from '../types';
import { calculateSafetySchedule, formatDurationGerman } from '../utils/timeSafety';
import { VerificationLabel } from './VerificationBadge';

interface HomeViewProps {
  stops: CruiseStop[];
  nextPort: CruiseStop;
  excursions: Excursion[];
  onOpenPort: (stop: CruiseStop) => void;
  onSelectExcursion: (excursion: Excursion) => void;
  onOpenAdvisor: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  stops,
  nextPort,
  excursions,
  onOpenPort,
  onSelectExcursion,
  onOpenAdvisor,
}) => {
  const featuredExcursions = excursions
    .filter((e) => e.portId === nextPort.id)
    .slice(0, 3);

  return (
    <div className="space-y-8 pb-6">
      {/* Hero Spotlight: Next Destination */}
      <section className="rounded-3xl overflow-hidden bg-white border border-[#E2DDD2]">
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-7 relative aspect-[16/9] lg:aspect-auto min-h-[240px] bg-[#DFD8CA]">
            <img
              src={nextPort.heroImage}
              alt={`${nextPort.island} – ${nextPort.portName}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p className="text-xs font-medium text-white/90 tabular-nums">
                Nächster Zielhafen · {nextPort.dateDisplay} ·{' '}
                {nextPort.arrivalTime ? `Ankunft ${nextPort.arrivalTime} Uhr` : 'Einschiffung'}{' '}
                {nextPort.departureTime ? `– Abfahrt ${nextPort.departureTime} Uhr` : ''}
              </p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold leading-tight">
                {nextPort.island}: {nextPort.portName}
              </h1>
              <p className="mt-2 text-sm text-white/90 max-w-xl">
                {nextPort.shortSummary}
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 flex flex-col justify-between gap-5 bg-white">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[#0B5D7A]">
                <Ship className="w-4 h-4" />
                <span>
                  {CRUISE_META.cruiseLine} · {CRUISE_META.shipName} · {CRUISE_META.dateRange}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[#142634]">
                Entspannte Landgänge ohne Reederei-Busse
              </h2>
              <p className="text-sm text-[#526473] leading-relaxed">
                Alle Routen starten direkt am Kreuzfahrtterminal, dauern maximal 3 Stunden und rechnen automatisch mindestens 90 Minuten Sicherheitsreserve vor Schiffsabfahrt ein.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onOpenPort(nextPort)}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0B5D7A] text-white text-sm font-medium hover:bg-[#094C65] inline-flex items-center justify-center gap-2 transition"
              >
                <span>Hafen &amp; Wetter für {nextPort.island} öffnen</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onOpenAdvisor}
                className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[#D9D2C5] bg-[#F7F6F2] text-[#142634] text-sm font-medium hover:bg-[#EFECE4] inline-flex items-center justify-center gap-2 transition"
              >
                <MessageSquareText className="w-4 h-4 text-[#0B5D7A]" />
                <span>„Mein Kanaren-Reiseberater“ fragen</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Three Current Excursion Proposals */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#142634]">
              Drei passende Ausflugsideen für {nextPort.island}
            </h2>
            <p className="text-xs text-[#526473] mt-0.5">
              Zu Fuß oder mit dem Leihfahrrad · Max. 3 Stunden inkl. Rückweg
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenPort(nextPort)}
            className="min-h-[44px] px-3 text-sm font-medium text-[#0B5D7A] hover:underline inline-flex items-center gap-1"
          >
            <span>Alle Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {featuredExcursions.map((exc) => {
            const safety = calculateSafetySchedule(nextPort, exc);
            return (
              <button
                key={exc.id}
                type="button"
                onClick={() => onSelectExcursion(exc)}
                className="text-left rounded-2xl border border-[#E2DDD2] bg-white overflow-hidden hover:border-[#0B5D7A] transition flex flex-col justify-between group"
              >
                <div>
                  <div className="aspect-[4/3] bg-[#DFD8CA] overflow-hidden">
                    <img
                      src={exc.image}
                      alt={exc.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-4 space-y-1.5">
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
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[#EFECE4] flex items-center justify-between text-xs tabular-nums">
                  <span className="text-[#1E7A6D] font-medium">
                    Rückkehr ca. {safety.estimatedReturnTime} Uhr
                  </span>
                  <VerificationLabel status={exc.distanceStatus} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Full Cruise Route Overview */}
      <section className="rounded-2xl border border-[#E2DDD2] bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#142634] flex items-center gap-2">
              <Anchor className="w-4 h-4 text-[#0B5D7A]" />
              <span>Reiseverlauf AIDAblu (29.11. – 06.12.2026)</span>
            </h2>
            <p className="text-xs text-[#526473] mt-0.5">
              Die Liegezeiten sind in der Hafenansicht jederzeit bearbeitbar. Verbindliche Zeiten bitte vor Reiseantritt anhand der AIDA-Unterlagen prüfen.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#EFECE4]">
          {stops.map((stop) => {
            const isMainGoal =
              !stop.isSeaDay && !stop.isEmbarkationOnly;
            return (
              <button
                key={stop.id}
                type="button"
                onClick={() => onOpenPort(stop)}
                className="w-full min-h-[56px] py-3 px-2 rounded-xl hover:bg-[#F7F6F2] transition flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-medium text-[#526473] tabular-nums">
                      {stop.dateDisplay}
                    </span>
                    <span aria-hidden="true" className="text-[#D9D2C5]">·</span>
                    <span className="text-sm font-semibold text-[#142634]">
                      {stop.island}
                      {stop.portName !== stop.island && !stop.isSeaDay
                        ? ` (${stop.portName})`
                        : ''}
                    </span>
                    {isMainGoal && (
                      <span className="text-xs text-[#0B5D7A] font-medium">
                        · Tagesziel
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#526473] truncate mt-0.5">
                    {stop.shortSummary}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs font-medium text-[#142634] tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[#0B5D7A] hidden sm:inline" />
                  <span>
                    {stop.isSeaDay
                      ? 'Seetag'
                      : stop.arrivalTime && stop.departureTime
                      ? `${stop.arrivalTime}–${stop.departureTime}`
                      : stop.departureTime
                      ? `Ab ${stop.departureTime}`
                      : stop.arrivalTime
                      ? `An ${stop.arrivalTime}`
                      : '–'}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#7A8A97]" />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
