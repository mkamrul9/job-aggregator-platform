'use client';

import React, { useState } from 'react';
import { UserProfile } from '../lib/mock-data';

interface ProfileWorkspaceProps {
  profile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  onOpenDataControl: () => void;
}

export default function ProfileWorkspace({
  profile,
  onUpdateProfile,
  onOpenDataControl
}: ProfileWorkspaceProps) {
  const [newSkill, setNewSkill] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: profile.name,
    title: profile.title,
    minSalary: profile.preferences.min_salary,
    remote: profile.preferences.remote_preference
  });

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill.trim()) return;
    const formatted = newSkill.trim();
    if (!profile.skills.includes(formatted)) {
      onUpdateProfile({
        ...profile,
        skills: [...profile.skills, formatted]
      });
    }
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    onUpdateProfile({
      ...profile,
      skills: profile.skills.filter(s => s !== skillToRemove)
    });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...profile,
      name: formData.name,
      title: formData.title,
      preferences: {
        ...profile.preferences,
        min_salary: formData.minSalary,
        remote_preference: formData.remote
      }
    });
    setIsEditing(false);
  };

  return (
    <div>
      {/* Header */}
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
            Candidate Profile & Match Preferences
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginTop: '0.2rem' }}>
            Tailor the recommendation engine and preview your candidate persona.
          </p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? 'Cancel Edit' : '✎ Edit Profile'}
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.25rem'
      }}>
        
        {/* Profile Card */}
        <div style={{
          backgroundColor: 'var(--seekers-bg-elevated)',
          border: '1px solid var(--seekers-border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem'
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '1rem',
            color: 'var(--seekers-text-primary)'
          }}>
            Professional Summary
          </h2>

          {isEditing ? (
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-name">Full Name</label>
                <input
                  id="edit-name"
                  className="input-text"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-title">Target Headline / Title</label>
                <input
                  id="edit-title"
                  className="input-text"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-salary">Minimum Target Monthly Pay (BDT)</label>
                <input
                  id="edit-salary"
                  className="input-text"
                  type="number"
                  value={formData.minSalary}
                  onChange={(e) => setFormData({ ...formData, minSalary: Number(e.target.value) })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-remote">Work Preference</label>
                <select
                  id="edit-remote"
                  className="select-input"
                  value={formData.remote}
                  onChange={(e) => setFormData({ ...formData, remote: e.target.value as UserProfile['preferences']['remote_preference'] })}
                >
                  <option value="FULLY_REMOTE">Fully Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ON_SITE">On-Site</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', textTransform: 'uppercase' }}>CANDIDATE NAME</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>{profile.name}</div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', textTransform: 'uppercase' }}>HEADLINE / SPECIALTY</div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--seekers-text-secondary)' }}>{profile.title}</div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', textTransform: 'uppercase' }}>REGISTERED EMAIL</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', fontFamily: 'var(--font-mono)' }}>{profile.email}</div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--seekers-border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>MINIMUM COMPENSATION</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--seekers-amber-400)' }}>
                    ৳{profile.preferences.min_salary.toLocaleString()} / mo
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>PREFERENCE</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
                    {profile.preferences.remote_preference.replace('_', ' ')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Skills & Parser Card */}
        <div style={{
          backgroundColor: 'var(--seekers-bg-elevated)',
          border: '1px solid var(--seekers-border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
            color: 'var(--seekers-text-primary)'
          }}>
            Identified Technical Skills
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '1rem' }}>
            Extracted via spaCy NLP pattern matcher from candidate CV. Click any skill tag to remove or add missing competencies.
          </p>

          {/* Interactive Tag Cloud */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {profile.skills.map((skill) => (
              <span
                key={skill}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.25rem 0.6rem',
                  backgroundColor: 'var(--seekers-bg-surface)',
                  border: '1px solid var(--seekers-border-medium)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--seekers-text-primary)'
                }}
              >
                {skill}
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--seekers-text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: 0
                  }}
                  aria-label={`Remove skill ${skill}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          {/* Add skill input form */}
          <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              className="input-text"
              placeholder="Add skill (e.g. Kubernetes, Redis)"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              style={{ minHeight: '38px', fontSize: '0.8125rem' }}
            />
            <button
              type="submit"
              className="btn-secondary"
              style={{ minHeight: '38px', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}
            >
              + Add Skill
            </button>
          </form>

          {/* Active Digital Resume Information */}
          <div style={{
            marginTop: 'auto',
            padding: '1rem',
            backgroundColor: '#111827',
            border: '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--seekers-text-muted)' }}>ATTACHED CV DOCUMENT</span>
              <span className="badge badge-success">EXTRACTED</span>
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.2rem' }}>
              Farhan_Ahmed_Senior_FullStack_2026.pdf
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.75rem' }}>
              Digital text-layer PDF • 182 KB • Processed via Python service-resume
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={onOpenDataControl}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', minHeight: '30px' }}
              >
                🔒 Data Privacy & Rights
              </button>

              <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                Demo Profile Locked
              </span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
