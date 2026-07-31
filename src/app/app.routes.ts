import { Routes } from '@angular/router';
import { WelcomePage } from './welcome-page/welcome-page';
import { ButtonPage } from './button-page/button-page';
import { VideoPage } from './video-page/video-page';
import { ApoPinatubo } from './apo-pinatubo/apo-pinatubo';
import { SimulatorComponent } from './simulator-component/simulator-component';

export const routes: Routes = [
    { path: '', component: WelcomePage },
    { path: 'menu', component: ButtonPage },
    { path: 'videos', component: VideoPage },
    { path: 'apo-pinatubo', component: ApoPinatubo },
    { path: 'simulator', component: SimulatorComponent },
    { path: '**', redirectTo: 'menu' }
];