import { KNOWLEDGE } from './pinatubo-knowledge';

// ================================================================
// STOPWORDS
// ================================================================
const STOPWORDS = new Set(["the","a","an","is","are","was","were","be","been","being","of","in","on","at","to","for","and","or","but","with","about","what","when","where","who","why","how","did","do","does","it","its","this","that","these","those","i","you","me","my","can","could","will","would","should","tell","please","apo","there","as","by","from","into","than","then","so","very","much","many","their","his","her","they","he","she","also","just","like","more","know","which","has","had","have","not","no","any","all"]);

// ================================================================
// STEMMER — collapses word forms so erupting/erupted/eruptions match
// ================================================================
function stem(word: string): string {
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0,-3);
  if (word.length > 5 && word.endsWith('ied')) return word.slice(0,-3)+'y';
  // Words ending in "eed" (indeed, need, exceed, proceed, agreed, speed...)
  // aren't verb+"ed" inflections, so stripping "ed" would mangle them into
  // meaningless fragments (e.g. "indeed" -> "inde").
  if (word.length > 5 && word.endsWith('ed') && word[word.length-3] !== 'e')  return word.slice(0,-2);
  if (word.length > 5 && word.endsWith('ies')) return word.slice(0,-3)+'y';
  if (word.length > 5 && word.endsWith('es'))  return word.slice(0,-2);
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0,-1);
  return word;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g,' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

// ================================================================
// LEVENSHTEIN TYPO TOLERANCE
// ================================================================
// Reused across calls to avoid allocating a new array on every comparison —
// this function gets called thousands of times per keystroke correction,
// so allocation overhead here matters a lot more than the arithmetic does.
let _levRow: number[] = [];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (_levRow.length < n + 1) _levRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) _levRow[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = _levRow[0];
    _levRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = _levRow[j];
      _levRow[j] = a[i-1] === b[j-1]
        ? prevDiag
        : 1 + Math.min(_levRow[j], _levRow[j-1], prevDiag);
      prevDiag = temp;
    }
  }
  return _levRow[n];
}

const VOCAB: Set<string> = new Set();
// Words bucketed by length so typo correction only ever compares a word
// against other words of a plausible length, instead of the whole vocab.
const VOCAB_BY_LENGTH: Map<number, string[]> = new Map();
// How often each word actually appears in this book's content. Used to
// break ties when a misspelling is equally close (by edit distance) to
// more than one real word — e.g. "clak" is one edit from both "clan" and
// "clark", but "clark" is overwhelmingly more likely given this content.
const VOCAB_FREQ: Map<string, number> = new Map();

function buildVocab(): void {
  const addToken = (t: string) => {
    VOCAB_FREQ.set(t, (VOCAB_FREQ.get(t) || 0) + 1);
    if (VOCAB.has(t)) return;
    VOCAB.add(t);
    const bucket = VOCAB_BY_LENGTH.get(t.length);
    if (bucket) bucket.push(t); else VOCAB_BY_LENGTH.set(t.length, [t]);
    const pk = phoneticKey(t);
    const pbucket = VOCAB_BY_PHONETIC.get(pk);
    if (pbucket) pbucket.push(t); else VOCAB_BY_PHONETIC.set(pk, [t]);
  };
  KNOWLEDGE.forEach(k => tokenize(k.text).forEach(addToken));
  // Also index words from the curated fact keys/answers themselves — some
  // words (e.g. "index", "caldera", "seismograph") only appear there, and
  // typo correction can't fix a misspelling of a word it's never seen.
  FALLBACK_FACTS.forEach(f => {
    f.keys.forEach(k => tokenize(k).forEach(addToken));
    tokenize(f.text).forEach(addToken);
  });
}

// Cheap check for a single adjacent-letter swap (e.g. "erput" vs "erupt")
// — this is an extremely common typing mistake, but a plain Levenshtein
// distance counts it as 2 edits (delete+insert), not 1, so it would
// otherwise get missed for short words. Only worth checking same-length
// candidates.
function isAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffStart = -1, diffCount = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffCount++;
      if (diffCount === 1) diffStart = i;
      if (diffCount > 2) return false;
    }
  }
  if (diffCount !== 2) return false;
  const i = diffStart;
  return a[i] === b[i+1] && a[i+1] === b[i];
}

// Normalizes common phonetic spelling confusions (ph/f, ck/k, etc.) so
// words like "seismograf" and "seismograph" are recognized as the same
// word even though they're 2 raw character edits apart — farther than our
// normal edit-distance tolerance, but an extremely common typing pattern.
function phoneticKey(word: string): string {
  return word
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1'); // collapse doubled letters
}

const VOCAB_BY_PHONETIC: Map<string, string[]> = new Map();

function correctTypo(word: string): string {
  if (VOCAB.has(word)) return word;

  // Check phonetic equivalence first — this catches things like
  // "seismograf" vs "seismograph" (2 raw character edits apart, which
  // would otherwise lose out to a closer-but-wrong word like
  // "seismogram") using a narrow, low-risk set of substitutions.
  const phonCandidates = VOCAB_BY_PHONETIC.get(phoneticKey(word));
  if (phonCandidates && phonCandidates.length) {
    let top = phonCandidates[0], topFreq = VOCAB_FREQ.get(top) || 0;
    for (const c of phonCandidates) {
      const f = VOCAB_FREQ.get(c) || 0;
      if (f > topFreq) { top = c; topFreq = f; }
    }
    return top;
  }

  const maxDist = word.length >= 6 ? 2 : 1;
  let best = word, bestDist = Infinity, bestFreq = 0;
  // Scan the whole plausible range and keep the closest match, breaking
  // ties by which word actually appears more often in this book's content
  // — a Set has no guaranteed order, so without this, "clak" could just
  // as easily resolve to the rare word "clan" as to the intended "clark".
  for (let len = word.length - maxDist; len <= word.length + maxDist; len++) {
    const bucket = VOCAB_BY_LENGTH.get(len);
    if (!bucket) continue;
    for (const v of bucket) {
      if (len === word.length && isAdjacentTransposition(word, v)) {
        const freq = VOCAB_FREQ.get(v) || 0;
        if (1 < bestDist || (1 === bestDist && freq > bestFreq)) {
          bestDist = 1; best = v; bestFreq = freq;
        }
        continue;
      }
      const d = levenshtein(word, v);
      if (d > maxDist) continue;
      const freq = VOCAB_FREQ.get(v) || 0;
      if (d < bestDist || (d === bestDist && freq > bestFreq)) {
        bestDist = d;
        best = v;
        bestFreq = freq;
      }
    }
  }
  return bestDist <= maxDist ? best : word;
}

function tokenizeWithCorrection(text: string): string[] {
  return tokenize(text).map(w => correctTypo(w));
}

// ================================================================
// SYNONYM EXPANSION
// ================================================================
const SYNONYMS: Record<string, string[]> = {
  die:['died','death','deaths','dead','killed','casualty','casualties','fatalities','perished','victims'],
  kill:['died','death','deaths','dead','killed','casualty','casualties','fatalities','perished'],
  people:['residents','population','inhabitants','families','communities','persons'],
  erupt:['eruption','eruptions','erupted','explosion','explosions','blast'],
  big:['large','massive','huge','major','powerful','magnitude','biggest','largest','enormous'],
  ash:['ashfall','tephra','pyroclastic'],
  lahar:['lahars','mudflow','mudflows','debris'],
  evacuate:['evacuation','evacuated','evacuees','relocate','relocation','resettle','resettlement','displaced'],
  aeta:['ayta','negrito','indigenous','tribe','tribal'],
  clark:['airbase','air base','american base','military base'],
  warn:['warning','forecast','predicted','prediction','alert'],
  volcano:['volcanic','mountain','crater','summit','caldera'],
  scientist:['scientists','volcanologist','volcanologists','geologist','geologists','phivolcs','usgs','researchers'],
  destroy:['destroyed','destruction','damage','damaged','devastate','devastation','ruined'],
  cool:['cooling','cooled','temperature','climate'],
  gas:['gases','sulfur','dioxide','emissions','steam'],
  house:['homes','buildings','structures','residences'],
  water:['rainfall','rain','monsoon','flood'],
  old:['ancient','ancestral','historical','previous','prior','prehistoric'],
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const t of terms) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t===key || syns.includes(t)) { expanded.add(key); syns.forEach(s=>expanded.add(s)); }
    }
  }
  return [...expanded];
}

// ================================================================
// BM25 ENGINE
// ================================================================
const K1 = 1.5, B_PARAM = 0.75;
let _initialized = false;
let docTokensList: string[][] = [];
let docEligible: boolean[] = [];
let avgDocLen = 0;
const N_DOCS = KNOWLEDGE.length;
const df: Record<string,number> = {};

// A handful of the raw book excerpts are footnote/bibliography clutter
// left over from PDF extraction (author lists, repeated "Ibid.", page
// citations) rather than actual prose — e.g. "1Gaillard, Jean-Christophe,
// Delfin Jr, F G, Dizon, E.Z., ... 2 Ibid. 3 Ibid. 4 Ibid." These are
// never a real answer to anything, but because they contain rare proper
// nouns (an author's surname, say) they can still score well against a
// query that happens to share that name. Flag and permanently exclude
// them from full-text search so they can never be surfaced as an answer.
function isCitationClutter(text: string): boolean {
  const ibid = (text.match(/\bIbid\b/gi) || []).length;
  const footnoteAuthor = (text.match(/\b\d{1,2}\s?[A-Z][a-zA-Z]+,/g) || []).length;
  const pageRef = (text.match(/\bpp?\.\s?\d/g) || []).length;
  // Bibliography-style author-initials runs, e.g. ", E.Z.," ", V.J," ", C.T.,"
  // — the telltale shape of a list of co-authors' initials.
  const initialsList = (text.match(/,\s[A-Z]{1,3}\.?[A-Z]?\.?,/g) || []).length;
  // Publisher/volume/edition markers that only show up in a citation line.
  const pubMarkers = (text.match(/\(Unpublished\)|\(forthcoming\)|\bet al\.|\bVol\.\s?\d/g) || []).length;
  const score = ibid*2 + footnoteAuthor*1.5 + pageRef + initialsList*1.2 + pubMarkers*1.5;
  return score >= 2.5;
}

export function initBM25(): void {
  if (_initialized) return;
  docTokensList = KNOWLEDGE.map(k => tokenize(k.text));
  docEligible = KNOWLEDGE.map(k => !isCitationClutter(k.text));
  const totalLen = docTokensList.reduce((s,t) => s + t.length, 0);
  avgDocLen = totalLen / N_DOCS;
  docTokensList.forEach(tokens => new Set(tokens).forEach(t => { df[t] = (df[t]||0) + 1; }));
  buildVocab();
  _initialized = true;
}

function bm25Score(docIdx: number, queryTerms: string[]): number {
  const tokens = docTokensList[docIdx];
  const len = tokens.length;
  const tf: Record<string,number> = {};
  tokens.forEach(t => { tf[t] = (tf[t]||0)+1; });
  let score = 0;
  for (const term of queryTerms) {
    const f = tf[term]||0;
    if (!f) continue;
    const idf = Math.log((N_DOCS-(df[term]||0)+0.5)/((df[term]||0)+0.5)+1);
    const tfn = (f*(K1+1))/(f+K1*(1-B_PARAM+B_PARAM*len/avgDocLen));
    score += idf * tfn;
  }
  return score;
}

function countMatchedTerms(docIdx: number, terms: string[]): number {
  const tokens = docTokensList[docIdx];
  if (!tokens.length) return 0;
  const tokenSet = new Set(tokens);
  let n = 0;
  for (const term of terms) if (tokenSet.has(term)) n++;
  return n;
}

// A word only counts as real corroborating signal if it's actually
// distinctive to some part of the book. Common connective words ("now",
// "today", "president", "story"...) show up in a large fraction of
// sentences, so requiring "2 matching words" without this check is easy
// to satisfy by accident on totally off-topic questions (e.g. "who is
// the president of the philippines now" coincidentally overlaps a couple
// of unrelated sentences just via "now" and "president"). Anything
// appearing in more than 5% of the book's sentences doesn't count.
function informativeTerms(terms: string[]): string[] {
  const cutoff = N_DOCS * 0.02;
  return terms.filter(t => (df[t] || 0) > 0 && (df[t] || 0) <= cutoff);
}

function searchBM25(rawTerms: string[], topK: number): {entry:{page:number;text:string;source?:string}; score:number}[] {
  const queryTerms = expandTerms(rawTerms);
  if (!queryTerms.length) return [];
  const informative = informativeTerms(queryTerms);
  // If nothing in the query is actually distinctive to the book's content,
  // there's nothing real to corroborate a match against — treat it as no
  // match rather than surface whatever loosely overlaps.
  if (!informative.length) return [];
  // Require corroboration from more than one distinct, informative query
  // word before a document counts as a real match. Without this, a single
  // rare proper noun (a typo-corrected name, for instance) gets a huge IDF
  // weight and can single-handedly pull in totally unrelated passages that
  // just happen to share that one word — which is what produced the
  // garbled, unrelated "Garcia" answer. Single-word queries only need 1
  // match, since there's nothing else to corroborate against.
  const minMatches = Math.min(2, informative.length);
  const scores = KNOWLEDGE
    .map((_,idx) => ({idx, score:bm25Score(idx,queryTerms), matched:countMatchedTerms(idx,informative)}))
    .filter(s => docEligible[s.idx])
    .filter(s => s.matched >= minMatches);
  scores.sort((a,b) => b.score-a.score);
  return scores.slice(0,topK).filter(s=>s.score>0.5).map(s=>({entry:KNOWLEDGE[s.idx],score:s.score}));
}

function synthesize(results: {entry:{page:number;text:string;source?:string}; score:number}[], max: number): {text:string; citations:string[]} {
  const chosen: {entry:{page:number;text:string;source?:string}; score:number}[] = [];
  const seenText = new Set<string>();
  for (const r of results) {
    if (chosen.length >= max) break;
    const normText = r.entry.text.trim();
    if (seenText.has(normText)) continue; // exact-duplicate passage, e.g. duplicated book excerpts
    const sameCount = chosen.filter(c=>c.entry.page===r.entry.page && c.entry.source===r.entry.source).length;
    if (sameCount >= 1) continue; // avoid stitching together overlapping/duplicate extraction fragments from the same page
    seenText.add(normText);
    chosen.push(r);
  }
  chosen.sort((a,b)=>a.entry.page-b.entry.page);
  // Format each citation as "p.42" for the default (HAU) book, or
  // "Fire and Mud, p.42" when a different source is tagged — so the
  // little citation tags in the UI never imply the wrong book.
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const c of chosen) {
    const label = c.entry.source ? `${c.entry.source.split(' (')[0]}, p.${c.entry.page}` : `p.${c.entry.page}`;
    if (!seen.has(label)) { seen.add(label); citations.push(label); }
  }
  return {
    text: chosen.map(c=>c.entry.text.trim()).join(' '),
    citations
  };
}

