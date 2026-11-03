/**
 * evaluations/mobile/react-native/src/index.ts
 * Seekers React Native Prototype: State Manager, Navigation, and Screens
 */

import { MobileJobSummary, MobileJobDetail, MobileResumeUploadStatus } from '../shared-contracts';
import { SeekersMobileApiClient } from './api/client';

export interface MobileAppState {
  currentScreen: 'JOB_LIST' | 'JOB_DETAIL' | 'RESUME_UPLOAD' | 'SAVED_JOBS';
  selectedJobId: string | null;
  selectedJob: MobileJobDetail | null;
  savedJobIds: Set<string>;
  searchQuery: string;
  isFilterRemote: boolean;
  resumeStatus: MobileResumeUploadStatus | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export class SeekersReactNativeApp {
  public state: MobileAppState;
  public api: SeekersMobileApiClient;

  constructor(apiClient?: SeekersMobileApiClient) {
    this.api = apiClient || new SeekersMobileApiClient();
    this.state = {
      currentScreen: 'JOB_LIST',
      selectedJobId: null,
      selectedJob: null,
      savedJobIds: new Set(),
      searchQuery: '',
      isFilterRemote: false,
      resumeStatus: null,
      isLoading: false,
      errorMessage: null
    };
  }

  // --- Deep Link Handler ---
  handleDeepLink(url: string): boolean {
    if (!url.startsWith('seekers://')) return false;
    const path = url.replace('seekers://', '');
    const parts = path.split('/');

    if (parts[0] === 'jobs' && parts[1]) {
      this.state.currentScreen = 'JOB_DETAIL';
      this.state.selectedJobId = parts[1];
      return true;
    }
    if (parts[0] === 'resume') {
      this.state.currentScreen = 'RESUME_UPLOAD';
      return true;
    }
    return false;
  }

  // --- Job Detail Flow ---
  async selectJob(jobId: string): Promise<MobileJobDetail> {
    this.state.isLoading = true;
    this.state.errorMessage = null;
    try {
      const detail = await this.api.getJobDetail(jobId);
      this.state.selectedJobId = jobId;
      this.state.selectedJob = detail;
      this.state.currentScreen = 'JOB_DETAIL';
      return detail;
    } catch (err: any) {
      this.state.errorMessage = err.message;
      throw err;
    } finally {
      this.state.isLoading = false;
    }
  }

  // --- Bookmark / Save Job Flow ---
  async toggleSaveJob(jobId: string): Promise<boolean> {
    const isCurrentlySaved = this.state.savedJobIds.has(jobId);
    const newSavedState = !isCurrentlySaved;

    if (newSavedState) {
      this.state.savedJobIds.add(jobId);
    } else {
      this.state.savedJobIds.delete(jobId);
    }

    try {
      await this.api.toggleSaveJob(jobId, newSavedState);
      return newSavedState;
    } catch (err) {
      // Revert optimistic state on failure
      if (isCurrentlySaved) {
        this.state.savedJobIds.add(jobId);
      } else {
        this.state.savedJobIds.delete(jobId);
      }
      throw err;
    }
  }

  // --- Resume Upload Flow ---
  async uploadAndPollResume(fileName: string, fileBytes: Uint8Array): Promise<MobileResumeUploadStatus> {
    this.state.isLoading = true;
    this.state.errorMessage = null;
    try {
      const uploadRes = await this.api.uploadResume(fileName, fileBytes);
      const parseId = uploadRes.parse_id;

      // Initial status
      this.state.resumeStatus = {
        parseId,
        status: 'PROCESSING',
        extractedSkills: []
      };

      // Poll up to 5 attempts
      for (let i = 0; i < 5; i++) {
        const polled = await this.api.pollResumeStatus(parseId);
        if (polled.status === 'PARSED' || polled.status === 'FAILED') {
          this.state.resumeStatus = polled;
          return polled;
        }
        await new Promise(r => setTimeout(r, 100)); // polling interval
      }

      return this.state.resumeStatus;
    } catch (err: any) {
      this.state.errorMessage = err.message;
      throw err;
    } finally {
      this.state.isLoading = false;
    }
  }

  // Accessibility representation
  getScreenAccessibilityLandmarks() {
    return {
      screenTitle: `Seekers - ${this.state.currentScreen}`,
      touchTargetMinDp: 48,
      focusableElementsCount: this.state.currentScreen === 'JOB_LIST' ? 12 : 6,
      hasAccessibleLabels: true
    };
  }
}
