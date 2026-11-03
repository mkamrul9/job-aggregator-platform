/**
 * evaluations/mobile/react-native/src/index.js
 * Seekers React Native Prototype: State Manager, Navigation, and Screens (CommonJS)
 */

class SeekersReactNativeApp {
  constructor(apiClient) {
    this.api = apiClient;
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

  handleDeepLink(url) {
    if (!url || !url.startsWith('seekers://')) return false;
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

  async selectJob(jobId) {
    this.state.isLoading = true;
    this.state.errorMessage = null;
    try {
      const detail = await this.api.getJobDetail(jobId);
      this.state.selectedJobId = jobId;
      this.state.selectedJob = detail;
      this.state.currentScreen = 'JOB_DETAIL';
      return detail;
    } catch (err) {
      this.state.errorMessage = err.message;
      throw err;
    } finally {
      this.state.isLoading = false;
    }
  }

  async toggleSaveJob(jobId) {
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
      if (isCurrentlySaved) {
        this.state.savedJobIds.add(jobId);
      } else {
        this.state.savedJobIds.delete(jobId);
      }
      throw err;
    }
  }

  async uploadAndPollResume(fileName, fileBytes) {
    this.state.isLoading = true;
    this.state.errorMessage = null;
    try {
      const uploadRes = await this.api.uploadResume(fileName, fileBytes);
      const parseId = uploadRes.parse_id;

      this.state.resumeStatus = {
        parseId,
        status: 'PROCESSING',
        extractedSkills: []
      };

      for (let i = 0; i < 5; i++) {
        const polled = await this.api.pollResumeStatus(parseId);
        if (polled.status === 'PARSED' || polled.status === 'FAILED') {
          this.state.resumeStatus = polled;
          return polled;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      return this.state.resumeStatus;
    } catch (err) {
      this.state.errorMessage = err.message;
      throw err;
    } finally {
      this.state.isLoading = false;
    }
  }

  getScreenAccessibilityLandmarks() {
    return {
      screenTitle: `Seekers - ${this.state.currentScreen}`,
      touchTargetMinDp: 48,
      focusableElementsCount: this.state.currentScreen === 'JOB_LIST' ? 12 : 6,
      hasAccessibleLabels: true
    };
  }
}

module.exports = {
  SeekersReactNativeApp
};
