import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  isInfoOpen: boolean = false;

  toggleInfoModal(): void {
    this.isInfoOpen = !this.isInfoOpen;
  }
}