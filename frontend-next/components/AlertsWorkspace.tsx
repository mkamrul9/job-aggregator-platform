'use client';

import React, { useState } from 'react';
import { AlertSubscription } from '../lib/mock-data';

interface AlertsWorkspaceProps {
  alerts: AlertSubscription[];
  onToggleActive: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  onCreateAlert: (newAlert: Omit<AlertSubscription, 'id' | 'created_at'>) => void;
}

export default function AlertsWorkspace({
  alerts,
  onToggleActive,
  onDeleteAlert,
  onCreateAlert
}: AlertsWorkspaceProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Dhaka');
  const [frequency, setFrequency] = useState<'IMMEDIATE' | 'DAILY' | 'WEEKLY'>('DAILY');
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setFormError('Search query cannot be empty.');
      return;
    }
    onCreateAlert({
      query: query.trim(),
      location,
      frequency,
      active: true
    });
    setQuery('');
    setFormError('');
    setIsModalOpen(false);
  };

  return (
    <div>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.35rem',
            fontWeight: 700,
            color: 'var(--seekers-text-primary)'
          }}>
            Job Alert Subscriptions
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.2rem' }}>
            Receive notifications when new matching engineering roles are crawled.
          </p>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsModalOpen(true)}
          id="create-alert-btn"
        >
          + Create New Alert
        </button>
      </div>

      {/* Synthetic Notice */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid var(--seekers-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.8125rem',
        color: 'var(--seekers-text-secondary)'
      }}>
        <span style={{ color: 'var(--seekers-amber-400)', fontSize: '1rem' }}>🔔</span>
        <span>
          <strong>Simulated Email Notifications:</strong> In P04 preview mode, alert preferences match the P03 OpenAPI contract. Dispatched notification webhooks and real email delivery are scheduled for P11.
        </span>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <div className="empty-title">No job alerts configured</div>
          <div className="empty-desc">
            Save keyword and location criteria to receive email notifications when matching roles are indexed.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsModalOpen(true)}
          >
            Create Your First Alert
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                backgroundColor: 'var(--seekers-bg-elevated)',
                border: '1px solid var(--seekers-border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: 'var(--seekers-text-primary)'
                  }}>
                    &quot;{alert.query}&quot;
                  </h3>
                  <span className={`badge ${alert.active ? 'badge-success' : 'badge-onsite'}`}>
                    {alert.active ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--seekers-text-secondary)', fontSize: '0.8125rem' }}>
                  <span>Location: <strong style={{ color: 'var(--seekers-text-primary)' }}>{alert.location}</strong></span>
                  <span>•</span>
                  <span>Cadence: <strong style={{ color: 'var(--seekers-amber-400)' }}>{alert.frequency}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => onToggleActive(alert.id)}
                  style={{ minHeight: '36px', fontSize: '0.8125rem' }}
                >
                  {alert.active ? 'Pause Alert' : 'Resume Alert'}
                </button>

                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onDeleteAlert(alert.id)}
                  style={{ color: 'var(--seekers-danger)', minHeight: '36px' }}
                  aria-label="Delete alert"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Alert Modal */}
      {isModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-alert-heading"
        >
          <div className="modal-dialog">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--seekers-border-subtle)'
            }}>
              <h2 id="create-alert-heading" style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.2rem',
                fontWeight: 700
              }}>
                Create Role Alert
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setIsModalOpen(false)}
                style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && (
                <div style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--seekers-danger-dim)',
                  border: '1px solid var(--seekers-danger)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--seekers-danger)',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem'
                }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="alert-query">Search Keywords / Role Query</label>
                <input
                  id="alert-query"
                  className="input-text"
                  type="text"
                  placeholder="e.g. Fullstack Engineer OR Go"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="alert-location">Target Location</label>
                <select
                  id="alert-location"
                  className="select-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="Dhaka">Dhaka (Tech Hubs)</option>
                  <option value="Chattogram">Chattogram</option>
                  <option value="Remote">Remote Only</option>
                  <option value="All Locations">All South Asia</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="alert-freq">Alert Dispatch Frequency</label>
                <select
                  id="alert-freq"
                  className="select-input"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as 'IMMEDIATE' | 'DAILY' | 'WEEKLY')}
                >
                  <option value="DAILY">Daily Digest (9:00 AM BD Time)</option>
                  <option value="IMMEDIATE">Immediate (Upon crawl detection)</option>
                  <option value="WEEKLY">Weekly Summary (Every Sunday)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
