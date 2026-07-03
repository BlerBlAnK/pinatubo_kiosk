import { Routes } from '@angular/router';
import { WelcomePage } from './welcome-page/welcome-page';
import { ButtonPage } from './button-page/button-page';
import { VideoPage } from './video-page/video-page';
import { ApoPinatubo } from './apo-pinatubo/apo-pinatubo';

export const routes: Routes = [
    { path: '', component: WelcomePage },
    { path: 'menu', component: ButtonPage },
    { path: 'videos', component: VideoPage},
    { path: 'apo-pinatubo', component: ApoPinatubo},
    // Fallback for any unmapped route (e.g. the "Pinatubo Timeline" card
    // currently points at /timeline, which has no page built yet) so the
    // kiosk never gets stuck on a blank/broken screen.
    { path: '**', redirectTo: 'menu' }
];
