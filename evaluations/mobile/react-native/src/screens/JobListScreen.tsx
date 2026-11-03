import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { MobileJobSummary } from '../../../shared-contracts';

interface Props {
  jobs: MobileJobSummary[];
  isLoading: boolean;
  onSelectJob: (id: string) => void;
  onSearch: (q: string) => void;
  onToggleRemoteFilter: () => void;
  isRemoteOnly: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
}

export const JobListScreen: React.FC<Props> = ({
  jobs,
  isLoading,
  onSelectJob,
  onSearch,
  onToggleRemoteFilter,
  isRemoteOnly,
  onRefresh,
  onLoadMore
}) => {
  const [query, setQuery] = useState('');

  const renderItem = ({ item }: { item: MobileJobSummary }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`View job details for ${item.title} at ${item.company}`}
      style={styles.card}
      onPress={() => onSelectJob(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.company}>{item.company}</Text>
      </View>
      <View style={styles.badgeRow}>
        <Text style={styles.location}>{item.location}</Text>
        <Text style={[styles.badge, item.remote_eligibility === 'FULLY_REMOTE' ? styles.remoteBadge : null]}>
          {item.remote_eligibility}
        </Text>
        {item.salary?.min && (
          <Text style={styles.salary}>
            {item.salary.currency} {item.salary.min.toLocaleString()}
          </Text>
        )}
      </View>
      <View style={styles.skillsRow}>
        {item.skills.slice(0, 3).map((skill, idx) => (
          <Text key={idx} style={styles.skillChip}>{skill}</Text>
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          accessibilityLabel="Search jobs by title, company, or skill"
          style={styles.searchInput}
          placeholder="Search engineering roles..."
          placeholderTextColor="#8C939D"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            onSearch(text);
          }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isRemoteOnly ? 'Filter: Remote active' : 'Filter: Remote inactive'}
          style={[styles.filterChip, isRemoteOnly ? styles.filterChipActive : null]}
          onPress={onToggleRemoteFilter}
        >
          <Text style={[styles.filterText, isRemoteOnly ? styles.filterTextActive : null]}>
            Remote
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading && jobs.length === 0 ? (
        <ActivityIndicator style={styles.loader} size="large" color="#F59E0B" />
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={onRefresh}
          refreshing={isLoading}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No verified job listings found.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121416' },
  searchBar: { flexDirection: 'row', padding: 12, backgroundColor: '#1E2022' },
  searchInput: {
    flex: 1,
    height: 48, // Minimum 48dp touch target
    backgroundColor: '#2D3033',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#F9FAFB',
    fontSize: 16
  },
  filterChip: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#2D3033'
  },
  filterChipActive: { backgroundColor: '#F59E0B' },
  filterText: { color: '#D1D5DB', fontWeight: '600' },
  filterTextActive: { color: '#121416' },
  listContent: { padding: 12 },
  card: {
    backgroundColor: '#1E2022',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2D3033'
  },
  cardHeader: { marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#F9FAFB' },
  company: { fontSize: 14, color: '#F59E0B', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  location: { fontSize: 13, color: '#9CA3AF' },
  badge: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', backgroundColor: '#2D3033', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  remoteBadge: { color: '#10B981', backgroundColor: '#064E3B' },
  salary: { fontSize: 13, fontWeight: '600', color: '#E5E7EB' },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  skillChip: { fontSize: 11, color: '#D1D5DB', backgroundColor: '#374151', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 16 }
});
