import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage } from "@shared/schemas";
import { confirm, EmptyState, ErrorView, Loading } from "../../../components/ui";
import { api, errorMessage } from "../../../lib/api";
import { chatTime } from "../../../lib/format";
import { useTheme } from "../../../lib/theme";

const POLL_MS = 4000;
type Page = { messages: ChatMessage[]; hasMore: boolean };

/** Merge by id (newer copies win) and keep oldest → newest. */
const merge = (a: ChatMessage[], b: ChatMessage[]) => {
  const byId = new Map(a.map((m) => [m.id, m]));
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.id - y.id);
};

export default function GroupChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = useTheme();
  const qc = useQueryClient();
  const base = `/app/groups/${id}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const newest = useRef(0);
  const lastRead = useRef(0);

  const load = useCallback(async () => {
    try {
      const page = await api.get<Page>(`${base}/messages?limit=50`);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    newest.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  // While this screen is open: load, then poll for new messages.
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(async () => {
        try {
          const page = await api.get<Page>(`${base}/messages?after=${newest.current}`);
          if (page.messages.length) setMessages((m) => merge(m, page.messages));
        } catch {
          /* keep showing what we have; the next poll will retry */
        }
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [base, load]),
  );

  // Mark messages as read as they arrive.
  useEffect(() => {
    const latest = messages.at(-1)?.id ?? 0;
    if (latest > lastRead.current) {
      lastRead.current = latest;
      void api.post(`${base}/read`, { lastMessageId: latest }).then(() => qc.invalidateQueries({ queryKey: ["groups"] }));
    }
  }, [messages, base, qc]);

  const loadOlder = async () => {
    if (!hasMore || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const page = await api.get<Page>(`${base}/messages?limit=50&before=${messages[0]!.id}`);
      setMessages((m) => merge(page.messages, m));
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const { message } = await api.post<{ message: ChatMessage }>(`${base}/messages`, { body });
      setMessages((m) => merge(m, [message]));
      setDraft("");
    } catch (e) {
      setSendError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const remove = async (m: ChatMessage) => {
    if (!(await confirm("Delete this message?", "It will be removed for everyone in the group.", "Delete", true))) return;
    try {
      await api.delete(`${base}/messages/${m.id}`);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)));
    } catch (e) {
      setSendError(errorMessage(e));
    }
  };

  const title = name ?? "Group chat";
  const header = <Stack.Screen options={{ title, headerStyle: { backgroundColor: t.card }, headerTintColor: t.brand, headerTitleStyle: { color: t.text } }} />;
  if (loading) return <>{header}<Loading /></>;
  if (error) return <>{header}<ErrorView error={error} onRetry={() => void load()} /></>;

  const newestFirst = [...messages].reverse();

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}>
        <FlatList
          inverted
          data={newestFirst}
          keyExtractor={(m) => String(m.id)}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: 12, gap: 2, flexGrow: 1 }}
          ListFooterComponent={loadingOlder ? <ActivityIndicator color={t.brand} style={{ margin: 12 }} /> : null}
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }], flex: 1, justifyContent: "center" }}>
              <EmptyState icon="chatbubble-ellipses-outline" title="No messages yet" body={`Start the conversation with ${title}.`} />
            </View>
          }
          renderItem={({ item, index }) => {
            const older = newestFirst[index + 1];
            const showName = !item.mine && (older?.author.memberId !== item.author.memberId || older?.mine);
            return (
              <View style={{ alignItems: item.mine ? "flex-end" : "flex-start", marginTop: showName ? 10 : 2 }}>
                {showName && <Text style={{ color: t.muted, fontSize: 12, marginBottom: 2, marginLeft: 10 }}>{item.author.name}</Text>}
                <Pressable
                  onLongPress={item.mine && !item.deleted ? () => void remove(item) : undefined}
                  delayLongPress={350}
                  accessibilityHint={item.mine && !item.deleted ? "Long-press to delete" : undefined}
                  style={[
                    styles.bubble,
                    item.mine
                      ? { backgroundColor: t.mine, borderBottomRightRadius: 6 }
                      : { backgroundColor: t.theirs, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
                  ]}
                >
                  <Text
                    style={{
                      color: item.deleted ? (item.mine ? "rgba(255,255,255,0.7)" : t.faint) : item.mine ? t.mineText : t.text,
                      fontSize: 16,
                      lineHeight: 21,
                      fontStyle: item.deleted ? "italic" : "normal",
                    }}
                    selectable={!item.deleted}
                  >
                    {item.deleted ? "Message deleted" : item.body}
                  </Text>
                  <Text style={{ color: item.mine ? "rgba(255,255,255,0.75)" : t.faint, fontSize: 11, marginTop: 2, alignSelf: "flex-end" }}>
                    {chatTime(item.createdAt)}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
        {sendError && <Text style={{ color: t.danger, paddingHorizontal: 16, paddingBottom: 4 }}>{sendError}</Text>}
        <View style={[styles.composer, { backgroundColor: t.card, borderTopColor: t.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${title}`}
            placeholderTextColor={t.faint}
            multiline
            maxLength={2000}
            style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.border }]}
            accessibilityLabel="Message"
            onKeyPress={(e) => {
              // On the web, Enter sends and Shift+Enter adds a new line.
              const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && ev.key === "Enter" && !ev.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                void send();
              }
            }}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.send, { backgroundColor: draft.trim() ? t.brand : t.border }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "82%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
