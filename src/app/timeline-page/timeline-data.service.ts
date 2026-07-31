import { Injectable } from '@angular/core';
import { TimelineEvent } from './timeline-event.model';

/**
 * All facts verified against:
 * - PHIVOLCS (Philippine Institute of Volcanology and Seismology)
 * - USGS Cascades Volcano Observatory bulletins
 * - Newhall et al. (1997) "The Cataclysmic 1991 Eruption of Mount Pinatubo"
 * - Wolfe & Hoblitt (1996) "Overview of the Eruptions"
 *
 * `impactProfile.affectedRegions[].regionId` values ('zambales',
 * 'pampanga', 'tarlac') correspond to the three interactive province
 * markers on the stylized volcano map (timeline-page.html,
 * `.province-marker`), NOT literal region polygons. These three
 * provinces bore the overwhelming majority of lahar damage and are
 * called out explicitly rather than folded into a generic "Region III".
 */
@Injectable({ providedIn: 'root' })
export class TimelineDataService {
  private readonly events: TimelineEvent[] = [
    {
      id: 'before-1991',
      year: 'c. 1500 – April 1991',
      title: 'BEFORE 1991',
      subtitle: 'The Mountain in Peace',
      paragraphs: [
        'Mount Pinatubo sits at the meeting point of Zambales, Pampanga, and Tarlac provinces on Luzon. Before 1991, its summit reached approximately 1,745 meters (5,725 ft) above sea level, and the surrounding farmland and river valleys had been stable for centuries.',
      ],
      imageUrl: '/assets/images/fig2b.jpg',
      badge: '1',
      keyFacts: [
        { icon: '🏔️', label: 'Pre-eruption elevation', value: '~1,745 m (5,725 ft)' },
        { icon: '📅', label: 'Last known eruption', value: 'c. 1450 CE (~500 yrs dormant)' },
        { icon: '🌿', label: 'Vegetation', value: 'Dense montane tropical rainforest' },
        { icon: '👥', label: 'Indigenous population', value: '~30,000 Aeta people on slopes' },
        { icon: '🌊', label: 'Rivers', value: 'O\'Donnell, Sacobia, Abacan, Pasig-Potrero — clean and perennial' },
        { icon: '🔬', label: 'Monitoring', value: 'No permanent seismic network before 1991' },
      ],
      source: 'PHIVOLCS; Newhall et al. (1997), USGS Professional Paper 1586',
      figures: [
        {
          id: 'fig-1',
          label: 'Figure 1',
          caption: 'Approximate locations and directions of view of photographs in this paper.',
          imageUrl: '/assets/images/fig2b.jpg',
          credit: 'USGS Fire and Mud',
        },
      ],
      // Quiet era — no province highlighted, map shows the mountain at rest.
      impactProfile: {
        affectedRegions: [],
        showPinatuboGlow: false,
      },
    },
    {
      id: '1991-eruption',
      year: 'April – June 1991',
      title: '1991 ERUPTION',
      subtitle: 'The Cataclysm',
      paragraphs: [
        'On April 2, 1991, Pinatubo began showing renewed activity with a 1.5-km-long fissure that opened near the summit. PHIVOLCS deployed emergency seismic monitors and issued early evacuation advisories to the three provinces ringing the volcano — Zambales, Pampanga, and Tarlac — well before the climactic June 15 eruption.',
      ],
      imageUrl: '/assets/images/fig3a.jpg',
      badge: '2',
      navDate: 'June 15, 1991',
      keyFacts: [
        { icon: '💥', label: 'Volcanic Explosivity Index', value: 'VEI 6 — Colossal (2nd largest, 20th century)' },
        { icon: '☁️', label: 'Eruption column height', value: '34–40 km into the stratosphere' },
        { icon: '🌋', label: 'Pyroclastic volume ejected', value: '~10.4 km³ of magma equivalent' },
        { icon: '☠️', label: 'Confirmed fatalities', value: '847 deaths (NDCC official count)' },
        { icon: '🏘️', label: 'Displaced persons', value: 'Over 200,000 evacuated; 364 barangays affected' },
        { icon: '🌡️', label: 'Global climate impact', value: 'Global avg. temperature fell ~0.4–0.5°C for 18 months' },
        { icon: '💨', label: 'SO₂ injected', value: '~20 million tonnes into the stratosphere' },
        { icon: '🛫', label: 'Clark Air Base (Pampanga)', value: 'Abandoned; ~18,000 US personnel evacuated' },
      ],
      source: 'PHIVOLCS; Wolfe & Hoblitt (1996); Pinatubo Volcano Observatory Team (1991)',
      figures: [
        {
          id: 'fig-2a',
          label: 'Figure 2A',
          caption: 'Preeruption Mount Pinatubo, April 16, 1991. View from the northwest.',
          imageUrl: '/assets/images/fig3a.jpg',
          credit: 'R.S. Punongbayan',
        },
        {
          id: 'fig-3a',
          label: 'Figure 3A',
          caption: 'Preeruption Mount Pinatubo, late April 1991. View from the north.',
          imageUrl: '/assets/images/fig3a.jpg',
          credit: 'V. Gempis',
        },
        {
          id: 'fig-4a',
          label: 'Figure 4A',
          caption: 'Preeruption Mount Pinatubo, June 9, 1991. View from the northeast.',
          imageUrl: '/assets/images/fig4a.jpg',
          credit: 'R.P. Hoblitt',
        },
        {
          id: 'fig-5a',
          label: 'Figure 5A',
          caption: 'Mount Pinatubo from Clark Air Base runway, June 14, 1991.',
          imageUrl: '/assets/images/fig5a.jpg',
          credit: 'R.P. Hoblitt',
        },
      ],
      // Blast/ashfall era — all three surrounding provinces take a direct hit,
      // Zambales worst (closest to the vent), Pampanga and Tarlac close behind.
      impactProfile: {
        affectedRegions: [
          { regionId: 'zambales', intensity: 'severe',   label: 'Closest province to the vent (capital: Iba, 15.33°N 119.97°E) — direct blast & heaviest ashfall' },
          { regionId: 'pampanga', intensity: 'severe',   label: 'Capital: City of San Fernando, 15.03°N 120.69°E — Clark Air Base evacuated, heavy ashfall province-wide' },
          { regionId: 'tarlac',   intensity: 'moderate', label: 'Capital: Tarlac City, 15.48°N 120.60°E — heavy ashfall, crop and roof collapses' },
        ],
        showPinatuboGlow: true,
      },
    },
    {
      id: '1991-1995-lahar',
      year: '1991 – 2000',
      title: '1991–1995 LAHAR',
      subtitle: 'Rivers of Destruction',
      paragraphs: [
        'Every monsoon season after the eruption, loose pyroclastic deposits on Pinatubo\'s slopes were remobilized into lahars — fast-moving volcanic mudflows. Pampanga, Zambales, and Tarlac absorbed the overwhelming majority of this damage: their river systems carried lahars directly through farmland, towns, and eventually into Pampanga\'s San Guillermo Church, buried up to its roofline in Bacolor.',
      ],
      imageUrl: '/assets/images/fig3b.jpg',
      badge: '3',
      navDate: '1991 – 2000',
      keyFacts: [
        { icon: '🌊', label: 'Lahar volume mobilized', value: '~2.4 billion m³ of volcanic material' },
        { icon: '📍', label: 'Hardest-hit provinces', value: 'Pampanga, Zambales & Tarlac — over 90% of buried farmland' },
        { icon: '🌾', label: 'Agricultural land buried', value: '>100,000 hectares of farmland' },
        { icon: '⛪', label: 'Cultural heritage loss', value: 'Bacolor, Pampanga — San Guillermo Church buried to its roof' },
        { icon: '💀', label: 'Additional deaths', value: '~200–300 lahar-related fatalities (1991–1996)' },
        { icon: '🏙️', label: 'Cities affected', value: 'Angeles City, San Fernando City (Pampanga), Mabalacat, Bacolor' },
        { icon: '📅', label: 'Hazard peak', value: '1991–1993 monsoon seasons most destructive' },
      ],
      source: 'PHIVOLCS; Major et al. (2004); Rodolfo & Arguden (1991)',
      figures: [
        {
          id: 'fig-3b',
          label: 'Figure 3B',
          caption: 'Summit caldera, October 4, 1991. Caldera floor submerged beneath a lake.',
          imageUrl: '/assets/images/fig3b.jpg',
          credit: 'C.G. Newhall',
        },
        {
          id: 'fig-4b',
          label: 'Figure 4B',
          caption: 'Summit caldera, August 1, 1991. Collapse during June 15 climactic eruption.',
          imageUrl: '/assets/images/fig4b.jpg',
          credit: 'T.J. Casadevall',
        },
        {
          id: 'fig-4c',
          label: 'Figure 4C',
          caption: 'Summit caldera, March 18, 1992. Fumaroles along Sacobia lineament.',
          imageUrl: '/assets/images/fig4c.jpg',
          credit: 'R.P. Hoblitt',
        },
      ],
      // Peak lahar era — Pampanga worst-hit (lowland river confluence),
      // Zambales and Tarlac both severely affected along their river systems.
      impactProfile: {
        affectedRegions: [
          { regionId: 'pampanga', intensity: 'severe', label: 'Worst-hit — Bacolor and the capital, San Fernando, buried by repeated lahars' },
          { regionId: 'zambales', intensity: 'severe', label: 'Sto. Tomas and Marella river systems overwhelmed, incl. Botolan near the vent' },
          { regionId: 'tarlac',   intensity: 'severe', label: 'O\'Donnell river system buried farmland province-wide, north to Tarlac City' },
        ],
        showPinatuboGlow: true,
      },
    },
    {
      id: 'present-day',
      year: '1995 – Present',
      title: 'PRESENT DAY',
      subtitle: 'A New Landscape',
      paragraphs: [
        'The 1991 eruption fundamentally reshaped Mount Pinatubo. The pre-eruption summit at ~1,745 m collapsed into a caldera roughly 2.5 km wide, lowering the peak by more than 300 m to its current ~1,486 m — now filled by the summit crater lake. Pampanga, Zambales, and Tarlac have spent three decades rebuilding — much of the reclaimed farmland now sits on top of the very lahar deposits that once buried it.',
      ],
      imageUrl: '/assets/images/fig2a.jpg',
      badge: '4',
      navDate: '1995 – Present',
      keyFacts: [
        { icon: '🏔️', label: 'Current summit elevation', value: '~1,486 m (4,875 ft) — down from 1,745 m pre-eruption' },
        { icon: '🏊', label: 'Lake Pinatubo diameter', value: '~2.5 km wide; formed by 1992' },
        { icon: '🌡️', label: 'Lake water temperature', value: '30–39°C (active geothermal input)' },
        { icon: '💧', label: 'Lake color', value: 'Blue-green (sulfate and chloride minerals)' },
        { icon: '📡', label: 'Monitoring status', value: 'Continuous 24/7 — PHIVOLCS seismic network' },
        { icon: '🌱', label: 'Recovery', value: 'Pampanga, Zambales & Tarlac farmland largely reclaimed since the 2000s' },
        { icon: '🧭', label: 'Tourism', value: 'Active since ~2009; Aeta-guided treks to crater lake' },
        { icon: '⚠️', label: 'Alert level', value: 'Periodically Alert Level 1 (Abnormal) per PHIVOLCS' },
      ],
      source: 'PHIVOLCS Volcano Bulletin; Stimac et al. (2004); Gaillard (2006)',
      figures: [
        {
          id: 'fig-2b',
          label: 'Figure 2B',
          caption: 'Summit caldera and lake, October 5, 1994. View from the northwest.',
          imageUrl: '/assets/images/fig2a.jpg',
          credit: 'R.S. Punongbayan',
        },
        {
          id: 'fig-5b',
          label: 'Figure 5B',
          caption: 'Same view as 5A, March 13, 1992. Peaks stripped of vegetation.',
          imageUrl: '/assets/images/fig5b.jpg',
          credit: 'R.P. Hoblitt',
        },
      ],
      // Recovery era — light residual shading on all three provinces,
      // signaling recovery rather than ongoing hazard.
      impactProfile: {
        affectedRegions: [
          { regionId: 'pampanga', intensity: 'light', label: 'Reclaimed farmland over old lahar deposits; San Fernando fully rebuilt' },
          { regionId: 'zambales', intensity: 'light', label: 'River systems stabilized; Pinatubo crater-lake trek economy centered near Botolan' },
          { regionId: 'tarlac',   intensity: 'light', label: 'Agricultural land fully restored across the O\'Donnell watershed' },
        ],
        showPinatuboGlow: false,
      },
    },
  ];

  getEvents(): TimelineEvent[] {
    return this.events;
  }

  getEventById(id: string): TimelineEvent | undefined {
    return this.events.find(e => e.id === id);
  }
}