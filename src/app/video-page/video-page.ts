import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

interface Interviewee {
  id: number;
  name: string;
  avatar: string;
  videoSrc: string;
  storyTitle?: string;
  category?: string; // Links interviewees directly to filter categories
}

@Component({
  selector: 'app-video-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-page.html',
  styleUrl: './video-page.css',
})
export class VideoPage {
  @ViewChild('kioskVideoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  selectedPerson: Interviewee | null = null;
  videoUnavailable = false;

  // Premium Filter Options (ALL set as default option)
  filters: string[] = ['ALL', 'FILTER 1', 'FILTER 2', 'FILTER 3'];
  selectedFilter: string = 'ALL';

  // Pagination & Swipe Management
  currentPage = 0;
  itemsPerPage = 6;
  isTransitioning = false;
  swipeDirection: 'left' | 'right' | '' = 'left';

  // Internal touch tracking coordinates
  private touchStartX = 0;
  private touchEndX = 0;

  constructor(private router: Router) {}

  goBack(): void {
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }

  // Interviewee array containing category tags mapping directly to your Filters
  interviewees: Interviewee[] = [
    {
      id: 1,
      name: 'ELISA FEDELINO',
      avatar: '/assets/images/elisa.png',      
      videoSrc: '/assets/videos/elisa.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 1'
    },
    {
      id: 2,
      name: 'RANDOLF GARCIA',
      avatar: '/assets/images/randolf.png',
      videoSrc: '/assets/videos/randolf.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 1'
    },
    {
      id: 3,
      name: 'VIOLY OCAMPO',
      avatar: '/assets/images/violy.png',
      videoSrc: '/assets/videos/violy.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 1'
    },
    {
      id: 4,
      name: 'ANTONIO SANCHEZ',
      avatar: '/assets/images/antonio.jpg',
      videoSrc: '/assets/videos/antonio_story.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 3'
    },
    {
      id: 5,
      name: 'ELENA MAGAT',
      avatar: '/assets/images/elena.jpg',
      videoSrc: '/assets/videos/elena_story.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 3'
    },
    {
      id: 6,
      name: 'LUZVIMINDA CRUZ',
      avatar: '/assets/images/luzviminda.jpg',
      videoSrc: '/assets/videos/luzviminda_story.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 3'
    },
    // Mock profiles mapped for Filter 2/3 pagination & swipe testing
    {
      id: 7,
      name: 'JUSTIN CABE',
      avatar: '/assets/images/pinatubo.jpg',
      videoSrc: '/assets/videos/elisa.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 2'
    },
    {
      id: 8,
      name: 'FRIENCH OCAMPO',
      avatar: '/assets/images/pinatubo.jpg',
      videoSrc: '/assets/videos/randolf.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 2'
    },
    {
      id: 9,
      name: 'JAMES MANANQUIL',
      avatar: '/assets/images/pinatubo.jpg',
      videoSrc: '/assets/videos/violy.mp4',
      storyTitle: 'Lorem Ipsum',
      category: 'FILTER 3'
    }
  ];

  // Helper to obtain profiles relevant to active filter (shows all if "ALL" is selected)
  get filteredInterviewees(): Interviewee[] {
    if (this.selectedFilter === 'ALL') {
      return this.interviewees;
    }
    return this.interviewees.filter(person => person.category === this.selectedFilter);
  }

  // Returns precisely the 6 profiles showing on the current page
  get pagedInterviewees(): Interviewee[] {
    const startIndex = this.currentPage * this.itemsPerPage;
    return this.filteredInterviewees.slice(startIndex, startIndex + this.itemsPerPage);
  }

  // Returns total pages based on current selection filter size
  get totalPages(): number {
    return Math.ceil(this.filteredInterviewees.length / this.itemsPerPage);
  }

  // Sets the filter, resetting pagination back to page 1 (0-indexed)
  setFilter(filter: string): void {
    if (this.selectedFilter === filter || this.isTransitioning) return;
    this.swipeDirection = 'left';
    this.triggerPageTransition(() => {
      this.selectedFilter = filter;
      this.currentPage = 0;
    });
  }

  // Set individual page via click action on dots
  setPage(pageIndex: number): void {
    if (this.currentPage === pageIndex || this.isTransitioning) return;
    this.swipeDirection = pageIndex > this.currentPage ? 'left' : 'right';
    this.triggerPageTransition(() => {
      this.currentPage = pageIndex;
    });
  }

  // Go to previous page (Used by Left Arrow and Swipe Right)
  prevPage(): void {
    if (this.currentPage > 0 && !this.isTransitioning) {
      this.swipeDirection = 'right';
      this.triggerPageTransition(() => {
        this.currentPage--;
      });
    }
  }

  // Go to next page (Used by Right Arrow and Swipe Left)
  nextPage(): void {
    if (this.currentPage < this.totalPages - 1 && !this.isTransitioning) {
      this.swipeDirection = 'left';
      this.triggerPageTransition(() => {
        this.currentPage++;
      });
    }
  }

  // Stagger helper to generate organic delay differences dynamically
  getCardDelay(index: number): string {
    const staggeredDelay = index * 0.11; 
    return `${staggeredDelay}s`;
  }

  // Swipe Gesture Handling Logic
  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  onTouchEnd(event: TouchEvent): void {
    this.touchEndX = event.changedTouches[0].screenX;
    this.handleSwipeGesture();
  }

  private handleSwipeGesture(): void {
    const threshold = 60; // minimum distance in pixels to count as swipe
    const swipeDistance = this.touchEndX - this.touchStartX;

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance < 0) {
        // Swiped Left -> Load next page
        this.nextPage();
      } else {
        // Swiped Right -> Load previous page
        this.prevPage();
      }
    }
  }

  // Controls the execution frame timings of our staggered transition timeline
  private triggerPageTransition(changeStateCallback: () => void): void {
    this.isTransitioning = true;
    
    // Change state instantly so the UI registers the input immediately on click
    changeStateCallback();

    // Reset transition flag to match CSS transition timings (allows seamless immediate re-clicks)
    setTimeout(() => {
      this.isTransitioning = false;
    }, 400); 
  }

  openVideoModal(person: Interviewee): void {
    this.selectedPerson = person;
    this.videoUnavailable = false;

    setTimeout(() => {
      if (this.videoPlayer && this.videoPlayer.nativeElement) {
        this.videoPlayer.nativeElement.load();
        this.videoPlayer.nativeElement.play().catch(err => {
          console.warn("Kiosk presentation automatic media capture initialization intercept:", err);
        });
      }
    }, 50);
  }

  closeVideoModal(): void {
    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      this.videoPlayer.nativeElement.pause();
    }
    this.selectedPerson = null;
    this.videoUnavailable = false;
  }

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).src = '/assets/images/pinatubo.jpg';
  }

  onVideoError(): void {
    this.videoUnavailable = true;
  }
}
