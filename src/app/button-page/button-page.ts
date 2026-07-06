import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from "@angular/router";

interface TimelineSlide {
  id: number;
  images: string[];
  currentImageIndex: number; // Keep track of the active sub-index explicitly
  title: string;
  captionTitle: string;
  description: string;
  route: string;
}

@Component({
  selector: 'app-button-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './button-page.html',
  styleUrl: './button-page.css',
})
export class ButtonPage implements OnInit, OnDestroy {
  @ViewChild('sliderTrack') sliderTrack!: ElementRef;

  slides: TimelineSlide[] = [
    {
      id: 1,
      images: ['assets/images/ptstories.jpg', 'assets/images/ptstories2.jpg', 'assets/images/ptstories3.jpg'],
      currentImageIndex: 0,
      title: 'Mt. Pinatubo Stories',
      captionTitle: 'Pinatubo Stories',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit...',
      route: '/videos'
    },
    {
      id: 2,
      images: ['assets/images/pt2.jpg', 'assets/images/pt2_sub1.jpg', 'assets/images/pt2_sub2.jpg'],
      currentImageIndex: 0,
      title: 'Pinatubo Timeline',
      captionTitle: 'Pinatubo Timeline',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit...',
      route: '/timeline'
    },
    {
      id: 3,
      images: ['assets/images/pt3.jpg', 'assets/images/pt3_sub1.jpg', 'assets/images/pt3_sub2.jpg'],
      currentImageIndex: 0,
      title: 'Pinatubo Caldera',
      captionTitle: 'Ask Apo Namalyari (AI)',
      description: 'Duis aute irure dolor in reprehenderit in voluptate...',
      route: '/apo-pinatubo'
    },
  ];

  activeIndex: number = 1;
  private rotationInterval: any;

  // Inject ChangeDetectorRef to explicitly push DOM refreshes out to the template
  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.startActiveRotation();
  }

  ngOnDestroy(): void {
    this.stopRotation();
  }

  /**
   * Loops explicitly and forces a template update only on the enlarged card
   */
  startActiveRotation(): void {
    this.stopRotation();
    this.rotationInterval = setInterval(() => {
      const activeSlide = this.slides[this.activeIndex];
      
      if (activeSlide && activeSlide.images.length > 1) {
        // Increment the current active image index
        activeSlide.currentImageIndex = (activeSlide.currentImageIndex + 1) % activeSlide.images.length;
        
        // Force Angular to check the DOM immediately to avoid background-stalling
        this.cdr.detectChanges();
      }
    }, 3000); // 1.5s fast loop transitions
  }

  stopRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
  }

  onTrackScroll(event: Event): void {
    const track = event.target as HTMLElement;
    const cards = track.querySelectorAll('.polaroid-card');
    const trackCenter = track.getBoundingClientRect().left + (track.offsetWidth / 2);

    let closestIndex = this.activeIndex;
    let minDistance = Infinity;

    cards.forEach((cardElement, i) => {
      const card = cardElement as HTMLElement;
      const cardCenter = card.getBoundingClientRect().left + (card.offsetWidth / 2);
      const distanceFromCenter = Math.abs(trackCenter - cardCenter);

      if (distanceFromCenter < minDistance) {
        minDistance = distanceFromCenter;
        closestIndex = i;
      }
    });

    if (this.activeIndex !== closestIndex) {
      // Clean up old active card instantly back to cover image
      this.slides[this.activeIndex].currentImageIndex = 0;
      this.activeIndex = closestIndex;
      
      // Reset timer track to start looping instantly from 0 delay
      this.startActiveRotation();
    }
  }

  setActiveCard(index: number, targetRoute: string, event: MouseEvent): void {
    const clickedCard = event.currentTarget as HTMLElement;

    if (this.activeIndex !== index) {
      this.slides[this.activeIndex].currentImageIndex = 0;
      this.activeIndex = index;
      
      this.startActiveRotation();
      
      clickedCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
      return;
    }

    clickedCard.classList.add('clicked-flash');

    setTimeout(() => {
      this.router.navigate([targetRoute])
        .catch(error => {
          console.error(`Navigation error:`, error);
          clickedCard.classList.remove('clicked-flash');
        });
    }, 200);
  }
}