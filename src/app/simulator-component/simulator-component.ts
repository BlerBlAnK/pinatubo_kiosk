import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ChapterId = 'before-1991' | 'early-unrest' | 'steam-and-gas' | 'magma-ascent' | 'escalating-activity' | 'eruption' | 'aftermath';
type Phenomenon = 'ash' | 'bomb' | 'lava' | 'steam';
type EruptionPhase = 'idle' | 'rumble' | 'rising' | 'pressure' | 'burst' | 'overflow' | 'cooling';

interface Chapter {
  id: ChapterId;
  numeral: string;
  title: string;
  year: string;
  icon: string;
  description: string;
  bullets: string[];
  image?: string;
}

interface AftermathStat {
  label: string;
  value: string;
  hint: string;
}

interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

interface EruptionOutcome {
  vei: string; title: string; narrative: string;
  kind: Phenomenon; plumeHeightKm: number; pyroclasticFlow: boolean;
  lavaFlowKm: number; hazardLevel: string;
  pressureNote: string; waterNote: string; viscosityNote: string;
  ashColor: number;
}

@Component({
  selector: 'app-simulator-component',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simulator-component.html',
  styleUrl: './simulator-component.css',
})
export class SimulatorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // ================= CHAPTERS (Mount Pinatubo, 1991) =================

  readonly chapters: Chapter[] = [
    {
      id: 'before-1991', numeral: 'I', title: 'Before 1991', year: 'Dormant since c. 1500', icon: '🌲',
      description: 'For more than four centuries Pinatubo sat quiet under thick forest in the Zambales Mountains of Central Luzon, unremarkable enough that most regional maps barely named it. The Aeta people had lived on its slopes for generations. Nothing about its gentle, green profile suggested it was one of the most dangerous volcanoes in the Philippines.',
      bullets: [
        'Last confirmed eruption roughly 500 years earlier',
        'A densely forested, gently sloped stratovolcano in the Zambales Range',
        'Home to the indigenous Aeta community',
      ],
      image: 'assets/pinatubo/before-1991.jpg',
    },
    {
      id: 'early-unrest', numeral: 'II', title: 'Early Unrest', year: 'March 15, 1991', icon: '📳',
      description: 'A magnitude 7.8 earthquake had rattled the region back in July 1990, triggering a brief, unremarkable stir of steam and small quakes at Pinatubo before it went quiet again. Then, on March 15, 1991, villagers on the volcano\u2019s forested northwest flank began feeling tremors of their own — the first sign that this time, something underneath was actually changing.',
      bullets: [
        'Villagers at Sitios Tarao and Yamut felt the season\u2019s first tremors',
        'Nothing was yet visible at the summit — the mountain still looked completely normal',
        'A magnitude 7.8 regional quake eight months earlier is now seen as a possible trigger',
      ],
    },
    {
      id: 'steam-and-gas', numeral: 'III', title: 'Steam and Phreatic Explosions', year: 'April 2 \u2013 May 1991', icon: '💨',
      description: 'On the afternoon of April 2, a series of small explosions tore a 1.5-kilometer line of vents across the volcano\u2019s upper north flank, dusting villages 10 kilometers away with ash. These were phreatic blasts — groundwater flashing to steam against rising heat, not magma itself reaching the surface. Dense white steam kept jetting from the new vents for weeks afterward.',
      bullets: [
        'The April 2 explosions ejected only old rock — no fresh magma, confirming a steam-driven origin',
        'Fumaroles vented steam 300\u2013800 m high, occasionally gusting ash to 3 km',
        'A seismic network installed within days logged tens to hundreds of quakes a day',
      ],
    },
    {
      id: 'magma-ascent', numeral: 'IV', title: 'Magma on the Move', year: 'Late May \u2013 June 6, 1991', icon: '🔥',
      description: 'Beneath Mount Pinatubo\u2019s still-unchanged summit, fresh magma was forcing its way toward the surface through the volcano\u2019s own plumbing. In mid-May, sulfur dioxide output suddenly spiked — then puzzlingly collapsed within days. Scientists correctly read the drop as bad news: the conduit had sealed itself, trapping gas-charged magma directly under the mountain\u2019s summit at mounting pressure.',
      bullets: [
        'A sealed conduit traps rising gas — pressure builds invisibly rather than venting safely',
        'A newly installed tilt network detected the ground swelling on the upper east flank',
        'By June 1, earthquakes were originating just 5 km below the summit',
      ],
    },
    {
      id: 'escalating-activity', numeral: 'V', title: 'Escalating Activity', year: 'June 7 \u2013 14, 1991', icon: '⚡',
      description: 'On June 7, seismicity rocketed to 1,500 quakes a day and an ash burst reached 8 kilometers — magma had finally arrived, extruding a small lava dome just northwest of the summit. Alert Level 4 was declared and a 20-kilometer danger zone drawn. Explosions on June 12 and 13 sent ash 19 and then 25 kilometers up, each one a rehearsal for what was coming.',
      bullets: [
        '14,400 personnel evacuated Clark Air Base on June 10 alone',
        'June 12 (Philippine Independence Day) produced the first sub-Plinian column, ~19 km high',
        'The unstable new dome triggered Pinatubo\u2019s first small pyroclastic flows on June 9',
      ],
    },
    {
      id: 'eruption', numeral: 'VI', title: 'The Climactic Eruption', year: 'June 15, 1991', icon: '🌋',
      description: 'On the afternoon of June 15, with Typhoon Yunya battering the region at the very same time, Pinatubo let go in a colossal Plinian eruption — hurling an ash column more than 35 kilometers into the stratosphere while pyroclastic density currents raced down every flank of the mountain.',
      bullets: [],
    },
    {
      id: 'aftermath', numeral: 'VII', title: 'Aftermath', year: 'After June 1991', icon: '🏞️',
      description: 'When the explosions finally stopped, the mountain had lost its summit to a wide new caldera, and Pampanga, Tarlac, and Zambales all lay under a blanket of grey ash. Renewed dome growth continued intermittently into 1992. Within months, rain and groundwater began collecting in the caldera floor — the first stage of what would become Lake Pinatubo, still slowly deepening years later.',
      bullets: [],
    },
  ];

  readonly aftermathStats: AftermathStat[] = [
    { label: 'VEI', value: '6', hint: 'Ultra-Plinian — the second-largest eruption of the 20th century' },
    { label: 'Ash Column', value: '~35 km', hint: 'Height the eruption column reached into the stratosphere' },
    { label: 'People Evacuated', value: '200,000+', hint: 'Residents, Aeta communities, and Clark Air Base personnel moved to safety' },
    { label: 'Lives Lost', value: '847', hint: 'Most from wet ash collapsing roofs during Typhoon Yunya, which struck at the same time' },
    { label: 'Economic Damage', value: '~$700M', hint: 'Crops, infrastructure, evacuation, and lahar-control costs combined' },
    { label: 'Global Cooling', value: '~0.5\u00B0C', hint: 'Average drop in global temperatures for about two years afterward' },
  ];

  private readonly cameraViews: Record<ChapterId, CameraView> = {
    'before-1991': { position: [0, 11, 32], target: [0, 6, 0] },
    'early-unrest': { position: [0, 10, 29], target: [0, 6, 0] },
    'steam-and-gas': { position: [-7, 10, 20], target: [0, 7, 0] },
    'magma-ascent': { position: [7, -20, 14], target: [0, -23, 0] },
    'escalating-activity': { position: [7, 9, 17], target: [0, 8, 0] },
    'eruption': { position: [0, 8, 27], target: [0, 11, 0] },
    'aftermath': { position: [0, 14, 34], target: [0, 5, 0] },
  };

  chapterIndex = 0;
  maxUnlocked = 0;
  eruptionWitnessed = false;
  bars = Array(15).fill(0);
  audioMuted = false;

  private readonly outcome: EruptionOutcome = {
    vei: 'VEI 6 \u2014 Pinatubo, 1991', title: 'Ultra-Plinian Climax',
    narrative: 'Highly gas-charged magma met a groundwater system already primed by weeks of precursor explosions, producing one of the most powerful eruptions of the 20th century.',
    kind: 'ash', plumeHeightKm: 35, pyroclasticFlow: true, lavaFlowKm: 3, hazardLevel: 'Extreme',
    pressureNote: 'Extreme \u2014 gas-charged magma trapped enormous pressure for weeks',
    waterNote: 'Groundwater flashing to steam amplified the explosion',
    viscosityNote: 'Thick, gas-rich magma prone to violent fragmentation',
    ashColor: 0xc3cad4,
  };

  get currentChapter(): Chapter {
    return this.chapters[this.chapterIndex];
  }

  get progressPercent(): number {
    return Math.round((this.chapterIndex / (this.chapters.length - 1)) * 100);
  }

  get seismicLevel(): number {
    return Math.round(Math.min(1, this.shakeAmount / 0.12) * 100);
  }

  get canGoBack(): boolean {
    return this.chapterIndex > 0 && !this.isErupting;
  }

  get canGoNext(): boolean {
    return this.chapterIndex < this.chapters.length - 1 && this.currentChapter.id !== 'eruption';
  }

  trackChapter(_: number, c: Chapter): ChapterId {
    return c.id;
  }

  isUnlocked(i: number): boolean {
    return i <= this.maxUnlocked;
  }

  goToChapter(i: number): void {
    if (!this.isUnlocked(i) || i === this.chapterIndex || this.isErupting) return;
    this.initAudio();
    this.chapterIndex = i;
    this.onEnterChapter();
  }

  goNext(): void {
    if (!this.canGoNext) return;
    this.initAudio();
    this.chapterIndex++;
    this.maxUnlocked = Math.max(this.maxUnlocked, this.chapterIndex);
    this.onEnterChapter();
  }

  goPrevious(): void {
    if (!this.canGoBack) return;
    this.initAudio();
    this.chapterIndex--;
    this.onEnterChapter();
  }

  continueToAftermath(): void {
    if (!this.eruptionWitnessed) return;
    clearTimeout(this.phaseTimer);
    clearTimeout(this.eruptionBurstTimer);
    this.phase = 'idle';
    this.chapterIndex = this.chapters.length - 1;
    this.maxUnlocked = this.chapterIndex;
    this.onEnterChapter();
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  toggleMute(): void {
    this.audioMuted = !this.audioMuted;
    if (!this.audioCtx) { this.initAudio(); return; }
    if (this.audioMaster) {
      this.audioMaster.gain.setTargetAtTime(this.audioMuted ? 0 : 0.35, this.audioCtx.currentTime, 0.15);
    }
    this.applyAudioProfile();
  }

  private onEnterChapter(): void {
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    this.applyAudioProfile();

    const view = this.cameraViews[this.currentChapter.id];
    this.flyCameraTo(view.position, view.target, 2200);

    this.birdGroup.visible = this.currentChapter.id === 'before-1991';

    const underground = this.currentChapter.id === 'magma-ascent';
    this.undergroundGroup.visible = underground;
    this.mountainMesh.visible = !underground;
    this.skyMesh.visible = !underground;
    this.cloudGroup.visible = !underground;
    this.groundMesh.visible = !underground;
    this.vegetation.visible = !underground;
    this.geoGroup.visible = !underground;

    this.fumarolesActive = false;
    this.rockfallsActive = false;
    this.rainActive = false;

    switch (this.currentChapter.id) {
      case 'before-1991':
        this.craterFillTarget = 0;
        this.smokeTarget = 0;
        this.magmaBaseGlowTarget = 0;
        this.shakeAmount = 0;
        this.vegetationGrowthTarget = 1;
        this.landscapeAshTarget = 0;
        this.skyDarknessTarget = 0;
        this.crackVisibilityTarget = 0;
        this.lakeFormationTarget = 0;
        break;

      case 'early-unrest':
        // Deliberately near-identical to "before" — the whole point is that nothing
        // is visible at the summit yet. Only a barely-perceptible tremor hints at change.
        this.craterFillTarget = 0;
        this.smokeTarget = 0.03;
        this.magmaBaseGlowTarget = 0;
        this.vegetationGrowthTarget = 1;
        this.startQuakePulses(0.006, 0.014, 4500);
        break;

      case 'steam-and-gas':
        this.craterFillTarget = 0.1;
        this.smokeTarget = 0;
        this.magmaBaseGlowTarget = 0;
        this.fumarolesActive = true;
        this.crackVisibilityTarget = 0.55;
        this.vegetationGrowthTarget = 0.9;
        this.startQuakePulses(0.015, 0.03, 3200);
        break;

      case 'magma-ascent':
        this.magmaRiseTarget = 1;
        this.startQuakePulses(0.012, 0.028, 3800);
        break;

      case 'escalating-activity':
        this.craterFillTarget = 0.35;
        this.smokeTarget = 0.55;
        this.magmaBaseGlowTarget = 0.12;
        this.fumarolesActive = true;
        this.rockfallsActive = true;
        this.crackVisibilityTarget = 1;
        this.skyDarknessTarget = 0.55;
        this.vegetationGrowthTarget = 0.35;
        this.startQuakePulses(0.035, 0.08, 2000);
        this.startPrecursorPuffs();
        break;

      case 'eruption':
        this.skyDarknessTarget = 0.85;
        this.vegetationGrowthTarget = 0;
        break;

      case 'aftermath':
        this.craterFillTarget = 0.5;
        this.smokeTarget = 0.15;
        this.magmaBaseGlowTarget = 0.05;
        this.shakeAmount = 0;
        this.skyDarknessTarget = 0.25;
        this.landscapeAshTarget = 0.85;
        this.crackVisibilityTarget = 0.5;
        this.lakeFormationTarget = 1;
        this.rainActive = true;
        this.vegetationGrowthTarget = 0;
        break;
    }
  }

  private startQuakePulses(min: number, max: number, baseMs: number): void {
    clearTimeout(this.quakeTimer);
    const tick = () => {
      this.shakeAmount = Math.max(this.shakeAmount, min + Math.random() * (max - min));
      this.quakeTimer = setTimeout(tick, baseMs + Math.random() * 1500);
    };
    this.quakeTimer = setTimeout(tick, baseMs + Math.random() * 1500);
  }

  /** The June 7–14 precursor explosions were discrete, separate events — not sustained activity.
   *  A small, infrequent puff (with a matching quiet boom) reads very differently from both the
   *  ambient unrest of earlier chapters and the continuous bursts of the climax itself. */
  private startPrecursorPuffs(): void {
    clearTimeout(this.precursorPuffTimer);
    const tick = () => {
      if (this.currentChapter.id !== 'escalating-activity') return;
      this.spawnEjecta(0.1);
      this.playBoom();
      this.shakeAmount = Math.max(this.shakeAmount, 0.06);
      this.precursorPuffTimer = setTimeout(tick, 9000 + Math.random() * 7000);
    };
    this.precursorPuffTimer = setTimeout(tick, 5000 + Math.random() * 4000);
  }

  replay(): void {
    clearTimeout(this.phaseTimer);
    clearInterval(this.plumeCountUpId);
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    clearTimeout(this.eruptionBurstTimer);
    this.clearFlows();

    this.ejecta.forEach((e) => {
      this.ejectaGroup.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    });
    this.ejecta = [];

    this.rockfalls.forEach((r) => {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    });
    this.rockfalls = [];

    this.pyroclastic.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    });
    this.pyroclastic = [];

    this.phase = 'idle';
    this.shakeAmount = 0;
    this.smokeTarget = 0.12;
    this.craterFillTarget = 0;
    this.craterFill = 0;
    this.displayedPlume = 0;
    this.eruptionWitnessed = false;
    this.magmaRise = 0;
    this.magmaRiseTarget = 0;

    this.chapterIndex = 0;
    this.maxUnlocked = 0;
    this.onEnterChapter();
  }

  phase: EruptionPhase = 'idle';
  displayedPlume = 0;

  get isErupting(): boolean { return this.phase !== 'idle' && this.phase !== 'cooling'; }

  // ---- three.js core ----
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private rafId = 0;
  private resizeObserver!: ResizeObserver;

  // ---- volcano ----
  private mountainMesh!: THREE.Mesh;
  private groundMesh!: THREE.Mesh;
  private lavaMesh!: THREE.Mesh;
  private lavaLight!: THREE.PointLight;
  private lavaMaterial!: THREE.MeshStandardMaterial;
  private craterDepth = 3.2;
  private craterFloorY = 0;
  private craterRimY = 0;
  private craterFill = 0;
  private craterFillTarget = 0;

  // ---- ambient environmental targets (drive material/light state across chapters) ----
  private magmaBaseGlow = 0;
  private magmaBaseGlowTarget = 0;
  private skyDarkness = 0;
  private skyDarknessTarget = 0;
  private landscapeAsh = 0;
  private landscapeAshTarget = 0;
  private lakeFormation = 0;
  private lakeFormationTarget = 0;
  private magmaRise = 0;
  private magmaRiseTarget = 0;

  private readonly skyCalm = { top: new THREE.Color(0x2a2350), horizon: new THREE.Color(0xff8a52), bottom: new THREE.Color(0x3a2420) };
  private readonly skyDark = { top: new THREE.Color(0x120f14), horizon: new THREE.Color(0x6b4a3a), bottom: new THREE.Color(0x1a1512) };
  private readonly fogCalm = new THREE.Color(0x8a5a48);
  private readonly fogDark = new THREE.Color(0x2a2018);
  private readonly noTint = new THREE.Color(0xffffff);
  private readonly ashTint = new THREE.Color(0x8f857a);
  private readonly groundBaseColor = new THREE.Color(0x2e2318);
  private readonly groundAshColor = new THREE.Color(0x6b6258);
  private readonly lavaBaseColor = new THREE.Color(0x2a0d02);
  private readonly lakeColor = new THREE.Color(0x2a3a42);

  // ---- lava overflow ribbons (kept minor — Pinatubo was ash/pyroclastic-dominant, not lava-flow-dominant) ----
  private lavaFlows: { mesh: THREE.Mesh; progress: number; cooled: number; dir: THREE.Vector3 }[] = [];

  // ---- smoke / steam ----
  private smokeGroup = new THREE.Group();
  private smokeSprites: { sprite: THREE.Sprite; vy: number; seed: number }[] = [];
  private smokeTexture!: THREE.Texture;
  private smokeIntensity = 0.12;
  private smokeTarget = 0.12;

  // ---- ash/ejecta particles ----
  private ejectaGroup = new THREE.Group();
  private ejecta: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];

  // ---- sky ----
  private skyMesh!: THREE.Mesh;

  // ---- clouds ----
  private cloudGroup = new THREE.Group();
  private clouds: { group: THREE.Group; speed: number; baseX: number; wrapRadius: number; bobSeed: number }[] = [];

  // ---- volcanic lightning (ash-rich plume only) ----
  private lightningLight!: THREE.PointLight;
  private lightningTimer = 0;

  // ---- camera flythrough between chapters ----
  private cameraFlying = false;
  private cameraFlyFrom = new THREE.Vector3();
  private cameraFlyToPos = new THREE.Vector3();
  private cameraFlyTargetFrom = new THREE.Vector3();
  private cameraFlyTargetTo = new THREE.Vector3();
  private cameraFlyElapsed = 0;
  private cameraFlyDuration = 1;

  // ---- vegetation (stage I: dormant, forested) ----
  private vegetation!: THREE.InstancedMesh;
  private readonly vegetationCount = 220;
  private vegetationBase: { pos: THREE.Vector3; rotY: number; scale: number }[] = [];
  private vegetationSwaySeeds: number[] = [];
  private vegetationGrowth = 1;
  private vegetationGrowthTarget = 1;

  // ---- birds (stage I only) ----
  private birdGroup = new THREE.Group();
  private birds: { group: THREE.Group; wingL: THREE.Mesh; wingR: THREE.Mesh; speed: number; radius: number; angle: number; height: number; flapSeed: number }[] = [];

  // ---- underground cavern (stage II) ----
  private undergroundGroup = new THREE.Group();
  private magmaConduitCore!: THREE.Mesh;
  private magmaChamberMesh!: THREE.Mesh;
  private undergroundLight!: THREE.PointLight;

  // ---- fumaroles (stages III & IV) ----
  private fumaroleVents: THREE.Vector3[] = [];
  private fumarolesActive = false;

  // ---- ground cracks (stages III & IV, remain scarred afterward) ----
  private cracksGroup = new THREE.Group();
  private crackMeshes: THREE.Mesh[] = [];
  private crackVisibility = 0;
  private crackVisibilityTarget = 0;

  // ---- rockfalls (stage IV) ----
  private rockfalls: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private rockfallsActive = false;
  private rockfallTimer = 0;

  // ---- pyroclastic density currents (stage V climax) ----
  private pyroclastic: { mesh: THREE.Mesh; angle: number; dist: number; speed: number; life: number }[] = [];

  // ---- rain / crater lake (stage VI) ----
  private rainPoints!: THREE.Points;
  private rainVelocities!: Float32Array;
  private readonly rainCount = 260;
  private rainActive = false;

  // ---- static Central Luzon geographic context (background ranges, rivers, fields, landmarks) ----
  private geoGroup = new THREE.Group();

  // ---- ambient audio (procedural — no external assets) ----
  private audioCtx: AudioContext | null = null;
  private audioMaster: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;

  private shakeAmount = 0;
  private phaseTimer: any = null;
  private plumeCountUpId: any = null;
  private quakeTimer: any = null;
  private precursorPuffTimer: any = null;
  private eruptionBurstTimer: any = null;

  // Shared noise field — used by both the mountain mesh AND the lava flow sampler,
  // so lava geometrically has to sit on the same surface the mountain was built from.
  private noiseSeed = Math.random() * 1000;

  ngAfterViewInit(): void {
    this.initScene();
    this.onEnterChapter();
    requestAnimationFrame(() => {
      this.onResize();
      this.animate();
    });
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.phaseTimer);
    clearInterval(this.plumeCountUpId);
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    clearTimeout(this.eruptionBurstTimer);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.audioCtx?.close();
  }

  @HostListener('window:resize')
  onResize(): void {
    const el = this.canvasRef.nativeElement.parentElement!;
    const w = el.clientWidth, h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ================= CAMERA FLYTHROUGH =================

  private flyCameraTo(pos: [number, number, number], target: [number, number, number], durationMs: number): void {
    if (!this.camera || !this.controls) return;
    this.cameraFlyFrom.copy(this.camera.position);
    this.cameraFlyToPos.set(pos[0], pos[1], pos[2]);
    this.cameraFlyTargetFrom.copy(this.controls.target);
    this.cameraFlyTargetTo.set(target[0], target[1], target[2]);
    this.cameraFlyElapsed = 0;
    this.cameraFlyDuration = durationMs / 1000;
    this.cameraFlying = true;
  }

  private stepCameraFly(dt: number): void {
    if (!this.cameraFlying) return;
    this.cameraFlyElapsed += dt;
    const t = Math.min(1, this.cameraFlyElapsed / this.cameraFlyDuration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — brisk start, gentle settle
    this.camera.position.lerpVectors(this.cameraFlyFrom, this.cameraFlyToPos, eased);
    this.controls.target.lerpVectors(this.cameraFlyTargetFrom, this.cameraFlyTargetTo, eased);
    if (t >= 1) this.cameraFlying = false;
  }

  // ================= NOISE / TERRAIN SAMPLING =================

  private terrainNoise(x: number, z: number): number {
    const angle = Math.atan2(z, x);
    const dist = Math.sqrt(x * x + z * z);
    const n1 = Math.sin(angle * 7 + dist * 0.9 + this.noiseSeed) * 0.35;
    const n2 = Math.sin(angle * 17 - dist * 1.7 + this.noiseSeed * 1.3) * 0.15;
    const n3 = Math.sin(angle * 31 + dist * 2.6 + this.noiseSeed * 0.7) * 0.06;
    return n1 + n2 + n3;
  }

  /** Returns the mountain surface height at a given (x,z), matching buildMountain's displacement exactly. */
  private sampleTerrainHeight(x: number, z: number): number {
    const radius = 12, height = 14;
    const dist = Math.sqrt(x * x + z * z);
    const distFrac = Math.min(1, dist / radius);
    const baseY = height * (1 - distFrac) - height / 2;
    const heightFrac = (baseY + height / 2) / height;
    const roughness = this.terrainNoise(x, z) * (0.4 + heightFrac * 0.6);

    let y = baseY + roughness * 2.3;

    if (heightFrac > 0.78) {
      const craterT = Math.min(1, (heightFrac - 0.78) / 0.22);
      y -= craterT * craterT * this.craterDepth * 1.6;
    }
    return y + this.mountainMesh.position.y;
  }

  // ================= SCENE SETUP =================

  private initScene(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    // Fog now tuned to the warm sunset sky tone instead of a flat dark color,
    // so distance haze blends into the skybox rather than fading to black.
    this.scene.fog = new THREE.FogExp2(0x8a5a48, 0.0075);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
    this.camera.position.set(0, 9, 26);
    this.camera.lookAt(0, 6, 0);

    // --- Environment lighting: hemisphere + warm directional key, tuned so sky color bounces onto terrain ---
    this.scene.add(new THREE.HemisphereLight(0xffb377, 0x3a2e28, 1.4));

    const keyLight = new THREE.DirectionalLight(0xffcf9e, 1.7); // warm "low sun" key light
    keyLight.position.set(-18, 20, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.bias = -0.0015;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff8a4d, 0.6);
    rimLight.position.set(10, 8, -22);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x6a584a, 0.6);
    fillLight.position.set(14, 10, 18);
    this.scene.add(fillLight);

    this.buildSky();
    this.buildGround();
    this.buildMountain();
    this.buildCraterLava();
    this.buildSmokeSystem();
    this.buildClouds();
    this.buildLightning();
    this.buildVegetation();
    this.buildBirds();
    this.buildUnderground();
    this.computeFumaroleVents();
    this.buildCracks();
    this.buildRain();
    this.buildBackgroundRanges();
    this.buildRivers();
    this.buildFieldPatches();
    this.buildLandmarks();
    this.buildLakeIsland();
    this.scene.add(this.geoGroup);
    this.scene.add(this.ejectaGroup);

    // --- Orbit controls: click-and-drag rotation around the volcano ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 6, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 40;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.update();
  }

  /** Large inward-facing sphere with a vertical gradient shader — replaces the flat background color
   *  with a proper sunset skybox (deep dusk blue at the zenith, warm orange/pink at the horizon).
   *  Colors are mutable uniforms so they can be darkened as unrest builds. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(400, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: this.skyCalm.top.clone() },
        horizonColor: { value: this.skyCalm.horizon.clone() },
        bottomColor: { value: this.skyCalm.bottom.clone() },
        offset: { value: 8 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          vec3 sky = h > 0.0
            ? mix(horizonColor, topColor, pow(max(h, 0.0), exponent))
            : mix(horizonColor, bottomColor, pow(max(-h, 0.0), exponent * 1.4));
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.skyMesh);
  }

  private buildGround(): void {
    const geo = new THREE.PlaneGeometry(200, 200, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: this.groundBaseColor.clone(), roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.groundMesh = ground;
    this.scene.add(this.groundMesh);
  }

  /** Noise-displaced cone with height-based vertex coloring: earthy brown base transitioning
   *  to dark basalt-grey slopes, with a warm red tint near the crater rim. Smooth shaded
   *  (flatShading: false + computeVertexNormals) so triangles blend into rugged, continuous terrain. */
  private buildMountain(): void {
    const radius = 12, height = 14, radialSegments = 96, heightSegments = 40;
    const geo = new THREE.ConeGeometry(radius, height, radialSegments, heightSegments, true);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    this.craterRimY = height * 0.42;
    this.craterFloorY = this.craterRimY - this.craterDepth;

    // Color stops for the height gradient
    const baseColor = new THREE.Color(0x5a4326);   // earthy brown, low slopes
    const midColor = new THREE.Color(0x3f382f);    // transitional dark rock
    const rockColor = new THREE.Color(0x4a4741);   // basalt grey, upper slopes
    const rimGlow = new THREE.Color(0x7a2e14);      // warm red-tinted rock right at the crater rim
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const heightFrac = (y + height / 2) / height;

      const roughness = this.terrainNoise(x, z) * (0.4 + heightFrac * 0.6);
      const dist = Math.sqrt(x * x + z * z);
      const scale = dist > 0.001 ? (dist + roughness) / dist : 1;

      let newX = x * scale;
      let newZ = z * scale;
      let newY = y + roughness * 2.3;

      if (heightFrac > 0.78) {
        const craterT = Math.min(1, (heightFrac - 0.78) / 0.22);
        newY -= craterT * craterT * this.craterDepth * 1.6;
      }

      pos.setXYZ(i, newX, newY, newZ);

      // Height-based color blend: brown -> mid -> basalt grey, with a red rim glow near the crater
      if (heightFrac < 0.35) {
        tmp.lerpColors(baseColor, midColor, heightFrac / 0.35);
      } else if (heightFrac < 0.78) {
        tmp.lerpColors(midColor, rockColor, (heightFrac - 0.35) / 0.43);
      } else if (heightFrac < 0.88) {
        tmp.lerpColors(rockColor, rimGlow, (heightFrac - 0.78) / 0.1);
      } else {
        tmp.copy(rimGlow);
      }
      // Slight per-vertex variance so it doesn't look like flat color bands
      const variance = 0.92 + Math.random() * 0.16;
      colors[i * 3] = tmp.r * variance;
      colors[i * 3 + 1] = tmp.g * variance;
      colors[i * 3 + 2] = tmp.b * variance;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals(); // smooth normals — no more harsh flat-shaded facets

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: false, // smooth shading, per your requirement
      color: this.noTint.clone(),
    });

    this.mountainMesh = new THREE.Mesh(geo, mat);
    this.mountainMesh.position.y = height / 2 - this.craterDepth * 0.3;
    this.mountainMesh.castShadow = true;
    this.mountainMesh.receiveShadow = true;
    this.scene.add(this.mountainMesh);
  }

  /** The lava disc inside the crater doubles as an emissive material AND the source of the key point light.
   *  Later in the story (aftermath) this same disc transitions into a still, reflective crater lake. */
  private buildCraterLava(): void {
    const craterRadius = 2.1;
    const geo = new THREE.CircleGeometry(craterRadius, 48);
    this.lavaMaterial = new THREE.MeshStandardMaterial({
      color: this.lavaBaseColor.clone(),
      emissive: 0xff5a1f,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    this.lavaMesh = new THREE.Mesh(geo, this.lavaMaterial);
    this.lavaMesh.rotation.x = -Math.PI / 2;
    this.lavaMesh.position.set(0, this.craterFloorY + this.mountainMesh.position.y, 0);
    this.scene.add(this.lavaMesh);

    this.lavaLight = new THREE.PointLight(0xff6a2a, 0, 40, 1.6);
    this.lavaLight.position.copy(this.lavaMesh.position);
    this.lavaLight.position.y += 0.4;
    this.scene.add(this.lavaLight);
  }

  private buildSmokeSystem(): void {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cctx = c.getContext('2d')!;
    const grad = cctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, size, size);
    this.smokeTexture = new THREE.CanvasTexture(c);

    this.scene.add(this.smokeGroup);
  }

  /** Real 3D cloud clusters (overlapping low-poly spheres, not billboarded sprites) drifting
   *  slowly around the peak and background, wrapping around once they pass out of view. */
  private buildClouds(): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xfff2e0,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
      emissive: 0xffb377,
      emissiveIntensity: 0.08,
    });

    const clusterCount = 9;
    for (let c = 0; c < clusterCount; c++) {
      const group = new THREE.Group();
      const puffCount = 4 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffCount; p++) {
        const puffGeo = new THREE.IcosahedronGeometry(1.4 + Math.random() * 1.2, 1);
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 4.5,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 2.5
        );
        puff.scale.setScalar(0.7 + Math.random() * 0.5);
        group.add(puff);
      }

      const angle = Math.random() * Math.PI * 2;
      const dist = 22 + Math.random() * 26;
      const baseX = Math.cos(angle) * dist;
      const baseZ = Math.sin(angle) * dist;
      const height = 12 + Math.random() * 14;
      group.position.set(baseX, height, baseZ);
      group.scale.setScalar(1.2 + Math.random() * 1.6);

      this.cloudGroup.add(group);
      this.clouds.push({
        group, speed: 0.15 + Math.random() * 0.25,
        baseX, wrapRadius: dist + 20, bobSeed: Math.random() * 1000,
      });
    }
    this.scene.add(this.cloudGroup);
  }

  private stepClouds(dt: number, elapsed: number): void {
    this.clouds.forEach((c) => {
      c.group.position.x += c.speed * dt;
      c.group.position.y += Math.sin(elapsed * 0.3 + c.bobSeed) * 0.003; // gentle vertical bob
      // Wrap clouds that drift too far back around to the opposite side, so they loop forever
      if (c.group.position.x > c.wrapRadius) {
        c.group.position.x = -c.wrapRadius;
      }
    });
  }

  // ================= VOLCANIC LIGHTNING (ash-rich plume only) =================

  private buildLightning(): void {
    this.lightningLight = new THREE.PointLight(0xd8e8ff, 0, 60, 1.4);
    this.lightningLight.position.set(0, 14, 0);
    this.scene.add(this.lightningLight);
  }

  private stepLightning(dt: number): void {
    if (this.lightningLight.intensity > 0) {
      this.lightningLight.intensity = Math.max(0, this.lightningLight.intensity - dt * 14);
    }
    const active = (this.phase === 'burst' || this.phase === 'overflow') && this.outcome.kind === 'ash';
    if (!active) return;

    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningLight.intensity = 6 + Math.random() * 4;
      this.lightningLight.position.set(
        (Math.random() - 0.5) * 6,
        this.lavaMesh.position.y + 8 + Math.random() * 6,
        (Math.random() - 0.5) * 6
      );
      this.lightningTimer = 0.4 + Math.random() * 1.2;
    }
  }

  // ================= VEGETATION (stage I: dense forest cover) =================

  /** Instanced trees scattered across the lower/mid slopes. A single draw call regardless of
   *  count. Growth (scale) and sway are updated every frame; instances shrink away and desaturate
   *  toward "dead" as later chapters bring ash and heat, rather than disappearing abruptly. */
  private buildVegetation(): void {
    const geo = new THREE.ConeGeometry(0.5, 1.6, 6);
    geo.translate(0, 0.8, 0); // pivot at the base so growth/sway reads naturally from the ground
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f6b2f, roughness: 1 });
    this.vegetation = new THREE.InstancedMesh(geo, mat, this.vegetationCount);
    this.vegetation.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.vegetationCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 10.5; // stay off the bare upper crater rim
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = this.sampleTerrainHeight(x, z);
      const scale = 0.7 + Math.random() * 0.8;
      const rotY = Math.random() * Math.PI * 2;

      this.vegetationBase.push({ pos: new THREE.Vector3(x, y, z), rotY, scale });
      this.vegetationSwaySeeds.push(Math.random() * 100);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.vegetation.setMatrixAt(i, dummy.matrix);
    }
    this.vegetation.instanceMatrix.needsUpdate = true;
    this.scene.add(this.vegetation);
  }

  private stepVegetation(dt: number, elapsed: number): void {
    this.vegetationGrowth += (this.vegetationGrowthTarget - this.vegetationGrowth) * dt * 1.2;
    if (this.vegetationGrowth < 0.005 && this.vegetationGrowthTarget < 0.005) return;

    (this.vegetation.material as THREE.MeshStandardMaterial).color.lerpColors(
      new THREE.Color(0x3f6b2f), new THREE.Color(0x5a4a34), this.landscapeAsh
    );

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.vegetationCount; i++) {
      const base = this.vegetationBase[i];
      const sway = Math.sin(elapsed * 1.4 + this.vegetationSwaySeeds[i]) * 0.06;
      dummy.position.copy(base.pos);
      dummy.rotation.set(0, base.rotY, sway);
      dummy.scale.setScalar(base.scale * this.vegetationGrowth);
      dummy.updateMatrix();
      this.vegetation.setMatrixAt(i, dummy.matrix);
    }
    this.vegetation.instanceMatrix.needsUpdate = true;
  }

  // ================= BIRDS (stage I only) =================

  private buildBirds(): void {
    const wingGeo = new THREE.ConeGeometry(0.35, 0.9, 4);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();
      const wingL = new THREE.Mesh(wingGeo, mat);
      wingL.rotation.z = Math.PI / 2;
      wingL.position.x = -0.4;
      const wingR = new THREE.Mesh(wingGeo, mat);
      wingR.rotation.z = -Math.PI / 2;
      wingR.position.x = 0.4;
      group.add(wingL, wingR);
      group.scale.setScalar(0.5 + Math.random() * 0.3);
      this.birdGroup.add(group);
      this.birds.push({
        group, wingL, wingR,
        speed: 0.8 + Math.random() * 0.6,
        radius: 14 + Math.random() * 10,
        angle: Math.random() * Math.PI * 2,
        height: 13 + Math.random() * 5,
        flapSeed: Math.random() * 100,
      });
    }
    this.scene.add(this.birdGroup);
  }

  private stepBirds(dt: number, elapsed: number): void {
    if (!this.birdGroup.visible) return;
    this.birds.forEach((b) => {
      b.angle += (b.speed * dt) / b.radius;
      b.group.position.set(Math.cos(b.angle) * b.radius, b.height + Math.sin(elapsed * 0.4 + b.flapSeed) * 0.6, Math.sin(b.angle) * b.radius);
      b.group.rotation.y = -b.angle + Math.PI / 2;
      const flap = Math.sin(elapsed * 9 + b.flapSeed) * 0.6;
      b.wingL.rotation.x = flap;
      b.wingR.rotation.x = -flap;
    });
  }

  // ================= UNDERGROUND CAVERN (stage II) =================

  /** A self-contained "you are now underground" scene, positioned well below the surface group
   *  and only revealed by flying the camera down into it. Simpler and more robust than clipping
   *  the live mountain mesh with a cutaway plane. */
  private buildUnderground(): void {
    this.undergroundGroup.position.set(0, -22, 0);

    const cavern = new THREE.Mesh(
      new THREE.SphereGeometry(15, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x2c231c, roughness: 1, side: THREE.BackSide })
    );
    this.undergroundGroup.add(cavern);

    const chamber = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a0f04, emissive: 0xff5a1f, emissiveIntensity: 0.6, roughness: 0.5 })
    );
    chamber.scale.set(1.3, 0.8, 1.3);
    chamber.position.set(0, -4, 0);
    this.magmaChamberMesh = chamber;
    this.undergroundGroup.add(chamber);

    const conduitOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 9, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 1, side: THREE.DoubleSide })
    );
    conduitOuter.position.set(0, 0.5, 0);
    this.undergroundGroup.add(conduitOuter);

    const coreGeo = new THREE.CylinderGeometry(0.32, 0.45, 9, 16, 1, true);
    coreGeo.translate(0, 4.5, 0); // pivot at the bottom face so it visibly "rises" as it fills
    const core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshStandardMaterial({ color: 0x2a0d02, emissive: 0xff6a1f, emissiveIntensity: 1.4, roughness: 0.4 })
    );
    core.position.set(0, -4, 0);
    core.scale.y = 0.02;
    this.magmaConduitCore = core;
    this.undergroundGroup.add(core);

    for (let i = 0; i < 10; i++) {
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.7, 0),
        new THREE.MeshStandardMaterial({ color: 0x4a4741, roughness: 0.95 })
      );
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 6;
      rock.position.set(Math.cos(a) * d, -6 + Math.random() * 8, Math.sin(a) * d);
      this.undergroundGroup.add(rock);
    }

    this.undergroundLight = new THREE.PointLight(0xff6a2a, 1.5, 20, 1.6);
    this.undergroundLight.position.set(0, -2, 0);
    this.undergroundGroup.add(this.undergroundLight);

    this.undergroundGroup.visible = false;
    this.scene.add(this.undergroundGroup);
  }

  // ================= FUMAROLES (stages III & IV) =================

  private computeFumaroleVents(): void {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 2.6 + Math.random() * 0.6; // just outside the crater rim
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = this.sampleTerrainHeight(x, z);
      this.fumaroleVents.push(new THREE.Vector3(x, y, z));
    }
  }

  private maybeSpawnFumaroleSteam(): void {
    if (!this.fumarolesActive || this.fumaroleVents.length === 0) return;
    if (Math.random() > 0.35) return;

    const vent = this.fumaroleVents[Math.floor(Math.random() * this.fumaroleVents.length)];
    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture, color: 0xe8e2da, transparent: true, opacity: 0.4, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 0.35 + Math.random() * 0.3;
    sprite.scale.set(scale, scale, 1);
    sprite.position.copy(vent).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2));
    this.smokeGroup.add(sprite);
    this.smokeSprites.push({ sprite, vy: 0.5 + Math.random() * 0.3, seed: Math.random() * 1000 });
  }

  // ================= GROUND CRACKS (stages III & IV, remain scarred afterward) =================

  private buildCracks(): void {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const innerDist = 2.3, outerDist = 4.2 + Math.random() * 1.5;
      const x1 = Math.cos(angle) * innerDist, z1 = Math.sin(angle) * innerDist;
      const angle2 = angle + (Math.random() - 0.5) * 0.3;
      const x2 = Math.cos(angle2) * outerDist, z2 = Math.sin(angle2) * outerDist;
      const y1 = this.sampleTerrainHeight(x1, z1), y2 = this.sampleTerrainHeight(x2, z2);
      const mid = new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2 + 0.05, (z1 + z2) / 2);
      const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);

      const geo = new THREE.BoxGeometry(0.12, 0.04, len);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a0e08, emissive: 0xff4010, emissiveIntensity: 0, roughness: 0.9,
        transparent: true, opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid);
      mesh.lookAt(x2, y2, z2);
      this.crackMeshes.push(mesh);
      this.cracksGroup.add(mesh);
    }
    this.scene.add(this.cracksGroup);
  }

  private stepCracks(dt: number): void {
    this.crackVisibility += (this.crackVisibilityTarget - this.crackVisibility) * dt * 2;
    this.crackMeshes.forEach((m) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = this.crackVisibility;
      mat.emissiveIntensity = Math.max(0, this.crackVisibility - 0.4) * this.magmaBaseGlow * 3;
    });
  }

  // ================= ROCKFALLS (stage IV) =================

  private maybeSpawnRockfall(dt: number): void {
    if (!this.rockfallsActive) return;
    this.rockfallTimer -= dt;
    if (this.rockfallTimer > 0) return;
    this.rockfallTimer = 0.4 + Math.random() * 0.6;

    const angle = Math.random() * Math.PI * 2;
    const dist = 2.6 + Math.random() * 1.5;
    const x = Math.cos(angle) * dist, z = Math.sin(angle) * dist;
    const y = this.sampleTerrainHeight(x, z) + 0.3;

    const geo = new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.15, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4741, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);

    const outDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    outDir.multiplyScalar(1 + Math.random());
    outDir.y = 0.5 + Math.random() * 0.5;
    this.rockfalls.push({ mesh, vel: outDir, life: 1 });
  }

  private stepRockfalls(dt: number): void {
    const gravity = 9;
    for (let i = this.rockfalls.length - 1; i >= 0; i--) {
      const r = this.rockfalls[i];
      r.vel.y -= gravity * dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotation.x += dt * 4;
      r.mesh.rotation.z += dt * 3;

      const groundY = this.sampleTerrainHeight(r.mesh.position.x, r.mesh.position.z);
      if (r.mesh.position.y <= groundY) {
        r.life -= dt * 2;
      }
      if (r.life <= 0 || r.mesh.position.y < groundY - 3) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rockfalls.splice(i, 1);
      }
    }
  }

  // ================= PYROCLASTIC DENSITY CURRENTS (stage V climax) =================

  /** Fast, ground-hugging, radially-expanding surge — visually and physically distinct from the
   *  vertical ash column (ejecta) and from lava flows, which Pinatubo produced little of. */
  private spawnPyroclasticSurge(): void {
    const count = 160;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.25 + Math.random() * 0.3, 5, 5);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a42, roughness: 1, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      const startDist = 1.6 + Math.random() * 0.8;
      const x = Math.cos(angle) * startDist, z = Math.sin(angle) * startDist;
      mesh.position.set(x, this.sampleTerrainHeight(x, z) + 0.3, z);
      this.scene.add(mesh);
      this.pyroclastic.push({ mesh, angle, dist: startDist, speed: 5 + Math.random() * 4, life: 1 });
    }
  }

  private stepPyroclastic(dt: number): void {
    for (let i = this.pyroclastic.length - 1; i >= 0; i--) {
      const p = this.pyroclastic[i];
      p.dist += p.speed * dt;
      p.life -= dt * 0.35;
      const x = Math.cos(p.angle) * p.dist, z = Math.sin(p.angle) * p.dist;
      const y = this.sampleTerrainHeight(x, z) + 0.3 + (1 - p.life) * 0.6;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(1 + (1 - p.life) * 2.2);
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, p.life * 0.85);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.pyroclastic.splice(i, 1);
      }
    }
  }

  // ================= RAIN / CRATER LAKE (stage VI) =================

  private buildRain(): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);
    this.rainVelocities = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      this.rainVelocities[i] = 9 + Math.random() * 5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaac4d8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false });
    this.rainPoints = new THREE.Points(geo, mat);
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);
  }

  private stepRain(dt: number): void {
    this.rainPoints.visible = this.rainActive;
    if (!this.rainActive) return;
    const pos = this.rainPoints.geometry.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < this.rainCount; i++) {
      let y = pos.getY(i) - this.rainVelocities[i] * dt;
      if (y < -1) y = 18 + Math.random() * 4;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  // ================= GEOGRAPHIC CONTEXT (Central Luzon setting, all static/cheap) =================

  /** Distant, irregular ridgelines suggesting the wider Zambales mountain range Pinatubo sits
   *  within — deliberately built from clustered, flattened, faceted rock forms rather than any
   *  single symmetric peak, so they read as ordinary terrain and never as other volcanoes. */
  private buildBackgroundRanges(): void {
    const clusterCount = 9;
    for (let i = 0; i < clusterCount; i++) {
      const angle = (i / clusterCount) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 55 + Math.random() * 70;
      const distFactor = Math.min(1, (dist - 40) / 90);
      const group = new THREE.Group();

      const bumpCount = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < bumpCount; b++) {
        const height = 4 + Math.random() * 7;
        const radius = 5 + Math.random() * 6;
        const mat = new THREE.MeshStandardMaterial({ color: 0x5a6a78, roughness: 1, flatShading: true });
        mat.color.lerp(new THREE.Color(0x8a7a6d), distFactor * 0.5);
        const bump = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), mat);
        // Flattened and stretched so it reads as a weathered ridge segment, not a pointed cone.
        bump.scale.set(1.1 + Math.random() * 0.4, (height / radius) * 0.5, 1.1 + Math.random() * 0.4);
        bump.position.set((Math.random() - 0.5) * radius * 1.6, height * 0.28 - 1, (Math.random() - 0.5) * radius * 0.7);
        bump.rotation.y = Math.random() * Math.PI * 2;
        group.add(bump);
      }

      group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      group.rotation.y = Math.random() * Math.PI * 2;
      this.geoGroup.add(group);
    }
  }

  /** Two winding drainage rivers descending from the slopes into the lowlands — standing in for
   *  the real Sacobia–Bamban, O'Donnell, and Bucao systems that later carried Pinatubo's lahars
   *  into Tarlac, Pampanga, and Zambales. */
  private buildRivers(): void {
    const riverMat = new THREE.MeshStandardMaterial({ color: 0x4a6b78, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 });
    const riverConfigs = [{ startAngle: 0.6, curve: 0.3 }, { startAngle: 3.6, curve: -0.4 }];
    riverConfigs.forEach((cfg) => {
      const points: THREE.Vector3[] = [];
      let angle = cfg.startAngle;
      let dist = 9;
      for (let i = 0; i < 10; i++) {
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = dist < 12 ? this.sampleTerrainHeight(x, z) : -0.03;
        points.push(new THREE.Vector3(x, y + 0.02, z));
        angle += cfg.curve * 0.15;
        dist += 5 + i * 0.6;
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.35, 6, false), riverMat);
      this.geoGroup.add(mesh);
    });
  }

  /** Scattered flat color patches in the mid-distance reading as a lowland agricultural mosaic. */
  private buildFieldPatches(): void {
    const colors = [0x5a7a3f, 0x8a7a4a, 0x6b8a4f, 0x9a8a5a];
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 28 + Math.random() * 48;
      const x = Math.cos(angle) * dist, z = Math.sin(angle) * dist;
      const geo = new THREE.PlaneGeometry(4 + Math.random() * 7, 4 + Math.random() * 7);
      const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.position.set(x, -0.03, z);
      this.geoGroup.add(mesh);
    }
  }

  /** A small forest-fringe settlement plus a simplified Clark Air Base cluster (runway strip and
   *  a handful of buildings) further out, connected by a rough road — grounding the scene in the
   *  real Central Luzon communities the 1991 eruption displaced. */
  private buildLandmarks(): void {
    const hutRoofMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 1 });
    const hutWallMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 1 });
    const settlementCenter = new THREE.Vector3(Math.cos(1.1) * 48, 0, Math.sin(1.1) * 48);
    for (let i = 0; i < 8; i++) {
      const pos = settlementCenter.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), hutWallMat);
      wall.position.set(pos.x, 0.3, pos.z);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), hutRoofMat);
      roof.position.set(pos.x, 0.85, pos.z);
      roof.rotation.y = Math.PI / 4;
      this.geoGroup.add(wall, roof);
    }

    const baseCenter = new THREE.Vector3(Math.cos(4.4) * 85, 0, Math.sin(4.4) * 85);
    const runway = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 0.9 })
    );
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(baseCenter.x, -0.02, baseCenter.z);
    this.geoGroup.add(runway);

    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xaba69c, roughness: 0.85 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random(), 0.8 + Math.random() * 0.6, 1.2 + Math.random()), buildingMat);
      b.position.set(baseCenter.x + (Math.random() - 0.5) * 10, 0.5, baseCenter.z + (Math.random() - 0.5) * 6 - 3);
      this.geoGroup.add(b);
    }

    const roadCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(1.1) * 13, 0.01, Math.sin(1.1) * 13),
      settlementCenter.clone().setY(0.01),
    ]);
    const roadMesh = new THREE.Mesh(
      new THREE.TubeGeometry(roadCurve, 20, 0.25, 5, false),
      new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 1 })
    );
    this.geoGroup.add(roadMesh);
  }

  /** Small rocky protrusions sitting just above the eventual aftermath lake level — matching the
   *  real dome-island documented in Lake Pinatubo's crater lake in years after the eruption. */
  private buildLakeIsland(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4741, roughness: 0.95 });
    const islandY = this.craterFloorY + this.mountainMesh.position.y + this.craterDepth * 0.5 + 0.08;
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.18, 0), mat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.6 + Math.random() * 0.8;
      mesh.position.set(Math.cos(angle) * dist, islandY, Math.sin(angle) * dist);
      this.scene.add(mesh);
    }
  }

  // ================= AMBIENT AUDIO (procedural synthesis — no external assets) =================

  private initAudio(): void {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.audioCtx = new Ctx();

    this.audioMaster = this.audioCtx.createGain();
    this.audioMaster.gain.value = this.audioMuted ? 0 : 0.35;
    this.audioMaster.connect(this.audioCtx.destination);

    // A single shared filtered-noise bed stands in for wind, steam, rain, and rumble alike —
    // only the filter's tuning changes between chapters, rather than separate synth voices.
    const buffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * 2, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.noiseSource = this.audioCtx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;

    this.noiseFilter = this.audioCtx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 1400;
    this.noiseFilter.Q.value = 0.5;

    this.noiseGain = this.audioCtx.createGain();
    this.noiseGain.gain.value = 0;

    this.noiseSource.connect(this.noiseFilter).connect(this.noiseGain).connect(this.audioMaster);
    this.noiseSource.start();

    this.rumbleOsc = this.audioCtx.createOscillator();
    this.rumbleOsc.type = 'sine';
    this.rumbleOsc.frequency.value = 40;

    this.rumbleGain = this.audioCtx.createGain();
    this.rumbleGain.gain.value = 0;

    this.rumbleOsc.connect(this.rumbleGain).connect(this.audioMaster);
    this.rumbleOsc.start();

    this.applyAudioProfile();
  }

  private applyAudioProfile(): void {
    if (!this.audioCtx || !this.noiseFilter || !this.noiseGain || !this.rumbleGain || !this.rumbleOsc) return;
    const t = this.audioCtx.currentTime;
    const ramp = 1.4;

    const profiles: Record<ChapterId, { freq: number; q: number; noise: number; rumble: number; rumbleHz: number }> = {
      'before-1991': { freq: 1400, q: 0.5, noise: 0.10, rumble: 0, rumbleHz: 40 },
      'early-unrest': { freq: 1300, q: 0.5, noise: 0.09, rumble: 0.02, rumbleHz: 40 },
      'steam-and-gas': { freq: 2600, q: 0.9, noise: 0.14, rumble: 0.05, rumbleHz: 41 },
      'magma-ascent': { freq: 220, q: 1.2, noise: 0.05, rumble: 0.10, rumbleHz: 38 },
      'escalating-activity': { freq: 900, q: 0.8, noise: 0.20, rumble: 0.18, rumbleHz: 46 },
      'eruption': { freq: 500, q: 0.6, noise: 0.28, rumble: 0.30, rumbleHz: 55 },
      'aftermath': { freq: 3200, q: 0.5, noise: 0.16, rumble: 0.02, rumbleHz: 36 },
    };
    const p = profiles[this.currentChapter.id];
    this.noiseFilter.frequency.setTargetAtTime(p.freq, t, ramp);
    this.noiseFilter.Q.setTargetAtTime(p.q, t, ramp);
    this.noiseGain.gain.setTargetAtTime(this.audioMuted ? 0 : p.noise, t, ramp);
    this.rumbleGain.gain.setTargetAtTime(this.audioMuted ? 0 : p.rumble, t, ramp);
    this.rumbleOsc.frequency.setTargetAtTime(p.rumbleHz, t, ramp);
  }

  private playBoom(): void {
    if (!this.audioCtx || !this.audioMaster) return;
    const t = this.audioCtx.currentTime;
    const len = Math.floor(this.audioCtx.sampleRate * 0.6);
    const buf = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.55);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(this.audioMuted ? 0 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    src.connect(filter).connect(gain).connect(this.audioMaster);
    src.start(t);
    src.stop(t + 0.6);
  }

  // ================= ERUPTION SEQUENCE =================

  triggerEruption(): void {
    if (this.isErupting) return;
    this.initAudio();
    clearTimeout(this.phaseTimer);
    this.clearFlows();
    this.setPhase('rumble');
  }

  private setPhase(phase: EruptionPhase): void {
    this.phase = phase;
    clearTimeout(this.phaseTimer);

    switch (phase) {
      case 'rumble':
        this.shakeAmount = 0.03;
        this.smokeTarget = 0.45;
        this.phaseTimer = setTimeout(() => this.setPhase('rising'), 1200);
        break;
      case 'rising':
        this.craterFillTarget = 0.9;
        this.smokeTarget = 0.7;
        this.shakeAmount = 0.05;
        this.phaseTimer = setTimeout(() => this.setPhase('pressure'), 2200);
        break;
      case 'pressure':
        this.craterFillTarget = 0.98;
        this.shakeAmount = 0.09;
        this.smokeTarget = 0.85;
        this.phaseTimer = setTimeout(() => this.setPhase('burst'), 900);
        break;
      case 'burst':
        this.shakeAmount = 0.35;
        this.smokeTarget = 1;
        this.spawnEjecta(1);
        this.spawnPyroclasticSurge();
        this.playBoom();
        this.animatePlumeCountUp(this.outcome.plumeHeightKm);
        this.startContinuousBursts();
        this.phaseTimer = setTimeout(() => this.setPhase('overflow'), 500);
        break;
      case 'overflow':
        this.spawnLavaFlows();
        this.spawnPyroclasticSurge();
        this.shakeAmount = 0.1;
        this.eruptionWitnessed = true;
        this.phaseTimer = setTimeout(() => this.setPhase('cooling'), 4200);
        break;
      case 'cooling':
        this.smokeTarget = 0.12;
        this.craterFillTarget = 0.15;
        this.shakeAmount = 0.02;
        this.phaseTimer = setTimeout(() => { this.phase = 'idle'; this.shakeAmount = 0; }, 5000);
        break;
    }
  }

  /** "Continuous explosions" during the climax — repeated smaller ejecta pulses (with a matching
   *  boom and a forced lightning flash) rather than a single burst. Self-terminates once the
   *  eruption moves past the burst/overflow phases. */
  private startContinuousBursts(): void {
    clearTimeout(this.eruptionBurstTimer);
    const tick = () => {
      if (this.phase !== 'burst' && this.phase !== 'overflow') return;
      this.spawnEjecta(0.35);
      this.playBoom();
      this.lightningTimer = 0;
      this.eruptionBurstTimer = setTimeout(tick, 650 + Math.random() * 500);
    };
    this.eruptionBurstTimer = setTimeout(tick, 700 + Math.random() * 400);
  }

  private animatePlumeCountUp(target: number): void {
    clearInterval(this.plumeCountUpId);
    this.displayedPlume = 0;
    const steps = 24;
    let i = 0;
    this.plumeCountUpId = setInterval(() => {
      i++;
      this.displayedPlume = Math.round((target * i) / steps);
      if (i >= steps) clearInterval(this.plumeCountUpId);
    }, 25);
  }

  // ================= LAVA OVERFLOW (kept minor — real geometry, terrain-hugging) =================

  private clearFlows(): void {
    this.lavaFlows.forEach((f) => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    });
    this.lavaFlows = [];
  }

  private spawnLavaFlows(): void {
    const count = 1; // Pinatubo's 1991 eruption was ash/pyroclastic-dominant, not a lava-flow event

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const startX = Math.cos(angle) * 2.0;
      const startZ = Math.sin(angle) * 2.0;
      const startY = this.sampleTerrainHeight(startX, startZ);

      const geo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(startX, startY, startZ),
          new THREE.Vector3(startX, startY, startZ),
        ]), 8, 0.14, 6, false
      );
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a0d02, emissive: 0xff6a1f, emissiveIntensity: 1.6, roughness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.userData['path'] = [new THREE.Vector3(startX, startY, startZ)];
      mesh.userData['speed'] = 0.15;
      this.scene.add(mesh);
      this.lavaFlows.push({ mesh, progress: 0, cooled: 0, dir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)) });
    }
  }

  private growLavaFlows(dt: number): void {
    const groundY = -0.02;

    this.lavaFlows.forEach((f) => {
      const path: THREE.Vector3[] = f.mesh.userData['path'];
      const last = path[path.length - 1];

      if (last.y > groundY && path.length < 20) {
        const sampleRadius = 0.7;
        let bestDrop = -Infinity;
        let bestX = last.x, bestZ = last.z;

        for (let s = 0; s < 10; s++) {
          const jitter = (Math.random() - 0.5) * 1.1;
          const baseDir: THREE.Vector3 = f.dir;
          const angle = Math.atan2(baseDir.z, baseDir.x) + jitter * 0.5;
          const cx = last.x + Math.cos(angle) * sampleRadius;
          const cz = last.z + Math.sin(angle) * sampleRadius;
          const cy = this.sampleTerrainHeight(cx, cz);
          const drop = last.y - cy;
          if (drop > bestDrop) { bestDrop = drop; bestX = cx; bestZ = cz; }
        }

        const nextY = this.sampleTerrainHeight(bestX, bestZ) + 0.04;

        const slopeSpeed = THREE.MathUtils.clamp(bestDrop * 2.2, 0.35, 1.6);
        f.mesh.userData['speed'] = THREE.MathUtils.lerp(f.mesh.userData['speed'], slopeSpeed, 0.3);

        path.push(new THREE.Vector3(bestX, nextY, bestZ));

        if (path.length > 3) {
          const curve = new THREE.CatmullRomCurve3(path);
          const newGeo = new THREE.TubeGeometry(curve, path.length * 4, 0.14, 6, false);
          f.mesh.geometry.dispose();
          f.mesh.geometry = newGeo;
        }
      } else {
        f.cooled = Math.min(1, f.cooled + dt * 0.08);
        const mat = f.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.6 * (1 - f.cooled);
        mat.color.setHex(f.cooled > 0.5 ? 0x1a1210 : 0x2a0d02);
      }

      if (this.phase === 'cooling') {
        f.cooled = Math.min(1, f.cooled + dt * 0.1);
        const mat = f.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 1.6 * (1 - f.cooled);
      }
    });
  }

  // ================= EJECTA (ash column, real 3D particles) =================

  private spawnEjecta(scale: number = 1): void {
    const baseCount = this.outcome.kind === 'ash' ? 220 : this.outcome.kind === 'steam' ? 110 : 70;
    const count = Math.max(8, Math.round(baseCount * scale));
    const isAsh = this.outcome.kind === 'ash' || this.outcome.kind === 'steam';
    const geo = isAsh ? new THREE.SphereGeometry(0.12, 6, 6) : new THREE.SphereGeometry(0.22, 8, 8);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: this.outcome.ashColor,
        emissive: isAsh ? 0x000000 : 0xff6a1f,
        emissiveIntensity: isAsh ? 0 : 1.2,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const spread = 1.4;
      mesh.position.set((Math.random() - 0.5) * spread, this.lavaMesh.position.y + 0.3, (Math.random() - 0.5) * spread);
      this.ejectaGroup.add(mesh);

      const upSpeed = isAsh ? 6 + Math.random() * 5 : 4 + Math.random() * 3;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, upSpeed, (Math.random() - 0.5) * 3);
      this.ejecta.push({ mesh, vel, life: 1 });
    }
  }

  private stepEjecta(dt: number): void {
    const gravity = this.outcome.kind === 'ash' ? 1.4 : 5.5;
    this.ejecta.forEach((e) => {
      e.vel.y -= gravity * dt;
      e.mesh.position.addScaledVector(e.vel, dt);
      e.life -= dt * (this.outcome.kind === 'ash' ? 0.12 : 0.2);
      const mat = e.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, e.life);
      mat.transparent = true;
      const s = 1 + (1 - e.life) * 1.5;
      e.mesh.scale.setScalar(this.outcome.kind === 'ash' ? s : 1);
    });

    for (let i = this.ejecta.length - 1; i >= 0; i--) {
      if (this.ejecta[i].life <= 0 || this.ejecta[i].mesh.position.y < -2) {
        this.ejectaGroup.remove(this.ejecta[i].mesh);
        this.ejecta[i].mesh.geometry.dispose();
        (this.ejecta[i].mesh.material as THREE.Material).dispose();
        this.ejecta.splice(i, 1);
      }
    }
  }

  // ================= SMOKE (billboarded sprites, curling upward with turbulence) =================

  private maybeSpawnSmoke(): void {
    const spawnChance = 0.1 + this.smokeIntensity * 0.5;
    if (Math.random() > spawnChance) return;

    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      color: this.isErupting ? 0x2a2622 : 0x6a625a,
      transparent: true,
      opacity: 0.28 + this.smokeIntensity * 0.3,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 0.8 + Math.random() * 0.6;
    sprite.scale.set(scale, scale, 1);
    sprite.position.set(
      (Math.random() - 0.5) * 0.6,
      this.lavaMesh.position.y + 0.4,
      (Math.random() - 0.5) * 0.6
    );
    this.smokeGroup.add(sprite);
    this.smokeSprites.push({ sprite, vy: 0.4 + this.smokeIntensity * 1.2, seed: Math.random() * 1000 });
  }

  private stepSmoke(dt: number, elapsed: number): void {
    this.smokeSprites.forEach((s) => {
      s.sprite.position.x += Math.sin(elapsed * 0.6 + s.seed) * 0.006 + Math.sin(elapsed * 1.7 + s.seed * 2) * 0.003;
      s.sprite.position.z += Math.cos(elapsed * 0.5 + s.seed) * 0.006;
      s.sprite.position.y += s.vy * dt;

      const heightFrac = (s.sprite.position.y - this.lavaMesh.position.y) / 14;
      if (this.isErupting && heightFrac > 0.5) {
        const spread = (heightFrac - 0.5) * 2;
        s.sprite.position.x += Math.sign(s.sprite.position.x || 1) * spread * 0.02;
        s.vy *= 0.995;
      }

      s.sprite.scale.multiplyScalar(1 + dt * 0.15);
      const mat = s.sprite.material as THREE.SpriteMaterial;
      mat.opacity -= dt * 0.045;
      const lightness = Math.min(1, heightFrac * 1.2);
      mat.color.setRGB(0.3 + lightness * 0.4, 0.28 + lightness * 0.38, 0.26 + lightness * 0.36);
    });

    for (let i = this.smokeSprites.length - 1; i >= 0; i--) {
      const s = this.smokeSprites[i];
      if ((s.sprite.material as THREE.SpriteMaterial).opacity <= 0) {
        this.smokeGroup.remove(s.sprite);
        (s.sprite.material as THREE.Material).dispose();
        this.smokeSprites.splice(i, 1);
      }
    }
  }

  // ================= MAIN LOOP =================

  private animate = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // ---- smoothly-animated ambient targets ----
    this.smokeIntensity += (this.smokeTarget - this.smokeIntensity) * dt * 1.2;
    this.craterFill += (this.craterFillTarget - this.craterFill) * dt * 1.4;
    this.magmaBaseGlow += (this.magmaBaseGlowTarget - this.magmaBaseGlow) * dt * 0.8;
    this.skyDarkness += (this.skyDarknessTarget - this.skyDarkness) * dt * 0.6;
    this.landscapeAsh += (this.landscapeAshTarget - this.landscapeAsh) * dt * 0.5;
    this.lakeFormation += (this.lakeFormationTarget - this.lakeFormation) * dt * 0.3;
    this.magmaRise += (this.magmaRiseTarget - this.magmaRise) * dt * 0.35;

    // ---- crater: magma glow, later transitioning into a still crater lake ----
    const lavaY = this.craterFloorY + this.mountainMesh.position.y + this.craterDepth * this.craterFill;
    this.lavaMesh.position.y = lavaY;
    this.lavaLight.position.y = lavaY + 0.3;
    const dynamicGlow = this.magmaBaseGlow + this.craterFill * 1.6;
    this.lavaMaterial.emissiveIntensity = dynamicGlow * (1 - this.lakeFormation);
    this.lavaLight.intensity = (1.8 + this.craterFill * 4) * (1 - this.lakeFormation * 0.85);
    const heat = 0.5 + Math.sin(elapsed * 6) * 0.05;
    this.lavaMaterial.emissive.setRGB(1, 0.35 + this.craterFill * heat * 0.3, 0.1);
    this.lavaMaterial.color.lerpColors(this.lavaBaseColor, this.lakeColor, this.lakeFormation);
    this.lavaMaterial.roughness = THREE.MathUtils.lerp(0.4, 0.15, this.lakeFormation);

    // ---- landscape recoloring toward ash-grey ----
    (this.mountainMesh.material as THREE.MeshStandardMaterial).color.lerpColors(this.noTint, this.ashTint, this.landscapeAsh);
    (this.groundMesh.material as THREE.MeshStandardMaterial).color.lerpColors(this.groundBaseColor, this.groundAshColor, this.landscapeAsh);

    // ---- sky and fog darkening as unrest builds ----
    const skyMat = this.skyMesh.material as THREE.ShaderMaterial;
    (skyMat.uniforms['topColor'].value as THREE.Color).lerpColors(this.skyCalm.top, this.skyDark.top, this.skyDarkness);
    (skyMat.uniforms['horizonColor'].value as THREE.Color).lerpColors(this.skyCalm.horizon, this.skyDark.horizon, this.skyDarkness);
    (skyMat.uniforms['bottomColor'].value as THREE.Color).lerpColors(this.skyCalm.bottom, this.skyDark.bottom, this.skyDarkness);
    (this.scene.fog as THREE.FogExp2).color.lerpColors(this.fogCalm, this.fogDark, this.skyDarkness);

    // ---- underground conduit: magma visibly rising, chamber gently pulsing ----
    this.magmaConduitCore.scale.y = Math.max(0.02, this.magmaRise);
    const chamberPulse = 0.5 + Math.sin(elapsed * 2) * 0.15;
    (this.magmaChamberMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + this.magmaRise * chamberPulse;
    this.undergroundLight.intensity = 1.5 + this.magmaRise * 2.5 * chamberPulse;

    this.stepVegetation(dt, elapsed);
    this.stepCracks(dt);
    this.stepBirds(dt, elapsed);

    this.maybeSpawnSmoke();
    this.maybeSpawnFumaroleSteam();
    this.stepSmoke(dt, elapsed);
    this.stepClouds(dt, elapsed);
    this.stepLightning(dt);
    this.maybeSpawnRockfall(dt);
    this.stepRockfalls(dt);
    this.stepPyroclastic(dt);
    this.stepRain(dt);

    if (this.ejecta.length > 0) this.stepEjecta(dt);
    if (this.lavaFlows.length > 0) this.growLavaFlows(dt);

    this.stepCameraFly(dt);
    this.controls.update();

    if (this.shakeAmount > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= 0.9;
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.animate);
  };
}