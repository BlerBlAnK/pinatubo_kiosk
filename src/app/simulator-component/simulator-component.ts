import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ParamLevel = 1 | 2 | 3;
type Phenomenon = 'ash' | 'bomb' | 'lava' | 'steam';
type EruptionPhase = 'idle' | 'rumble' | 'rising' | 'pressure' | 'burst' | 'overflow' | 'cooling';

interface EruptionOutcome {
  vei: string; title: string; narrative: string;
  kind: Phenomenon; plumeHeightKm: number; pyroclasticFlow: boolean;
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

  viscosity: ParamLevel = 3;
  gas: ParamLevel = 3;
  water: ParamLevel = 3;

  viscosityLabels = ['Runny Basalt', 'Andesite', 'Sticky Dacite'];
  gasLabels = ['Gas-Poor', 'Moderate', 'Gas-Rich'];
  waterLabels = ['Dry', 'Some Water', 'Saturated'];

  phase: EruptionPhase = 'idle';
  bars = Array(15).fill(0);
  displayedPlume = 0;
  hoveredMetric: string | null = null;

  outcome: EruptionOutcome = {
    vei: 'VEI —', title: 'System Ready',
    narrative: 'Set the sliders, then press the trigger to simulate an eruption.',
    kind: 'ash', plumeHeightKm: 0, pyroclasticFlow: false,
    pressureNote: '—', waterNote: '—', viscosityNote: '—', ashColor: 0xc3cad4,
  };

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
  private lavaMesh!: THREE.Mesh;
  private lavaLight!: THREE.PointLight;
  private lavaMaterial!: THREE.MeshStandardMaterial;
  private craterDepth = 3.2;
  private craterFloorY = 0;
  private craterRimY = 0;
  private craterFill = 0;
  private craterFillTarget = 0;

  // ---- lava overflow ribbons ----
  private lavaFlows: { mesh: THREE.Mesh; progress: number; cooled: number; dir: THREE.Vector3 }[] = [];

  // ---- smoke ----
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

  private shakeAmount = 0;
  private phaseTimer: any = null;
  private plumeCountUpId: any = null;

  // Shared noise field — used by both the mountain mesh AND the lava flow sampler,
  // so lava geometrically has to sit on the same surface the mountain was built from.
  private noiseSeed = Math.random() * 1000;

  ngAfterViewInit(): void {
    this.initScene();
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
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
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

  onSlide(key: 'viscosity' | 'gas' | 'water', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) as ParamLevel;
    this[key] = value;
  }

  get unrestIndex(): number {
    const raw = this.viscosity * 14 + this.gas * 16 + this.water * 8;
    return Math.min(100, Math.round((raw / 114) * 100));
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

    let y = baseY + roughness * 1.8;

    if (heightFrac > 0.82) {
      const craterT = Math.min(1, (heightFrac - 0.82) / 0.18);
      y -= craterT * craterT * this.craterDepth * 1.4;
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
   *  with a proper sunset skybox (deep dusk blue at the zenith, warm orange/pink at the horizon). */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(400, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a2350) },
        horizonColor: { value: new THREE.Color(0xff8a52) },
        bottomColor: { value: new THREE.Color(0x3a2420) },
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e2318, roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
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
      let newY = y + roughness * 1.8;

      if (heightFrac > 0.82) {
        const craterT = Math.min(1, (heightFrac - 0.82) / 0.18);
        newY -= craterT * craterT * this.craterDepth * 1.4;
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
    });

