// frontend-admin/src/app/features/catalog/catalog.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CatalogComponent } from './catalog.component';
import { OperationsService } from '../../core/services/operations.service';
import { AuthService } from '../../core/services/auth.service';

describe('CatalogComponent', () => {
  let component: CatalogComponent;
  let fixture: ComponentFixture<CatalogComponent>;
  let opsService: OperationsService;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [CatalogComponent],
      providers: [OperationsService, AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogComponent);
    component = fixture.componentInstance;
    opsService = TestBed.inject(OperationsService);
    authService = TestBed.inject(AuthService);
    authService.switchRole('ADMIN');
    fixture.detectChanges();
  });

  it('should create catalog component and load initial jobs', () => {
    expect(component).toBeTruthy();
    expect(component.jobs.length).toBeGreaterThan(0);
  });

  it('should open and close job provenance inspection modal', () => {
    expect(component.selectedJobForInspection).toBeNull();
    const job = component.jobs[0];
    component.onInspect(job);
    expect(component.selectedJobForInspection).toBe(job);

    component.closeInspection();
    expect(component.selectedJobForInspection).toBeNull();
  });

  it('should prompt and execute moderation action', fakeAsync(() => {
    const job = component.jobs[0];
    component.promptAction(job, 'FLAG');
    expect(component.selectedJobForAction).toBeTruthy();

    component.moderationReason = 'Spam listing reported';
    component.confirmModerationAction();
    tick(500);
    expect(component.selectedJobForAction).toBeNull();
    flush();
  }));

  it('should filter jobs when search query changes', () => {
    component.searchQuery = 'bKash';
    component.onSearchChange();
    fixture.detectChanges();
    expect(component.jobs.every(j => j.title.includes('bKash') || j.company.includes('bKash'))).toBeTrue();
  });
});
