// frontend-admin/src/app/layout/sidebar/sidebar.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { AuthService } from '../../core/services/auth.service';

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      declarations: [SidebarComponent],
      providers: [AuthService]
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create sidebar component', () => {
    expect(component).toBeTruthy();
  });

  it('should render navigation links for all 6 operational views', () => {
    const el = fixture.nativeElement as HTMLElement;
    const links = el.querySelectorAll('nav a');
    expect(links.length).toBe(6);

    const text = el.textContent || '';
    expect(text).toContain('Pipeline Health');
    expect(text).toContain('Crawler Sources');
    expect(text).toContain('Catalog & Moderation');
    expect(text).toContain('Queues & DLQ');
    expect(text).toContain('Support Queue');
    expect(text).toContain('Audit History');
  });

  it('should emit closeDrawer on mobile link click', () => {
    spyOn(component.closeDrawer, 'emit');
    component.mobileOpen = true;
    component.onLinkClick();
    expect(component.closeDrawer.emit).toHaveBeenCalled();
  });
});
