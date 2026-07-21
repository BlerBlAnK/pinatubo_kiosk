import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-lahar-defense-page',
  standalone: true,
  templateUrl: './lahar-defense-page.html',
  styleUrl: './lahar-defense-page.css',
})
export class LaharDefensePage {
  gameUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer, private router: Router) {
    this.gameUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/lahar-defense/index.html');
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