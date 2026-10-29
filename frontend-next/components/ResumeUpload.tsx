'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function ResumeUpload() {
  const { user, token, isDemo, retrySync } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'IDLE' | 'UPLOADING' | 'PROCESSING' | 'REVIEW' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [parseId, setParseId] = useState<string | null>(null);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const isPollingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanupPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const pollParseStatus = useCallback(
    (targetParseId: string, authToken: string) => {
      cleanupPolling();
      pollCountRef.current = 0;
      isPollingRef.current = true;

      const runPollStep = async () => {
        if (!isPollingRef.current) return;
        pollCountRef.current += 1;

        // Bounded polling ceiling: 30 attempts x 1.5s = 45s max
        if (pollCountRef.current > 30) {
          cleanupPolling();
          setStage('ERROR');
          setError('Resume extraction timed out. Please try uploading again.');
          return;
        }

        try {
          const controller = new AbortController();
          abortControllerRef.current = controller;

          const res = await fetch(`/api/v1/users/resume/status/${targetParseId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
            signal: controller.signal,
          });

          if (!isPollingRef.current) return;

          if (!res.ok) {
            if (res.status === 404) {
              cleanupPolling();
              setStage('ERROR');
              setError('Resume parse task not found or unauthorized.');
              return;
            }
          } else {
            const data = await res.json();
            if (!isPollingRef.current) return;

            if (data.status === 'COMPLETED') {
              cleanupPolling();
              const skills: string[] = data.extracted_skills || [];
              setExtractedSkills(skills);
              setSelectedSkills(new Set(skills));
              setStage('REVIEW');
              return;
            } else if (data.status === 'FAILED') {
              cleanupPolling();
              setStage('ERROR');
              if (data.error_code === 'SCANNED_PDF_NO_TEXT') {
                setError(
                  'No selectable text layer found in document. Scanned PDFs are not supported under standard parsing.',
                );
              } else if (data.error_code === 'ENCRYPTED_PDF') {
                setError(
                  'The PDF file is password protected. Please upload an unencrypted document.',
                );
              } else if (data.error_code === 'PAGE_LIMIT_EXCEEDED') {
                setError(
                  'Document exceeds supported page limit with no selectable text found in initial pages.',
                );
              } else {
                setError(
                  data.error_message || 'Resume parsing could not be completed.',
                );
              }
              return;
            } else if (data.status === 'CANCELLED') {
              cleanupPolling();
              setStage('ERROR');
              setError('Resume parsing task was superseded or cancelled.');
              return;
            }
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          // Network hiccup: keep polling sequentially
        }

        if (isPollingRef.current) {
          pollTimerRef.current = setTimeout(runPollStep, 1500);
        }
      };

      runPollStep();
    },
    [cleanupPolling],
  );

  // Hydrate active resume state on load / account switch
  useEffect(() => {
    let isCancelled = false;

    async function checkActiveResume() {
      if (isDemo || !user) return;
      try {
        const authToken = token || (await user.getIdToken());
        const res = await fetch('/api/v1/users/resume', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok || isCancelled) return;

        const data = await res.json();
        if (isCancelled) return;

        if (data.has_resume && data.document) {
          setActiveFileName(data.document.file_name);
          if (data.latest_parse) {
            setParseId(data.latest_parse.id);
            if (data.latest_parse.status === 'COMPLETED') {
              const reviewed: string[] = data.latest_parse.reviewed_skills || [];
              const extracted: string[] = data.latest_parse.extracted_skills || [];
              setExtractedSkills(extracted);
              if (reviewed.length > 0) {
                setSelectedSkills(new Set(reviewed));
                setStage('SUCCESS');
              } else {
                setSelectedSkills(new Set(extracted));
                setStage('REVIEW');
              }
            } else if (
              data.latest_parse.status === 'QUEUED' ||
              data.latest_parse.status === 'PROCESSING'
            ) {
              setStage('PROCESSING');
              pollParseStatus(data.latest_parse.id, authToken);
            }
          } else {
            setStage('SUCCESS');
          }
        }
      } catch {
        // Leave in default IDLE stage if check fails
      }
    }

    checkActiveResume();

    return () => {
      isCancelled = true;
      cleanupPolling();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user, token, isDemo, pollParseStatus, cleanupPolling]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    validateAndSetFile(dropped);
  };

  const validateAndSetFile = (candidateFile?: File | null) => {
    setError(null);
    if (!candidateFile) return;

    if (candidateFile.type !== 'application/pdf' && !candidateFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only digital text-layer PDF documents are supported.');
      return;
    }

    if (candidateFile.size > 10 * 1024 * 1024) {
      setError('File exceeds maximum 10MB limit.');
      return;
    }

    setFile(candidateFile);
    setActiveFileName(candidateFile.name);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF resume file to upload.');
      return;
    }

    setError(null);
    setStage('UPLOADING');

    // Synthetic demo path
    if (isDemo || !user) {
      setTimeout(() => {
        setStage('PROCESSING');
        setTimeout(() => {
          const demoExtracted = ['React', 'TypeScript', 'Next.js', 'Node.js', 'PostgreSQL', 'Docker', 'TailwindCSS'];
          setExtractedSkills(demoExtracted);
          setSelectedSkills(new Set(demoExtracted));
          setStage('REVIEW');
        }, 1200);
      }, 600);
      return;
    }

    // Authenticated API flow
    try {
      const authToken = token || (await user.getIdToken());
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v1/users/resume/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Upload failed with HTTP ${response.status}`);
      }

      const uploadData = await response.json();
      const newParseId = uploadData.parse_id;
      setParseId(newParseId);
      setStage('PROCESSING');

      // Start sequential polling for async extraction results
      pollParseStatus(newParseId, authToken);
    } catch (err: unknown) {
      setStage('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'An error occurred during resume upload.');
    }
  };

  const handleToggleSkill = (skill: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const handleApplySkills = async () => {
    if (selectedSkills.size === 0) {
      setError('Please select at least one skill to apply.');
      return;
    }

    setError(null);
    setApplying(true);

    if (isDemo || !user) {
      setTimeout(() => {
        setApplying(false);
        setStage('SUCCESS');
      }, 500);
      return;
    }

    try {
      const authToken = token || (await user.getIdToken());
      const response = await fetch('/api/v1/users/resume/review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parse_id: parseId,
          selected_skills: Array.from(selectedSkills),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save reviewed skills.');
      }

      // Refresh candidate profile in AuthContext
      await retrySync();
      setStage('SUCCESS');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to apply skills to profile.');
    } finally {
      setApplying(false);
    }
  };

  const handleDeleteResume = async () => {
    if (!confirm('Are you sure you want to remove your resume document?')) return;

    setError(null);
    setDeleting(true);

    if (!isDemo && user) {
      try {
        const authToken = token || (await user.getIdToken());
        const response = await fetch('/api/v1/users/resume', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.message || `Removal failed with HTTP ${response.status}`);
        }

        await retrySync();
      } catch (err: unknown) {
        setDeleting(false);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to remove resume: ${msg}`);
        return;
      }
    }

    setDeleting(false);
    setStage('IDLE');
    setFile(null);
    setActiveFileName(null);
    setParseId(null);
    setExtractedSkills([]);
    setSelectedSkills(new Set());
  };

  const handleDownloadResume = async () => {
    if (isDemo || !user) return;
    setError(null);
    setDownloading(true);

    try {
      const authToken = token || (await user.getIdToken());
      const res = await fetch('/api/v1/users/resume/download', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Download failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeFileName || 'resume.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Download error: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--seekers-bg-surface)',
        border: '1px solid var(--seekers-border-medium)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        marginTop: '1.5rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📄</span>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              Candidate Resume &amp; NLP Skill Extraction
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
              Upload your digital text-layer PDF (max 10MB). Extracted skills are staged for candidate review before profile enrichment.
            </p>
          </div>
        </div>

        {activeFileName && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleDownloadResume}
              disabled={downloading}
              style={{
                background: 'transparent',
                border: '1px solid var(--seekers-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.35rem 0.65rem',
                color: 'var(--seekers-amber-400)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={handleDeleteResume}
              disabled={deleting}
              style={{
                background: 'transparent',
                border: '1px solid var(--seekers-border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.35rem 0.65rem',
                color: 'var(--seekers-danger)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {deleting ? 'Removing...' : 'Remove Resume'}
            </button>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--seekers-danger)',
            borderRadius: 'var(--radius-xs)',
            color: '#fca5a5',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Stage: IDLE / Selecting File */}
      {stage === 'IDLE' && (
        <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
            style={{
              border: `2px dashed ${dragActive ? 'var(--seekers-amber-500)' : 'var(--seekers-border-strong)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '1.75rem 1rem',
              textAlign: 'center',
              backgroundColor: dragActive ? 'var(--seekers-amber-dim)' : 'var(--seekers-bg-elevated)',
              cursor: 'pointer',
              display: 'block',
              transition: 'border-color 0.2s, background-color 0.2s',
            }}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => validateAndSetFile(e.target.files?.[0])}
            />
            <div style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>📂</div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              {file ? file.name : 'Click to select or drag and drop your PDF resume'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginTop: '0.2rem' }}>
              Text-layer digital PDF only • Maximum 10MB
            </p>
          </label>

          {file && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: 'var(--seekers-bg-elevated)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--seekers-border-subtle)' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-secondary)' }}>
                Selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </span>
              <button
                type="submit"
                className="btn-amber"
                style={{ minHeight: '36px', padding: '0 1rem', fontSize: '0.8125rem' }}
              >
                Upload &amp; Extract Skills
              </button>
            </div>
          )}
        </form>
      )}

      {/* Stage: UPLOADING */}
      {stage === 'UPLOADING' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid var(--seekers-amber-500)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--seekers-text-primary)' }}>
            Uploading resume securely to private storage...
          </p>
        </div>
      )}

      {/* Stage: PROCESSING */}
      {stage === 'PROCESSING' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--seekers-amber-500)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
            Extracting technical skills with spaCy NLP...
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginTop: '0.25rem' }}>
            Document ID: {activeFileName} • Polling extraction results asynchronously
          </p>
        </div>
      )}

      {/* Stage: REVIEW */}
      {stage === 'REVIEW' && (
        <div>
          <div style={{ marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              Extracted Skills Staging Area
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
              Select the skills you want added to your persistent candidate profile. Skills are only merged upon confirmation.
            </p>
          </div>

          {extractedSkills.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)', fontStyle: 'italic', marginBottom: '1rem' }}>
              No canonical technical skills were detected in this document.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '1rem' }}>
              {extractedSkills.map((skill) => {
                const isSelected = selectedSkills.has(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => handleToggleSkill(skill)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? 600 : 400,
                      backgroundColor: isSelected ? 'var(--seekers-amber-dim)' : 'var(--seekers-bg-elevated)',
                      border: `1px solid ${isSelected ? 'var(--seekers-amber-500)' : 'var(--seekers-border-medium)'}`,
                      color: isSelected ? 'var(--seekers-amber-400)' : 'var(--seekers-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{isSelected ? '☑' : '☐'}</span>
                    <span>{skill}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-amber"
              onClick={handleApplySkills}
              disabled={applying || selectedSkills.size === 0}
              style={{ minHeight: '38px', padding: '0 1.25rem' }}
            >
              {applying ? 'Applying...' : `Apply Selected (${selectedSkills.size}) to Profile`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStage('IDLE')}
              style={{ minHeight: '38px', padding: '0 1rem' }}
            >
              Cancel / Re-upload
            </button>
          </div>
        </div>
      )}

      {/* Stage: SUCCESS */}
      {stage === 'SUCCESS' && (
        <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span style={{ color: 'var(--seekers-success)', fontWeight: 700 }}>✓</span>
            <strong style={{ color: '#86efac', fontSize: '0.875rem' }}>Resume Active &amp; Skills Enriched</strong>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.75rem' }}>
            Active Document: <strong>{activeFileName || 'resume.pdf'}</strong>. Your reviewed skills have been merged into your profile.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDownloadResume}
              disabled={downloading}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', minHeight: '32px' }}
            >
              {downloading ? 'Downloading...' : 'Download Resume'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStage('IDLE')}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', minHeight: '32px' }}
            >
              Upload New Version
            </button>
          </div>
        </div>
      )}

      {/* Stage: ERROR */}
      {stage === 'ERROR' && (
        <div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setStage('IDLE'); setError(null); }}
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
