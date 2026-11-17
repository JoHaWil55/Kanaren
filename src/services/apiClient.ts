import {
  AdvisorMessage,
  BikeRentalStation,
  CruiseStop,
  ElevationSummary,
  Excursion,
  LatLng,
  PortResearchResult,
  PortWeather,
  TransportMode,
} from '../types';

function notifyQuotaIf429(res: Response, payload?: { status?: string; error?: string }) {
  if (
    res.status === 429 ||
    payload?.status === 'RESOURCE_EXHAUSTED' ||
    (payload?.error && payload.error.includes('RESOURCE_EXHAUSTED'))
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export async function fetchMapsRuntimeConfig(): Promise<{ configured: boolean; apiKey: string }> {
  try {
    const res = await fetch('/api/config/maps');
    if (!res.ok) return { configured: false, apiKey: '' };
    const data = (await res.json()) as { configured?: boolean; apiKey?: string };
    return {
      configured: Boolean(data.configured && data.apiKey),
      apiKey: data.apiKey || '',
    };
  } catch {
    return { configured: false, apiKey: '' };
  }
}

export interface ComputedRouteResult {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  steps: Array<{ instruction: string; distanceMeters: number; durationSeconds: number }>;
  elevationSummary: ElevationSummary | null;
}

export async function computeLiveRoute(
  excursion: Excursion
): Promise<ComputedRouteResult> {
  if (excursion.waypoints.length < 2) {
    throw new Error('Für diese Route sind mindestens zwei Wegpunkte erforderlich.');
  }

  const origin = excursion.waypoints[0].coords;
  const destination = excursion.isRoundTrip
    ? excursion.waypoints[0].coords
    : excursion.waypoints[excursion.waypoints.length - 1].coords;

  const intermediates = excursion.isRoundTrip
    ? excursion.waypoints.slice(1).map((w) => w.coords)
    : excursion.waypoints.slice(1, -1).map((w) => w.coords);

  const res = await fetch('/api/routes/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      destination,
      intermediates,
      travelMode: excursion.mode,
    }),
  });

  const data = (await res.json()) as ComputedRouteResult & { error?: string; status?: string };
  notifyQuotaIf429(res, data);

  if (!res.ok) {
    throw new Error(data.error || 'Routenberechnung fehlgeschlagen.');
  }
  return data;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function searchRealBikeRentals(stop: CruiseStop): Promise<BikeRentalStation[]> {
  const query = `Fahrradverleih bike rental ${stop.portName} ${stop.island}`;
  const res = await fetch('/api/places/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      textQuery: query,
      lat: stop.terminalCoords.lat,
      lng: stop.terminalCoords.lng,
      radiusMeters: 7000,
      pageSize: 6,
    }),
  });

  const data = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
      rating?: number;
      userRatingCount?: number;
      regularOpeningHours?: { weekdayDescriptions?: string[] };
      currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      googleMapsUri?: string;
    }>;
    error?: string;
    status?: string;
  };

  notifyQuotaIf429(res, data);

  if (!res.ok) {
    throw new Error(data.error || 'Fahrradverleiher konnten nicht abgefragt werden.');
  }

  const places = data.places || [];
  return places.map((p, index): BikeRentalStation => {
    const coords =
      typeof p.location?.latitude === 'number' && typeof p.location?.longitude === 'number'
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : undefined;

    const approxAirDist = coords ? haversineMeters(stop.terminalCoords, coords) : null;
    const distText =
      approxAirDist !== null
        ? approxAirDist < 1000
          ? `ca. ${Math.round(approxAirDist)} m Luftlinie ab Terminal`
          : `ca. ${(approxAirDist / 1000).toFixed(1).replace('.', ',')} km Luftlinie ab Terminal`
        : 'Entfernung nicht bestätigt';

    const weekdayHours =
      p.regularOpeningHours?.weekdayDescriptions?.[0] ||
      p.currentOpeningHours?.weekdayDescriptions?.[0];

    const phone = p.internationalPhoneNumber || p.nationalPhoneNumber || '';
    const website = p.websiteUri || '';

    return {
      id: p.id || `bike-${stop.id}-${index}`,
      portId: stop.id,
      name: p.displayName?.text || 'Fahrradverleih',
      address: p.formattedAddress || 'Adresse nicht verfügbar',
      distanceFromTerminalText: distText,
      coords,
      openingHours: weekdayHours || 'Öffnungszeiten über Google Maps / Website prüfen',
      openingHoursStatus: weekdayHours ? 'verifiziert' : 'nicht_verfuegbar',
      phone: phone || 'Keine Telefonnummer hinterlegt',
      phoneStatus: phone ? 'verifiziert' : 'nicht_verfuegbar',
      website: website || 'Keine Website hinterlegt',
      websiteStatus: website ? 'verifiziert' : 'nicht_verfuegbar',
      bikeTypes: ['City- / Trekkingrad / E-Bike (Verfügbarkeit vorab anfragen)'],
      priceEstimate: 'Mietpreise direkt beim Anbieter erfragen (keine Pauschalpreise verfügbar)',
      priceStatus: 'nicht_verfuegbar',
      googleMapsUri: p.googleMapsUri,
      rating: p.rating,
      userRatingCount: p.userRatingCount,
      sourceStatus: 'verifiziert',
      sourceNote: 'Quelle: Google Places API (Live-Abfrage)',
    };
  });
}

