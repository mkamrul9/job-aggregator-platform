import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { MobileJobDetail } from '../../../shared-contracts';

interface Props {
  job: MobileJobDetail;
  isSaved: boolean;
  onToggleSave: () => void;
  onApplyOutbound: (url: string) => void;
  onBack: () => void;
}

export const JobDetailScreen: React.FC<Props> = ({
  job,
  isSaved,
  onToggleSave,
  onApplyOutbound,
  onBack
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Back to job listings"
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isSaved ? 'Remove from saved jobs' : 'Save this job'}
          style={[styles.saveButton, isSaved ? styles.savedActive : null]}
          onPress={onToggleSave}
        >
          <Text style={[styles.saveText, isSaved ? styles.savedTextActive : null]}>
            {isSaved ? '★ Saved' : '☆ Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.company}>{job.company}</Text>
        <Text style={styles.meta}>{job.location} • {job.remote_eligibility}</Text>

        {job.salary?.min && (
          <View style={styles.salaryCard}>
            <Text style={styles.salaryLabel}>Target Compensation</Text>
            <Text style={styles.salaryValue}>
              {job.salary.currency} {job.salary.min.toLocaleString()} - {job.salary.max?.toLocaleString()} / {job.salary.period.toLowerCase()}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Job Overview</Text>
        <Text style={styles.description}>{job.description}</Text>

        <Text style={styles.sectionTitle}>Required Skills</Text>
        <View style={styles.skillsContainer}>
          {job.skills.map((skill, idx) => (
            <Text key={idx} style={styles.skillBadge}>{skill}</Text>
          ))}
        </View>

        <View style={styles.provenanceBox}>
          <Text style={styles.provenanceTitle}>Source Provenance</Text>
          <Text style={styles.provenanceText}>Verified listing from {job.source}.</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Apply on original company site"
          style={styles.applyButton}
          onPress={() => onApplyOutbound(job.outbound_url)}
        >
          <Text style={styles.applyText}>Apply on Employer Site ↗</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121416' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: '#1E2022' },
  backButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: 12 },
  backText: { color: '#F59E0B', fontSize: 16, fontWeight: '600' },
  saveButton: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#2D3033', borderRadius: 8 },
  savedActive: { backgroundColor: '#F59E0B' },
  saveText: { color: '#F9FAFB', fontWeight: '600' },
  savedTextActive: { color: '#121416' },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#F9FAFB' },
  company: { fontSize: 18, color: '#F59E0B', marginTop: 4, fontWeight: '600' },
  meta: { fontSize: 14, color: '#9CA3AF', marginTop: 4, marginBottom: 16 },
  salaryCard: { backgroundColor: '#1E2022', padding: 14, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#2D3033' },
  salaryLabel: { fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase' },
  salaryValue: { fontSize: 16, color: '#10B981', fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginTop: 16, marginBottom: 8 },
  description: { fontSize: 15, lineHeight: 22, color: '#D1D5DB' },
  skillsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  skillBadge: { backgroundColor: '#2D3033', color: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontSize: 13 },
  provenanceBox: { backgroundColor: '#1E2022', padding: 12, borderRadius: 8, marginTop: 20, borderWidth: 1, borderColor: '#374151' },
  provenanceTitle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  provenanceText: { fontSize: 13, color: '#D1D5DB', marginTop: 2 },
  applyButton: { backgroundColor: '#F59E0B', minHeight: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 32 },
  applyText: { color: '#121416', fontSize: 16, fontWeight: '700' }
});
