import { Component, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { WelcomePage } from './welcome-page/welcome-page';
import { Header } from './header/header';
import { Footer } from './footer/footer';
import { ButtonPage } from './button-page/button-page';



@Component({
  selector: 'app-root',
  imports: [RouterOutlet, WelcomePage, Header, Footer, ButtonPage],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('pinatubo-museum');

  constructor(router: Router) {
    // Tracks which page led to the current one, in sessionStorage rather
    // than relying on the browser's own history.back(). Kiosk browsers
    // and embedded webviews often sandbox or don't reliably support
    // native history navigation, so any page (like Apo Pinatubo's "Back"
    // button) can instead read sessionStorage's 'kioskPreviousRoute' to
    // return to wherever the visitor actually came from.
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const current = sessionStorage.getItem('kioskCurrentRoute');
        if (current && current !== event.urlAfterRedirects) {
          sessionStorage.setItem('kioskPreviousRoute', current);
        }
        sessionStorage.setItem('kioskCurrentRoute', event.urlAfterRedirects);
      });
  }
}
