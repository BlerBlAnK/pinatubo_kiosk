import { KNOWLEDGE } from './pinatubo-knowledge';
import { FIRE_AND_MUD_FULL } from './pinatubo-fireandmud';
import { HAU_FULL } from './pinatubo-hau-full';

// ================================================================
// 100% local search — finds the passages most relevant to a
// question so they can be handed to the AI as grounding context
// (see pinatubo-ai.service.ts). Searches across BOTH sources:
// the HAU book (pinatubo-knowledge.ts) and the full Fire and Mud
// monograph extraction (pinatubo-fireandmud.ts). This file does NOT
// generate answers itself — that's the model's job.
// ================================================================

const ALL_KNOWLEDGE: { page: number; text: string; source?: string }[] = [
  ...KNOWLEDGE,
  ...FIRE_AND_MUD_FULL,
  ...HAU_FULL
];

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","of","in","on","at","to","for",
  "and","or","but","with","about","what","when","where","who","why","how","did","do","does",
  "it","its","this","that","these","those","i","you","me","my","can","could","will","would",
  "should","tell","please","apo","there","as","by","from","into","than","then","so","very",
  "much","many","their","his","her","they","he","she","also","just","like","more","know",
  "which","has","had","have","not","no","any","all"
]);

function stem(word: string): string {
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith('ied')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('ed') && word[word.length - 3] !== 'e') return word.slice(0, -2);
  if (word.length > 5 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

const SYNONYMS: Record<string, string[]> = {
  die: ['died', 'death', 'deaths', 'dead', 'killed', 'casualty', 'casualties', 'fatalities', 'victims'],
  people: ['residents', 'population', 'inhabitants', 'families'],
  erupt: ['eruption', 'eruptions', 'erupted', 'explosion', 'blast'],
  big: ['large', 'massive', 'huge', 'major', 'magnitude', 'biggest'],
  ash: ['ashfall', 'tephra', 'pyroclastic'],
  lahar: ['lahars', 'mudflow', 'mudflows', 'debris'],
  evacuate: ['evacuation', 'evacuated', 'evacuees', 'relocate', 'resettlement', 'displaced'],
  aeta: ['ayta', 'negrito', 'indigenous'],
  clark: ['airbase', 'air base', 'military base'],
  warn: ['warning', 'forecast', 'predicted', 'prediction', 'alert'],
  volcano: ['volcanic', 'mountain', 'crater', 'summit', 'caldera'],
  scientist: ['scientists', 'volcanologist', 'geologist', 'phivolcs', 'usgs'],
  destroy: ['destroyed', 'destruction', 'damage', 'damaged'],
  gas: ['gases', 'sulfur', 'dioxide', 'emissions'],
  hazard: ['hazards', 'risk', 'danger'],
  monitor: ['monitoring', 'monitored', 'survey', 'assessment'],
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const t of terms) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t === key || syns.includes(t)) {
        expanded.add(key);
        syns.forEach(s => expanded.add(s));
      }
    }
  }
  return [...expanded];
}

// ================================================================
// BM25 relevance scoring
// ================================================================
const K1 = 1.5, B_PARAM = 0.75;
let indexed = false;
let docTokens: string[][] = [];
let docEligible: boolean[] = [];
let avgDocLen = 0;
const N_DOCS = ALL_KNOWLEDGE.length;
const df: Record<string, number> = {};

function isCitationClutter(text: string): boolean {
  const ibid = (text.match(/\bIbid\b/gi) || []).length;
  const footnoteAuthor = (text.match(/\b\d{1,2}\s?[A-Z][a-zA-Z]+,/g) || []).length;
  const pageRef = (text.match(/\bpp?\.\s?\d/g) || []).length;
  const initialsList = (text.match(/,\s[A-Z]{1,3}\.?[A-Z]?\.?,/g) || []).length;
  const pubMarkers = (text.match(/\(Unpublished\)|\(forthcoming\)|\bet al\.|\bVol\.\s?\d/g) || []).length;
  const score = ibid * 2 + footnoteAuthor * 1.5 + pageRef + initialsList * 1.2 + pubMarkers * 1.5;
  return score >= 2.5;
}

