import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
}