// ================================================================
// AUTOCOMPLETE
// ================================================================
const AUTOCOMPLETE_POOL = [
  "When did Mt. Pinatubo erupt?","How many people died?","What is lahar?",
  "Who are the Aeta?","What happened to Clark Air Base?","Who is Apu Namalyari?",
  "What is the Crater Lake?","Who was Dr. Raymundo Punongbayan?","Who was Sister Emma Fondevilla?",
  "How big was the 1991 eruption?","What is pyroclastic flow?","What is PHIVOLCS?",
  "How did the eruption affect global climate?","What is the Buag Eruptive Period?","Why is it called Mt. Pinatubo?",
  "What is the five-level warning system?","What was the 1990 Luzon earthquake?","Where is Mt. Pinatubo located?",
  "How tall is Mt. Pinatubo?","Who predicted the eruption?","What is a caldera?",
  "What is PNOC-EDC?","What is Camp Sanchez?","Who was President Magsaysay and Mt. Pinatubo?",
  "What is the Sinukuan legend?","What is the Bacobaco myth?","Who wrote the book?",
  "What happened to Bacolor?","What is the typhoon that hit during the eruption?","How did lahars affect Pampanga?",
  "Can you hike Mt. Pinatubo today?","How were the Aeta evacuated?","What is geothermal energy?",
  "Who is Guy Hilbero?","What is subsidence?","What is the Manila Trench?",
  "How many lives were saved?","What is magma?","What is the VEI of the 1991 eruption?",
  "What happened on June 12, 1991?","How many U.S. personnel were evacuated?","What is the Maraunot Fault?",
  "What is ancestral Pinatubo?","How was Crater Lake formed?","Say hello",
  "Goodbye","Who are the Kapampangans?","What is the USGS?",
  "What gases were released?","What is the Capas Trail?","What rivers come from Mt. Pinatubo?",
  "What are Pinatubo's eruptive periods in order?","Who is Guy Hilbero?","What is the Bacobaco myth?",
  "Who is Kargon-Kargon?","What is the Alindaya legend?","When was Bacolor the capital of the Philippines?",
  "What was the PNOC-EDC project?","How big was Clark Air Base?","What is the Maraunot Fault?",
  "Who was Chris Newhall?","Who was Richard Anderegg?","Who was Kelvin Rodolfo?",
  "Who was Julio Sabit?","Who is Levy Laus?","What is the RP-US Bases Agreement?",
  "What is the full title?","Who is the publisher?","Who are the cover photo credits?",
  "Who does the author dedicate the book to?","What major sources does the book acknowledge?","What was the author's personal experience during the eruption?",
  "Why did the author write the book?","How tall was Mt. Pinatubo before and after the 1991 eruption?","Which province was most severely affected by the eruption?",
  "How far was Clark Air Base from Mt. Pinatubo?","What were the major rivers originating from Mt. Pinatubo?","How was Mt. Pinatubo born?",
  "What type of volcano is Mt. Pinatubo?","How many magma chambers does Pinatubo have, and how big are they?","How much magma did the 1991 eruption actually expel?",
  "What is the Volcanic Explosivity Index (VEI) of the 1991 eruption?","How does Pinatubo compare to Mt. St. Helens?","How does the 1991 eruption rank globally?",
  "What caused the 1991 eruption scientifically?","What is subsidence, and why does it threaten Pampanga?","What is a pyroclastic flow?",
  "What tectonic forces created the Philippines' volcanic environment?","How old is Mt. Pinatubo?","What was the largest eruption in Pinatubo's history?",
  "What are the named eruptive periods of Pinatubo in sequence?","What was the Buag Eruptive Period?","What towns or areas in Pampanga stand on prehistoric Pinatubo lahar deposits?",
  "Did the Spaniards ever witness a Pinatubo eruption?","How did the Buag Eruptive Period reshape Pampanga's coastline?","What did archaeologists find in Porac related to Pinatubo's prehistoric eruptions?",
  "What did Robert B. Fox find near Pinatubo in 1947?","What are petrified trees, and what did they reveal about Pinatubo?","Why did the Aeta settle specifically around Pinatubo?",
  "Who named the mountain Pinatubo, and what does it mean?","What did the Aeta believe about Mt. Pinatubo spiritually?","What was the PNOC geothermal project's effect on the Aeta?",
  "What happened to the Aeta after the eruption?","What was the Aeta's relationship with the Kapampangans and Sambals historically?","Who is Guy Hilbero, and what was his role?",
  "What is the Sinukuan-Namalyari legend?","What is the myth of Apolaqui and Mayari?","What is the Mangatia legend?",
  "What is the Sambal version of the Pinatubo origin myth?","What is the legend of Kargon-Kargon?","What is Camp Sanchez, and how did it originate?",
  "Who was the first American geologist to study Pinatubo, and what did he conclude?","Who was Capt. H.A. Myers, and what did he describe?","What role did Pinatubo play during World War II?",
  "What is the story of President Magsaysay and Mt. Pinatubo?","What is the earliest colonial-era document to mention Pinatubo by name?","What did Fray Diego Bergano's 1732 Kapampangan dictionary reveal about Pinatubo?",
  "When was Bacolor briefly the capital of the Philippines?","What was the PNOC-EDC geothermal project on Pinatubo?","Did PNOC drilling cause the eruption?",
  "What was the July 16, 1990 Luzon Earthquake?","How did the 1990 earthquake relate to Pinatubo's eruption?","What happened in August 1990 at Pinatubo, and what was PHIVOLCS' response?",
  "When did Mt. Pinatubo's 1991 crisis actually begin?","Who were the members of PHIVOLCS' Quick Response Team?","When did the USGS team arrive at Clark, and how did they set up?",
  "What monitoring equipment did PHIVOLCS and USGS install?","What was the Five-Level Volcano Warning System?","What were the U.S.-Philippines base negotiations about?",
  "What Betamax tape played a key role in public education?","When was the climactic eruption?","What typhoon struck during the eruption?",
  "How high did the ash column reach?","What happened to the Boeing 747s during the eruption?","What calamities did Kapampangans experience in the 1991-1995 period?",
  "What were the three eruption scenarios scientists identified before June 15?","What happened to the summit during the eruption?","What was Clark Air Base?",
  "When did Clark Air Base evacuate, and what was it like?","What was the scene at Subic when Clark evacuees arrived?","Why did the U.S. ultimately abandon Clark Air Base?",
  "What was the reaction of the Angeles City mayor to the Clark evacuation?","What happened to Mabalacat residents when Clark closed?","What was the primary cause of death during the eruption?",
  "How many lives were saved by the evacuation?","What was the economic impact of the eruption?","What happened to the Bacolor cemetery?",
  "How long did lahars continue after the 1991 eruption?","What was the 1992 lahar season like?","What was the Cabalantian disaster of 1995?",
  "What is the Megadike, and when was it built?","How did communities warn each other of approaching lahars before mobile phones?","Why were lahars of Pampanga described as \"unprecedented in history\"?",
  "What is the ongoing risk from the Maraunot Fault?","How did Kapampangans recover after the eruption?","What is the Crater Lake, and how was it formed?",
  "Is Mt. Pinatubo still active?","What do Kapampangans born after 1991 see when they look at Pinatubo today?","Who was Dr. Chris Newhall?",
  "Who was Col. Richard Anderegg?","Who was Dr. Kelvin Rodolfo?","Who is Levy Laus, and what is the Save San Fernando Movement?",
  "What is USGS, and why were they involved?","What warning signs did scientists monitor?","How accurate was the eruption prediction?",
  "What is a seismograph, and how was it used at Pinatubo?","What is sulfur dioxide (SO2), and why was it a key warning sign?","What was the Pyroclastic-Flow Hazard Map, and what were its limitations?",
  "Why did PHIVOLCS initially hesitate to make definitive predictions?"
];

export function getAutocompleteMatches(query: string): string[] {
  if (!query.trim() || query.length < 2) return [];
  const q = query.toLowerCase();
  return AUTOCOMPLETE_POOL.filter((p: string) => p.toLowerCase().includes(q)).slice(0,6);
}

// ================================================================
// CURATED FACTS
// ================================================================
interface Fact { keys: string[]; text: string; }