function buildIndex(): void {
  if (indexed) return;
  docTokens = ALL_KNOWLEDGE.map(k => tokenize(k.text));
  docEligible = ALL_KNOWLEDGE.map(k => !isCitationClutter(k.text));
  avgDocLen = docTokens.reduce((s, t) => s + t.length, 0) / N_DOCS;
  docTokens.forEach(toks => new Set(toks).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  indexed = true;
}

export function initBM25(): void {
  buildIndex();
}

function bm25Score(docIdx: number, queryTerms: string[]): number {
  const tokens = docTokens[docIdx];
  const len = tokens.length;
  const tf: Record<string, number> = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
  let score = 0;
  for (const term of queryTerms) {
    const f = tf[term] || 0;
    if (!f) continue;
    const idf = Math.log((N_DOCS - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5) + 1);
    const tfn = (f * (K1 + 1)) / (f + K1 * (1 - B_PARAM + B_PARAM * len / avgDocLen));
    score += idf * tfn;
  }
  return score;
}

// ================================================================
// Autocomplete
// ================================================================
const AUTOCOMPLETE_POOL = [
  "When did Mt. Pinatubo erupt?", "How many people died?", "What is lahar?",
  "Who are the Aeta?", "What happened to Clark Air Base?", "Who is Apu Namalyari?",
  "What is the Crater Lake?", "Who was Dr. Raymundo Punongbayan?", "Who was Sister Emma Fondevilla?",
  "How big was the 1991 eruption?", "What is pyroclastic flow?", "What is PHIVOLCS?",
  "How did the eruption affect global climate?", "What is the Buag Eruptive Period?", "Why is it called Mt. Pinatubo?",
  "Where is Mt. Pinatubo located?", "How tall is Mt. Pinatubo?", "What is a caldera?",
  "What is Camp Sanchez?", "What is the Sinukuan legend?", "What is the Bacobaco myth?",
  "What happened to Bacolor?", "What typhoon hit during the eruption?", "How did lahars affect Pampanga?",
  "Can you hike Mt. Pinatubo today?", "How were the Aeta evacuated?", "Who is Guy Hilbero?",
  "What is subsidence?", "How many lives were saved?", "What is magma?",
  "What happened on June 12, 1991?", "What is the Maraunot Fault?", "Who are the Kapampangans?",
  "What gases were released?", "What is the Capas Trail?", "What rivers come from Mt. Pinatubo?",
  "How was Mt. Pinatubo born?", "What type of volcano is Mt. Pinatubo?",
  "How does Pinatubo compare to Mt. St. Helens?", "How old is Mt. Pinatubo?",
  "What happened to the Aeta after the eruption?", "Is Mt. Pinatubo still active?",
  "How was the lahar hazard assessed?", "What did the warning system review find?",
  "How were evacuation zones determined?", "What was the survey methodology after the eruption?",
];

export function getAutocompleteMatches(query: string): string[] {
  if (!query.trim() || query.length < 2) return [];
  const q = query.toLowerCase();
  return AUTOCOMPLETE_POOL.filter(p => p.toLowerCase().includes(q)).slice(0, 6);
}

// ================================================================
// Retrieval for the AI backend
// ================================================================
export interface ContextPassage { text: string; page: number; source?: string; }

export function retrieveContext(rawQuestion: string, topK: number = 12): ContextPassage[] {
  buildIndex();
  const terms = expandTerms(tokenize(rawQuestion));
  if (!terms.length) return [];

  const scored = ALL_KNOWLEDGE
    .map((_, idx) => ({ idx, score: bm25Score(idx, terms) }))
    .filter(s => docEligible[s.idx] && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK * 2); // extra candidates so we can dedupe near-identical passages below

  const seenText = new Set<string>();
  const out: ContextPassage[] = [];
  for (const s of scored) {
    if (out.length >= topK) break;
    const entry = ALL_KNOWLEDGE[s.idx];
    const norm = entry.text.trim();
    if (seenText.has(norm)) continue;
    seenText.add(norm);
    out.push(entry);
  }
  return out;
}
