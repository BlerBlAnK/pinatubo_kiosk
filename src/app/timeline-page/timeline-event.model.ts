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

export interface TimelineEvent {
  id: string;
  year: string;
  title: string;
  subtitle: string;
  paragraphs: string[];
  imageUrl: string;
  activeSvgLayerId: string;
  badge: string;
  navDate?: string;
  keyFacts: TimelineFact[];
  source: string;
  figures: TimelineFigure[];

}