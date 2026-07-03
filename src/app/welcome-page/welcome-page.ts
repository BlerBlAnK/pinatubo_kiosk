import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-page.html',
  styleUrls: ['./welcome-page.css']
})
export class WelcomePage {
  isColored = false;

  constructor(private router: Router) {}

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