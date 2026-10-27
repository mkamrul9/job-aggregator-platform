import { Component } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html'
})
export class SidebarComponent {
  currentSection = 'overview';

  selectSection(section: string): void {
    this.currentSection = section;
  }
}
