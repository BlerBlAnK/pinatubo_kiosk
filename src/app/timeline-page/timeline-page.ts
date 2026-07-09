import {
  Component, inject, signal, computed,
  HostListener, OnInit, OnDestroy, NgZone,
  ViewChild, ElementRef, AfterViewChecked
} from '@angular/core';
import { TimelineDataService } from './timeline-data.service';
import { TimelineEvent } from './timeline-event.model';
import { UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';

// SVG coordinate constants — center of Pinatubo in our viewBox
const MAP_CX = 345;
const MAP_CY = 520;
const BASE_VB = { x: -80, y: 60, w: 840, h: 880 };
// Era radius thresholds (in SVG units, matching the generated ring shapes)
const R_CALDERA   = 46;   // ERA 4: present day / crater
const R_BLAST     = 64;   // ERA 2: 1991 eruption blast zone
const R_FOREST    = 82;   // ERA 1: pre-1991 forested watershed
// Lahar tendril directions in degrees (0=North, clockwise)
const LAHAR_DIRS  = [0, 45, 100, 145, 230];
const LAHAR_HALF_WIDTH_DEG = 20;

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

  selectEra(era: any): void {
    console.log('Selected era:', era);
    // Add your logic here (e.g., updating a selectedEra state variable)
  }

  // ── SVG Zoom / Pan ───────────────────────────────────────────────────────
  private _zoomLevel  = 1;
  private _panX       = 0;
  private _panY       = 0;
  private _vbW        = BASE_VB.w;
  private _vbH        = BASE_VB.h;

  readonly viewBoxStr = signal(
    `${BASE_VB.x} ${BASE_VB.y} ${BASE_VB.w} ${BASE_VB.h}`
  );
  readonly zoomLevel  = signal(1);

  // Pan drag state
  private _dragging   = false;
  private _dragStartSvgX = 0;
  private _dragStartSvgY = 0;
  private _dragStartPanX = 0;
  private _dragStartPanY = 0;
  private _pinching = false;
  private _pendingSliderReset = false;

  // Pinch state
  private _lastPinchDist = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this._panX = BASE_VB.x;
    this._panY = BASE_VB.y;
  }

  ngAfterViewChecked(): void {
    if (this._pendingSliderReset && this.sliderTrack) {
      this._pendingSliderReset = false;
      this.scrollSliderToIndex(0, false);
    }
  }

  ngOnDestroy(): void {}


  // ── Era selection (map-driven only) ───────────────────────────────────────
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

  // ── Map click — coordinate-math hit detection bypasses SVG z-order ───────
  onMapClick(event: MouseEvent): void {
    if (this._dragging) return;

    const svg = event.currentTarget as SVGSVGElement;
    const pt  = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());

    const dx   = svgPt.x - MAP_CX;
    const dy   = svgPt.y - MAP_CY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const bearingDeg = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;

    // Ensure these keys match your service data / ids used in the layout template
  if (dist < R_CALDERA) {
    this.setActiveEvent('1991-1995-lahar'); // or your current crater configuration
    return;
  }
  if (dist < R_FOREST) {
    this.setActiveEvent('1991-eruption');
    return;
  }
  if (dist < 320) {
    if (this.inLaharZone(bearingDeg)) {
      this.setActiveEvent('1991-1995-lahar');
    } else {
      this.setActiveEvent('before-1991');
    }
  }
  }

  private inLaharZone(bearingDeg: number): boolean {
    return LAHAR_DIRS.some(dir => {
      let diff = Math.abs(bearingDeg - dir);
      if (diff > 180) diff = 360 - diff;
      return diff < LAHAR_HALF_WIDTH_DEG;
    });
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  zoomIn(): void  { this.applyZoom(1.5);  }
  zoomOut(): void { this.applyZoom(1/1.5); }

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

  private applyZoom(factor: number): void {
    this.applyZoomAroundPoint(factor, MAP_CX, MAP_CY);
  }

  private applyZoomAroundPoint(factor: number, cx: number, cy: number): void {
    const newZoom = Math.min(Math.max(this._zoomLevel * factor, 1), 5);
    const scaleChange = this._zoomLevel / newZoom;

    const newW = BASE_VB.w / newZoom;
    const newH = BASE_VB.h / newZoom;

    this._panX = cx - (cx - this._panX) * scaleChange;
    this._panY = cy - (cy - this._panY) * scaleChange;

    this._panX = Math.max(BASE_VB.x, Math.min(this._panX, BASE_VB.x + BASE_VB.w - newW));
    this._panY = Math.max(BASE_VB.y, Math.min(this._panY, BASE_VB.y + BASE_VB.h - newH));

    this._zoomLevel = newZoom;
    this._vbW = newW;
    this._vbH = newH;
    this.zoomLevel.set(+newZoom.toFixed(2));
    this.viewBoxStr.set(`${this._panX.toFixed(1)} ${this._panY.toFixed(1)} ${newW.toFixed(1)} ${newH.toFixed(1)}`);
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

  // ── Pan (unified pointer events for mouse + touch) ────────────────────────
  onPointerDown(event: PointerEvent): void {
    if (this._pinching) return;

    this._dragging = false;
    this._dragStartPanX = this._panX;
    this._dragStartPanY = this._panY;

    const svg = event.currentTarget as SVGSVGElement;
    const pt  = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    this._dragStartSvgX = svgPt.x;
    this._dragStartSvgY = svgPt.y;

    svg.setPointerCapture(event.pointerId);
    svg.addEventListener('pointermove', this._onPointerMove);
    svg.addEventListener('pointerup',   this._onPointerUp, { once: true });
    svg.addEventListener('pointercancel', this._onPointerUp, { once: true });
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (this._pinching) return;

    const svg = event.currentTarget as SVGSVGElement;
    const pt  = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());

    const dx = svgPt.x - this._dragStartSvgX;
    const dy = svgPt.y - this._dragStartSvgY;

    if (Math.abs(dx) + Math.abs(dy) > 3) this._dragging = true;

    const newX = Math.max(BASE_VB.x, Math.min(this._dragStartPanX - dx, BASE_VB.x + BASE_VB.w - this._vbW));
    const newY = Math.max(BASE_VB.y, Math.min(this._dragStartPanY - dy, BASE_VB.y + BASE_VB.h - this._vbH));

    this._panX = newX;
    this._panY = newY;
    this.ngZone.run(() => {
      this.viewBoxStr.set(`${newX.toFixed(1)} ${newY.toFixed(1)} ${this._vbW.toFixed(1)} ${this._vbH.toFixed(1)}`);
    });
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    const svg = event.currentTarget as SVGSVGElement;
    svg.removeEventListener('pointermove', this._onPointerMove);
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