    this.mountainMesh = new THREE.Mesh(geo, mat);
    this.mountainMesh.position.y = height / 2 - this.craterDepth * 0.3;
    this.mountainMesh.castShadow = true;
    this.mountainMesh.receiveShadow = true;
    this.scene.add(this.mountainMesh);
  }

  /** The lava disc inside the crater doubles as an emissive material AND the source of the key point light. */
  private buildCraterLava(): void {
    const craterRadius = 2.1;
    const geo = new THREE.CircleGeometry(craterRadius, 48);
    this.lavaMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a0d02,
      emissive: 0xff5a1f,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    this.lavaMesh = new THREE.Mesh(geo, this.lavaMaterial);
    this.lavaMesh.rotation.x = -Math.PI / 2;
    this.lavaMesh.position.set(0, this.craterFloorY + this.mountainMesh.position.y, 0);
    this.scene.add(this.lavaMesh);

    this.lavaLight = new THREE.PointLight(0xff6a2a, 3.5, 40, 1.6);
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

  // ================= ERUPTION SEQUENCE =================

  erupt(): void {
    if (this.isErupting) return;
    this.outcome = this.resolveEruption();
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
        this.shakeAmount = this.outcome.kind === 'ash' ? 0.35 : 0.14;
        this.smokeTarget = 1;
        this.spawnEjecta();
        this.animatePlumeCountUp(this.outcome.plumeHeightKm);
        this.phaseTimer = setTimeout(() => this.setPhase('overflow'), 500);
        break;
      case 'overflow':
        this.spawnLavaFlows();
        this.shakeAmount = 0.1;
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

  private resolveEruption(): EruptionOutcome {
    const { viscosity, gas, water } = this;
    if (viscosity === 3 && gas === 3 && water === 3) {
      return { vei: 'VEI 6 — Pinatubo-class', title: 'Violent Plinian Eruption',
        narrative: 'Sticky dacite magma trapped enormous gas pressure until the crater lake and groundwater flashed to steam, driving a column of ash tens of kilometers skyward and collapsing into pyroclastic flows.',
        kind: 'ash', plumeHeightKm: 35, pyroclasticFlow: true, ashColor: 0xc3cad4,
        pressureNote: 'Extreme — gas cannot escape through viscous magma',
        waterNote: 'Groundwater flash-boils, adding explosive steam energy',
        viscosityNote: 'Dacite: thick, glassy, resists flow' };
    }
    if (viscosity === 1 && gas === 1) {
      return { vei: 'VEI 0–1', title: 'Effusive Hawaiian-Style Flow',
        narrative: 'Runny basaltic magma lets gas bubble out gently. Lava spreads in slow-moving flows rather than exploding.',
        kind: 'lava', plumeHeightKm: 1, pyroclasticFlow: false, ashColor: 0xff6a1f,
        pressureNote: 'Low — gas escapes freely',
        waterNote: 'No significant groundwater interaction',
        viscosityNote: 'Basalt: thin, fluid, flows easily' };
    }
    if (viscosity === 3 && gas === 1) {
      return { vei: 'VEI 1–2', title: 'Viscous Lava Dome Growth',
        narrative: 'Thick magma creeps out of the vent without exploding, since gas content is low. It piles into a steep dome over the crater.',
        kind: 'lava', plumeHeightKm: 2, pyroclasticFlow: false, ashColor: 0x8a6a58,
        pressureNote: 'Low, despite high viscosity',
        waterNote: 'Minimal interaction',
        viscosityNote: 'Dacite: builds a dome rather than flowing away' };
    }
    if (water === 3) {
      return { vei: 'VEI 3–4', title: 'Phreatomagmatic Steam Explosion',
        narrative: 'Superheated groundwater flashes to steam on contact with magma, shattering rock and hurling ash in sudden violent bursts.',
        kind: 'steam', plumeHeightKm: 8, pyroclasticFlow: false, ashColor: 0xd8dee6,
        pressureNote: 'Spikes suddenly from steam flashing',
        waterNote: 'Dominant driver — groundwater is the trigger',
        viscosityNote: 'Secondary factor in this scenario' };
    }
    return { vei: 'VEI 2', title: 'Strombolian Explosive Eruption',
      narrative: 'Moderate gas bursts launch glowing lava bombs above the summit, producing rhythmic fountains rather than a sustained column.',
      kind: 'bomb', plumeHeightKm: 3, pyroclasticFlow: false, ashColor: 0xff8a1f,
      pressureNote: 'Moderate, released in discrete bursts',
      waterNote: 'Limited involvement',
      viscosityNote: 'Intermediate — enough to trap some gas' };
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

  // ================= LAVA OVERFLOW (real geometry, terrain-hugging) =================

  private clearFlows(): void {
    this.lavaFlows.forEach((f) => {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    });
    this.lavaFlows = [];
  }

  private spawnLavaFlows(): void {
    const count = this.outcome.kind === 'lava' ? 3 : 2;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const startX = Math.cos(angle) * 2.0;
      const startZ = Math.sin(angle) * 2.0;
      const startY = this.sampleTerrainHeight(startX, startZ);

      const geo = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(startX, startY, startZ),
          new THREE.Vector3(startX, startY, startZ),
        ]), 8, 0.16, 6, false
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

      if (last.y > groundY && path.length < 34) {
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
          const newGeo = new THREE.TubeGeometry(curve, path.length * 4, 0.16, 6, false);
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

  // ================= EJECTA (ash / bombs / steam as real 3D particles) =================

  private spawnEjecta(): void {
    const count = this.outcome.kind === 'ash' ? 220 : this.outcome.kind === 'steam' ? 110 : 70;
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

    this.smokeIntensity += (this.smokeTarget - this.smokeIntensity) * dt * 1.2;
    this.craterFill += (this.craterFillTarget - this.craterFill) * dt * 1.4;

    const lavaY = this.craterFloorY + this.mountainMesh.position.y + this.craterDepth * this.craterFill;
    this.lavaMesh.position.y = lavaY;
    this.lavaLight.position.y = lavaY + 0.3;
    this.lavaMaterial.emissiveIntensity = 0.3 + this.craterFill * 1.6;
    this.lavaLight.intensity = 1.8 + this.craterFill * 4;
    const heat = 0.5 + Math.sin(elapsed * 6) * 0.05;
    this.lavaMaterial.emissive.setRGB(1, 0.35 + this.craterFill * heat * 0.3, 0.1);

    this.maybeSpawnSmoke();
    this.stepSmoke(dt, elapsed);
    this.stepClouds(dt, elapsed);

    if (this.ejecta.length > 0) this.stepEjecta(dt);
    if (this.lavaFlows.length > 0) this.growLavaFlows(dt);

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