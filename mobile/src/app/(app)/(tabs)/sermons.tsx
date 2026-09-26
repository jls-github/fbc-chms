import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { Sermon } from "@shared/schemas";
import { EmptyState, ErrorView, Loading } from "../../../components/ui";
import { useSermons } from "../../../lib/queries";
import { longDate } from "../../../lib/format";
import { useTheme } from "../../../lib/theme";

export default function SermonsScreen() {
  const t = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useSermons();
  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  const [latest, ...rest] = data?.sermons ?? [];

  const open = (s: Sermon) => router.push({ pathname: "/sermons/[id]", params: { id: s.id } });

  return (
    <FlatList
      data={rest}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={t.brand} />}
      ListEmptyComponent={latest ? null : <EmptyState icon="play-circle-outline" title="No sermons yet" />}
      ListHeaderComponent={
        latest ? (
          <Pressable onPress={() => open(latest)} style={[styles.hero, { backgroundColor: t.card, borderColor: t.border }]} accessibilityRole="button" accessibilityLabel={`Play the latest sermon: ${latest.title}`}>
            <View>
              <Image source={latest.imageUrl ? { uri: latest.imageUrl } : undefined} style={styles.heroImage} contentFit="cover" transition={200} />
              <View style={styles.play}>
                <Ionicons name="play" size={26} color="#fff" />
              </View>
            </View>
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={{ color: t.brand, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Latest sermon</Text>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>{latest.title}</Text>
              <Text style={{ color: t.muted, fontSize: 14 }}>
                {[latest.date && longDate(latest.date), latest.speaker, latest.series].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </Pressable>
        ) : null
      }
      ListFooterComponent={
        data?.stale ? <Text style={{ color: t.muted, textAlign: "center", fontSize: 13 }}>Showing saved sermons — the church website isn't responding right now.</Text> : null
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={`Play ${item.title}`}>
          <Image source={item.imageUrl ? { uri: item.imageUrl } : undefined} style={styles.thumb} contentFit="cover" transition={200} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }} numberOfLines={2}>{item.title}</Text>
            <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{[item.date && longDate(item.date), item.speaker].filter(Boolean).join(" · ")}</Text>
            {item.series && <Text style={{ color: t.faint, fontSize: 13 }} numberOfLines={1}>{item.series}</Text>}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  heroImage: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#333" },
  play: { position: "absolute", right: 14, bottom: 14, width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 12, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  thumb: { width: 112, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: "#333" },
});
