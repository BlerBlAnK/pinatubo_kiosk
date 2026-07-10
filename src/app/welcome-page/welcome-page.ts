import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-page.html',
  styleUrls: ['./welcome-page.css']
})
export class WelcomePage implements AfterViewInit {
  // 1. Reference the #bgVideo template variable from your HTML
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;

  isColored = false;

  constructor(private router: Router) {}

  // 2. Set the video speed once the view has fully initialized
  ngAfterViewInit(): void {
    if (this.videoRef) {
      this.videoRef.nativeElement.playbackRate = 0.4; // Adjust this number to change speed (e.g., 0.4, 0.6)
    }
  }

  toggleColor(): void {
    // Guard against repeated taps re-triggering the transition and
    // stacking up multiple navigation timers.
    if (this.isColored) return;
    this.isColored = true;
    setTimeout(() => {
      this.router.navigate(['/menu']);
    }, 2000);
  }
}