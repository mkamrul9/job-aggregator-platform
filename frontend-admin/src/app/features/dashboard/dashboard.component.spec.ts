import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DashboardComponent],
      imports: [FormsModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should filter jobs by search query', () => {
    component.searchQuery = 'bKash';
    const mockJobs = [
      { id: '1', title: 'Go Engineer', company: 'bKash', location: 'Dhaka', source: 'bdjobs', url: '', latency_ms: 10, scraped_at: '', status: 'INGESTED' as const },
      { id: '2', title: 'Android Engineer', company: 'Pathao', location: 'Dhaka', source: 'pathao', url: '', latency_ms: 10, scraped_at: '', status: 'INDEXED' as const }
    ];
    const filtered = component.getFilteredJobs(mockJobs);
    expect(filtered.length).toBe(1);
    expect(filtered[0].company).toBe('bKash');
  });
});
