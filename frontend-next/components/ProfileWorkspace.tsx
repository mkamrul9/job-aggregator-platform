'use client';

import React, { useState } from 'react';
import { useAuth } from '../lib/auth-context';

interface ProfileWorkspaceProps {
  onOpenDataControl: () => void;
  onOpenAuth: () => void;
}

export default function ProfileWorkspace({
  onOpenDataControl,
  onOpenAuth,
}: ProfileWorkspaceProps) {
  const {
    status,
    user,
    profile,
    isDemo,
    updateProfile,
    sendVerificationEmail,
  } = useAuth();

  const [newSkill, setNewSkill] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  const [formData, setFormData] = useState({
    name: profile?.name || '',
    title: profile?.title || '',
    minSalary: profile?.preferences?.min_salary || 0,
    remote: profile?.preferences?.remote_preference || 'UNSPECIFIED',
    locations: profile?.preferences?.locations || [],
  });

  const handleToggleEdit = () => {
    if (!isEditing) {
      setFormData({
        name: profile?.name || '',
        title: profile?.title || '',
        minSalary: profile?.preferences?.min_salary || 0,
        remote: profile?.preferences?.remote_preference || 'UNSPECIFIED',
        locations: profile?.preferences?.locations || [],
      });
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
    setErrorMsg('');
  };

  if (status === 'SIGNED_OUT' && !isDemo) {
    return (
      <div
        style={{
          padding: '3rem 1.5rem',
          textAlign: 'center',
          backgroundColor: 'var(--seekers-bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--seekers-border-subtle)',
          maxWidth: '540px',
          margin: '2rem auto',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>👤</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--seekers-text-primary)', marginBottom: '0.5rem' }}>
          Candidate Profile & Persistence
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Sign in with your Firebase candidate account to view and edit your profile attributes, skills, and job match preferences with durable PostgreSQL persistence.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={onOpenAuth}
          style={{ minHeight: '44px', padding: '0.5rem 1.5rem', justifyContent: 'center' }}
        >
          Sign In or Register
        </button>
      </div>
    );
  }

  const activeProfile = profile || {
    id: 'guest',
    name: 'Guest Candidate',
    email: 'guest@example.com',
    title: '',
    skills: [],
    preferences: {
      locations: [],
      remote_preference: 'UNSPECIFIED',
      min_salary: 0,
      currency: 'BDT',
    },
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill.trim()) return;
    const formatted = newSkill.trim();
    if (!activeProfile.skills.includes(formatted)) {
      const updatedSkills = [...activeProfile.skills, formatted];
      try {
        setSaving(true);
        await updateProfile({ skills: updatedSkills });
        setNewSkill('');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
      } finally {
        setSaving(false);
      }
    } else {
      setNewSkill('');
    }
  };

  const handleRemoveSkill = async (skillToRemove: string) => {
    const updatedSkills = activeProfile.skills.filter((s) => s !== skillToRemove);
    try {
      setSaving(true);
      await updateProfile({ skills: updatedSkills });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);

    try {
      await updateProfile({
        name: formData.name,
        title: formData.title,
        preferences: {
          ...activeProfile.preferences,
          min_salary: Number(formData.minSalary) || 0,
          remote_preference: formData.remote,
          locations: formData.locations,
        },
      });
      setIsEditing(false);
      setSuccessMsg(
        isDemo
          ? 'Demo profile updated in local memory.'
          : 'Profile modifications saved to PostgreSQL database.',
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestVerification = async () => {
    try {
      await sendVerificationEmail();
      setVerificationSent(true);
      setSuccessMsg('Verification email sent to ' + (user?.email || ''));
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.35rem',
                fontWeight: 700,
                color: 'var(--seekers-text-primary)',
              }}
            >
              Candidate Profile & Match Preferences
            </h1>
            {isDemo && (
              <span className="demo-tag" style={{ fontSize: '0.7rem' }}>
                DEMO PERSONA
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)' }}>
            {isDemo
              ? 'Previewing synthetic candidate persona in portfolio demo mode.'
              : 'Durable profile persisted in PostgreSQL; synchronized with Firebase Identity.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleToggleEdit}
            disabled={saving}
          >
            {isEditing ? 'Cancel Edit' : '✎ Edit Profile'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={onOpenDataControl}
            style={{ fontSize: '0.8125rem' }}
          >
            🔒 Privacy & Data
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div
          style={{
            backgroundColor: 'var(--seekers-danger-dim)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--seekers-danger)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
            fontSize: '0.8125rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            backgroundColor: 'var(--seekers-teal-dim)',
            border: '1px solid rgba(14, 165, 233, 0.4)',
            color: 'var(--seekers-teal-400)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
            fontSize: '0.8125rem',
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Left Column: Persona Details */}
        <div
          style={{
            backgroundColor: 'var(--seekers-bg-surface)',
            border: '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--seekers-border-subtle)',
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              Candidate Identity
            </h2>
            {user?.emailVerified ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--seekers-teal-400)',
                  backgroundColor: 'var(--seekers-teal-dim)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-xs)',
                }}
              >
                ✓ Verified Email
              </span>
            ) : !isDemo ? (
              <button
                type="button"
                onClick={handleRequestVerification}
                disabled={verificationSent}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--seekers-amber-400)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {verificationSent ? 'Verification Sent' : '⚠ Send Verification Email'}
              </button>
            ) : null}
          </div>

          {isEditing ? (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.35rem' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="filter-select"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Farhan Ahmed"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.35rem' }}>
                  Professional Title
                </label>
                <input
                  type="text"
                  className="filter-select"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Full-Stack Software Engineer"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.35rem' }}>
                  Target Remote Policy
                </label>
                <select
                  className="filter-select"
                  style={{ width: '100%' }}
                  value={formData.remote}
                  onChange={(e) => setFormData({ ...formData, remote: e.target.value as 'UNSPECIFIED' | 'FULLY_REMOTE' | 'HYBRID' | 'ON_SITE' })}
                >
                  <option value="UNSPECIFIED">No Preference</option>
                  <option value="FULLY_REMOTE">Fully Remote</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="ON_SITE">On-Site</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.35rem' }}>
                  Minimum Monthly Salary ({activeProfile.preferences?.currency || 'BDT'})
                </label>
                <input
                  type="number"
                  className="filter-select"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={formData.minSalary}
                  onChange={(e) => setFormData({ ...formData, minSalary: Number(e.target.value) })}
                  min={0}
                  step={5000}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving to Database...' : 'Save Profile Changes'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Name</span>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
                  {activeProfile.name || 'Not provided'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Email Address</span>
                <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)' }}>
                  {activeProfile.email || user?.email || 'N/A'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Title</span>
                <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)' }}>
                  {activeProfile.title || 'Software Engineer'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Remote Preference</span>
                <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)' }}>
                  {activeProfile.preferences?.remote_preference === 'FULLY_REMOTE'
                    ? 'Fully Remote'
                    : activeProfile.preferences?.remote_preference === 'HYBRID'
                      ? 'Hybrid'
                      : activeProfile.preferences?.remote_preference === 'ON_SITE'
                        ? 'On-Site'
                        : 'Any Remote Arrangement'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>Target Compensation</span>
                <div style={{ fontSize: '0.875rem', color: 'var(--seekers-text-secondary)' }}>
                  {activeProfile.preferences?.min_salary
                    ? `৳${activeProfile.preferences.min_salary.toLocaleString()} / month`
                    : 'Open to negotiation'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Candidate-Managed Skills */}
        <div
          style={{
            backgroundColor: 'var(--seekers-bg-surface)',
            border: '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--seekers-border-subtle)',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
                Candidate Skills & Competencies
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                Curated skills used for personalized job matching.
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
              {activeProfile.skills?.length || 0} skills
            </span>
          </div>

          {/* Add skill input */}
          <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <input
              type="text"
              className="filter-select"
              style={{ flex: 1 }}
              placeholder="Add skill (e.g. Go, GraphQL, Docker)..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              disabled={saving}
            />
            <button
              type="submit"
              className="btn-secondary"
              style={{ minHeight: '38px', padding: '0 0.85rem' }}
              disabled={saving}
            >
              + Add
            </button>
          </form>

          {/* Skill Tag Cloud */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', minHeight: '80px' }}>
            {activeProfile.skills && activeProfile.skills.length > 0 ? (
              activeProfile.skills.map((skill) => (
                <span
                  key={skill}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    backgroundColor: 'var(--seekers-bg-elevated)',
                    border: '1px solid var(--seekers-border-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8125rem',
                    color: 'var(--seekers-text-primary)',
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
                      padding: 0,
                      fontSize: '0.75rem',
                    }}
                    title={`Remove ${skill}`}
                    disabled={saving}
                  >
                    ✕
                  </button>
                </span>
              ))
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)' }}>
                No skills added yet. Add your core programming languages, frameworks, and databases above.
              </p>
            )}
          </div>

          {/* Separation notice for parser */}
          <div
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--seekers-bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--seekers-border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--seekers-text-secondary)',
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: 'var(--seekers-text-primary)' }}>Architecture Note:</strong> Candidate-managed skills are strictly isolated from automated NLP parser extraction. In Phase 8, resume uploads extract skills to a candidate review staging area before profile enrichment.
          </div>
        </div>
      </div>
    </div>
  );
}
