import {
  Component, inject, signal, computed,
  HostListener, OnInit, OnDestroy, NgZone,
  ViewChild, ElementRef, AfterViewChecked
} from '@angular/core';
import { TimelineDataService } from './timeline-data.service';
import { TimelineEvent, LaharIntensity } from './timeline-event.model';
import { UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';

// Central-Luzon-focused crop of the traced landmass, GEOREFERENCED
// against the source map's real bounding box (N 18.94°, S 12.23°,
// W 119.44°, E 124.49°, equirectangular projection), not eyeballed.
// Aspect ratio (~16:9) matches the wide, full-bleed .map-viewport box.
// This is the STARTING view (and what "reset zoom" returns to);
// panning is not restricted to this box — see PAN_BOUNDS below.
const BASE_VB = { x: -650, y: -3, w: 2300, h: 1294 };
const MAP_CX = BASE_VB.x + BASE_VB.w / 2; // 500
const MAP_CY = BASE_VB.y + BASE_VB.h / 2; // 644

// Pan is clamped to this larger area (the full traced map, plus margin),
// NOT to BASE_VB — see prior fix. Source map is 960x1294px. Expanded to
// comfortably contain the new, wider BASE_VB above.
const PAN_BOUNDS = { x: -700, y: -50, w: 2400, h: 1400 };

// Mount Pinatubo — 15.1300°N, 120.3500°E — converted to the source
// map's pixel space via the equirectangular formula:
//   x = (lon - 119.44) / (124.49 - 119.44) * 960
//   y = (18.94 - lat)  / (18.94  - 12.23) * 1294
// Verified to land inside the traced landmass.
const PINATUBO_X = 173;
const PINATUBO_Y = 735;

// Province markers, each placed at (or just inland of, for coastal
// capitals) their real provincial capital's georeferenced position:
//   Zambales  -> Iba (capital), 15.3333°N, 119.9667°E
//   Tarlac    -> Tarlac City (capital), 15.4802°N, 120.5979°E
//   Pampanga  -> City of San Fernando (capital), 15.0286°N, 120.6898°E
// Iba sits directly on the coastline, so its marker is nudged a few
// pixels inland (still within Zambales) to stay clearly on the landmass.
interface ProvinceMarker {
  id: 'zambales' | 'pampanga' | 'tarlac';
  label: string;
  x: number;
  y: number;
}
const PROVINCE_MARKERS: ProvinceMarker[] = [
  { id: 'zambales', label: 'Zambales', x: 140, y: 710 },
  { id: 'tarlac',   label: 'Tarlac',   x: 220, y: 667 },
  { id: 'pampanga', label: 'Pampanga', x: 238, y: 754 },
];

@Component({
  selector: 'app-timeline-page',
  imports: [UpperCasePipe],
  templateUrl: './timeline-page.html',
  styleUrl: './timeline-page.css',
})
export class TimelinePage implements OnInit, OnDestroy, AfterViewChecked {
  private readonly dataService = inject(TimelineDataService);
  private readonly ngZone = inject(NgZone);

  constructor(private router: Router) {}

  goBack(): void {
    // Uses the previous route tracked app-wide in sessionStorage (see
    // app.ts) instead of the browser's native history.back() — kiosk
    // browsers and embedded webviews don't always support that reliably.
    // Falls back to the menu if there's no tracked previous page (e.g.
    // this route was opened directly, with nothing recorded yet).
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }

  @ViewChild('sliderTrack') sliderTrack?: ElementRef<HTMLElement>;

  // ── Data ─────────────────────────────────────────────────────────────────
  readonly timelineEvents = this.dataService.getEvents();
  readonly activeEvent    = signal<TimelineEvent>(this.timelineEvents[0]);
  readonly activeFigures  = computed(() => this.activeEvent().figures);
  readonly activeSlideIndex = signal(0);

  readonly pinatuboX = PINATUBO_X;
  readonly pinatuboY = PINATUBO_Y;
  readonly provinceMarkers = PROVINCE_MARKERS;

  // Which province marker is currently hovered/focused, for the tooltip.
  readonly hoveredProvince = signal<string | null>(null);

  // ── Thematic layer: province -> intensity for the active era ───────────
  readonly regionIntensityMap = computed(() => {
    const map = new Map<string, LaharIntensity>();
    for (const r of this.activeEvent().impactProfile.affectedRegions) {
      map.set(r.regionId, r.intensity);
    }
    return map;
  });

  getRegionIntensity(regionId: string): LaharIntensity {
    return this.regionIntensityMap().get(regionId) ?? 'none';
  }

  getRegionLabel(regionId: string): string | undefined {
    return this.activeEvent().impactProfile.affectedRegions
      .find(r => r.regionId === regionId)?.label;
  }

  get pinatuboGlowActive(): boolean {
    return this.activeEvent().impactProfile.showPinatuboGlow;
  }

  // Radar-style halo radius per era — grows to visibly reach toward the
  // affected provinces as the timeline progresses, then recedes during
  // recovery. Distances from Pinatubo (173,735) to the markers: Zambales
  // ~41, Pampanga ~68, Tarlac ~83 (map units) — radii below are chosen
  // relative to those so the "reach" roughly tracks which provinces are
  // actually flagged as affected in each era's impactProfile.
  private readonly HALO_RADIUS_BY_ERA: Record<string, number> = {
    'before-1991':     28,   // dormant — small, inactive marker only
    '1991-eruption':   95,   // reaches Zambales + Pampanga (blast/ashfall)
    '1991-1995-lahar': 135,  // reaches all three, incl. Tarlac (lahar peak)
    'present-day':     55,   // receding — recovery, residual glow only
  };

  readonly pinatuboHaloRadius = computed(() =>
    this.HALO_RADIUS_BY_ERA[this.activeEvent().id] ?? 28
  );

  setHoveredProvince(id: string | null): void {
    this.hoveredProvince.set(id);
  }

  private _pendingSliderReset = false;

  // ── Google-Maps-style zoom / pan (map itself doesn't change era —
  //    era switching is still exclusively via the timeline buttons) ───────
  private _zoomLevel  = 1;
  private _panX       = BASE_VB.x;
  private _panY       = BASE_VB.y;
  private _vbW        = BASE_VB.w;
  private _vbH        = BASE_VB.h;

  readonly viewBoxStr = signal(
    `${BASE_VB.x} ${BASE_VB.y} ${BASE_VB.w} ${BASE_VB.h}`
  );
  readonly zoomLevel  = signal(1);

  // Live drag preview: instead of mutating viewBox on every pointermove
  // (which forces the browser to re-layout/repaint the huge landmass path
  // from scratch every frame — the actual cause of the shake/stagger),
  // we translate a wrapping <g> via a cheap, compositor-friendly SVG
  // transform. viewBox itself is only updated once, on pointer-up, when
  // the drag is baked into the real pan position.
  readonly dragTransform = signal('translate(0,0)');

  private _dragging       = false;
  private _dragStartSvgX  = 0;
  private _dragStartSvgY  = 0;
  private _dragStartPanX  = 0;
  private _dragStartPanY  = 0;
  private _pinching        = false;
  private _lastPinchDist   = 0;
  private _dragLastDx      = 0;
  private _dragLastDy      = 0;

  // Cached once per drag (in onPointerDown) instead of recomputed on every
  // pointermove — getScreenCTM() forces a synchronous layout reflow, so
  // calling it dozens of times a second during a drag was costly (kept,
  // still worth avoiding even though it's no longer the main bottleneck).
  private _dragCtmInverse: DOMMatrix | null = null;

  // rAF batching so we never push more than one transform update per
  // paint frame, no matter how fast pointermove events arrive.
  private _rafId: number | null = null;
  private _pendingTransform: string | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {}

  ngAfterViewChecked(): void {
    if (this._pendingSliderReset && this.sliderTrack) {
      this._pendingSliderReset = false;
      this.scrollSliderToIndex(0, false);
    }
  }

  ngOnDestroy(): void {}

  // ── Era selection — driven ONLY by the timeline buttons ────────────────
  setActiveEvent(id: string): void {
    const match = this.timelineEvents.find(e => e.id === id);
    if (!match || match.id === this.activeEvent().id) return;
    this.activeEvent.set(match);
    this.activeSlideIndex.set(0);
    this._pendingSliderReset = true;
  }

  isActive(id: string): boolean {
    return this.activeEvent().id === id;
  }

  // ── Figure slider (read-only; does not change era) ────────────────────────
  goToSlide(index: number): void {
    const count = this.activeFigures().length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(index, count - 1));
    this.activeSlideIndex.set(clamped);
    this.scrollSliderToIndex(clamped);
  }

  prevSlide(): void {
    this.goToSlide(this.activeSlideIndex() - 1);
  }

  nextSlide(): void {
    this.goToSlide(this.activeSlideIndex() + 1);
  }

  onSliderScroll(event: Event): void {
    const track = event.target as HTMLElement;
    const slides = track.querySelectorAll('.figure-slide');
    if (slides.length === 0) return;

    const trackCenter = track.getBoundingClientRect().left + track.offsetWidth / 2;
    let closestIndex = this.activeSlideIndex();
    let minDistance = Infinity;

    slides.forEach((slideEl, i) => {
      const slide = slideEl as HTMLElement;
      const slideCenter = slide.getBoundingClientRect().left + slide.offsetWidth / 2;
      const distance = Math.abs(trackCenter - slideCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    });

    if (closestIndex !== this.activeSlideIndex()) {
      this.activeSlideIndex.set(closestIndex);
    }
  }

  private scrollSliderToIndex(index: number, smooth = true): void {
    const track = this.sliderTrack?.nativeElement;
    if (!track) return;
    const slide = track.querySelectorAll('.figure-slide')[index] as HTMLElement | undefined;
    if (!slide) return;

    const targetLeft = slide.offsetLeft - (track.offsetWidth - slide.offsetWidth) / 2;
    track.scrollTo({ left: targetLeft, behavior: smooth ? 'smooth' : 'instant' });
  }

  // ── Zoom controls (buttons) ─────────────────────────────────────────────
  zoomIn(): void  { this.applyZoom(1.5); }
  zoomOut(): void { this.applyZoom(1 / 1.5); }

  private applyZoom(factor: number): void {
    this.applyZoomAroundPoint(factor, MAP_CX, MAP_CY);
  }

  resetZoom(): void {
    this._zoomLevel = 1;
    this._panX = BASE_VB.x;
    this._panY = BASE_VB.y;
    this._vbW  = BASE_VB.w;
    this._vbH  = BASE_VB.h;
    this.zoomLevel.set(1);
    this.viewBoxStr.set(`${BASE_VB.x} ${BASE_VB.y} ${BASE_VB.w} ${BASE_VB.h}`);
  }

  // ── Mouse wheel zoom (zooms toward the cursor, like Google Maps) ───────
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;

    const svg = event.currentTarget as SVGSVGElement;
    const pt  = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());

    this.applyZoomAroundPoint(factor, svgPt.x, svgPt.y);
  }

  private applyZoomAroundPoint(factor: number, cx: number, cy: number): void {
    // Clamp zoom range: 1x (fully zoomed out to the Central Luzon crop)
    // up to 5x (close enough to clearly distinguish the three provinces).
    const newZoom = Math.min(Math.max(this._zoomLevel * factor, 1), 5);
    const scaleChange = this._zoomLevel / newZoom;

    const newW = BASE_VB.w / newZoom;
    const newH = BASE_VB.h / newZoom;

    this._panX = cx - (cx - this._panX) * scaleChange;
    this._panY = cy - (cy - this._panY) * scaleChange;

    this._panX = Math.max(PAN_BOUNDS.x, Math.min(this._panX, PAN_BOUNDS.x + PAN_BOUNDS.w - newW));
    this._panY = Math.max(PAN_BOUNDS.y, Math.min(this._panY, PAN_BOUNDS.y + PAN_BOUNDS.h - newH));

    this._zoomLevel = newZoom;
    this._vbW = newW;
    this._vbH = newH;
    this.zoomLevel.set(+newZoom.toFixed(2));
    this.viewBoxStr.set(`${this._panX.toFixed(1)} ${this._panY.toFixed(1)} ${newW.toFixed(1)} ${newH.toFixed(1)}`);
  }

  // ── Pan (unified pointer events for mouse + touch, like dragging Google Maps) ──
 onPointerDown(event: PointerEvent): void {
    if (this._pinching) return;
    // Stops the browser's native drag-gesture handling (e.g. trying to
    // "drag" the SVG path/text like an image/text selection) from running
    // at the same time as our JS-driven pan — that conflict is what causes
    // the shake/stagger while dragging with the mouse.
    event.preventDefault();

    this._dragging = false;
    // Reset the last-known drag delta from any PREVIOUS drag. A plain
    // click never fires _onPointerMove (which is the only place these
    // normally get updated), so without this reset, pointer-up would
    // still bake in a stale leftover delta from your last real drag —
    // that's what was causing every click to "jump"/move the map.
    this._dragLastDx = 0;
    this._dragLastDy = 0;
    this._dragStartPanX = this._panX;
    this._dragStartPanY = this._panY;

    const svg = event.currentTarget as SVGSVGElement;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    // Cache the inverse matrix ONCE for the whole drag — this is the
    // expensive, reflow-triggering call, so it must not run per-move.
    this._dragCtmInverse = ctm.inverse();

    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgPt = pt.matrixTransform(this._dragCtmInverse);
    this._dragStartSvgX = svgPt.x;
    this._dragStartSvgY = svgPt.y;

    svg.setPointerCapture(event.pointerId);
    // Run the high-frequency drag listeners outside Angular's zone so each
    // raw pointermove doesn't trigger a full change-detection pass; we only
    // re-enter the zone once per animation frame (see _onPointerMove).
    this.ngZone.runOutsideAngular(() => {
      svg.addEventListener('pointermove', this._onPointerMove);
      svg.addEventListener('pointerup',   this._onPointerUp, { once: true });
      svg.addEventListener('pointercancel', this._onPointerUp, { once: true });
    });
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (this._pinching || !this._dragCtmInverse) return;

    const pt = new DOMPoint(event.clientX, event.clientY);
    const svgPt = pt.matrixTransform(this._dragCtmInverse);

    const dx = svgPt.x - this._dragStartSvgX;
    const dy = svgPt.y - this._dragStartSvgY;

    if (Math.abs(dx) + Math.abs(dy) > 3) this._dragging = true;

    this._dragLastDx = dx;
    this._dragLastDy = dy;
    // NOTE: intentionally NOT touching viewBoxStr here — that would force
    // the browser to re-layout/repaint the full landmass path every frame.
    // translate() on the wrapping <g> is composited and much cheaper.
    this._pendingTransform = `translate(${dx.toFixed(1)},${dy.toFixed(1)})`;

    if (this._rafId === null) {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        if (this._pendingTransform) {
          this.ngZone.run(() => this.dragTransform.set(this._pendingTransform!));
        }
      });
    }
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    const svg = event.currentTarget as SVGSVGElement;
    svg.removeEventListener('pointermove', this._onPointerMove);
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Bake the accumulated drag delta into the real pan position and
    // commit it to viewBox exactly once (not per-frame), then reset the
    // preview transform back to identity.
    const newX = Math.max(PAN_BOUNDS.x, Math.min(this._dragStartPanX - this._dragLastDx, PAN_BOUNDS.x + PAN_BOUNDS.w - this._vbW));
    const newY = Math.max(PAN_BOUNDS.y, Math.min(this._dragStartPanY - this._dragLastDy, PAN_BOUNDS.y + PAN_BOUNDS.h - this._vbH));
    this._panX = newX;
    this._panY = newY;

    this.ngZone.run(() => {
      this.viewBoxStr.set(`${newX.toFixed(1)} ${newY.toFixed(1)} ${this._vbW.toFixed(1)} ${this._vbH.toFixed(1)}`);
      this.dragTransform.set('translate(0,0)');
    });

    this._pendingTransform = null;
    this._dragCtmInverse = null;
    setTimeout(() => { this._dragging = false; }, 50);
  };

  // ── Touch pinch zoom ──────────────────────────────────────────────────────
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      this._pinching = true;
      this._lastPinchDist = this.pinchDist(event);
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      const dist = this.pinchDist(event);
      const factor = dist / this._lastPinchDist;
      this._lastPinchDist = dist;
      this.applyZoom(factor);
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this._pinching = false;
    }
  }

  private pinchDist(event: TouchEvent): number {
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  }
}