export async function fetchPortWeather(stop: CruiseStop): Promise<PortWeather> {
  const params = new URLSearchParams({
    lat: String(stop.terminalCoords.lat),
    lng: String(stop.terminalCoords.lng),
    date: stop.dateISO,
    portId: stop.id,
  });
  const res = await fetch(`/api/weather?${params.toString()}`);
  const data = (await res.json()) as PortWeather & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Wetterdaten konnten nicht geladen werden.');
  }
  return data;
}

export async function sendAdvisorQuestion(params: {
  message: string;
  history: AdvisorMessage[];
  stop: CruiseStop;
  weather?: PortWeather;
  preferredMode: 'BOTH' | TransportMode;
  excursionTitle?: string;
}): Promise<{ text: string; sources: Array<{ title: string; url: string }> }> {
  const weatherSummary = params.weather
    ? `${params.weather.currentTempC} °C, ${params.weather.weatherLabel}, Wind bis ${params.weather.windSpeedKmh} km/h, Regenwahrscheinlichkeit max. ${params.weather.precipProbMax} %`
    : undefined;

  const res = await fetch('/api/advisor/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      history: params.history.map((m) => ({ role: m.role, text: m.text })),
      portContext: {
        island: params.stop.island,
        portName: params.stop.portName,
        dateDisplay: params.stop.dateDisplay,
        arrivalTime: params.stop.arrivalTime,
        departureTime: params.stop.departureTime,
        terminalName: params.stop.terminalName,
        weatherSummary,
        preferredMode: params.preferredMode,
        excursionTitle: params.excursionTitle,
      },
    }),
  });

  const data = (await res.json()) as {
    text?: string;
    sources?: Array<{ title: string; url: string }>;
    error?: string;
  };

  if (!res.ok || !data.text) {
    throw new Error(data.error || 'Der KI-Reiseberater ist derzeit nicht erreichbar.');
  }

  return {
    text: data.text,
    sources: data.sources || [],
  };
}

export async function runLivePortResearch(stop: CruiseStop): Promise<PortResearchResult> {
  const res = await fetch('/api/advisor/research-port', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      portId: stop.id,
      island: stop.island,
      portName: stop.portName,
      dateDisplay: stop.dateDisplay,
    }),
  });

  const data = (await res.json()) as PortResearchResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Live-Recherche fehlgeschlagen.');
  }
  return data;
}
