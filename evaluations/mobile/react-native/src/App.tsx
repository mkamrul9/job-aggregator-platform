import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Linking, View, Text } from 'react-native';
import { JobListScreen } from './screens/JobListScreen';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { ResumeUploadScreen } from './screens/ResumeUploadScreen';
import { SeekersMobileApiClient } from './api/client';
import { MobileJobSummary, MobileJobDetail, MobileResumeUploadStatus } from '../../shared-contracts';

export const SeekersApp: React.FC<{ client?: SeekersMobileApiClient }> = ({ client }) => {
  const [apiClient] = useState(() => client || new SeekersMobileApiClient());
  const [currentScreen, setCurrentScreen] = useState<'LIST' | 'DETAIL' | 'RESUME'>('LIST');
  const [jobs, setJobs] = useState<MobileJobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<MobileJobDetail | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<MobileResumeUploadStatus | null>(null);

  // Load initial jobs
  const loadJobs = useCallback(async (q = '', cursor: string | null = null, remote = isRemoteOnly) => {
    setIsLoading(true);
    try {
      const res = await apiClient.searchJobs(q, cursor, 20, remote);
      if (cursor) {
        setJobs(prev => [...prev, ...res.items]);
      } else {
        setJobs(res.items);
      }
      setNextCursor(res.next_cursor);
    } catch (err) {
      console.warn('Failed to load jobs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, isRemoteOnly]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Deep linking handler
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      if (!url.startsWith('seekers://')) return;
      const path = url.replace('seekers://', '');
      const parts = path.split('/');

      if (parts[0] === 'jobs' && parts[1]) {
        apiClient.getJobDetail(parts[1]).then(detail => {
          setSelectedJob(detail);
          setCurrentScreen('DETAIL');
        }).catch(() => {});
      } else if (parts[0] === 'resume') {
        setCurrentScreen('RESUME');
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });

    return () => sub.remove();
  }, [apiClient]);

  const handleSelectJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      const detail = await apiClient.getJobDetail(jobId);
      setSelectedJob(detail);
      setCurrentScreen('DETAIL');
    } catch (err) {
      console.warn('Error fetching job detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (!selectedJob) return;
    const jobId = selectedJob.id;
    const wasSaved = savedJobIds.has(jobId);
    const newSaved = !wasSaved;

    setSavedJobIds(prev => {
      const next = new Set(prev);
      if (newSaved) next.add(jobId); else next.delete(jobId);
      return next;
    });

    try {
      await apiClient.toggleSaveJob(jobId, newSaved);
    } catch {
      // Revert on failure
      setSavedJobIds(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(jobId); else next.delete(jobId);
        return next;
      });
    }
  };

  const handleResumeUpload = async (fileName: string, bytes: Uint8Array) => {
    setIsLoading(true);
    try {
      const upload = await apiClient.uploadResume(fileName, bytes);
      setResumeStatus({ parse_id: upload.parse_id, status: 'PROCESSING', extracted_skills: [] });

      // Polling with backoff
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise(r => setTimeout(r, 100 * attempts));
        const status = await apiClient.pollResumeStatus(upload.parse_id);
        if (status.status === 'PARSED' || status.status === 'FAILED') {
          setResumeStatus(status);
          break;
        }
      }
    } catch (err: any) {
      setResumeStatus({ parse_id: '', status: 'FAILED', extracted_skills: [], error_code: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#121416" />
      {currentScreen === 'LIST' && (
        <JobListScreen
          jobs={jobs}
          isLoading={isLoading}
          onSelectJob={handleSelectJob}
          onSearch={(q) => loadJobs(q, null, isRemoteOnly)}
          onToggleRemoteFilter={() => {
            const nextRemote = !isRemoteOnly;
            setIsRemoteOnly(nextRemote);
            loadJobs('', null, nextRemote);
          }}
          isRemoteOnly={isRemoteOnly}
          onRefresh={() => loadJobs('', null, isRemoteOnly)}
          onLoadMore={() => {
            if (nextCursor && !isLoading) {
              loadJobs('', nextCursor, isRemoteOnly);
            }
          }}
        />
      )}
      {currentScreen === 'DETAIL' && selectedJob && (
        <JobDetailScreen
          job={selectedJob}
          isSaved={savedJobIds.has(selectedJob.id)}
          onToggleSave={handleToggleSave}
          onApplyOutbound={(url) => Linking.openURL(url).catch(() => {})}
          onBack={() => setCurrentScreen('LIST')}
        />
      )}
      {currentScreen === 'RESUME' && (
        <ResumeUploadScreen
          status={resumeStatus}
          isLoading={isLoading}
          onSelectAndUpload={() => {
            const sampleBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
            handleResumeUpload('sample_cv.pdf', sampleBytes);
          }}
          onBack={() => setCurrentScreen('LIST')}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121416' }
});

export default SeekersApp;
