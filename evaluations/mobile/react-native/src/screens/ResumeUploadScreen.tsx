import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { MobileResumeUploadStatus } from '../../../shared-contracts';

interface Props {
  status: MobileResumeUploadStatus | null;
  isLoading: boolean;
  onSelectAndUpload: () => void;
  onBack: () => void;
}

export const ResumeUploadScreen: React.FC<Props> = ({
  status,
  isLoading,
  onSelectAndUpload,
  onBack
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to dashboard"
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resume Parser</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.uploadCard}>
          <Text style={styles.cardTitle}>Private In-Memory NLP Parsing</Text>
          <Text style={styles.cardSubtitle}>
            Upload your PDF resume (max 10MB). Text is parsed in-memory with spaCy NLP without persistent storage.
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Select PDF resume to upload"
            style={styles.uploadBtn}
            onPress={onSelectAndUpload}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#121416" />
            ) : (
              <Text style={styles.uploadBtnText}>Select PDF Document 📄</Text>
            )}
          </TouchableOpacity>
        </View>

        {status && (
          <View style={styles.statusBox}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusLabel}>Parse Status:</Text>
              <Text style={[styles.statusBadge, status.status === 'PARSED' ? styles.parsedBadge : styles.processingBadge]}>
                {status.status}
              </Text>
            </View>

            {status.status === 'PARSED' && status.extracted_skills.length > 0 && (
              <View style={styles.skillsSection}>
                <Text style={styles.skillsTitle}>Extracted Skills ({status.extracted_skills.length})</Text>
                <View style={styles.skillsList}>
                  {status.extracted_skills.map((skill, i) => (
                    <Text key={i} style={styles.skillPill}>{skill}</Text>
                  ))}
                </View>
              </View>
            )}

            {status.status === 'FAILED' && (
              <Text style={styles.errorText}>
                Parsing failed: {status.error_code || 'Unable to extract text layer from PDF'}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121416' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#1E2022' },
  backButton: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  backText: { color: '#F59E0B', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '700' },
  content: { padding: 16 },
  uploadCard: { backgroundColor: '#1E2022', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#2D3033' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#F9FAFB' },
  cardSubtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 6, lineHeight: 20 },
  uploadBtn: { backgroundColor: '#F59E0B', minHeight: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  uploadBtnText: { color: '#121416', fontSize: 16, fontWeight: '700' },
  statusBox: { backgroundColor: '#1E2022', padding: 16, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#2D3033' },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { color: '#9CA3AF', fontSize: 14 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, fontWeight: '700', fontSize: 12 },
  parsedBadge: { backgroundColor: '#064E3B', color: '#10B981' },
  processingBadge: { backgroundColor: '#78350F', color: '#F59E0B' },
  skillsSection: { marginTop: 14 },
  skillsTitle: { fontSize: 14, fontWeight: '600', color: '#E5E7EB', marginBottom: 8 },
  skillsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillPill: { backgroundColor: '#2D3033', color: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontSize: 12 },
  errorText: { color: '#EF4444', marginTop: 10, fontSize: 14 }
});
