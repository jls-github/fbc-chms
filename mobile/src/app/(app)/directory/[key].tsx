import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, Loading, Photo, type IconName } from "../../../components/ui";
import { adultNames, childName, formatAddress, useDirectory } from "../../../lib/directory";
import { birthday } from "../../../lib/format";
import { fonts, useTheme } from "../../../lib/theme";

function Action({ icon, label, detail, url }: { icon: IconName; label: string; detail?: string; url: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="link"
      accessibilityLabel={`${label}${detail ? `, ${detail}` : ""}`}
    >
      <View style={[styles.actionIcon, { backgroundColor: t.brandSoft }]}>
        <Ionicons name={icon} size={18} color={t.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>{label}</Text>
        {detail && <Text style={{ color: t.muted, fontSize: 13 }}>{detail}</Text>}
      </View>
    </Pressable>
  );
}

/** Each distinct number once, with whose it is ("David & Rachel"). */
function phonesFor(people: { firstName: string; phone: string | null }[]) {
  const byDigits = new Map<string, { phone: string; names: string[] }>();
  for (const p of people) {
    if (!p.phone) continue;
    const key = p.phone.replace(/\D/g, "");
    const entry = byDigits.get(key) ?? { phone: p.phone, names: [] };
    entry.names.push(p.firstName);
    byDigits.set(key, entry);
  }
  return [...byDigits.values()].map((e) => ({ phone: e.phone, names: e.names.join(" & ") }));
}

const mapsUrl = (address: string) =>
  Platform.OS === "ios" ? `https://maps.apple.com/?q=${encodeURIComponent(address)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export default function DirectoryEntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const t = useTheme();
  const { data, isLoading } = useDirectory();
  const entry = data?.find((e) => e.key === key);

  if (isLoading) return <Loading />;
  if (!entry) return <EmptyState icon="person-outline" title="Not in the directory" />;

  const everyone = [...entry.adults, ...entry.children];
  const birthdays = everyone.filter((p) => p.birthday);
  const address = entry.address ? formatAddress(entry.address) : null;

  return (
    <>
      <Stack.Screen options={{ title: entry.title, headerStyle: { backgroundColor: t.card }, headerTintColor: t.brand, headerTitleStyle: { color: t.text } }} />
      <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 640, width: "100%", alignSelf: "center" }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Photo url={entry.photoUrl} title={entry.title} size={180} radius={24} />
          <Text style={[styles.h1, { color: t.text }]}>{entry.title}</Text>
          {entry.adults.length > 0 && <Text style={{ color: t.muted, fontSize: 16 }}>{adultNames(entry)}</Text>}
        </View>

        {entry.children.length > 0 && (
          <Card>
            <Text style={[styles.h2, { color: t.text }]}>{entry.adults.length ? "Children" : "People"}</Text>
            {entry.children.map((c) => (
              <Text key={c.id} style={{ color: t.text, fontSize: 16, marginTop: 6 }}>
                {childName(entry, c)}
                {c.birthday && <Text style={{ color: t.muted }}>  ·  {birthday(c.birthday)}</Text>}
              </Text>
            ))}
          </Card>
        )}

        <Card style={{ gap: 4 }}>
          <Text style={[styles.h2, { color: t.text }]}>Contact</Text>
          {phonesFor(everyone).map(({ phone, names }) => {
            const digits = phone.replace(/[^\d+]/g, "");
            return (
              <View key={digits}>
                <Action icon="call" label={phone} detail={everyone.length > 1 ? names : undefined} url={`tel:${digits}`} />
                <Action icon="chatbubble-ellipses" label="Send a text" url={`sms:${digits}`} />
              </View>
            );
          })}
          {everyone.filter((p) => p.email).map((p) => (
            <Action key={`e${p.id}`} icon="mail" label={p.email!} detail={everyone.length > 1 ? p.firstName : undefined} url={`mailto:${p.email}`} />
          ))}
          {address && <Action icon="location" label={address} url={mapsUrl(address.replace("\n", ", "))} />}
          {!address && everyone.every((p) => !p.phone && !p.email) && <Text style={{ color: t.muted, marginTop: 6 }}>No contact details shared.</Text>}
        </Card>

        {birthdays.length > 0 && (
          <Card>
            <Text style={[styles.h2, { color: t.text }]}>Birthdays</Text>
            {birthdays.map((p) => (
              <Text key={p.id} style={{ color: t.text, fontSize: 16, marginTop: 6 }}>
                {p.firstName} <Text style={{ color: t.muted }}>· {birthday(p.birthday!)}</Text>
              </Text>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontFamily: fonts.heading },
  h2: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.7 },
  action: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, minHeight: 48 },
  actionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
