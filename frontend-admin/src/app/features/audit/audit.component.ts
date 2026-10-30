// frontend-admin/src/app/features/audit/audit.component.ts
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { OperationsService } from '../../core/services/operations.service';
import { AuditLogEntry } from '../../core/models/operations.models';

@Component({
  selector: 'app-audit',
  templateUrl: './audit.component.html',
  styleUrls: ['./audit.component.scss']
})
export class AuditComponent implements OnInit {
  logs$!: Observable<AuditLogEntry[]>;
  searchQuery = '';
  selectedAction = 'ALL';
  selectedLogEntry: AuditLogEntry | null = null;

  constructor(public opsService: OperationsService) {}

  ngOnInit(): void {
    this.logs$ = this.opsService.getAuditLogs();
  }

  getFilteredLogs(logs: AuditLogEntry[] | null): AuditLogEntry[] {
    if (!logs) return [];
    return logs.filter(log => {
      if (this.selectedAction !== 'ALL' && !log.action.includes(this.selectedAction)) {
        return false;
      }
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesActor = log.actor.email.toLowerCase().includes(q);
        const matchesTarget = log.targetId.toLowerCase().includes(q);
        const matchesDetails = (log.details || '').toLowerCase().includes(q);
        if (!matchesAction && !matchesActor && !matchesTarget && !matchesDetails) {
          return false;
        }
      }
      return true;
    });
  }

  inspectEntry(entry: AuditLogEntry): void {
    this.selectedLogEntry = entry;
  }

  closeModal(): void {
    this.selectedLogEntry = null;
  }
}