const FALLBACK_FACTS = [
  // ---- EXACT verbatim Q&A from the user's Complete Reference Guide document ----
  // These are placed first so they win scoring ties against older, shorter,
  // more generic paraphrased facts below for the same questions.
  { keys: ["wrote book", "who wrote the book?"], text: "The book was written by Robby Tantingco, completed May 17, 2011, and published by Holy Angel University (HAU) in Angeles City, Pampanga." },
  { keys: ["full title", "what is the full title?"], text: "Pinatubo: The Saga of the Philippines' Forgotten Giant." },
  { keys: ["publisher", "who is the publisher?"], text: "Holy Angel University (HAU), Angeles City, Pampanga. It was printed by Data Access Enterprises, Inc. in Quezon City." },
  { keys: ["cover photo credit", "who are the cover photo credits?"], text: "Cover photos are by Josie D. Henson and Nick Sagmit. The back-cover photo comes from the Boston Globe's photo cache." },
  { keys: ["author dedicate book", "who does the author dedicate the book to?"], text: "Tantingco dedicates it to all Pinatubo victims, especially his fellow Kapampangans -- those who endured the horror, panic, grief, and desperation of the calamitous years 1991-1995, as well as those who showed bravery and heroism in helping others even while being victims themselves." },
  { keys: ["major sourc book acknowledge", "what major sources does the book acknowledge?"], text: "Key sources include: Fire and Mud (co-edited by Dr. Chris Newhall of USGS and Dr. Raymundo Punongbayan of PHIVOLCS); The Ash Warriors by Col. Richard Anderegg; Pinatubo and the Politics of Lahar by Dr. Kelvin Rodolfo; Pinatubo: 500 Years After by Barbara Mae Dacanay; Pinatubo: The Eruption of the Century by Eddee RH. Castro; and Pinatubo: The Triumph of the Kapampangan Spirit by Bong Lacson." },
  { keys: ["author personal experience during eruption", "what was the author's personal experience during the eruption?"], text: "On the night of the eruption, Tantingco's family wanted to flee but his father refused to leave. They endured the quakes and ashfall while his mother led the family rosary. His son Marvin was born two months after the eruption." },
  { keys: ["author write book", "why did the author write the book?"], text: "He wrote it so that all Pinatubo victims, especially his fellow Kapampangans, can revisit those earth-shaking and life-changing events any time they want -- without having to make a pilgrimage to the crater lake. He also wanted those who weren't there (those not yet born, or those abroad) to vicariously experience the ordeal and gain the same lessons survivors did." },
  { keys: ["pinatubo locat", "where is mt. pinatubo located?"], text: "Mt. Pinatubo is the point of convergence among Pampanga, Zambales, and Tarlac -- three provinces on the island of Luzon, Philippines. It is roughly 90 km northwest of Manila." },
  { keys: ["tall pinatubo before after 1991 eruption", "how tall was mt. pinatubo before and after the 1991 eruption?"], text: "Before the 1991 eruption, Mt. Pinatubo stood at 5,725 feet (about 1,745 m). The climactic eruption blew off 853 feet of its summit, reducing it to 4,872 feet (about 1,486 m) -- still higher than Mt. Arayat at 3,366 feet." },
  { keys: ["province most severely affect eruption", "which province was most severely affected by the eruption?"], text: "Pampanga. Although Zambales and Tarlac also shared the brunt, the book says \"it was Pampanga which took a beating\" -- both from the eruption itself and, more devastatingly, from the years of lahars that followed." },
  { keys: ["far clark air base pinatubo", "how far was clark air base from mt. pinatubo?"], text: "Clark Air Base was approximately 14 kilometers from Mt. Pinatubo. The main housing area was about 13 km away -- close enough that pyroclastic flows could have reached it within five minutes of an eruption." },
  { keys: ["capa trail", "what is the capas trail?"], text: "The Capas Trail is a natural pass through the Zambales Mountain Range that allowed prehistoric inhabitants -- Kapampangans, Sambals, and Aetas -- to cross between the Zambales coast (west of Pinatubo) and Tarlac/Pampanga (east of Pinatubo). It was used as a trade route long before the Spaniards arrived and led directly to Botolan in Zambales." },
  { keys: ["major river originat pinatubo", "what were the major rivers originating from mt. pinatubo?"], text: "Pinatubo feeds all the major river channels in Central Luzon: Marella River (through San Marcelino, Zambales), Maraunot River (through Botolan, Zambales), O'Donnell River (Capas, Tarlac), Sacobia River (Bamban, Tarlac), Abacan River (Angeles City, Pampanga), Pasig-Potrero River (Bacolor, Pampanga), North Gumain River (Porac, Pampanga), and Porac-Gumain River (Floridablanca, Pampanga), plus countless creeks and springs." },
  { keys: ["pinatubo born", "how was mt. pinatubo born?"], text: "About 10-15 million years ago, the floor of the South China Sea slid down (subducted) into the Earth's mantle below Luzon island. The subduction produced magma that mixed and eventually rose through rock fractures until it reached the surface, piling up debris that formed the volcano. The Manila Trench -- a 4 km-deep scar on the South China Sea floor -- is where this subduction occurs." },
  { keys: ["type volcano pinatubo", "what type of volcano is mt. pinatubo?"], text: "Pinatubo is a Plinian-type (stratovolcano) that produces explosive eruptions with enormous quantities of pyroclastic materials -- not slow lava flows. It does not produce lava in the way Mayon or Fuji do; instead it produces pyroclastic flows, which are far more deadly." },
  { keys: ["magma chamber pinatubo big", "how many magma chambers does pinatubo have, and how big are they?"], text: "Pinatubo has at least three connected magma chambers, all about 6 km below the mountain: (1) the main chamber under the ridge linking Pinatubo and Mt. Negron, holding 40-90 cubic km of magma; (2) another chamber below Mt. Negron; and (3) a third below the northwest slope of Pinatubo, directly under the caldera that formed in 1991 -- this third one supplied the 1991 eruption. Together they hold roughly 125 cubic kilometers of magma total." },
  { keys: ["magma 1991 eruption actually expel", "how much magma did the 1991 eruption actually expel?"], text: "Only 5 cubic kilometers of magma was expelled -- a small fraction of the roughly 125 cubic km total capacity of Pinatubo's magma chambers." },
  { keys: ["volcanic explosivity index vei 1991 eruption", "what is the volcanic explosivity index (vei) of the 1991 eruption?"], text: "Pinatubo's 1991 eruption is rated VEI 6 -- one of the largest explosive eruptions of the 20th century. The VEI scale runs from 0 to 8, measuring the volume of material ejected." },
  { keys: ["pinatubo compare helen", "how does pinatubo compare to mt. st. helens?"], text: "Pinatubo's magma chamber measures 3 to 5 square kilometers, compared to just 1 square kilometer at Mt. St. Helens. This means Pinatubo's eruption had the potential to be 9 to 15 times stronger than the 1980 St. Helens eruption." },
  { keys: ["1991 eruption rank globally", "how does the 1991 eruption rank globally?"], text: "It is the second-largest volcanic eruption of the 20th century -- behind only Alaska's 1912 Novarupta eruption, and comparable in scale to Krakatoa (1883) and Huaynaputina (1600). It dwarfs Mt. St. Helens (1980) but is itself dwarfed by prehistoric giants like Yellowstone and Tambora." },
  { keys: ["caus 1991 eruption scientifically", "what caused the 1991 eruption scientifically?"], text: "New mafic magma (basalt, runny and superheated to ~1,250C) penetrated the base of Pinatubo's magma chamber -- possibly triggered by the 1990 Luzon earthquake -- and began mixing with the older, cooler felsic (dacite) magma at ~780C. The mixing produced a new magma type (andesite), which was less dense and began rising. This process, which took only weeks, built enough pressure and gas to fracture the overlying rock layers, eventually triggering the eruption." },
  { keys: ["subsidence threaten pampanga", "what is subsidence, and why does it threaten pampanga?"], text: "Subsidence is the gradual sinking of land under its own weight. Pinatubo's volcanic sediments have added enormous weight to Pampanga, whose lowland areas already sit precariously on recently deposited silt. Excessive extraction of underground water via artesian wells worsens the problem. Scientists warn the towns of Sasmuan, Lubao, Masantol, and Macabebe could eventually be submerged as the sea reclaims the sinking land." },
  { keys: ["pyroclastic flow", "what is a pyroclastic flow?"], text: "A dense, cloud-like mixture of hot gases and pyroclastic debris (solidified lava fragments) that flows down a volcano's slopes like an avalanche, reaching speeds of up to 300 kph and distances of up to 150 km. A single breath inside a pyroclastic flow is fatal -- it sears the lungs. Mt. Pinatubo produces pyroclastic flows, not slow lava." },
  { keys: ["lahar", "what is lahar?"], text: "Lahar (always used in the plural: lahars) refers to pyroclastic-flow deposits that are remobilized by water -- usually monsoon rains. They behave like mudflows but are hotter and have the consistency, viscosity, and density of concrete. They flow like rivers of boiling mud, carrying boulders, and bury everything in their path." },
  { keys: ["caldera", "what is a caldera?"], text: "A caldera is a volcanic crater at least 1 km in diameter, formed when the volcano's summit is destroyed during an explosive eruption or when the crater floor collapses into the emptied magma chamber below. Pinatubo's 1991 eruption created a caldera roughly 2.5-3.5 km wide, which later filled with rainwater to form the present Crater Lake." },
  { keys: ["tectonic forc creat philippin volcanic environment", "what tectonic forces created the philippines' volcanic environment?"], text: "The Philippines is sandwiched between two subduction zones: the Manila Trench (South China Sea side, where the Eurasian Plate subducts) and the Philippine Trench (Pacific side, where the Philippine Sea Plate subducts). These two plates act like a clamp compressing the Philippine micro-plate, cracking it into fragments and creating chains of volcanoes, including Pinatubo." },
  { keys: ["old pinatubo", "how old is mt. pinatubo?"], text: "Ancestral Pinatubo started erupting about one million years ago. The modern volcano (Modern Pinatubo) was reborn about 35,000 years ago following the Inararo Eruptive Period. The Ancestral Pinatubo was twice as high as the pre-1991 peak, with a crater twice as wide as the present caldera." },
  { keys: ["largest eruption pinatubo history", "what was the largest eruption in pinatubo's history?"], text: "The Inararo Eruptive Period, about 35,000 years ago -- sometimes called the \"mother of all Pinatubo eruptions.\" It was 10 times larger than the 1991 eruption and blanketed the surroundings with about 325 feet of volcanic debris. It destroyed the ancestral volcano entirely." },
  { keys: ["named eruptive period pinatubo sequence", "what are the named eruptive periods of pinatubo in sequence?"], text: "In chronological order: (1) Ancestral Pinatubo eruptions (1,000,000 to ~45,000 years ago); (2) Inararo Eruptive Period (35,000 years ago -- the rebirth of Modern Pinatubo); (3) Sacobia Eruptive Period (17,000 years ago); (4) Pasbul Eruptive Period (9,000 years ago); (5) Crow Valley Eruptive Period (6,000-5,000 years ago); (6) Maraunot Eruptive Period (3,900-2,300 years ago); (7) Buag Eruptive Period (~800-500 years ago); (8) 1991 eruption." },
  { keys: ["buag eruptive period", "what was the buag eruptive period?"], text: "Pinatubo's last known eruption before 1991, dated to roughly 500-800 years ago (between the late 12th and late 15th centuries, 1190s-1490s), according to French geographer Dr. Jean-Christophe Gaillard. It occurred in three phases: (1) an initial explosive eruption that produced a caldera; (2) dome growth; and (3) partial collapse of that dome. The dome growth gave Pinatubo the conical shape everyone saw before 1991. The name \"Buag\" means \"collapse.\"" },
  { keys: ["town area pampanga stand prehistoric pinatubo lahar deposit", "what towns or areas in pampanga stand on prehistoric pinatubo lahar deposits?"], text: "Lubao and Floridablanca stand on deposits from the Pasbul Eruptive Period (9,000 years ago). Much of Tarlac, including Hacienda Luisita, sits atop material from the Crow Valley Eruptive Period (6,000-5,000 years ago). The entire area of Clark Air Base was created by the Maraunot Eruptive Period (3,900-2,300 years ago). The Buag Eruptive Period filled the Sacobia-Bamban, Abacan, and Pasig-Potrero rivers with sediment." },
  { keys: ["spaniard ever witness pinatubo eruption", "did the spaniards ever witness a pinatubo eruption?"], text: "No. The Buag Eruptive Period ended about 80 years before the Spanish arrived in Pampanga in 1571, and the rivers had already stabilized by then. The Spaniards never referred to Pinatubo as a volcano during their entire 300-year colonial period -- they were completely unaware of its volcanic nature." },
  { keys: ["buag eruptive period reshape pampanga coastline", "how did the buag eruptive period reshape pampanga's coastline?"], text: "Before the Buag eruptions, Manila Bay (specifically Pampanga Bay) extended inland about 15 km farther than today -- all the way to Guagua. All the present-day towns between Guagua and Manila Bay (Macabebe, Sasmuan, Masantol, parts of Lubao and Minalin) were underwater. Buag lahars carried sediments to the low-lying areas, pushing the shoreline 15 km outward to where it stands today." },
  { keys: ["archaeologist find porac relat pinatubo prehistoric eruption", "what did archaeologists find in porac related to pinatubo's prehistoric eruptions?"], text: "Extensive prehistoric settlements were excavated in Porac highlands (Babo Balukbuk near the Porac River). Anthropologist H. Otley Beyer (1939), Robert Fox (1959), and Dr. Victor Paz (2002) found evidence of multiple generations of settlers, all of whom abandoned the site for the same reason -- volcanic activity -- with the latest layer of items (jars, saucers, bronze bangles) buried under volcanic ash dated to the 14th-16th century, coinciding with the Buag eruption." },
  { keys: ["robert fox find near pinatubo 1947", "what did robert b. fox find near pinatubo in 1947?"], text: "Fox found an extensive porcelain site deep in Negrito (Aeta) territory on Pinatubo's west side, near Ugik. The pieces were identified as 13th- to 15th-century Yuan and Early Ming Chinese wares -- evidence that maritime traders once penetrated this far into the mountains, and that the Pinatubo area was once close enough to the sea to permit such commerce." },
  { keys: ["petrify tree reveal pinatubo", "what are petrified trees, and what did they reveal about pinatubo?"], text: "After 1991 lahars scoured the Abacan riverbed, Angeles City residents found two kinds of fossilized tree trunks: some still had organic wood and were carbon-dated to about 2,900 years old, while others had fully petrified into stone -- a process that takes at least 1,000,000 years -- evidence of Pinatubo's much older eruptive history." },
  { keys: ["aeta", "who are the aeta?"], text: "The Aeta (also Ayta or Negrito) are considered among the earliest inhabitants of the Philippines. Their ancestors arrived in the archipelago by a land bridge connecting southern China, Taiwan, and northern Luzon about 30,000 years ago -- 25,000 years before the Austronesians. They initially lived on the plains of Luzon but were gradually pushed to the foothills of Pinatubo by sea-faring Austronesian settlers. They eventually became hunter-gatherers in the mountain forests, where they lived for generations before the 1991 eruption." },
  { keys: ["aeta settle specifically around pinatubo", "why did the aeta settle specifically around pinatubo?"], text: "Although Aetas roamed practically the whole Zambales Mountain Range, the Pinatubo area had the highest concentration of Aeta settlements because of the numerous rivers flowing from the volcano. The mountain was the fountainhead of all the life-giving rivers in the forests -- their source of water, food, and livelihood." },
  { keys: ["named mountain pinatubo mean", "who named the mountain pinatubo, and what does it mean?"], text: "The Aeta named the mountain. The name comes from the root word tubo, meaning \"to grow\" or \"to originate from.\" The word pinatubo (\"made to grow or increase\") is Sambal conjugation, not Kapampangan. It likely referred to the volcano's dome growth during the Buag Eruptive Period, which the Aeta living around the volcano most likely witnessed." },
  { keys: ["aeta believe pinatubo spiritually", "what did the aeta believe about mt. pinatubo spiritually?"], text: "As animists, the Aeta believe spirits inhabit rocks, trees, plants, and mountains. They worship a supreme being called Namalyari (or Apu Namalyari -- \"lord who can make anything possible\"), whom they believe resides at the summit or inside Mt. Pinatubo. The 1991 eruption was widely seen by Aeta elders as a sign of Namalyari's anger, partly linked to the PNOC geothermal drilling that desecrated their sacred mountain." },
  { keys: ["pnoc geothermal project effect aeta", "what was the pnoc geothermal project's effect on the aeta?"], text: "The Aeta, led by their apo (chieftain), opposed the PNOC project from the start. The drilling desecrated their holy mountain, and PNOC personnel brought gambling, cigarettes, liquor, and prostitutes into the area, corrupting even Aeta workers. A Baluga chieftain's child died after swimming in a pool of sulfur and acid-contaminated drilling water. Six more children in a nearby Aeta settlement died, possibly from contaminated drinking water. The Aeta organized protests and offered animal sacrifices to appease Apu Namalyari." },
  { keys: ["happen aeta after eruption", "what happened to the aeta after the eruption?"], text: "About 4,000 Aetas living within 10 km of the summit were evacuated into hastily organized lowland camps. Many were resettled in resettlement communities far from their ancestral mountain home, significantly disrupting their traditional hunter-gatherer and forest-based way of life. The Aburlin pagans, a sub-tribe that refused to evacuate, were never heard from again -- they reportedly perished in a cave during the eruption." },
  { keys: ["aeta relationship kapampangan sambal historically", "what was the aeta's relationship with the kapampangans and sambals historically?"], text: "Historically, Aetas were often held in captivity and sold as slaves by both Sambals and Kapampangans. The Aetas resisted Spanish attempts to confine them to pueblos by retreating deeper into the Pinatubo forests. They periodically raided and ambushed lowland communities but also traded with them (selling birds, deer, and freshwater eels). Evidence of regular contact is found in the Aeta-Kapampangan Capas Trail crossings." },
  { keys: ["guy hilbero role", "who is guy hilbero, and what was his role?"], text: "Guy \"Indra\" Hilbero is a Kapampangan who lived with the Baluga (Aeta) tribes on Mt. Pinatubo and Mt. Negron for nearly two years (1988-89) during the PNOC drillings. He conducted tribal research and documentation and served as a volunteer for the Military Civic Actions group from Clark Air Base conducting medical and dental missions. He witnessed the PNOC drillings firsthand and believed they angered Apo Namalyari and contributed to the eruption. He returned to Pinatubo in April 1994." },
  { keys: ["bacobaco myth", "what is the bacobaco myth?"], text: "A 1915 Negrito myth collected by Prof. Otley Beyer describes a battle between spirits: Blit (whose brother is Wasi, \"the spirit of the wind\") and Aglao (\"king of the spirit hunters\") pursue a giant sea-spirit turtle named Bacobaco (\"the spirit of the sea\"). Bacobaco hides in a lake at Mt. Pinatubo's foot, then climbs to the peak and begins digging. \"Rocks, mud, dust and other things began to fall in showers all around the mountain.\" Bacobaco howls so loudly the earth shakes, and fire from his mouth is so thick the pursuers flee. For three days the turtle burrows, throwing rocks, mud, and ash. Afterward, the summit has \"a great hole, through which Bacobaco had passed, and from which smoke could be seen constantly coming out.\" The myth ends ominously: \"Someday he will surely come out of his hiding place again.\" The description closely mirrors a real volcanic eruption and shows the Aeta's collective memory of the Buag Eruptive Period (~1491) persisting into the 20th century." },
  { keys: ["sinukuan namalyari legend", "what is the sinukuan-namalyari legend?"], text: "Kapampangan legend describes a cosmic battle between Suku (Sinukuan), the god of Mt. Arayat, and Namalyari (also called Apu Punsalan -- \"lord of enmity\"), the god of Mt. Pinatubo. Their friendship ended when Namalyari proposed marriage to Suku's daughter Mariang Sinukuan. They fought a rock-throwing battle for two days, with Suku beating Namalyari and cutting his mountain in half. One version says \"Mount Zambales was once the greatest mountain in the archipelago, but after the battle it was shattered into fragments, and today we see the Zambales Range.\" Scholars interpret the myth as a metaphor for skirmishes between lowland Kapampangans (Sinukuan) and highland Aetas (Namalyari)." },
  { keys: ["myth apolaqui mayari", "what is the myth of apolaqui and mayari?"], text: "From Dean S. Fansler's 1921 collection Filipino Popular Tales: Bathala had a son Apolaqui and a daughter Mayari (Namalyari). \"From the eyes of these children the earth received its first light.\" After Bathala died leaving no will, Apolaqui wanted to rule all the earth without sharing. They fought with bamboo clubs; Apolaqui struck Mayari in the face, blinding her in one eye. Feeling guilty, he vowed to share power: Apolaqui became the Sun (ruling the day), while Mayari became the Moon (ruling the night). With only one eye, she gives a fainter light than her brother. In this Kapampangan telling, Arayat is the Sun and Pinatubo is the Moon." },
  { keys: ["mangatia legend", "what is the mangatia legend?"], text: "In a legend common among the fisherfolk of Masantol, the supreme god Mangatia (the Net Weaver) created the sky as a great canopy of fishing net studded with stars. When finished, he dropped his sewing needle, which became the white rock (Piedra Blanca) on Mt. Arayat -- the magical entrance to Sinukuan's subterranean palace." },
  { keys: ["sambal version pinatubo origin myth", "what is the sambal version of the pinatubo origin myth?"], text: "As told to Abraham Anonas of Masinloc, Zambales in the 1970s: A magician granted a local ruler's wish to hunt like in his youth by planting a magic stone in the plain, which grew into Mt. Pinatubo. The ruler gave the magician his daughter Alindaya in thanks, but she was unhappy with the arrangement. Her refusal angered the magician, who let the mountain grow so big it overwhelmed the region. A noble prince rescued the situation by uprooting the mountain and transplanting it to its present location, leaving behind what became Lake Andaya." },
  { keys: ["legend kargon kargon", "what is the legend of kargon-kargon?"], text: "Kapampangan legend says Kargon-Kargon, a giant and the father of Suku (Sinukuan), scooped up a mountain from Candaba and transplanted it to Arayat town, leaving behind what is now known as the Candaba Swamp. His son Suku lived in a white palace on the mountaintop with his three daughters. Suku's name means \"old,\" not \"surrender.\"" },
  { keys: ["camp sanchez originate", "what is camp sanchez, and how did it originate?"], text: "Camp Sanchez (formerly known as Camp Four) was a U.S. military camp on a plateau about 3.9 km from Pinatubo's summit, built as a base for horseback expeditions to the volcano conducted by the 1st U.S. Cavalry from Fort Stotsenburg in the early 1900s. It was renamed Camp Sanchez in honor of a Filipino U.S. Army Cavalry officer who first explored the site in the 1920s and built several stone cottages there. American soldiers and their families used it on weekends for recreation; those who reached the summit signed a guest book and received certificates as \"conquistadores.\"" },
  { keys: ["first american geologist study pinatubo conclude", "who was the first american geologist to study pinatubo, and what did he conclude?"], text: "Smith of the U.S. Division of Mines climbed Pinatubo in 1909 and wrote in the Philippine Journal of Science that \"Mount Pinatubo is not a volcano and we saw no signs of it ever having been one, although the rock constituting it is porphyritic (magmatic).\" He was, of course, wrong -- but his conclusion underscored how completely dormant and unrecognized the volcano was at the time." },
  { keys: ["capt myer describe", "who was capt. h.a. myers, and what did he describe?"], text: "Capt. H.A. Myers of the U.S. 26th Cavalry led an expedition up Pinatubo and, in a memo dated January 17, 1925, described the mountain's breathtaking scenery: Fern Canyon, the Three Crater Trail, the Lost Canyon, and Pinatubo's crater itself, which he said was \"beyond description with its walls rising sheer from 500 to 2,000 feet.\" He also described views from the Zambales Pass as \"incomparable with anything in the Philippine Islands.\" He mistakenly described prehistoric pyroclastic-flow deposits as \"marvelous rock formation, reminders of the Pre-Glacial Age.\"" },
  { keys: ["role pinatubo play during world war", "what role did pinatubo play during world war ii?"], text: "Mt. Pinatubo became a guerrilla haven. Gen. MacArthur authorized Lt. Col. Claude Thorpe to establish an observation post at Camp Sanchez to spy on Japanese planes at Clark. After the Fall of Bataan, Thorpe organized a guerrilla unit of American and Filipino men who escaped Japanese capture. Key Kapampangan guerrilla leaders included Col. Mario Pamintuan and members of his family. Eventually Thorpe was captured and executed by the Japanese. Huk leaders Luis Taruc and Casto Alejandrino also visited the camp." },
  { keys: ["story president magsaysay pinatubo", "what is the story of president magsaysay and mt. pinatubo?"], text: "Many people mistakenly believe President Ramon Magsaysay died in a plane crash on Mt. Pinatubo. He actually died on Mt. Manunggal in Cebu (March 17, 1957). The confusion arose because his presidential plane was named \"Mount Pinatubo\" -- after the mountain where he hid and fought as a guerrilla during WWII. He told journalists the day before the crash, \"Pinatubo is where we hid and fought during my guerilla days.\" The plane crash killed 25 of 26 people aboard; only reporter Nestor Mata of the Philippine Herald survived. Magsaysay was a native of Iba, Zambales, and spoke Kapampangan (his grandparent was from Betis)." },
  { keys: ["earliest colonial era document mention pinatubo name", "what is the earliest colonial-era document to mention pinatubo by name?"], text: "The Dominican missionary Fray Domingo Perez's Relation of the Zambals (1680). It describes a road over sandy ground \"full of rocks left by the river which flows from the mountain of Pinatuba (sic),\" noting the dusty, wearisome conditions of the lahar-deposit terrain." },
  { keys: ["fray diego bergano 1732 kapampangan dictionary reveal pinatubo", "what did fray diego bergano's 1732 kapampangan dictionary reveal about pinatubo?"], text: "The dictionary contained two revealing words: tubu (\"to grow or increase, like a mountain\") -- suggesting early Kapampangans had witnessed a volcano increasing in size -- and buga (\"a white and spongy stone\"), making the word for pumice synonymous with \"to throw.\" Forman's 1971 Kapampangan dictionary also had the curious entry margaha, meaning \"volcanic ash\" -- a word that shouldn't exist in Kapampangan because the /h/ sound is not part of the language." },
  { keys: ["bacolor briefly capital philippin", "when was bacolor briefly the capital of the philippines?"], text: "During 1762-64, during the British Occupation of Manila, the Spaniards made Bacolor -- a town only a few kilometers from Pinatubo -- the capital of the Philippines. They had no idea a volcano lurked nearby." },
  { keys: ["pnoc edc geothermal project pinatubo", "what was the pnoc-edc geothermal project on pinatubo?"], text: "Starting in 1982, the Philippine National Oil Company's Energy Development Corporation (PNOC-EDC) began hydrothermal exploration on Pinatubo, searching for geothermal energy sources. In 1988, they returned with heavy equipment, built a 30 km access road, and drilled at least three exploratory wells: the deepest on the southeastern slope (2,733 m deep), another on the northeastern slope (2,216 m), and a third on the northwestern flank (2,190 m). They found a hydrothermal system heated by the magma chamber, but magmatic fluids corroded their pipes and the layers had poor permeability. In March 1990, after spending over 200 million pesos, they cemented the holes and abandoned the project -- only 15 months before the eruption." },
  { keys: ["pnoc drill cause eruption", "did pnoc drilling cause the eruption?"], text: "PHIVOLCS states that Pinatubo's hydrothermal system was stable throughout the PNOC-EDC project and only destabilized on April 2, 1991, when deep magma suddenly intruded. The drilling pipes reached only 2.7 km down, while the magma chamber was at least 6 km below. However, the book notes the highly acidic magmatic fluids that corroded the pipes were already a sign of magma intrusion -- the volcano was probably ripe for eruption anyway. The consensus: PNOC-EDC may have worsened an already bad situation, and the 1990 earthquake \"merely quickened the inevitable.\"" },
  { keys: ["july 1990 luzon earthquake", "what was the july 16, 1990 luzon earthquake?"], text: "A magnitude 7.8 earthquake struck Central and Northern Luzon at 4:26 PM on July 16, 1990, originating at the Digdig section of the Philippine Fault in Nueva Ecija. It killed 1,621 people, left destruction over ~20,000 sq km, and produced a 125 km ground rupture from Dingalan, Aurora to Cuyapo, Nueva Ecija. In Cabanatuan, the six-story Christian College of the Philippines collapsed, killing 154 students and teachers. In Dagupan, buildings sank up to 1 meter from liquefaction. It is the most destructive earthquake in Philippine history." },
  { keys: ["1990 earthquake relate pinatubo eruption", "how did the 1990 earthquake relate to pinatubo's eruption?"], text: "Less than two hours after the main quake, a magnitude 4.8 earthquake struck the Mt. Pinatubo area about 10 km southeast of the crater. PHIVOLCS notes this was synchronous with but distinct from the Digdig fault aftershocks -- it was caused by interaction of the major quake's seismic waves with a local fault that was already stressed by previous magma intrusion. The earthquake likely caused fractures in rock layers that allowed new mafic magma to seep toward the base of the magma chamber, beginning the process that led to the 1991 eruption." },
  { keys: ["happen august 1990 pinatubo phivolc response", "what happened in august 1990 at pinatubo, and what was phivolcs' response?"], text: "On August 3, 1990, Sister Emma Fondevilla reported a landslide, rumbling sounds, and \"black and grey smoke from a fissure\" on Pinatubo's northwest slope to PHIVOLCS. PHIVOLCS sent a team for a helicopter survey and dismissed the smoke as dust from the landslide, issuing a memo stating \"Preliminary findings indicate that the phenomenon is not related with any volcanic activity.\" No further monitoring was set up until April 1991 -- only two months before the eruption. Dr. Kelvin Rodolfo later said PHIVOLCS' interpretation of their own \"heavy continuous steaming\" video was puzzling, and a ground hike would have revealed more." },
  { keys: ["pinatubo 1991 crisi actually begin", "when did mt. pinatubo's 1991 crisis actually begin?"], text: "April 2, 1991, when new magma from deep underground intruded the base of Pinatubo's magma chamber and vented steam into the atmosphere. Aetas in Sitio Tarao and Sitio Yamut (Zambales side) heard explosions; Clark residents on the Pampanga side saw white steam rising. PHIVOLCS dispatched a Quick Response Team on April 5." },
  { keys: ["member phivolc quick response team", "who were the members of phivolcs' quick response team?"], text: "Julio Sabit (OIC, PHIVOLCS Volcano Monitoring and Eruption Prediction Division), Arturo Daag, and Gerry Diolata. They arrived at Sitio Yamut on April 5, 1991, where Sister Emma offered a nipa hut as their temporary field station. By 6 AM on April 6, their seismograph had already detected more than 400 high-frequency volcanic earthquakes." },
  { keys: ["usgs team arrive clark set", "when did the usgs team arrive at clark, and how did they set up?"], text: "Dr. Chris Newhall of the USGS and his team arrived at Clark on April 24, 1991. Clark officials gave them a two-story, four-unit base house on Maryland Avenue near the parade ground with a view of Pinatubo from the second floor. They named it the Pinatubo Volcano Observatory (PVO). PHIVOLCS initially considered setting up in Angeles City but joined the USGS at Clark on April 26, after the logistical advantages (helicopters, equipment, communications) outweighed political concerns." },
  { keys: ["monitor equipment phivolc usgs install", "what monitoring equipment did phivolcs and usgs install?"], text: "The joint USGS-PHIVOLCS team installed seven seismometers at different points around Pinatubo and two tiltmeters near the summit. Seismometers recorded ground vibrations; tiltmeters measured ground swelling or tilting (indicating a bulging, ready-to-erupt volcano). High-frequency earthquakes meant magma was forcing through solid rock; low-frequency quakes meant magma was nearing the surface." },
  { keys: ["five level volcano warn system", "what was the five-level volcano warning system?"], text: "PHIVOLCS introduced its Five-Level Volcano Warning System on May 13, 1991, designed to be simple enough for local residents but nuanced enough to convey escalating danger. Level 5 meant \"eruption in progress.\" The system was later amended: initially Level 5 was triggered by dome growth alone; it was updated to require \"accompanied by large explosions\" after a false alarm caused panic post-June 15." },
  { keys: ["philippin base negotiation", "what were the u.s.-philippines base negotiations about?"], text: "The RP-US Military Bases Agreement, forged in 1947, gave the U.S. the right to use military bases for 99 years (until 2046). In 1966, the expiry was reset to 1991. By 1991, the Philippine panel (led by Raul Manglapus) sought $825 million/year for just a seven-year extension, while the U.S. panel (led by Richard Armitage) offered only $360 million/year for 10-12 years. The volcano erupted in precisely the year the agreement was set to expire, making the negotiation moot." },
  { keys: ["betamax tape play key role public education", "what betamax tape played a key role in public education?"], text: "A video by the late volcanologist Maurice Krafft showing shocking footage of lahars, pyroclastic flows, and volcanic landslides recorded at eruption sites around the world. PHIVOLCS circulated copies, and the footage converted many skeptics who realized for the first time that a volcanic eruption meant far more than trickles of glowing lava." },
  { keys: ["climactic eruption", "when was the climactic eruption?"], text: "June 15, 1991. The most violent, climactic phase began in the early afternoon of June 15 and lasted approximately nine hours. Related volcanic activity -- smaller eruptions, then lahars -- continued for weeks, months, and years afterward." },
  { keys: ["happen june 1991", "what happened on june 12, 1991?"], text: "On June 12 -- Philippine Independence Day -- Mt. Pinatubo produced a billowing gigantic column of ash and steam that shot into the sky at 1,300 feet per second, reaching a height of at least 19 kilometers, then spreading into a mushroom cloud similar to a nuclear explosion. Church bells rang and panic spread through Angeles City. An Independence Day parade in downtown Angeles broke up, with the drum and bugle corps scattering in all directions. Clark officials were actually relieved -- the eruption seemed to vindicate their decision to evacuate and caused no major immediate damage." },
  { keys: ["typhoon struck during eruption", "what typhoon struck during the eruption?"], text: "Typhoon Diding (international name: Yunya) -- with 195-kph winds -- crossed the Pinatubo area at almost the exact same time as the climactic eruption on June 15, 1991. It is described as \"one incredible coincidence that never happened before or since.\" The typhoon's rains mixed with the volcanic ash, making it far heavier than dry ash, causing massive roof collapses and dramatically worsening the lahar threat." },
  { keys: ["high ash column reach", "how high did the ash column reach?"], text: "The climactic eruption sent an ash column an estimated 35 kilometers into the sky -- among the highest ever recorded for a volcanic eruption." },
  { keys: ["eruption affect global climate", "how did the eruption affect global climate?"], text: "Ash and sulfur dioxide from the eruption reached the stratosphere (roughly 12-50 km above the surface) and spread worldwide, reflecting sunlight back into space. This measurably cooled average global temperatures by roughly 0.5C for about two years. The volcanic aerosols also produced unusually vivid, colorful sunsets around the world for months after the eruption." },
  { keys: ["happen boeing 747s during eruption", "what happened to the boeing 747s during the eruption?"], text: "On June 15, 1991, a Tokyo-bound Boeing 747 flying at 29,000 feet over the South China Sea flew through Pinatubo's ash cloud -- all four engines were damaged beyond repair. A second Boeing 747 flying Narita to Singapore also hit ash and pumice and had to divert to Taipei." },
  { keys: ["calamity kapampangan experience 1991 1995 period", "what calamities did kapampangans experience in the 1991-1995 period?"], text: "The book compares their ordeal to the biblical Ten Plagues of Egypt: earthquakes, volcanic eruption, typhoons, floods, ash and rocks raining from the sky, days of darkness, and swarms of locusts -- all hitting simultaneously over five years. No comparable concentration of catastrophes has befallen a region in modern history." },
  { keys: ["three eruption scenario scientist identify before june", "what were the three eruption scenarios scientists identified before june 15?"], text: "(1) A Plinian eruption with pyroclastic flows going northwest toward Zambales -- \"highly probable\"; (2) a larger eruption with pyroclastic flows going east toward Pampanga and crossing populated areas -- \"moderately probable\"; (3) small explosions continuing for weeks, months, even years without a major eruption -- also \"moderately probable.\"" },
  { keys: ["happen summit during eruption", "what happened to the summit during the eruption?"], text: "The climactic eruption caused the summit to collapse into a new caldera roughly 2.5-3.5 km wide. The summit height dropped from 5,725 feet to 4,872 feet -- a loss of 853 feet. The caldera later gradually filled with rainwater to form today's Crater Lake." },
  { keys: ["clark air base", "what was clark air base?"], text: "Clark Air Base was the largest United States Air Force (USAF) base outside the continental United States, occupying 10,000 acres of land only 14 km from Mt. Pinatubo. It housed over 15,000 servicemen, with 4,000 more military retirees and families in adjacent Angeles City and Mabalacat. It served as the primary refueling and service stop for transport aircraft supplying U.S. forces in the Indian Ocean and Western Pacific. About 10,000 Filipinos worked on base." },
  { keys: ["clark air base evacuate", "when did clark air base evacuate, and what was it like?"], text: "On June 10, 1991 -- for the first time in its 90-year history -- Clark stood empty. Over 6,000 vehicles began assembling on the flightline at dawn after sirens blared; the six-hour convoy to Subic was so vast it included bar girls from Fields Avenue who followed servicemen to Olongapo. A contingent of 1,200 personnel (security, engineers, firemen, communications) stayed behind. Evacuees had packed only three days' worth of supplies and left behind critical documents (marriage licenses, insurance policies) and pets." },
  { keys: ["scene subic clark evacue arriv", "what was the scene at subic when clark evacuees arrived?"], text: "Subic's Sampaguita Club became a registration center, but the overcrowding was severe: thousands sweltered outdoors, some digging holes under their cars to stay cool. The great majority slept on cardboard in gymnasiums, classrooms, and chapels. That night the base commissary ran out of disposable diapers and dog food within hours of the evacuees' arrival. Subic had its own 14,000 Navy residents and had been experiencing water rationing and brownouts even before the influx." },
  { keys: ["ultimately abandon clark air base", "why did the u.s. ultimately abandon clark air base?"], text: "Clark was buried under heavy ashfall during the eruption, making it unusable. Combined with the expiration of the RP-US Military Bases Agreement in September 1991 (the negotiations had already broken down) and the end of the Cold War (which reduced the bases' strategic value), American forces permanently withdrew. The eruption, as the book puts it, \"left the United States government no option but to close down its largest offshore military base, rendering moot the ongoing negotiations.\"" },
  { keys: ["reaction angel city mayor clark evacuation", "what was the reaction of the angeles city mayor to the clark evacuation?"], text: "Mayor Antonio Abad Santos told reporters: \"The Americans are causing panic. I feel bad towards these Americans. They are overactive. We feel safe here. No one is affected.\" Dr. Punongbayan retorted, \"He is talking out of ignorance.\" Lieut. Kevin Mukri (Subic spokesman) said, \"The mayor is entitled to his own opinion, but our duty is to ensure the safety of our own personnel.\"" },
  { keys: ["happen mabalacat resident clark clos", "what happened to mabalacat residents when clark closed?"], text: "Hundreds of Mabalacat residents had already lost their houses in the eruption and also lost their jobs when Clark closed. They spent their hefty separation pay on new houses -- which they then lost again when the lahars came." },
  { keys: ["people died", "how many people died?"], text: "Several hundred people died directly from the eruption, mostly from roof collapses caused by wet volcanic ash made heavier by the simultaneous typhoon. Many more died from lahars in the years that followed -- the 1995 Cabalantian lahar alone killed at least 500-550 people in a single day." },
  { keys: ["primary cause death during eruption", "what was the primary cause of death during the eruption?"], text: "Roof collapses. Volcanic ash mixed with heavy rain from Typhoon Diding became far heavier than dry ash. The added weight caused flimsier or already-strained roofs to collapse on people sheltering inside their homes. The book specifically notes this as the dominant cause of direct eruption deaths." },
  { keys: ["live saved evacuation", "how many lives were saved by the evacuation?"], text: "Early warnings and evacuations are credited with saving tens of thousands of lives. The prospect Clark officials faced -- 15,000 military personnel being killed instantly like Pompeii -- gives scale to what the evacuation prevented. The book calls it \"a success story in disaster management.\"" },
  { keys: ["economic impact eruption", "what was the economic impact of the eruption?"], text: "The eruption caused massive economic damage -- destroying farmland, infrastructure, and Clark Air Base itself -- with losses estimated in the hundreds of millions of dollars, compounded by years of lahar damage. Tens of thousands of homes were damaged or destroyed, and hundreds of thousands of people were displaced. The closure of Clark alone eliminated thousands of jobs and a billion dollars per year in base-related economic activity." },
  { keys: ["happen bacolor cemetery", "what happened to the bacolor cemetery?"], text: "Repeated lahars forced the community to rebury the dead in Bacolor's cemetery over and over, one layer per monsoon season, until what had been \"six feet under\" became \"twenty-six feet under.\" The 1995 lahar dealt Bacolor one final blow, killing at least 500 residents in a single day." },
  { keys: ["long lahar continue after 1991 eruption", "how long did lahars continue after the 1991 eruption?"], text: "Lahars continued for several years, recurring with every rainy season as monsoon rains washed loose ash and pyroclastic deposits down the mountain's slopes. 1992 alone saw 62 separate lahar episodes triggered by a string of typhoons. The most devastating single lahar event was the 1995 Cabalantian disaster (Typhoon Mameng). The most severe activity was concentrated in 1991-1995." },
  { keys: ["1992 lahar season", "what was the 1992 lahar season like?"], text: "1992 saw 62 lahar episodes, mostly triggered by typhoons Asyang, Konsing, Ditang, and Gloring. By the end of 1992's monsoon season, 67,600 of Porac's 68,000 residents had evacuated, and 70% of Bamban's population had resettled elsewhere." },
  { keys: ["cabalantian disaster 1995", "what was the cabalantian disaster of 1995?"], text: "On October 1, 1995, Typhoon Mameng dumped 337 millimeters of rain on Pinatubo, triggering lahars that buried the barangay of Cabalantian and killed at least 550 residents. The remaining 13,000 inhabitants were trapped on rooftops for most of the day until helicopters rescued them." },
  { keys: ["megadike built", "what is the megadike, and when was it built?"], text: "The Megadike is a pair of parallel flood-control dikes built starting January 1996, funded by roughly P1.4 billion in emergency releases after the deadly 1995 Cabalantian lahar. One dike protects San Fernando, Angeles, Bacolor, Sto. Tomas, and Minalin; the other protects Porac, Sta. Rita, Floridablanca, Lubao, Sasmuan, and Guagua." },
  { keys: ["community warn each other approach lahar before mobile phon", "how did communities warn each other of approaching lahars before mobile phones?"], text: "Before mobile phones, communities near Pinatubo's rivers could only be warned by exploding firecrackers and ringing church bells. There was no other system to alert people in time." },
  { keys: ["lahar pampanga describ unprecedent history", "why were lahars of pampanga described as \"unprecedented in history\"?"], text: "The book states that \"in terms of magnitude, frequency and damage to densely populated communities, the lahars of Pampanga were unprecedented in history.\" Unlike fire and flood that destroy only a home, lahars destroy an entire home address -- forcing whole neighborhoods to relocate, erasing landmarks, and inundating the same place repeatedly to ensure nobody can rebuild. In Pampanga, this played out for five consecutive years." },
  { keys: ["ongo risk maraunot fault", "what is the ongoing risk from the maraunot fault?"], text: "The Maraunot Fault -- a sub-fault of the Iba Fault on Pinatubo's northwestern flank -- is still active. After 1991, the caldera lake rose dangerously close to a gap in the caldera rim right above the Maraunot Fault. If the gap were breached, water plus 6 cubic km of volcanic debris could cascade toward Botolan and neighboring towns. Heavy rains in July 2002 partially released lake water through the gap, averting catastrophe -- but the threat remains." },
  { keys: ["kapampangan recover after eruption", "how did kapampangans recover after the eruption?"], text: "The book describes the speed of recovery as surprising even to the Kapampangans themselves: \"As soon as the season of calamities ended, they got themselves out of the rock bottom where Pinatubo had kept them for five long years.\" Farmland was gradually restored, resettlement communities grew, and Mt. Pinatubo eventually became a tourism destination. Their deep religiosity played a role -- Kapampangans literally carried their religious images to the edge of lahar-threatened rivers, praying the waves would stop." },
  { keys: ["crater lake form", "what is the crater lake, and how was it formed?"], text: "The 1991 eruption collapsed Pinatubo's summit into a caldera roughly 2.5-3.5 km wide. Rainwater gradually filled this depression to form Crater Lake, which now sits roughly one kilometer above sea level. Today it is a popular hiking and tourist destination, typically reached via a 4x4 vehicle ride followed by a trek." },
  { keys: ["pinatubo still active", "is mt. pinatubo still active?"], text: "Yes, Mt. Pinatubo is still classified as an active volcano. It has had no major eruption since 1991, but the volcano remains monitored. The Maraunot Fault is still active, and a magma dome beneath the lake can still grow with minor eruptions." },
  { keys: ["kapampangan born after 1991 see look pinatubo today", "what do kapampangans born after 1991 see when they look at pinatubo today?"], text: "According to the book, \"Kapampangans aged 20 and below have no memory of the Pinatubo eruption. When they look at Mount Pinatubo they see a crater lake that's valued only as a magnet for tourists, not as a remembrance of past sorrows.\" This is part of the reason the author wrote the book -- to retell the story for those who weren't there." },
  { keys: ["raymundo punongbayan", "who was dr. raymundo punongbayan?"], text: "Dr. Raymundo Punongbayan was the Director of PHIVOLCS during the 1991 crisis. He dispatched the Quick Response Team that investigated Pinatubo's reawakening in April 1991 and oversaw all of PHIVOLCS' eruption monitoring and public warnings. He is co-editor (with Dr. Chris Newhall of USGS) of the landmark scientific reference Fire and Mud (1996). He is also the late Dr. Punongbayan -- he passed away after the book's events." },
  { keys: ["sister emma fondevilla", "who was sister emma fondevilla?"], text: "A Franciscan nun who worked with the Aeta community near Poonbato, Zambales, through an NGO called LAKAS (Lubos na Alyansa ng mga Katutubong Ayta ng Sambales). She first reported unusual landslide activity and smoke to PHIVOLCS in August 1990, and again reported the April 2, 1991 steam explosions. She also offered a nipa hut as the PHIVOLCS Quick Response Team's first field station at Sitio Yamut, and occasionally provided the scientists with food and cooking implements. She is credited with triggering the early monitoring that helped save tens of thousands of lives." },
  { keys: ["chri newhall", "who was dr. chris newhall?"], text: "Dr. Chris Newhall of the U.S. Geological Survey (USGS), based in Seattle, Washington. He led the American scientific team at the Pinatubo Volcano Observatory at Clark Air Base beginning April 24, 1991. He is co-editor of Fire and Mud with Dr. Punongbayan. He famously explained to Clark military officials what a \"Plinian eruption\" meant and warned that pyroclastic flows could engulf the base." },
  { keys: ["col richard anderegg", "who was col. richard anderegg?"], text: "Col. Richard Anderegg was the 3rd Tactical Fighter Wing Vice Commander at Clark Air Base. He oversaw the Clark evacuation planning and execution and wrote The Ash Warriors, one of the key primary sources the book acknowledges. He is quoted throughout the book describing the Clark military's perspective on the eruption crisis." },
  { keys: ["kelvin rodolfo", "who was dr. kelvin rodolfo?"], text: "Dr. Kelvin Rodolfo was a geologist and visiting professor from the University of Illinois in Chicago. He was at the PHIVOLCS office during Sister Emma's August 1990 visit. He later wrote Pinatubo and the Politics of Lahar, which the book acknowledges as a key source. He is also quoted criticizing PHIVOLCS' August 1990 decision to dismiss the steam activity without a ground survey." },
  { keys: ["levy laus save san fernando movement", "who is levy laus, and what is the save san fernando movement?"], text: "Levy Laus is President/CEO of the Laus Group of Companies. He played a significant role in the Save San Fernando Movement -- efforts to protect San Fernando City from lahar inundation -- and gave the author access to his personal Pinatubo collections documenting that role. He also spearheaded the commemoration of the eruption's 20th anniversary in 2011 along with Francis Tantingco." },
  { keys: ["julio sabit", "who was julio sabit?"], text: "Julio Sabit was the Officer-in-Charge of PHIVOLCS' Volcano Monitoring and Eruption Prediction Division and leader of the Quick Response Team dispatched to Pinatubo on April 5, 1991. His firsthand accounts of life at Sitio Yamut, monitoring conditions, and the escalating eruption activity appear extensively in the book." },
  { keys: ["phivolc", "what is phivolcs?"], text: "PHIVOLCS (Philippine Institute of Volcanology and Seismology) is the Philippine government agency that monitors volcanic and seismic activity nationwide. It led the scientific monitoring of Pinatubo before and during the 1991 eruption and issued all public evacuation warnings in the Philippines." },
  { keys: ["usgs involv", "what is usgs, and why were they involved?"], text: "The U.S. Geological Survey (USGS) sent a team to assist PHIVOLCS with technical monitoring expertise, given the direct threat to the nearby American-operated Clark Air Base and the ~15,000 U.S. personnel stationed there. The joint USGS-PHIVOLCS team operated from the Pinatubo Volcano Observatory (PVO) at Clark." },
  { keys: ["warn sign scientist monitor", "what warning signs did scientists monitor?"], text: "Scientists tracked: (1) increasing earthquake frequency and depth (shallow quakes indicated magma nearing the surface); (2) rising sulfur dioxide emissions (confirming fresh magma approaching); (3) ground deformation/tilting via tiltmeters (bulging indicating magma pressure); (4) visual observation of steam vents and ash emissions. The seismometers recorded up to 100+ high-frequency earthquakes per day before the eruption." },
  { keys: ["accurate eruption prediction", "how accurate was the eruption prediction?"], text: "The predictions were remarkably accurate in timing the major eruption phase. Scientists correctly identified the escalating timeline and issued evacuations ahead of the climactic eruption. However, the exact scale exceeded initial expectations -- scientists' models underestimated how fast the magma chamber would activate. French scientist Alain Burgisser later showed mathematically that 20-80 days were sufficient to activate Pinatubo's magma chamber, versus the conventional estimate of 500 years." },
  { keys: ["seismograph used pinatubo", "what is a seismograph, and how was it used at pinatubo?"], text: "A seismograph (seismometer) is an instrument that detects and records ground vibrations. Scientists used seven seismographs placed around Pinatubo, connected to computers at the PVO that measured earthquake location, depth, amplitude, and frequency. High-frequency quakes meant magma was forcing through solid rock; low-frequency quakes meant magma was getting closer to the surface. A seismogram is the paper sheet where the needle prints the recorded seismic waves." },
  { keys: ["sulfur dioxide so2 key warn sign", "what is sulfur dioxide (so2), and why was it a key warning sign?"], text: "Sulfur dioxide is a gas released by volcanoes as magma rises. Rising SO2 levels at Pinatubo were one of the key scientific signals that confirmed fresh magma was approaching the surface. After the eruption, the large quantity of SO2 ejected into the stratosphere spread worldwide and cooled global temperatures by ~0.5C for about two years." },
  { keys: ["pyroclastic flow hazard map limitation", "what was the pyroclastic-flow hazard map, and what were its limitations?"], text: "Issued by PHIVOLCS in May 1991, the map showed the expected extent of pyroclastic flows based on ancient pyroclastic deposits in river channels. It was later found to be incomplete: it covered only communities along river channels (where pyroclastic flows might pass) but not the alluvial plains where lahars might subsequently spread out. It was replaced after June 15 by a more comprehensive Lahar Hazard Map." },
  { keys: ["phivolc initially hesitate make definitive prediction", "why did phivolcs initially hesitate to make definitive predictions?"], text: "Because Pinatubo was erupting for the first time in recorded history, scientists had no baseline data on its behavior -- only hastily studied prehistoric deposits. Volcanoes behave in geologic rather than calendar time, meaning a restless volcano could stay dormant for years, decades, or centuries before erupting. Even if magma ascent continued, there was always a chance that rising magma could hit an impenetrable rock layer and the volcano would go back to sleep." },
  { keys: ["when did","what year","what date","when was the eruption","when did it erupt","when did pinatubo erupt"], text: "Mount Pinatubo first erupted at least 1 million years ago, when the ancestral volcano began forming. The volcano seen today, called Modern Pinatubo, began erupting slightly more than 35,000 years ago after a massive explosive eruption that reshaped the mountain. The first eruption recorded in human history occurred in June 15, 1991." },
  { keys: ["how many people died","how many died","how many casualt","death toll","number of deaths","how many people were killed","how many peop","many died","people died","people were killed","peeple"], text: "Several hundred people died, mostly from roofs collapsing under wet volcanic ash combined with rain from a typhoon striking at the same time. Many more died from lahars in the years that followed." },
  { keys: ["what caused most of the deaths","why did people die","cause of death"], text: "Most deaths happened when wet ash, made heavier by a typhoon hitting at the same time, caused roofs to collapse on people sheltering inside." },
  { keys: ["how many injured","number of injuries"], text: "Thousands of people were injured, mainly from roof collapses, falling debris, and respiratory problems caused by the ashfall." },
  { keys: ["lahar"], text: "Lahar is a fast-moving slurry of volcanic ash, rock, and water that flows like wet concrete down a volcano's slopes, often triggered by heavy rain remobilizing loose ash deposits." },
  { keys: ["how long did lahars","lahars continue","lahars last"], text: "Lahars continued for several years after the 1991 eruption, recurring with every rainy season as monsoon rains washed loose ash down the mountain's slopes." },
  { keys: ["aeta","ayta"], text: "The Aeta are the indigenous people of the Pinatubo region, believed to be among the earliest inhabitants of the Philippines. They lived in the mountain's forests for generations before being displaced by the eruption." },
  { keys: ["where did the aeta","aeta resettle","aeta relocated"], text: "Many displaced Aeta were resettled in lowland resettlement communities outside their ancestral mountain home, which significantly disrupted their traditional hunting, gathering, and forest-based way of life." },
  { keys: ["clark air base","clark airbase","clark base"], text: "Clark Air Base, a major U.S. military installation near the volcano, was heavily damaged by ashfall and was ultimately abandoned by American forces, later being converted into a civilian economic and aviation zone." },
  { keys: ["why did the us leave clark","us military leave"], text: "Clark Air Base was buried under heavy ashfall during the eruption, making it unusable; combined with the end of the U.S. military lease negotiations around that time, American forces withdrew." },
  { keys: ["how big was","how large was","size of the eruption","magnitude of the eruption","compare to other eruption","how powerful"], text: "Pinatubo's 1991 eruption is ranked the second-largest volcanic eruption of the 20th century, ejecting roughly 10 cubic kilometers of material — smaller only than Alaska's Novarupta eruption in 1912." },
  { keys: ["climate","global temperature","cool the planet","weather pattern"], text: "Ash and sulfur dioxide from the eruption reached the stratosphere and spread worldwide, measurably cooling average global temperatures by roughly 0.5°C for about two years afterward." },
  { keys: ["crater lake"], text: "The eruption collapsed Pinatubo's summit into a wide caldera, which gradually filled with rainwater to form Crater Lake — now a popular hiking and tourist destination." },
  { keys: ["who predicted","predict the eruption","early warning","forecast the eruption"], text: "Filipino scientists from PHIVOLCS, working with American volcanologists from the USGS, monitored seismic activity and gas emissions in the weeks before the eruption and issued evacuation warnings." },
  { keys: ["phivolcs"], text: "PHIVOLCS (Philippine Institute of Volcanology and Seismology) is the Philippine government agency that monitors volcanic and seismic activity; it led scientific monitoring of Pinatubo before the 1991 eruption." },
  { keys: ["lives saved","how many lives"], text: "Early warnings and evacuations before the climactic eruption are credited with saving tens of thousands of lives that would otherwise have been lost." },
  { keys: ["has pampanga recover","did pampanga rebuild","is pinatubo active today","is it active now","still active"], text: "In the decades since 1991, the region has gradually recovered: farmland has been restored, resettlement communities have grown, and Mt. Pinatubo is now also a tourism and memorial site. The volcano remains classified as active but has had no major eruption since 1991." },
  { keys: ["where is mt pinatubo","where is mount pinatubo","located","which province"], text: "Mt. Pinatubo sits on the border of Zambales, Tarlac, and Pampanga provinces on the island of Luzon, roughly 90 km northwest of Manila, Philippines." },
  { keys: ["how tall is", "height of", "elevation"], text: "Before 1991, Pinatubo stood about 1,745 meters tall. The eruption blew off its summit, leaving it roughly 1,486 meters tall today." },
  { keys: ["what country", "what province"], text: "Mt. Pinatubo is in the Philippines, on the island of Luzon, at the border of Zambales, Tarlac, and Pampanga provinces." },
  { keys: ["why is it called","name mean","meaning of the name","name of the mountain","why called","name come from","origin of the name","name pinatubo","etymology","named the mountain","what does the name","who named","name of mt"], text: "It was the Aeta who named the mountain Pinatubo, from the root word tubo, meaning \"to grow\" or \"to originate from.\" Linguists trace the word \"pinatubo\" (\"made to grow or increase\") to Sambal, not Kapampangan — likely referring to the volcano's dome growth." },
  { keys: ["typhoon","yunya","diding","storm hit"], text: "A typhoon — called Diding locally in the Philippines (internationally named Yunya) — struck the region at almost the exact same time as the climactic eruption on June 15, 1991, mixing wet ash with heavy rain and making roof collapses and lahars far more deadly." },
  { keys: ["can you hike","hike mount pinatubo","hike mt pinatubo","tourist destination","visit mt pinatubo","trek"], text: "Yes — Mt. Pinatubo's crater and Crater Lake are a popular hiking and day-trip destination today, typically reached via a 4x4 ride followed by a trek." },
  { keys: ["what is pyroclastic","pyroclastic flow"], text: "A pyroclastic flow is a fast-moving, extremely hot current of volcanic gas, ash, and rock fragments that races down a volcano's slopes during an explosive eruption." },
  { keys: ["how tall did the ash","ash column","ash cloud height"], text: "The climactic eruption sent an ash column an estimated 35 kilometers into the sky, among the highest ever recorded." },
  { keys: ["history of mt pinatubo before","history before 1991","ancestral pinatubo","what is ancestral"], text: "Geologists describe Pinatubo's history in eruptive periods going back roughly a million years. \"Ancestral Pinatubo\" refers to the original, much older summit that existed before the modern cone formed; the volcano's last known eruption before 1991 (the Buag Eruptive Period) occurred about 500 years earlier." },
  { keys: ["buag eruptive"], text: "The Buag Eruptive Period was Pinatubo's last known eruption before 1991, dated to roughly 500 years earlier (around the 15th century), based on geological and historical research." },
  { keys: ["how old is mt pinatubo","how old is pinatubo"], text: "Pinatubo's volcanic activity traces back roughly one million years to its ancestral form, though the modern cone that erupted in 1991 is geologically much younger." },
  { keys: ["how long did the eruption last","duration of the eruption"], text: "The most violent, climactic phase of the eruption occurred over about nine hours on June 15, 1991, though related volcanic activity (smaller eruptions, then lahars) continued for weeks, months, and years afterward." },
  { keys: ["was mt pinatubo active before 1991","active before 1991","dormant before"], text: "Before 1991, Pinatubo had been dormant for centuries — so long that it wasn't widely recognized as an active volcano until scientists investigated unusual seismic activity in early 1991." },
  { keys: ["what caused mt pinatubo to erupt","what caused the eruption","why did pinatubo erupt"], text: "New magma rising from deep underground intruded into Pinatubo's shallow magma chamber (only about 6 km below the surface) and mixed with older magma there, building up pressure and gas until the chamber's roof gave way, triggering the explosive eruption." },
  { keys: ["how many magma chambers","magma chamber size","how big is the magma chamber","total capacity magma","three magma chambers"], text: "Pinatubo's magma system has three connected chambers about 6 kilometers beneath the mountain: one under the ridge linking Pinatubo and Mount Negron, one beneath Mount Negron itself, and one beneath Pinatubo's northwest slope (under today's crater lake) — the chamber that fed the 1991 eruption. Together they hold roughly 125 cubic kilometers of magma." },
  { keys: ["what is magma","how did magma build up","magma chamber"], text: "Magma is molten rock from deep within the Earth. Beneath Pinatubo, magma pooled in a shallow chamber only about 6 kilometers down; as fresh, hotter magma intruded from below and mixed with the older magma, pressure built until it finally broke through." },
  { keys: ["what gases were released","gases released during"], text: "Sulfur dioxide and steam were the main gases released, along with volcanic ash. The large amount of sulfur dioxide is what later spread into the stratosphere and cooled global temperatures." },
  { keys: ["how much material did the volcano eject","material ejected","how much ash"], text: "Pinatubo ejected roughly 5 to 10 cubic kilometers of volcanic material during the 1991 eruption, making it one of the largest eruptions of the 20th century by volume." },
  { keys: ["did the eruption create a new crater","new crater formed"], text: "Yes — the climactic eruption caused the summit to collapse into a new caldera roughly 2.5 kilometers wide, which later filled with water to form today's Crater Lake." },
  { keys: ["how deep is pinatubo's crater","depth of the crater","crater lake depth"], text: "Pinatubo's caldera lake sits roughly one kilometer above sea level; exact crater depth has varied over time as sediment and water levels shifted, particularly after engineered releases of water in the 2000s." },
  { keys: ["did the eruption affect other countries","other countries affected"], text: "Yes — ash and sulfur dioxide from the eruption spread around the globe via the stratosphere, affecting sunsets and slightly cooling temperatures worldwide for about two years, even though the direct physical damage was concentrated in the Philippines." },
  { keys: ["effect on the sky","effect on the sun","colorful sunsets","sky color"], text: "Volcanic aerosols spread through the stratosphere produced unusually vivid, colorful sunsets around the world for months after the eruption, and slightly dimmed sunlight reaching the Earth's surface." },
  { keys: ["how many people were injured","number of injuries","injuries from the eruption"], text: "Thousands of people were injured, primarily from collapsing roofs under the weight of wet ash, falling debris, and respiratory problems caused by ashfall." },
  { keys: ["how many homes were destroyed","homes destroyed","houses destroyed"], text: "Tens of thousands of homes were damaged or destroyed by the combination of ashfall, the typhoon's rains, and later lahars that buried entire neighborhoods." },
  { keys: ["what towns were most affected","towns closest to the eruption","towns affected"], text: "The towns and cities closest to Pinatubo in Zambales, Pampanga, and Tarlac — including areas near Clark Air Base, Botolan, and Bacolor — were hit hardest by ashfall, and later by repeated lahars." },
  { keys: ["diseases spread after the eruption","disease outbreak"], text: "Crowded evacuation centers and disrupted sanitation led to outbreaks of respiratory illness and other communicable diseases in the weeks following the eruption." },
  { keys: ["hospitals and medical care","medical care after the eruption"], text: "Hospitals and clinics in the region were overwhelmed by ash-related injuries and respiratory cases, while many medical facilities themselves were damaged or had to be evacuated." },
  { keys: ["survivors in the days after","what was it like for survivors","experience of survivors"], text: "Survivors described days of darkness from the ash cloud, the constant rumble of aftershocks, and the disorienting experience of familiar landscapes being buried or transformed overnight." },
  { keys: ["how many people lost their homes","families lost their homes"], text: "Hundreds of thousands of people across Central Luzon were displaced and lost their homes, either immediately from the eruption and typhoon, or in the years after from recurring lahars." },
  { keys: ["economic damage","economic impact","cost of the eruption"], text: "The eruption caused massive economic damage — destroying farmland, infrastructure, and Clark Air Base itself — with losses estimated in the hundreds of millions of dollars, compounded by years of lahar damage afterward." },
  { keys: ["affect farmland","affect crops","impact on agriculture"], text: "Thick ashfall buried farmland across Central Luzon, destroying crops immediately and, in many areas, making the soil unusable for farming until it was cleared or until lahars buried it even deeper." },
  { keys: ["animals affected","what happened to animals","livestock"], text: "Livestock and farm animals across the region died from ashfall, collapsed shelters, and contaminated water and feed in the eruption's immediate aftermath." },
  { keys: ["did american scientists help","american scientists monitor"], text: "Yes — a team from the U.S. Geological Survey (USGS) worked alongside PHIVOLCS to monitor the volcano, given the direct risk to the nearby American-operated Clark Air Base." },
  { keys: ["what signs did scientists look for","warning signs scientists"], text: "Scientists monitored increasing earthquake activity, ground deformation, and rising sulfur dioxide emissions — all signs of magma moving toward the surface." },
  { keys: ["how accurate were the eruption predictions","accuracy of predictions"], text: "The predictions were remarkably accurate in timing the major eruption phase, which is widely credited with enabling evacuations that saved tens of thousands of lives, even though the exact scale of the climactic eruption still exceeded expectations." },
  { keys: ["instruments were used to monitor","monitoring equipment","seismographs"], text: "Scientists used seismographs to track earthquakes, tiltmeters and other instruments to measure ground deformation, and gas-monitoring equipment to track sulfur dioxide emissions from the volcano." },
  { keys: ["when did scientists first notice","first noticed unusual activity","first signs of activity"], text: "Unusual activity was first noticed in early April 1991, when a series of small steam explosions and increased seismic activity prompted PHIVOLCS to begin close monitoring." },
  { keys: ["usgs's role","usgs role","role of the usgs"], text: "The U.S. Geological Survey sent a team to assist PHIVOLCS with technical monitoring expertise, given the risk to nearby Clark Air Base and the personnel stationed there." },
  { keys: ["how were people evacuated","evacuation process","how was the evacuation"], text: "Authorities carried out staged evacuations as the threat level rose, moving residents and military personnel progressively farther from the volcano as PHIVOLCS raised its alert levels in the days before the climactic eruption." },
  { keys: ["how many u.s. personnel","u.s. personnel evacuated","american personnel evacuated"], text: "Tens of thousands of U.S. military personnel and their dependents were evacuated from Clark Air Base, with many temporarily relocated to other military facilities before eventually leaving the Philippines." },
  { keys: ["philippine government coordinate","government coordinate evacuation"], text: "The Philippine government, working with PHIVOLCS's alert levels, coordinated evacuations of civilian communities surrounding the volcano in the days leading up to the climactic eruption." },
  { keys: ["evacuation centers were set up","evacuation centers"], text: "Schools, gymnasiums, and other public buildings across Central Luzon were converted into evacuation centers to house the large number of displaced residents." },
  { keys: ["how long did people stay in evacuation centers","stay in evacuation centers"], text: "Many evacuees stayed in evacuation centers for weeks or months immediately after the eruption, and some resettlement communities, especially for displaced Aeta families, became long-term or permanent." },
  { keys: ["was the evacuation considered successful","success of the evacuation"], text: "The evacuation is widely regarded as a success story in disaster management — credited with saving tens of thousands of lives that would otherwise have been lost in the climactic eruption." },
  { keys: ["dikes","flood-control measures","flood control"], text: "Engineers and communities built dikes and flood-control structures in the years after 1991 to try to redirect or contain the repeated lahar flows, though many were overwhelmed during subsequent rainy seasons." },
  { keys: ["how much farmland was lost to lahar","farmland lost to lahar"], text: "Lahars buried thousands of hectares of farmland across Pampanga, Tarlac, and Zambales in the years following the eruption, some of it permanently." },
  { keys: ["are lahars still a risk today","lahar risk today","still a risk"], text: "The most severe lahar activity was concentrated in the years immediately after 1991; the risk has diminished significantly over time as ash deposits stabilized, though heavy rains can still occasionally remobilize remaining material." },
  { keys: ["what does the area around mt pinatubo look like now","area looks like now","landscape today"], text: "The area has largely recovered: ash-buried farmland has been reclaimed, vegetation has regrown on the slopes, and the crater area now draws hikers and tourists to Crater Lake." },
  { keys: ["how far is mt pinatubo from manila","far from manila","distance from manila"], text: "Mt. Pinatubo is roughly 90 kilometers northwest of Manila, in the Philippines." },
  { keys: ["what time did the climactic eruption","time of the climactic eruption","what time did it erupt"], text: "The most violent, climactic phase of the eruption began in the early afternoon of June 15, 1991, building through the day into the largest explosions that night." },
  { keys: ["what is a vei","volcanic explosivity index","explosivity index","vei rating","pinatubo's vei"], text: "The Volcanic Explosivity Index (VEI) measures eruption size on a scale of 0 to 8. Pinatubo's 1991 eruption is rated VEI 6, among the largest explosive eruptions of the 20th century." },
  { keys: ["smaller eruptions before the big one","eruptions before the climactic","build-up eruptions"], text: "Yes — Pinatubo had a series of smaller explosive eruptions in the days leading up to June 15, 1991, which scientists used to track the volcano's escalating activity before the climactic eruption." },
  { keys: ["what happened inside the volcano before it erupted","inside the volcano before"], text: "New magma rose from deep underground and intruded into Pinatubo's shallow magma chamber, mixing with older magma there. The resulting pressure and gas buildup eventually broke through the chamber's roof, triggering the climactic eruption." },
  { keys: ["towns were closest to the eruption","closest to the volcano"], text: "Communities in Zambales, Pampanga, and Tarlac closest to the volcano — including areas near Clark Air Base and Botolan — bore the brunt of the ashfall and pyroclastic flows." },
  { keys: ["what did the eruption sound like","sound of the eruption"], text: "Survivors described the climactic eruption as a series of thunderous explosions and a continuous deep rumble, audible for many kilometers, accompanied by lightning generated within the ash column itself." },
  { keys: ["how far did the ash travel","ash travel distance"], text: "Ash from the eruption fell across much of Luzon and was carried by the stratosphere around the entire globe, while the heaviest, most destructive ashfall was concentrated within about 50 kilometers of the volcano." },
  { keys: ["how did roofs collapsing cause deaths","roof collapse mechanism"], text: "Volcanic ash combined with heavy rain from a typhoon striking simultaneously, making it far heavier than dry ash. The added weight caused many roofs — especially flimsier or already-strained ones — to collapse onto the people sheltering inside." },
  { keys: ["animals were affected","what happened to animals","livestock affected"], text: "Livestock and farm animals across the region died from ashfall, collapsed shelters, and contaminated water and feed in the eruption's immediate aftermath." },
  { keys: ["how did scientists determine the eruption was coming","scientists determine eruption coming"], text: "Scientists tracked a clear escalation in seismic activity, ground deformation, and sulfur dioxide emissions in the weeks before June 15, which let PHIVOLCS raise alert levels and time evacuations ahead of the climactic eruption." },
  { keys: ["is mt pinatubo still an active volcano","still active volcano","currently active"], text: "Yes, Mt. Pinatubo is still classified as an active volcano, though it has had no major eruption since 1991." },
  { keys: ["last eruption before 1991","previous eruption before 1991"], text: "Pinatubo's last known eruption before 1991 was the Buag Eruptive Period, dated to roughly 500 years earlier, around the 15th century." },
  { keys: ["compare to other volcanic eruptions","compared to other eruptions","compared to other volcanoes"], text: "Pinatubo's 1991 eruption (VEI 6) ranks among the largest explosive eruptions of the 20th century, smaller only than Alaska's 1912 Novarupta eruption, and significantly larger than well-known eruptions like Mount St. Helens in 1980." },
  { keys: ["how many u.s. personnel","us personnel evacuated","american personnel evacuated","number of us personnel"], text: "Tens of thousands of U.S. military personnel and their dependents were evacuated from Clark Air Base, with many temporarily relocated to other military facilities before eventually leaving the Philippines." },

  // ---- Deeper content: people, places, legends, and specific events from the book ----
  { keys: ["raymundo punongbayan","who was punongbayan","phivolcs director"], text: "Dr. Raymundo Punongbayan was the PHIVOLCS Director during the 1991 crisis. He dispatched the Quick Response Team that investigated Pinatubo's reawakening in April 1991 and oversaw the agency's eruption monitoring and warnings." },
  { keys: ["quick response team","qrt"], text: "PHIVOLCS formed a Quick Response Team (QRT) of volcanologists who flew to investigate unusual activity on Pinatubo starting April 5, 1991, using a Franciscan mission station near the volcano as their field base." },
  { keys: ["sister emma","emma fondevilla","franciscan nun"], text: "Sister Emma Fondevilla, a Franciscan nun working with the Aeta community near Poonbato, Zambales, was the one who first reported unusual rumbling and landslide activity to PHIVOLCS, helping trigger early monitoring of the volcano." },
  { keys: ["five-level","volcano warning system","alert level system"], text: "On May 13, 1991, PHIVOLCS introduced a five-level Volcano Warning System, designed to be simple enough for local residents to understand while still conveying the volcano's escalating danger." },
  { keys: ["alert level 5","eruption in progress","maximum alert"], text: "PHIVOLCS raised the alert to Level 5 — its maximum, meaning \"eruption in progress\" — as the climactic eruption began on June 15, 1991, triggering final evacuations." },
  { keys: ["pnoc","geothermal drilling","geothermal exploration","who drilled pinatubo"], text: "The Philippine National Oil Company (PNOC), through its Energy Development Corporation (PNOC-EDC), began geothermal exploration drilling on Pinatubo in the 1980s, searching for energy sources. Some believe this disturbed the volcano's hydrothermal system, though scientists attribute the eruption to natural magma movement." },
  { keys: ["apu namalyari","pinatubo deity","pinatubo god"], text: "Apu Namalyari (\"lord who can make anything possible\") is the supreme deity the Aeta believe resides at Pinatubo's summit. Many Aeta saw the 1991 eruption as a sign of the deity's anger, partly linked to geothermal drilling on the mountain." },
  { keys: ["mount arayat","sinukuan"], text: "Mount Arayat, a separate volcano on the Pampanga plain often mistaken for Pinatubo, last erupted roughly 600,000 years ago. In Kapampangan legend, its deity Sinukuan is mythically associated with a rivalry against Pinatubo's deity." },
  { keys: ["bacolor"], text: "Bacolor, Pampanga, was one of the towns most devastated by repeated lahars after 1991 — the flows were so severe that the town cemetery had to be re-buried multiple times as ash layers piled up over the years." },
  { keys: ["hacienda luisita"], text: "Hacienda Luisita, in Tarlac, sits on volcanic material from the Crow Valley Eruptive Period (roughly 5,000-6,000 years ago), one of several prehistoric eruptive episodes the book traces in the region's geology." },
  { keys: ["what is kapampangan","kapampangan people","who are the kapampangans"], text: "The Kapampangans are the ethnic group native to Pampanga province, descended from Austronesian settlers who occupied the plains around Pinatubo, distinct from the Aeta who retreated to the mountain's foothills." },
  { keys: ["white smoke","black smoke","smoke mean","white or black"], text: "Early in the crisis, PHIVOLCS told residents a simple rule of thumb: if smoke from the volcano was white, there was no immediate danger; if it turned black, it was time to evacuate." },
  { keys: ["author of the book","who wrote the book","who wrote pinatubo"], text: "\"Pinatubo: The Saga of the Philippines' Forgotten Giant\" was published by Holy Angel University in 2011, drawing on eyewitness accounts, scientific reports, and contributions from multiple writers and researchers covering the 1991 eruption." },
  { keys: ["what does tubo mean","meaning of tubo"], text: "Tubo is the root word behind \"Pinatubo,\" meaning \"to grow\" or \"to originate from\" — referring to the volcano's dome growth." },
  { keys: ["luzon earthquake","1990 earthquake","earthquake before the eruption","earthquake before pinatubo"], text: "A major earthquake struck Luzon in July 1990, months before the eruption; some Aeta reported unusual mountain activity afterward, which in hindsight may have been an early sign of Pinatubo's reawakening." },
  { keys: ["why was clark air base important","significance of clark"], text: "Clark Air Base was one of the largest U.S. military installations outside the mainland United States, making the threat to it a major factor in how seriously the Philippine and American governments treated the eruption warnings." },
  { keys: ["what is vei","volcanic explosivity index","vei scale","vei rating"], text: "VEI stands for Volcanic Explosivity Index — a scale from 0 to 8 that measures the size of a volcanic eruption based on the volume of material ejected. Pinatubo's 1991 eruption was rated VEI 6, one of the largest of the 20th century." },
  { keys: ["what is the stratosphere","stratosphere"], text: "The stratosphere is the layer of Earth's atmosphere roughly 12–50 km above the surface. When Pinatubo's eruption shot ash and sulfur dioxide into the stratosphere, it spread globally and reflected sunlight, cooling Earth's surface for about two years." },
  { keys: ["what is a seismograph","seismograph","seismometer"], text: "A seismograph (or seismometer) is an instrument that detects and records ground vibrations — earthquakes and tremors. Scientists used seismographs to track increasing earthquake activity beneath Pinatubo as a key warning sign of the impending eruption." },
  { keys: ["what is sulfur dioxide","sulfur dioxide so2"], text: "Sulfur dioxide (SO2) is a gas released by volcanoes as magma rises. Rising SO2 levels at Pinatubo were one of the key scientific signals that confirmed fresh magma was approaching the surface before the 1991 eruption." },
  { keys: ["what is a caldera","caldera definition"], text: "A caldera is a large volcanic depression formed when a volcano's summit collapses into its emptied magma chamber during or after a powerful eruption. Pinatubo's 1991 eruption created a caldera roughly 2.5 kilometers wide, which filled with rainwater to form Crater Lake." },
{ keys: ["what is a volcano","what's a volcano","define volcano","volcano"], text: "A volcano is an opening in the Earth's crust where magma, gas, and ash escape to the surface, sometimes explosively. Mt. Pinatubo is a stratovolcano on Luzon island in the Philippines, best known for its massive eruption on June 15, 1991 — the second-largest of the 20th century." },
  { keys: ["what is an eruption","what's an eruption","define eruption","eruption"], text: "A volcanic eruption is the release of magma, gas, and ash from a volcano, ranging from gentle lava flows to violent explosions. Mt. Pinatubo's climactic eruption on June 15, 1991 was explosive (Plinian-type), sending an ash column roughly 35 kilometers into the sky." },
  { keys: ["what is mt pinatubo","what is mount pinatubo","what is pinatubo","about pinatubo","about mt pinatubo"], text: "Mt. Pinatubo is a stratovolcano on the border of Zambales, Tarlac, and Pampanga provinces in the Philippines. It was long dormant before its catastrophic eruption on June 15, 1991 — one of the largest volcanic eruptions of the 20th century — which reshaped the region and forced the closure of Clark Air Base." },
  { keys: ["what is this book","about this book","what book is this","what is the book"], text: "This chatbot is grounded in \"Pinatubo: The Saga of the Philippines' Forgotten Giant,\" a 2011 book by Robby Tantingco published by Holy Angel University. It traces Mt. Pinatubo's prehistoric eruptions through the catastrophic 1991 eruption and its five-year aftermath." },
  { keys: ["what is pampanga","about pampanga","pampanga province","pampanga"], text: "Pampanga is a province in Central Luzon, Philippines, and the region hit hardest by Mt. Pinatubo's 1991 eruption and the lahars that followed. Its capital is San Fernando." },
  { keys: ["what is tarlac","about tarlac","tarlac province","tarlac"], text: "Tarlac is one of the three provinces — along with Pampanga and Zambales — that converge at Mt. Pinatubo and bore the brunt of its 1991 eruption." },
  { keys: ["what is zambales","about zambales","zambales province","zambales"], text: "Zambales is the province on the western side of Mt. Pinatubo, facing the South China Sea. Much of the volcano's pyroclastic material and lahars flowed toward Zambales's river valleys and coastline." },
  { keys: ["what is a crater","define crater","crater definition"], text: "A crater is the bowl-shaped depression at a volcano's summit, formed by explosive eruptions or by the summit collapsing into the magma chamber below. Mt. Pinatubo's 1991 eruption created a caldera roughly 2.5 kilometers wide, which filled with water to form Crater Lake." },
  { keys: ["what is volcanic ash","define ash","ash fall"], text: "Volcanic ash is fine, gritty rock and glass debris blasted out during an eruption. Mt. Pinatubo's 1991 eruption sent an ash column roughly 35 kilometers high, and the falling ash — made heavier by rain from a passing typhoon — caused many roofs to collapse across Central Luzon." },
  { keys: ["what is an earthquake","define earthquake"], text: "An earthquake is the shaking of the ground caused by a sudden release of energy along a fault. A magnitude 7.8 earthquake struck Luzon on July 16, 1990 — months before Mt. Pinatubo's eruption — and is believed to have helped destabilize the volcano's magma chamber." },
  { keys: ["author","who wrote","robby tantingco","who wrote the book","dedication"], text: "The book was written by Robby Tantingco, completed May 17, 2011, and published by Holy Angel University. It is dedicated to all Pinatubo victims, particularly the Kapampangans." },
  { keys: ["sources","research","fire and mud","newhall"], text: "The book's sources include 'Fire and Mud' (co-edited by Dr. Chris Newhall of USGS and the late Dr. Raymundo Punongbayan of PHIVOLCS), Col. Richard Anderegg's 'The Ash Warriors', and Dr. Kelvin Rodolfo's 'Pinatubo and the Politics of Lahar'." },
  { keys: ["publisher","copyright","printed by","holy angel"], text: "The book is Copyright 2011 by Holy Angel University. Cover photos are by Josie D. Henson and Nick Sagmit. It was printed by Data Access Enterprises, Inc. in Quezon City, Philippines." },
  { keys: ["bacobaco","turtle legend","negrito myth","blit","aglao"], text: "A 1915 Negrito myth describes a giant sea-spirit turtle named Bacobaco burrowing into Mt. Pinatubo's summit to escape hunters. The story mirrors a volcanic eruption: three days of thundering quakes, smoke, and rains of hot rock, mud, and ash — showing the Aeta's ancient memory of Pinatubo as an active volcano." },
  { keys: ["sinukuan","feud","battle","mount arayat","punsalan","giants","namalyari"], text: "Kapampangan lore describes a cosmic rock-throwing war between Sinukuan of Mount Arayat and Namalyari (Punsalan) of Mt. Pinatubo. Legend says Mount Zambales was once one great mountain but was shattered into fragments — today's Zambales Range — after Sinukuan defeated Namalyari in battle." },
  { keys: ["apolaqui","mayari","sun and moon","fansler"], text: "In a tale collected by Dean S. Fansler in 1921, Bathala's children Apolaqui (the Sun/Arayat) and Mayari (the Moon/Pinatubo) fought with bamboo clubs. Apolaqui blinded Mayari in one eye — which is why the moon gives a fainter light than the sun." },
  { keys: ["mangatia","net weaver","needle","piedra blanca","white rock"], text: "In Masantol folklore, the supreme god Mangatia (the Net Weaver) wove the star-studded sky as a great fishing canopy. He dropped his sewing needle, which became the white rock (Piedra Blanca) on Mount Arayat — the magical gateway to Sinukuan's underground palace." },
  { keys: ["clark empty","fields avenue","bobby flores","three day"], text: "By noon on June 10, 1991, Clark Air Base stood empty for the first time in its 90-year history as over 6,000 vehicles evacuated to Subic — accompanied by Fields Avenue bar girls who followed the servicemen. Union president Bobby Flores worried about the June 15 payday being left behind." },
  { keys: ["subic overcrowding","sampaguita club","cardboard beds","diapers"], text: "Arriving Clark evacuees crowded Subic's Sampaguita Club for registration, with thousands sweltering outdoors. The overcrowding was severe — thousands slept on cardboard in gymnasiums, and the commissary ran out of diapers and dog food within hours." },
  { keys: ["june 12","june 12 explosion","independence day eruption","mushroom cloud","what happened on june","june 12 1991"], text: "On June 12, 1991 — Independence Day — Mt. Pinatubo exploded, sending an ash column over 19 kilometers into the sky at 1,300 feet per second, forming a mushroom cloud visible for hundreds of kilometers. Church bells rang and panic spread through Angeles City." },
  { keys: ["three eruption scenarios","plinian probability","moderately probable"], text: "USGS-PHIVOLCS scientists identified three possible scenarios: a Plinian eruption going northwest toward Zambales (highly probable), a larger eruption reaching Pampanga (moderately probable), or weeks of minor explosions (also moderately probable)." },
  { keys: ["what is kapampangan","kapampangans","kapampangan culture"], text: "The Kapampangans are the ethnic group native to Pampanga province, central Luzon. They were among the hardest-hit by the 1991 eruption and lahars, losing homes, livelihoods, and landmarks in what the book compares to the biblical ten plagues." },
  { keys: ["subsidence","sinking","pampanga sinking","land sinking"], text: "Scientists warn that Pampanga faces ongoing subsidence — the land gradually sinking under the weight of Pinatubo sediment and due to groundwater extraction. The towns of Sasmuan, Lubao, Macabebe, and Guagua are most at risk of eventually being reclaimed by the sea." },
  { keys: ["manila trench","philippine trench","ring of fire","tectonic plates"], text: "The Philippines sits between two subduction zones — the Manila Trench in the South China Sea and the Philippine Trench in the Pacific — making it one of the most geologically active spots on Earth. This tectonic setting is what gave rise to volcanoes like Mt. Pinatubo." },
  { keys: ["magsaysay","ramon magsaysay","plane crash","mount manunggal"], text: "President Ramon Magsaysay, who died in a plane crash on Mount Manunggal in Cebu in 1957, had actually named his presidential plane 'Mount Pinatubo' — the mountain where he hid and fought as a guerrilla during World War II. This caused widespread confusion about the crash location." },
  { keys: ["world war ii","japanese","guerrilla","camp sanchez wartime"], text: "During World War II, Mt. Pinatubo became a guerrilla haven. Gen. MacArthur authorized Lt. Col. Claude Thorpe to set up an observation post at Camp Sanchez to spy on Japanese planes at Clark, with Kapampangan volunteers including Col. Mario Pamintuan's family serving the resistance." },
  { keys: ["how was mount pinatubo born","birth of a volcano","birth of pinatubo","how did pinatubo form"], text: "About 10 to 15 million years ago, the Manila Trench beneath the West Philippine Sea suddenly slipped and plunged roughly 100 kilometers deeper into the Earth's mantle, generating magma that eventually broke through the crust west of Pampanga — giving birth to Mount Pinatubo." },
  { keys: ["mother of all pinatubo eruptions","mother of all eruptions","inararo eruptive period","inararo"], text: "Roughly 35,000 years ago, an eruption ten times larger than the 1991 eruption — sometimes called the 'mother of all Pinatubo eruptions' — destroyed the ancestral volcano and blanketed the region with about 325 feet of volcanic debris. Scientists call this the Inararo Eruptive Period." },
  { keys: ["sacobia eruptive period","what is the sacobia eruptive period"], text: "About 17,000 years ago, Pinatubo erupted again in the Sacobia Eruptive Period, burying more of Pampanga and Tarlac. The pyroclastic-flow deposits from this eruption are still visible on the Bamban side of the Sacobia River, where villages like Calumpang now stand." },
  { keys: ["did the spaniards know pinatubo was a volcano","spaniards volcano","spanish colonial period volcanic"], text: "No — when the Spanish arrived in Pampanga in 1571, the Buag Eruptive Period had already ended about 80 years earlier and the region's rivers had stabilized, so no volcanic activity was ever recorded during the entire Spanish colonial period." },
  { keys: ["h.a. myers","capt myers","1925 expedition","myers expedition"], text: "In 1925, Capt. H. A. Myers of the U.S. 26th Cavalry led an expedition up Pinatubo and described its crater as 'beyond description,' with walls rising sheer from 500 to 2,000 feet — one of the earliest detailed American accounts of the mountain." },
  { keys: ["camp sanchez","what was camp sanchez"], text: "Camp Sanchez, named for a Filipino officer in the U.S. Cavalry, was built as a base for American horseback expeditions to Pinatubo in the early 1900s, later expanding to include cottages, a golf course, and recreation facilities to take advantage of the mountain's cool climate." },
  { keys: ["preliminary findings not related","phivolcs landslide","phivolcs said not volcanic","what did phivolcs say after the landslide"], text: "After a landslide and reports of smoke on Pinatubo's slope in August 1990, PHIVOLCS did only a quick helicopter survey and issued a memo stating 'Preliminary findings indicate that the phenomenon is not related with any volcanic activity.' No further monitoring happened until April 1991, just two months before the climactic eruption." },
  { keys: ["1990 bases treaty negotiation","raul manglapus","richard armitage","bases rent negotiation"], text: "In late 1990, the Philippine panel (led by Raul Manglapus) sought $825 million a year for just a seven-year extension of the U.S. bases agreement, while the American panel (led by Richard Armitage) offered only $360 million a year for 10 to 12 years — talks that collapsed just as Pinatubo began stirring." },
  { keys: ["boeing 747 ash cloud","plane engine damage ash","747 encountered ash","boeing 747","what happened to the boeing 747"], text: "On June 15, 1991, a Tokyo-bound Boeing 747 flying at 29,000 feet over the South China Sea flew through Pinatubo's ash cloud; all four engines were damaged beyond repair. A second 747 flying Narita to Singapore also hit ash and pumice and had to divert to Taipei." },
  { keys: ["how much did pinatubo's summit height change","summit height change","how tall is pinatubo now","5725","4872","how tall did pinatubo used to be","tall pinatubo"], text: "The climactic eruption reduced Pinatubo's summit from 5,725 feet to 4,872 feet — a loss of 853 feet — and left behind a caldera about 3.5 kilometers wide that later filled with water to form today's Crater Lake." },
  { keys: ["megadike","what is the megadike"], text: "The Megadike is actually a pair of parallel flood-control dikes built starting January 1996 — one protecting San Fernando, Angeles, Bacolor, Sto. Tomas, and Minalin, the other protecting Porac, Sta. Rita, Floridablanca, Lubao, Sasmuan, and Guagua — funded by roughly P1.4 billion in emergency releases after the deadly 1995 Cabalantian lahar." },
  { keys: ["how many lahar episodes in 1992","62 lahar episodes","lahar episodes 1992"], text: "1992 alone saw 62 separate lahar episodes, mostly triggered by a string of strong typhoons (Asyang, Konsing, Ditang, and Gloring). By the end of that year's monsoon season, 67,600 of Porac's 68,000 residents had evacuated, and 70 percent of Bamban's population had resettled elsewhere." },
  { keys: ["cabalantian 1995","cabalantian lahar","october 1995 lahar","typhoon mameng"], text: "Typhoon Mameng dumped 337 millimeters of rain on Pinatubo on October 1, 1995, triggering lahars that buried the barangay of Cabalantian and killed at least 550 residents, while the rest of its 13,000 people were trapped on rooftops for most of the day until helicopters rescued them." },
  { keys: ["warn communities before cell phones","how did people warn each other lahar","firecrackers church bells"], text: "Before mobile phones existed, communities near Pinatubo's rivers could only be warned of an approaching lahar by exploding firecrackers and ringing church bells." },
  { keys: ["pinatubo's petrified trees","petrified trees","fossilized tree trunks abacan"], text: "After lahars scoured the Abacan riverbed in 1991, Angeles City residents found two kinds of fossilized tree trunks: some still had organic wood and were carbon-dated to about 2,900 years old, while others had fully petrified into hard rock — a process that takes at least 1,000,000 years." },
  { keys: ["compare pinatubo to mount st helens","pinatubo vs st helens","9 to 15 times stronger"], text: "USGS-PHIVOLCS scientists found Pinatubo's magma chamber measured 3 to 5 square kilometers, compared to just 1 square kilometer at Mount St. Helens — meaning Pinatubo's eruption had the potential to be 9 to 15 times stronger than the 1980 St. Helens eruption." },
  { keys: ["world's largest volcanic eruptions","compare pinatubo to other eruptions","novarupta vs pinatubo","biggest eruptions ever"], text: "Pinatubo ranks as the world's second-biggest eruption of the 20th century, behind only Alaska's 1912 Novarupta eruption. It's comparable in scale to Krakatoa (1883) and Huaynaputina (1600), but is dwarfed by prehistoric giants like Yellowstone and Tambora, which were many times larger." },

  // ---- Added from the "Complete Q&A" reference guide ----
  { keys: ["capas trail","what is the capas trail"], text: "The Capas Trail is a natural pass through the Zambales Mountain Range that let prehistoric Kapampangans, Sambals, and Aetas cross between the Zambales coast and the Tarlac-Pampanga side. It was used as a trade route long before the Spaniards arrived and led directly to Botolan, Zambales." },
  { keys: ["rivers from pinatubo","major rivers originating from pinatubo","rivers that come from pinatubo","which rivers come from pinatubo"], text: "Mt. Pinatubo feeds most of Central Luzon's major rivers, including the Marella, Maraunot, O'Donnell, Sacobia, Abacan, Pasig-Potrero, North Gumain, and Porac-Gumain rivers, plus countless smaller creeks and springs." },
  { keys: ["eruptive periods in order","sequence of eruptive periods","list of eruptive periods","named eruptive periods"], text: "In order, Pinatubo's eruptive history runs: Ancestral Pinatubo (1,000,000 to 45,000 years ago), the Inararo Eruptive Period (35,000 years ago), the Sacobia Eruptive Period (17,000 years ago), the Pasbul Eruptive Period (9,000 years ago), the Crow Valley Eruptive Period (6,000-5,000 years ago), the Maraunot Eruptive Period (3,900-2,300 years ago), the Buag Eruptive Period (roughly 500-800 years ago), and finally the 1991 eruption." },
  { keys: ["towns on prehistoric lahar deposits","which towns sit on old lahar deposits","towns standing on old pinatubo sediment"], text: "Lubao and Floridablanca sit atop deposits from the Pasbul Eruptive Period, much of Tarlac (including Hacienda Luisita) sits on Crow Valley Eruptive Period material, and the entire area of Clark Air Base was built on ground created by the Maraunot Eruptive Period." },
  { keys: ["porac archaeological sites","porac excavations","babo balukbuk"], text: "Archaeologists excavating the Porac highlands (Babo Balukbuk near the Porac River) found evidence of multiple generations of prehistoric settlers, each abandoning the site because of volcanic activity — with the final layer of artifacts buried under ash dated to the 14th to 16th century, matching the Buag Eruptive Period." },
  { keys: ["robert fox porcelain","1947 porcelain discovery","chinese porcelain pinatubo","robert b fox"], text: "In 1947, ethnographer Robert B. Fox found an extensive site of 13th- to 15th-century Chinese porcelain deep in Negrito territory on Pinatubo's west side, evidence that maritime traders once reached far into the mountains when the area was closer to the sea." },
  { keys: ["guy hilbero","who is guy hilbero","indra hilbero"], text: "Guy 'Indra' Hilbero is a Kapampangan who lived with the Baluga (Aeta) tribes on Mt. Pinatubo and Mt. Negron for nearly two years (1988-89) during the PNOC drillings, documenting their culture and later returning to the mountain in April 1994." },
  { keys: ["alindaya legend","sambal pinatubo origin myth","lake andaya"], text: "In a Sambal legend, a magician grew Mt. Pinatubo from a magic stone to grant a ruler's wish to hunt again, but his daughter Alindaya's refusal to marry the magician angered him, letting the mountain grow dangerously large — until a noble prince uprooted and relocated it, leaving behind what became Lake Andaya." },
  { keys: ["kargon kargon legend","who is kargon kargon"], text: "Kapampangan legend says the giant Kargon-Kargon, father of Suku (Sinukuan) of Mount Arayat, scooped up a mountain from Candaba and moved it to Arayat town, leaving behind the Candaba Swamp." },
  { keys: ["1909 geologist","smith pinatubo not a volcano","pinatubo not a volcano"], text: "In 1909, American geologist Smith of the U.S. Division of Mines climbed Pinatubo and wrote that it was 'not a volcano' with no signs of ever having been one — a conclusion that turned out to be wrong, showing how completely dormant and unrecognized the mountain was at the time." },
  { keys: ["earliest document mentioning pinatubo","fray domingo perez","relation of the zambals"], text: "The earliest known colonial document to mention Pinatubo by name is the Dominican missionary Fray Domingo Perez's 'Relation of the Zambals' (1680), which describes a dusty road strewn with rocks left by the river flowing from the mountain." },
  { keys: ["bacolor capital of the philippines","when was bacolor the capital"], text: "During 1762-64, amid the British Occupation of Manila, the Spaniards made Bacolor — just a few kilometers from Pinatubo — the temporary capital of the Philippines, unaware a volcano lurked nearby." },
  { keys: ["pnoc edc geothermal project","what was the pnoc edc project","geothermal drilling wells depth"], text: "Starting in 1982, the Philippine National Oil Company's Energy Development Corporation explored Pinatubo for geothermal energy, drilling at least three wells over 2 kilometers deep between 1988 and 1990 before abandoning the project in March 1990 — just 15 months before the eruption — after corrosive magmatic fluids and poor rock permeability made it commercially unviable." },
  { keys: ["rp us bases agreement","military bases agreement negotiation","clark base negotiations 1991","manglapus armitage"], text: "The 1947 RP-US Military Bases Agreement, later reset to expire in 1991, was in the middle of tense renewal negotiations — the Philippine panel sought $825 million a year for a seven-year extension while the American panel offered only $360 million a year for 10 to 12 years — when Pinatubo's eruption rendered the talks moot." },
  { keys: ["betamax tape","maurice krafft video","volcano education video"], text: "A video by the late volcanologist Maurice Krafft, showing shocking footage of lahars and pyroclastic flows from eruptions worldwide, was circulated by PHIVOLCS on Betamax tape and helped convince skeptical residents that a real eruption meant far more than trickling lava." },
  { keys: ["how big was clark air base","clark air base size","how many people at clark","clark air base acres"], text: "Clark Air Base occupied 10,000 acres of land only 14 kilometers from Mt. Pinatubo, housing over 15,000 U.S. servicemen plus 4,000 more retirees and families nearby, with about 10,000 Filipinos working on base." },
  { keys: ["maraunot fault","ongoing risk from pinatubo","is the crater lake dangerous","future doomsday scenario"], text: "The Maraunot Fault, on Pinatubo's northwestern caldera rim, remains active. After 1991 the crater lake rose dangerously close to a gap above the fault; heavy rains in July 2002 partially released the lake through the gap and averted a breach, but the risk of the lake and volcanic debris cascading toward Botolan remains." },
  { keys: ["who was chris newhall","chris newhall usgs"], text: "Dr. Chris Newhall of the U.S. Geological Survey, based in Seattle, led the American scientific team at the Pinatubo Volcano Observatory at Clark Air Base starting April 24, 1991, and is co-editor of 'Fire and Mud' with Dr. Raymundo Punongbayan." },
  { keys: ["who was richard anderegg","richard anderegg ash warriors"], text: "Col. Richard Anderegg was the 3rd Tactical Fighter Wing Vice Commander at Clark Air Base, who oversaw the base's evacuation planning and later wrote 'The Ash Warriors,' one of the book's key primary sources." },
  { keys: ["who was kelvin rodolfo","kelvin rodolfo geologist"], text: "Dr. Kelvin Rodolfo was a geologist and visiting professor from the University of Illinois in Chicago who was present at PHIVOLCS during Sister Emma's August 1990 report, and later wrote 'Pinatubo and the Politics of Lahar.'" },
  { keys: ["who was julio sabit","julio sabit phivolcs"], text: "Julio Sabit was the Officer-in-Charge of PHIVOLCS' Volcano Monitoring and Eruption Prediction Division and led the Quick Response Team dispatched to Pinatubo on April 5, 1991." },
  { keys: ["who is levy laus","save san fernando movement"], text: "Levy Laus, President/CEO of the Laus Group of Companies, played a significant role in the Save San Fernando Movement to protect San Fernando City from lahar inundation, and later helped spearhead the eruption's 20th-anniversary commemoration in 2011." },
];

