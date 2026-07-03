import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from "@angular/router";

interface TimelineSlide {
  id: number;
  imageSrc: string;
  title: string;
  captionTitle: string;
  description: string;
  route: string; // Dynamic navigation route mapping target
}

@Component({
  selector: 'app-button-page',
  standalone: true, // Ensuring clean standalone configuration
  imports: [CommonModule],
  templateUrl: './button-page.html',
  styleUrl: './button-page.css',
})
export class ButtonPage {
  // Grab a direct reference to the track element from the DOM
  @ViewChild('sliderTrack') sliderTrack!: ElementRef;

  // Added custom routes matching your separate kiosk presentation screens
  slides: TimelineSlide[] = [
    {
      id: 1,
      imageSrc: 'assets/images/pt1.jpg',
      title: 'Mt. Pinatubo Stories',
      captionTitle: 'Pintaubo Stories',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim.',
      route: '/videos' // Links to videos page
    },
    {
      id: 2,
      imageSrc: 'assets/images/pt2.jpg', 
      title: 'Pinatubo Timeline',
      captionTitle: 'Pinatubo Timeline',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim.',
      route: '/timeline' // Change this to your actual timeline page path
    },
    {
      id: 3,
      imageSrc: 'assets/images/pt3.jpg',
      title: 'Pinatubo Caldera',
      captionTitle: 'Ask AI Pinatubo',
      description: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.',
      route: '/apo-pinatubo' // Change this to your actual caldera page path
    },
  ];

  // NOTE: Your array has 3 elements. Arrays are 0-indexed, so the center card is index 1.
  activeIndex: number = 1;

  constructor(private router: Router) {}

  /**
   * Runs continuously while scrolling. Detects which polaroid element is closest 
   * to the physical center line of the slider container.
   */
  onTrackScroll(event: Event): void {
    const track = event.target as HTMLElement;
    const cards = track.querySelectorAll('.polaroid-card');
    
    // Determine the exact horizontal center line of the container view track
    const trackCenter = track.getBoundingClientRect().left + (track.offsetWidth / 2);

    let closestIndex = this.activeIndex;
    let minDistance = Infinity;

    cards.forEach((cardElement, i) => {
      const card = cardElement as HTMLElement;
      // Get the current dynamic center point of this polaroid on screen
      const cardCenter = card.getBoundingClientRect().left + (card.offsetWidth / 2);
      const distanceFromCenter = Math.abs(trackCenter - cardCenter);

      if (distanceFromCenter < minDistance) {
        minDistance = distanceFromCenter;
        closestIndex = i;
      }
    });

    // Only trigger a change detection update if a new slide crosses the center threshold
    if (this.activeIndex !== closestIndex) {
      this.activeIndex = closestIndex;
    }
  }

  /**
   * First tap on a card that isn't already centered/active just selects
   * and centers it — it does NOT navigate. Only a tap on a card that is
   * already active triggers navigation. This stops a single accidental
   * touch (e.g. brushing past the AI Pinatubo card) from immediately
   * launching that page.
   */
  setActiveCard(index: number, targetRoute: string, event: MouseEvent): void {
    const clickedCard = event.currentTarget as HTMLElement;

    if (this.activeIndex !== index) {
      this.activeIndex = index;
      clickedCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
      return;
    }

    // 1. Instantly inject the CSS animation class
    clickedCard.classList.add('clicked-flash');

    // 2. Briefly delay the view engine router step so the animation can visually express itself
    setTimeout(() => {
      this.router.navigate([targetRoute])
        .catch(error => {
          console.error(`Angular Router failed to navigate to ${targetRoute}:`, error);
          // Safely strip class if transition faults completely
          clickedCard.classList.remove('clicked-flash');
        });
    }, 200);
  }
}