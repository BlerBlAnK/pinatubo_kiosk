import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

interface Interviewee {
  id: number;
  name: string;
  avatar: string;
  videoSrc: string;
  storyTitle?: string; // Added to populate the elegant subtitle quotation text
}

@Component({
  selector: 'app-video-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-page.html',
  styleUrl: './video-page.css',
})
export class VideoPage {
  // Directly targets the video element in the DOM template reference view mapping
  @ViewChild('kioskVideoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  selectedPerson: Interviewee | null = null;
  videoUnavailable = false;
  
  constructor(private router: Router) {}

  goBack(): void {
    // Uses the previous route tracked app-wide in sessionStorage instead of the browser's native history.back()
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }

  // Storing information lists targeting your public folder assets directories
  interviewees: Interviewee[] = [
    {
      id: 1,
      name: 'ELISA FEDELINO',
      avatar: '/assets/images/elisa.png',      
      videoSrc: '/assets/videos/elisa.mp4',
      storyTitle: 'The Day the Sky Turned to Ash'
    },
    {
      id: 2,
      name: 'RANDOLF GARCIA',
      avatar: '/assets/images/randolf.png',
      videoSrc: '/assets/videos/randolf.mp4',
      storyTitle: 'Surviving the River of Mud'
    },
    {
      id: 3,
      name: 'VIOLY OCAMPO',
      avatar: '/assets/images/violy.png',
      videoSrc: '/assets/videos/violy.mp4',
      storyTitle: 'Echoes of Bakood'
    },
    {
      id: 4,
      name: 'ANTONIO SANCHEZ',
      avatar: '/assets/images/antonio.jpg',
      videoSrc: '/assets/videos/antonio_story.mp4',
      storyTitle: 'Guardians of the Dike'
    },
    {
      id: 5,
      name: 'ELENA MAGAT',
      avatar: '/assets/images/elena.jpg',
      videoSrc: '/assets/videos/elena_story.mp4',
      storyTitle: 'A Community Reborn'
    },
    {
      id: 6,
      name: 'LUZVIMINDA CRUZ',
      avatar: '/assets/images/luzviminda.jpg',
      videoSrc: '/assets/videos/luzviminda_story.mp4',
      storyTitle: 'Memories Across Generation'
    }
  ];

  /**
   * Activates the popup modal card wrapper system layout.
   * Utilizes a minor timeout loop hook execution window to ensure automated track playback loops seamlessly.
   */
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

  /**
   * Resets active modal tracking frames and kills background sound streams completely.
   */
  closeVideoModal(): void {
    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      this.videoPlayer.nativeElement.pause();
    }
    this.selectedPerson = null;
    this.videoUnavailable = false;
  }

  /** Swap a broken profile photo for a neutral placeholder instead of showing a broken-image icon. */
  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).src = '/assets/images/pinatubo.jpg';
  }

  /** Show a friendly message instead of a blank/broken player when a video file isn't present. */
  onVideoError(): void {
    this.videoUnavailable = true;
  }
}