// Pre-tokenized fact keys, built once, so matching doesn't re-tokenize
// every key on every question.
let FACTS_INDEXED: { text: string; keySets: string[][] }[] | null = null;

function buildFactsIndex(): void {
  if (FACTS_INDEXED) return;
  FACTS_INDEXED = (FALLBACK_FACTS as Fact[]).map(f => ({
    text: f.text,
    keySets: f.keys.map(k => tokenize(k)).filter(ks => ks.length > 0),
  }));
}

function scoreFactIndexed(keySets: string[][], querySet: Set<string>): number {
  let best = 0;
  for (const keyTokens of keySets) {
    // Require every meaningful word in the key phrase to be present in the
    // (typo-corrected) question — this keeps the same precision as the old
    // exact-substring check, but no longer requires perfect spelling or
    // exact word order.
    const allPresent = keyTokens.every(t => querySet.has(t));
    if (allPresent && keyTokens.length > best) best = keyTokens.length;
  }
  return best;
}

export function findFact(correctedTokens: string[]): string|null {
  buildFactsIndex();
  const querySet = new Set(correctedTokens);
  let bestScore = 0, bestText: string|null = null;
  for (const entry of FACTS_INDEXED!) {
    const score = scoreFactIndexed(entry.keySets, querySet);
    if (score > bestScore) { bestScore = score; bestText = entry.text; }
  }
  return bestScore > 0 ? bestText : null;
}

