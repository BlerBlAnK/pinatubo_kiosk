import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-lahar-defense-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lahar-defense-page.html',
  styleUrl: './lahar-defense-page.css',
})
export class LaharDefensePage implements OnInit, OnDestroy {
  gameUrl: SafeResourceUrl;
  gameStarted = false;

  constructor(private sanitizer: DomSanitizer, private router: Router) {
    this.gameUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/lahar-defense/index.html');
  }

  ngOnInit(): void {
    // Neither the welcome screen nor the game itself needs the kiosk's
    // shared footer/help button — the welcome screen has its own Home
    // button, and the game has its own full-screen HUD. Stays hidden for
    // the entire time this page is active; restored in ngOnDestroy.
    document.body.classList.add('hide-kiosk-chrome');
  }

  ngOnDestroy(): void {
    // Always restore it on the way out, no matter which button sent the
    // visitor away, so no other page inherits this page's UI state.
    document.body.classList.remove('hide-kiosk-chrome');
  }

  // The game's own "Exit to Menu" button (inside its Menu overlay) posts
  // 'exit-lahar-game' to window.parent when tapped, since it has no
  // knowledge of Angular routing from inside the iframe. This is the
  // Angular-side half of that bridge — origin-checked so only messages
  // from this same-origin iframe are ever acted on.
  @HostListener('window:message', ['$event'])
  onGameMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    if (event.data === 'exit-lahar-game') {
      this.router.navigate(['/menu']);
    }
  }

  startGame(): void {
    this.gameStarted = true;
  }

  // Welcome screen's Home button — always goes straight to the menu,
  // unlike goBack() below which retraces wherever the visitor came from.
  goHome(): void {
    this.router.navigate(['/menu']);
  }

  goBack(): void {
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/lahar-defense') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }
}