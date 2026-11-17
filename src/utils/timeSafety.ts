import { CruiseStop, Excursion, SafetyScheduleResult } from '../types';

export function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationGerman(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}

export function getSuggestedStartTime(stop: CruiseStop): string {
  if (stop.isSeaDay) return '10:00';
  // Overnight stop like Fuerteventura (arrived previous evening 22:00)
  if (stop.id === 'fuerteventura') return '09:30';
  if (stop.isEmbarkationOnly && !stop.arrivalTime) return '16:30';
  const arr = parseTimeToMinutes(stop.arrivalTime);
  if (arr === null) return '09:30';
  // Give 30 min after arrival for gangway clearance, or start 09:30 if arrived overnight (e.g. 01:00 La Palma)
  const earliest = Math.max(arr + 30, 9 * 60);
  return formatMinutesToTime(earliest);
}

export function calculateSafetySchedule(
  stop: CruiseStop,
  excursion: Excursion,
  plannedStartOverride?: string
): SafetyScheduleResult {
  const arrivalTime = stop.arrivalTime;
  const departureTime = stop.departureTime;
  const plannedStartTime = plannedStartOverride || getSuggestedStartTime(stop);
  const startMin = parseTimeToMinutes(plannedStartTime) ?? 9 * 60 + 30;

  // Extra safety buffer when route metrics are still estimated rather than live computed
  const hasUncertainty =
    excursion.distanceStatus !== 'verifiziert' ||
    excursion.elevation.status !== 'verifiziert';
  const uncertaintyBufferMinutes = hasUncertainty ? 15 : 0;

  const effectiveTotalMinutes = excursion.totalDurationMinutes + uncertaintyBufferMinutes;
  const returnMin = startMin + effectiveTotalMinutes;
  const estimatedReturnTime = formatMinutesToTime(returnMin);

  const exceedsMaxExcursionLimit = excursion.totalDurationMinutes > 180;

  if (!departureTime || stop.isSeaDay) {
    return {
      arrivalTime,
      departureTime,
      availablePortMinutes: null,
      plannedStartTime,
      estimatedReturnTime,
      latestSafeReturnTime: null,
      remainingBufferMinutes: null,
      safetyMarginAfter90Min: null,
      uncertaintyBufferMinutes,
      exceedsMaxExcursionLimit,
      status: exceedsMaxExcursionLimit ? 'knapp' : 'unbekannt',
      warningMessage: stop.isSeaDay
        ? 'Am Seetag findet kein Landgang statt.'
        : 'Keine Abfahrtszeit hinterlegt – bitte Liegezeit prüfen.',
    };
  }

  const depMin = parseTimeToMinutes(departureTime);
  if (depMin === null) {
    return {
      arrivalTime,
      departureTime,
      availablePortMinutes: null,
      plannedStartTime,
      estimatedReturnTime,
      latestSafeReturnTime: null,
      remainingBufferMinutes: null,
      safetyMarginAfter90Min: null,
      uncertaintyBufferMinutes,
      exceedsMaxExcursionLimit,
      status: 'unbekannt',
      warningMessage: 'Abfahrtszeit konnte nicht ausgewertet werden.',
    };
  }

  // Handle overnight arrival (e.g. Fuerteventura arrived 22:00 previous day -> full day until 21:00)
  const arrMin = parseTimeToMinutes(arrivalTime);
  let availablePortMinutes: number | null = null;
  if (arrMin !== null) {
    availablePortMinutes = depMin >= arrMin ? depMin - arrMin : 1440 - arrMin + depMin;
  }

  const latestSafeReturnMin = depMin - 90;
  const latestSafeReturnTime = formatMinutesToTime(latestSafeReturnMin);
  const remainingBufferMinutes = depMin - returnMin;
  const safetyMarginAfter90Min = remainingBufferMinutes - 90;

  let status: 'sicher' | 'knapp' | 'kritisch' = 'sicher';
  let warningMessage: string | null = null;

  if (remainingBufferMinutes < 45 || exceedsMaxExcursionLimit) {
    status = 'kritisch';
    warningMessage = exceedsMaxExcursionLimit
      ? 'Achtung: Dieser Ausflug überschreitet die maximale Gesamtdauer von 3 Stunden.'
      : `Kritisch: Nur ${remainingBufferMinutes} Min. Reserve vor Abfahrt (${departureTime} Uhr). Bitte früher starten oder Ausflug verkürzen.`;
  } else if (remainingBufferMinutes < 90) {
    status = 'knapp';
    warningMessage = `Zeitplan knapp: Rückkehrreserve beträgt ${remainingBufferMinutes} Min. (empfohlen sind mindestens 90 Min. vor ${departureTime} Uhr).`;
  }

  return {
    arrivalTime,
    departureTime,
    availablePortMinutes,
    plannedStartTime,
    estimatedReturnTime,
    latestSafeReturnTime,
    remainingBufferMinutes,
    safetyMarginAfter90Min,
    uncertaintyBufferMinutes,
    exceedsMaxExcursionLimit,
    status,
    warningMessage,
  };
}

export function buildGoogleMapsExcursionUrl(excursion: Excursion): string {
  const waypoints = excursion.waypoints;
  if (waypoints.length === 0) return 'https://www.google.com/maps';

  const origin = `${waypoints[0].coords.lat},${waypoints[0].coords.lng}`;
  const destination = excursion.isRoundTrip
    ? origin
    : `${waypoints[waypoints.length - 1].coords.lat},${waypoints[waypoints.length - 1].coords.lng}`;

  const intermediatePts = excursion.isRoundTrip
    ? waypoints.slice(1)
    : waypoints.slice(1, -1);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: excursion.mode === 'BICYCLE' ? 'bicycling' : 'walking',
  });

  if (intermediatePts.length > 0) {
    params.set(
      'waypoints',
      intermediatePts.map((w) => `${w.coords.lat},${w.coords.lng}`).join('|')
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