// ================================================================
// SOCIAL INTENTS
// ================================================================
interface SocialIntent { name: string; pattern: RegExp; responses: string[]; followups?: boolean; }

const SOCIAL_INTENTS = [
  {
    name: 'greeting',
    pattern: /^\s*(hi|hello|hey|kumusta|kamusta|good\s?(morning|afternoon|evening)|magandang\s?(umaga|hapon|gabi))\b/,
    responses: [
      "Malaus ka, apo! Welcome. Ask me anything about Mt. Pinatubo's 1991 eruption.",
      "Hello! Welcome to the Apo Pinatubo Archive Guide. What would you like to know?",
      "Kumusta, apo! What would you like to know about Mt. Pinatubo?",
    ],
    followups: true
  },
  {
    name: 'how_are_you',
    pattern: /how are you|kamusta ka|how('?s| is) it going|how do you feel/,
    responses: [
      "Steady as a mountain, apo. What can I tell you about Pinatubo?",
      "All good here — ready for your questions about the 1991 eruption.",
    ],
    followups: true
  },
  {
    name: 'thanks',
    pattern: /\b(thank you|thanks|thank u|salamat|maraming salamat|appreciate it)\b/,
    responses: [
      "You're welcome, apo.",
      "Anytime, apo. Walang anuman.",
      "Glad that helped — ask me anything else about Mt. Pinatubo.",
    ],
    followups: true
  },
  {
    name: 'goodbye',
    pattern: /^\s*(bye|goodbye|see you|see ya|paalam|good night|gn|that'?s all|i'?m done|that is all)\b/,
    responses: [
      "Paalam, apo. Salamat sa pagbisita — come back anytime to learn more about Mt. Pinatubo.",
      "Goodbye, apo. Ingat — the mountain will be here when you return.",
    ],
    followups: false
  },
  {
    name: 'identity',
    pattern: /who are you|what are you|tell me about yourself|ano ka|sino ka/,
    responses: [
      "I'm Apo Pinatubo, an offline guide built from the book \"Pinatubo: The Saga of the Philippines' Forgotten Giant\" (HAU, 2011). Ask me anything about the 1991 eruption.",
    ],
    followups: true
  },
  {
    name: 'capabilities',
    pattern: /what can you (do|answer)|what do you know|help me|what should i ask|what kind of questions/,
    responses: [
      "I can answer questions about Mt. Pinatubo's 1991 eruption — the timeline, the science, the Aeta, Clark Air Base, the lahars, casualties, recovery, and more. Try one of the suggestions below, or ask your own.",
    ],
    followups: true
  },
];

function pickRandom(arr: string[]): string { return arr[Math.floor(Math.random()*arr.length)]; }

export function matchSocial(q: string): {text:string; followups:boolean}|null {
  const t = q.trim().toLowerCase();
  for (const i of (SOCIAL_INTENTS as SocialIntent[])) {
    if (i.pattern.test(t)) return { text: pickRandom(i.responses), followups: !!i.followups };
  }
  return null;
}

// ================================================================
// FOLLOW-UPS
// ================================================================
const FOLLOW_UPS = [
  "What happened to the Aeta communities?","How did lahars affect nearby towns?",
  "What was Clark Air Base's role?","How did scientists predict the eruption?",
  "How big was the eruption compared to others?","What is the crater lake like today?",
  "How did ash affect global climate?","Where exactly is Mt. Pinatubo?",
  "Who was Sister Emma Fondevilla?","Who is Apu Namalyari?",
  "What was the five-level warning system?","Who was Dr. Raymundo Punongbayan?",
];

export function getFollowups(): string[] {
  return [...FOLLOW_UPS].sort(()=>Math.random()-0.5).slice(0,3);
}

// ================================================================
// MAIN ANSWER BUILDER
// ================================================================
export interface Answer { text: string; citations: string[]; followups: string[]; }

export function buildAnswer(question: string): Answer {
  // Layer 1: social intent
  const social = matchSocial(question);
  if (social) return { text: social.text, citations: [], followups: social.followups ? getFollowups() : [] };

  // Make sure the vocabulary (built from both the book text and the
  // curated fact keys/answers) is ready before we try to typo-correct
  // anything — this lets misspellings get fixed before EITHER the
  // curated-fact lookup or the full-text search runs.
  initBM25();
  const correctedTokens = tokenizeWithCorrection(question);

  // Layer 2: curated facts (now typo-tolerant via correctedTokens)
  const fact = findFact(correctedTokens);
  if (fact) return { text: fact, citations: [], followups: getFollowups() };

  // Layer 3: BM25 search
  // Single-word queries (a stray name, a typo, a fragment) are the main
  // source of nonsense answers here: BM25's IDF weighting means one rare
  // word can score deceptively high and pull in unrelated passages that
  // just happen to contain it, stitched together into something that
  // reads like an answer but isn't actually responsive to what was asked.
  // Any single meaningful topic word that really is answerable already
  // has a curated fact (Layer 2, above) with a clear, on-topic reply, so
  // requiring at least 2 content words here to even attempt full-text
  // search costs us nothing real and cuts out the garbled edge cases.
  if (correctedTokens.length >= 2) {
    const results = searchBM25(correctedTokens, 20);
    if (results.length && results[0].score > 2.2) {
      const {text, citations} = synthesize(results, 3);
      return { text, citations, followups: getFollowups() };
    }
    if (results.length && results[0].score > 1.0) {
      const {text, citations} = synthesize(results, 1);
      return { text, citations, followups: getFollowups() };
    }
  }

  // Layer 4: no match
  return {
    text: "I don\'t have information on that. Try asking about the 1991 eruption, the Aeta, lahars, or Clark Air Base.",
    citations: [],
    followups: getFollowups()
  };
}