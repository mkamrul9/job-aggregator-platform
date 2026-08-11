import { TestBed } from '@angular/core/testing';

import { LiveFeedService } from './live-feed.service';

describe('LiveFeedService', () => {
  let service: LiveFeedService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LiveFeedService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
