import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import type { DirectoryEntry } from "@shared/schemas";
import { EmptyState, ErrorView, Loading, Photo } from "../../../components/ui";
import { adultNames, matches, useDirectory } from "../../../lib/directory";
import { useTheme } from "../../../lib/theme";

export default function DirectoryScreen() {
  const t = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useDirectory();
  const [q, setQ] = useState("");

  const sections = useMemo(() => {
    const groups = new Map<string, DirectoryEntry[]>();
    for (const e of (data ?? []).filter((x) => matches(x, q.trim()))) {
      const letter = e.sortName[0]?.toUpperCase() ?? "#";
      groups.set(letter, [...(groups.get(letter) ?? []), e]);
    }
    return [...groups.entries()].map(([title, entries]) => ({ title, data: entries }));
  }, [data, q]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(e) => e.key}
      stickySectionHeadersEnabled
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={t.brand} />}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={[styles.search, { backgroundColor: t.card, borderColor: t.border }]}>
          <Ionicons name="search" size={18} color={t.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search names, phones, emails"
            placeholderTextColor={t.faint}
            style={[styles.searchInput, { color: t.text }]}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search the directory"
          />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="people-outline" title={q ? `No one matches “${q}”` : "The directory is empty"} />}
      renderSectionHeader={({ section }) => (
        <Text style={[styles.letter, { color: t.muted, backgroundColor: t.bg }]}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push({ pathname: "/directory/[key]", params: { key: item.key } })}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.border : t.card, borderColor: t.border }]}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${adultNames(item) || item.children.map((c) => c.firstName).join(", ")}`}
        >
          <Photo url={item.photoUrl} title={item.title} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
              {[adultNames(item), item.children.map((c) => c.firstName).join(", ")].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.faint} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 4, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  letter: { fontSize: 13, fontWeight: "700", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: "600" },
});
