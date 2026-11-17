export type MainTab = 'home' | 'ports' | 'map' | 'advisor' | 'saved';

export type TransportMode = 'WALK' | 'BICYCLE';

export type VerificationStatus = 'verifiziert' | 'geschaetzt' | 'nicht_verfuegbar';

export type DifficultyLevel = 'Sehr leicht' | 'Leicht' | 'Gemütlich';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SourceCitation {
  title: string;
  url?: string;
  note?: string;
  status: VerificationStatus;
}

export interface CruiseStop {
  id: string;
  dayNumber: number;
  dateISO: string; // e.g. '2026-11-30'
  dateDisplay: string; // e.g. '30.11.2026'
  island: string;
  portName: string;
  isSeaDay?: boolean;
  isEmbarkationOnly?: boolean;
  arrivalTime: string | null; // 'HH:MM' or null
  departureTime: string | null; // 'HH:MM' or null
  defaultArrivalTime: string | null;
  defaultDepartureTime: string | null;
  terminalName: string;
  terminalCoords: LatLng;
  heroImage: string;
  shortSummary: string;
  harborInfo: string;
  localTips: string[];
  walkingFriendlyNote: string;
  cyclingFriendlyNote: string;
}

export interface ExcursionWaypoint {
  id: string;
  name: string;
  description: string;
  coords: LatLng;
  stayMinutes: number;
  category:
    | 'Terminal'
    | 'Altstadt'
    | 'Promenade'
    | 'Aussichtspunkt'
    | 'Garten'
    | 'Strand'
    | 'Kultur'
    | 'Hafen';
  openingHours?: string;
  openingHoursStatus: VerificationStatus;
}

export interface ElevationSummary {
  minMeters: number;
  maxMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
  status: VerificationStatus;
  samples?: { distanceRatio: number; elevation: number }[];
}

export interface Excursion {
  id: string;
  portId: string;
  title: string;
  subtitle: string;
  image: string;
  description: string;
  mode: TransportMode;
  isRoundTrip: boolean;
  distanceKm: number;
  distanceStatus: VerificationStatus;
  movingMinutes: number;
  totalDurationMinutes: number; // <= 180 min
  terminalTransferMinutes: number; // included in totalDurationMinutes
  difficulty: DifficultyLevel;
  elevation: ElevationSummary;
  estimatedCostText: string;
  costStatus: VerificationStatus;
  pros: string[];
  cons: string[];
  recommendationNote: string;
  waypoints: ExcursionWaypoint[];
  sources: SourceCitation[];
  encodedPolyline?: string;
  lastVerifiedAt?: string;
  isLiveComputed?: boolean;
}

export interface BikeRentalStation {
  id: string;
  portId: string;
  name: string;
  address: string;
  distanceFromTerminalText: string;
  coords?: LatLng;
  openingHours: string;
  openingHoursStatus: VerificationStatus;
  phone: string;
  phoneStatus: VerificationStatus;
  website: string;
  websiteStatus: VerificationStatus;
  bikeTypes: string[];
  priceEstimate: string;
  priceStatus: VerificationStatus;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  sourceStatus: VerificationStatus;
  sourceNote: string;
}

export interface WeatherHour {
  timeISO: string;
  hourLabel: string;
  tempC: number;
  precipProb: number;
  windKmh: number;
  weatherCode: number;
  weatherLabel: string;
}

export interface PortWeather {
  portId: string;
  fetchedAt: string;
  currentTempC: number;
  weatherLabel: string;
  weatherCode: number;
  precipProbMax: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  isForecastForCruiseDate: boolean;
  forecastDateLabel: string;
  hourlyWindow: WeatherHour[];
  cyclingAdvice: {
    suitable: boolean;
    level: 'gut' | 'eingeschraenkt' | 'abgeraten';
    message: string;
  };
  walkingAdvice: {
    suitable: boolean;
    message: string;
  };
  sourceName: string;
  sourceUrl: string;
}

export interface SafetyScheduleResult {
  arrivalTime: string | null;
  departureTime: string | null;
  availablePortMinutes: number | null;
  plannedStartTime: string;
  estimatedReturnTime: string;
  latestSafeReturnTime: string | null; // departure - 90 min
  remainingBufferMinutes: number | null; // minutes before departure
  safetyMarginAfter90Min: number | null; // remainingBufferMinutes - 90
  uncertaintyBufferMinutes: number;
  exceedsMaxExcursionLimit: boolean; // > 180 min
  status: 'sicher' | 'knapp' | 'kritisch' | 'unbekannt';
  warningMessage: string | null;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  portId?: string;
  sources?: GroundingSource[];
  isError?: boolean;
}

export interface PortResearchResult {
  portId: string;
  fetchedAt: string;
  summary: string;
  highlights: {
    name: string;
    detail: string;
    openingHours: string;
    entryFee: string;
    status: VerificationStatus;
  }[];
  bikeRentalNote: string;
  pathAndConstructionNote: string;
  sources: GroundingSource[];
}
