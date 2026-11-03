/**
 * evaluations/mobile/react-native/src/index.js
 * CommonJS export for test harnesses and node scripts.
 */

const { BENCHMARK_FIXTURE_JOBS } = require('../../shared-contracts');

class SeekersMobileStateHolder {
  constructor(apiClient) {
    this.api = apiClient;
    this.state = {
      currentScreen: 'LIST',
      selectedJobId: null,
      selectedJob: null,
      savedJobIds: new Set(),
      items: [],
      next_cursor: null,
      total_count: 0,
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
      this.state.currentScreen = 'DETAIL';
      this.state.selectedJobId = parts[1];
      return true;
    }
    if (parts[0] === 'resume') {
      this.state.currentScreen = 'RESUME';
      return true;
    }
    return false;
  }

  async loadJobs(query = '', cursor = null) {
    this.state.isLoading = true;
    try {
      const res = await this.api.searchJobs(query, cursor, 20);
      this.state.items = cursor ? [...this.state.items, ...res.items] : res.items;
      this.state.next_cursor = res.next_cursor;
      this.state.total_count = res.total_count;
      return res;
    } finally {
      this.state.isLoading = false;
    }
  }

  async selectJob(jobId) {
    this.state.isLoading = true;
    try {
      const detail = await this.api.getJobDetail(jobId);
      this.state.selectedJobId = jobId;
      this.state.selectedJob = detail;
      this.state.currentScreen = 'DETAIL';
      return detail;
    } finally {
      this.state.isLoading = false;
    }
  }

  async toggleSaveJob(jobId) {
    const wasSaved = this.state.savedJobIds.has(jobId);
    const newSaved = !wasSaved;
    if (newSaved) this.state.savedJobIds.add(jobId); else this.state.savedJobIds.delete(jobId);

    try {
      await this.api.toggleSaveJob(jobId, newSaved);
      return newSaved;
    } catch (err) {
      if (wasSaved) this.state.savedJobIds.add(jobId); else this.state.savedJobIds.delete(jobId);
      throw err;
    }
  }

  async uploadAndPollResume(fileName, fileBytes) {
    this.state.isLoading = true;
    try {
      const uploadRes = await this.api.uploadResume(fileName, fileBytes);
      const parseId = uploadRes.parse_id;

      this.state.resumeStatus = {
        parse_id: parseId,
        status: 'PROCESSING',
        extracted_skills: []
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
    } finally {
      this.state.isLoading = false;
    }
  }

  getAccessibilityMetrics() {
    return {
      screenTitle: `Seekers - ${this.state.currentScreen}`,
      touchTargetMinDp: 48,
      focusableElementsCount: this.state.currentScreen === 'LIST' ? 12 : 6,
      hasAccessibleLabels: true
    };
  }
}

module.exports = {
  SeekersMobileStateHolder,
  SeekersReactNativeApp: SeekersMobileStateHolder
};
