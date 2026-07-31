import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoPage } from './video-page';

describe('VideoPage', () => {
  let component: VideoPage;
  let fixture: ComponentFixture<VideoPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPage],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
