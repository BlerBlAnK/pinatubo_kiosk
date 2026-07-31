export interface TimelineFact {
  icon: string;
  label: string;
  value: string;
}

export interface TimelineFigure {
  id: string;
  label: string;
  caption: string;
  imageUrl: string;
  credit?: string;
}

/**
 * Lahar/impact severity used to drive fill color + opacity on the
 * static Luzon base map's region layer. Purely presentational.
 */
export type LaharIntensity = 'none' | 'light' | 'moderate' | 'severe';

/**
 * A single region's state for a given timeline event.
 * `regionId` must match the `id` attribute of a <path> in the
 * static Luzon base map (see timeline-page.html `.regions-layer`).
 */
export interface RegionImpact {
  regionId: string;
  intensity: LaharIntensity;
  label?: string;
}

/**
 * Describes how the static Luzon map should look for a given era.
 * The base map geometry never changes — only these overlay values do.
 */
export interface ImpactProfile {
  affectedRegions: RegionImpact[];
  showPinatuboGlow: boolean;
}

export interface TimelineEvent {
  id: string;
  year: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
  imageUrl: string;
  badge: string;
  navDate?: string;
  keyFacts: TimelineFact[];
  source: string;
  figures: TimelineFigure[];
  impactProfile: ImpactProfile;
}