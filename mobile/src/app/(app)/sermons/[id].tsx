import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SermonPlayer } from "../../../components/sermon-player";
import { Button, EmptyState, ErrorView, Loading, Photo } from "../../../components/ui";
import { longDate } from "../../../lib/format";
import { useSermons } from "../../../lib/queries";
import { fonts, useTheme } from "../../../lib/theme";
import { router } from "expo-router";
import { useEffect } from "react";
import { api } from "../../../lib/api";

export default function SermonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { data, isLoading, error, refetch } = useSermons();
  // Anonymous "sermon opened" count (see Privacy in Profile); fire once per sermon.
  useEffect(() => {
    if (id) api.post("/app/events", { event: "sermon_open", sermonId: id }).catch(() => undefined);
  }, [id]);
  const header = <Stack.Screen options={{ title: "Sermon", headerStyle: { backgroundColor: t.card }, headerTintColor: t.brand, headerTitleStyle: { color: t.text } }} />;

  if (isLoading) return <>{header}<Loading /></>;
  if (error) return <>{header}<ErrorView error={error} onRetry={() => void refetch()} /></>;
  const sermons = data?.sermons ?? [];
  const sermon = sermons.find((s) => s.id === id);
  if (!sermon) return <>{header}<EmptyState icon="play-circle-outline" title="Sermon not found" body="It may no longer be on the church website." /></>;
  const more = sermons.filter((s) => s.id !== sermon.id && s.series === sermon.series).slice(0, 4);

  return (
    <>
      {header}
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.scroll}>
        <SermonPlayer url={sermon.playerUrl} title={sermon.title} />
        <View style={{ gap: 4 }}>
          {sermon.series && <Text style={[styles.eyebrow, { color: t.brand }]}>{sermon.series}</Text>}
          <Text style={[styles.title, { color: t.text }]}>{sermon.title}</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>{[sermon.date && longDate(sermon.date), sermon.speaker].filter(Boolean).join(" · ")}</Text>
        </View>
        {more.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.section, { color: t.muted }]}>More from this series</Text>
            {more.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.replace({ pathname: "/sermons/[id]", params: { id: s.id } })}
                style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                <Photo url={s.thumbnailUrl} title={s.title} size={56} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: "600", fontSize: 15 }} numberOfLines={2}>{s.title}</Text>
                  {s.date && <Text style={{ color: t.muted, fontSize: 13 }}>{longDate(s.date)}</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <Button title="Open on the church website" variant="ghost" icon="open-outline" onPress={() => void WebBrowser.openBrowserAsync(sermon.url)} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 18, paddingBottom: 40, maxWidth: 820, width: "100%", alignSelf: "center" },
  eyebrow: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 24, fontFamily: fonts.heading, letterSpacing: -0.2 },
  section: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
});
