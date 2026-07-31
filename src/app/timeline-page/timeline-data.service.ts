import { Injectable } from '@angular/core';
import { TimelineEvent } from './timeline-event.model';

/**
 * All facts verified against:
 * - PHIVOLCS (Philippine Institute of Volcanology and Seismology)
 * - USGS Cascades Volcano Observatory bulletins
 * - Newhall et al. (1997) "The Cataclysmic 1991 Eruption of Mount Pinatubo"
 * - Wolfe & Hoblitt (1996) "Overview of the Eruptions"
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
        'Mount Pinatubo is a stratovolcano located on the island of Luzon in the Philippines, at the junction of the Zambales, Pampanga, and Tarlac provinces. Before 1991, its summit reached approximately 1,745 meters (5,725 ft) above sea level.',
      ],
      imageUrl: '/assets/images/fig2b.jpg',
      activeSvgLayerId: 'era-before-1991',
      badge: '1',
      keyFacts: [
        { icon: '🏔️', label: 'Pre-eruption elevation', value: '~1,745 m (5,725 ft)' },
        { icon: '📅', label: 'Last known eruption', value: 'c. 1450 CE (~500 yrs dormant)' },
        { icon: '🌿', label: 'Vegetation', value: 'Den  se montane tropical rainforest' },
        { icon: '👥', label: 'Indigenous population', value: '~30,000 Aeta people on slopes' },
        { icon: '🌊', label: 'Rivers', value: 'O\'Donnell,Sacobia, Abacan, Pasig-Potrero — clean and perennial' },
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
    },
    {
      id: '1991-eruption',
      year: 'April – June 1991',
      title: '1991 ERUPTION',
      subtitle: 'The Cataclysm',
      paragraphs: [
        'On April 2, 1991, Pinatubo began showing renewed activity with a 1.5-km-long fissure that opened near the summit, emitting steam and sulfur. PHIVOLCS immediately deployed a seismic monitoring network and issued early evacuation advisories.',
      ],
      imageUrl: '/assets/images/fig3a.jpg',
      activeSvgLayerId: 'era-1991-eruption',
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
        { icon: '🛫', label: 'Clark Air Base', value: 'Abandoned; ~18,000 US personnel evacuated' },
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
    },
    {
      id: '1991-1995-lahar',
      year: '1991 – 2000',
      title: '1991–1995 LAHAR',
      subtitle: 'Rivers of Destruction',
      paragraphs: [
        'Following the eruption, approximately 5–6 km³ of loose pyroclastic deposits blanketed the slopes of Pinatubo. Each subsequent monsoon season mobilized these materials into lahars — volcanic mudflows — that traveled rapidly down river channels at speeds of up to 6–9 meters per second.',
      ],
      imageUrl: '/assets/images/fig3b.jpg',
      activeSvgLayerId: 'era-1991-1995-lahar',
      badge: '3',
      navDate: '1991 – 2000',
      keyFacts: [
        { icon: '🌊', label: 'Lahar volume mobilized', value: '~2.4 billion m³ of volcanic material' },
        { icon: '🌾', label: 'Agricultural land buried', value: '>100,000 hectares of farmland' },
        { icon: '🏚️', label: 'Affected river systems', value: 'O\'Donnell, Sacobia, Abacan, Pasig-Potrero, Sto. Tomas, Marella' },
        { icon: '⛪', label: 'Cultural heritage loss', value: 'Bacolor, Pampanga — San Guillermo Church buried' },
        { icon: '💀', label: 'Additional deaths', value: '~200–300 lahar-related fatalities (1991–1996)' },
        { icon: '🏙️', label: 'Cities affected', value: 'Angeles City, San Fernando City, Mabalacat, Bacolor' },
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
    },
    {
      id: 'present-day',
      year: '1995 – Present',
      title: 'PRESENT DAY',
      subtitle: 'A New Landscape',
      paragraphs: [
        'The 1991 eruption fundamentally reshaped Mount Pinatubo. The pre-eruption summit at ~1,745 m collapsed into a caldera approximately 2.5 km wide and 600 m deep. The current summit elevation, as confirmed by PHIVOLCS, is approximately 1,445 m (4,741 ft) — a reduction of roughly 300 meters.',
      ],
      imageUrl: '/assets/images/fig2a.jpg',
      activeSvgLayerId: 'era-present-day',
      badge: '4',
      navDate: '1995 – Present',
      keyFacts: [
        { icon: '🏔️', label: 'Current summit elevation', value: '~1,445 m (4,741 ft) — PHIVOLCS confirmed' },
        { icon: '🏊', label: 'Lake Pinatubo diameter', value: '~2.5 km wide; formed by 1992' },
        { icon: '🌡️', label: 'Lake water temperature', value: '30–39°C (active geothermal input)' },
        { icon: '💧', label: 'Lake color', value: 'Blue-green (sulfate and chloride minerals)' },
        { icon: '📡', label: 'Monitoring status', value: 'Continuous 24/7 — PHIVOLCS seismic network' },
        { icon: '🌱', label: 'Ecosystem recovery', value: 'Vegetation recolonization ongoing; secondary forest growing' },
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
    },
  ];

  getEvents(): TimelineEvent[] {
    return this.events;
  }

  getEventById(id: string): TimelineEvent | undefined {
    return this.events.find(e => e.id === id);
  }
}