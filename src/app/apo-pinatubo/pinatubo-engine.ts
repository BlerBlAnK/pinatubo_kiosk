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
let avgDocLen = 0;
const N_DOCS = KNOWLEDGE.length;
const df: Record<string,number> = {};

function initBM25(): void {
  if (_initialized) return;
  docTokensList = KNOWLEDGE.map(k => tokenize(k.text));
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

function searchBM25(rawTerms: string[], topK: number): {entry:{page:number;text:string;source?:string}; score:number}[] {
  const queryTerms = expandTerms(rawTerms);
  if (!queryTerms.length) return [];
  const scores = KNOWLEDGE.map((_,idx) => ({idx, score:bm25Score(idx,queryTerms)}));
  scores.sort((a,b) => b.score-a.score);
  return scores.slice(0,topK).filter(s=>s.score>0.5).map(s=>({entry:KNOWLEDGE[s.idx],score:s.score}));
}

function synthesize(results: {entry:{page:number;text:string;source?:string}; score:number}[], max: number): {text:string; citations:string[]} {
  const chosen: {entry:{page:number;text:string;source?:string}; score:number}[] = [];
  for (const r of results) {
    if (chosen.length >= max) break;
    const sameCount = chosen.filter(c=>c.entry.page===r.entry.page && c.entry.source===r.entry.source).length;
    if (sameCount >= 2) continue;
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
  "When did Mt. Pinatubo erupt?","How many people died?","What is lahar?","Who are the Aeta?",
  "What happened to Clark Air Base?","Who is Apu Namalyari?","What is the Crater Lake?",
  "Who was Dr. Raymundo Punongbayan?","Who was Sister Emma Fondevilla?",
  "How big was the 1991 eruption?","What is pyroclastic flow?","What is PHIVOLCS?",
  "How did the eruption affect global climate?","What is the Buag Eruptive Period?",
  "Why is it called Mt. Pinatubo?","What is the five-level warning system?",
  "What was the 1990 Luzon earthquake?","Where is Mt. Pinatubo located?",
  "How tall is Mt. Pinatubo?","Who predicted the eruption?","What is a caldera?",
  "What is PNOC-EDC?","What is Camp Sanchez?","Who was President Magsaysay and Mt. Pinatubo?",
  "What is the Sinukuan legend?","What is the Bacobaco myth?","Who wrote the book?",
  "What happened to Bacolor?","What is the typhoon that hit during the eruption?",
  "How did lahars affect Pampanga?","Can you hike Mt. Pinatubo today?",
  "How were the Aeta evacuated?","What is geothermal energy?","Who is Guy Hilbero?",
  "What is subsidence?","What is the Manila Trench?","How many lives were saved?",
  "What is magma?","What is the VEI of the 1991 eruption?","What happened on June 12, 1991?",
  "How many U.S. personnel were evacuated?","What is the Maraunot Fault?",
  "What is ancestral Pinatubo?","How was Crater Lake formed?","Say hello","Goodbye",
  "Who are the Kapampangans?","What is the USGS?","What gases were released?"
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
  { keys: ["when did","what year","what date","when was the eruption","when did it erupt","when did pinatubo erupt"], text: "Mount Pinatubo's climactic eruption struck on June 15, 1991, after weeks of smaller build-up eruptions earlier that month." },
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
  { keys: ["recover","rebuild","today","is it active now","still active"], text: "In the decades since 1991, the region has gradually recovered: farmland has been restored, resettlement communities have grown, and Mt. Pinatubo is now also a tourism and memorial site. The volcano remains classified as active but has had no major eruption since 1991." },
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
  const results = searchBM25(correctedTokens, 20);
  if (results.length && results[0].score > 1.5) {
    const {text, citations} = synthesize(results, 3);
    return { text, citations, followups: getFollowups() };
  }
  if (results.length && results[0].score > 0.5) {
    const {text, citations} = synthesize(results, 1);
    return { text, citations, followups: getFollowups() };
  }

  // Layer 4: no match
  return {
    text: "I don\'t have information on that. Try asking about the 1991 eruption, the Aeta, lahars, Clark Air Base, or the scientists who monitored Pinatubo.",
    citations: [],
    followups: getFollowups()
  };
}