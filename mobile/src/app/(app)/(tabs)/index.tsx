import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IconName } from "../../../components/ui";
import { API_URL } from "../../../lib/api";
import { useMe } from "../../../lib/auth";
import { useDirectory } from "../../../lib/directory";
import { longDate } from "../../../lib/format";
import { useGroups, useSermons } from "../../../lib/queries";
import { fonts, useTheme } from "../../../lib/theme";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Tile({
  icon,
  title,
  detail,
  onPress,
  badge,
  width,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
  badge?: number;
  width: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}${badge ? `. ${badge} unread` : ""}`}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: t.brandSoft }]}>
          <Ionicons name={icon} size={24} color={t.brand} />
        </View>
        {!!badge && (
          <View style={[styles.badge, { backgroundColor: t.accent }]}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tileTitle, { color: t.text }]}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const me = useMe();
  const directory = useDirectory();
  const sermons = useSermons();
  const groups = useGroups();

  const user = me.data?.user;
  const member = me.data?.profile.member;
  const latest = sermons.data?.sermons[0];
  const myGroups = groups.data?.groups ?? [];
  const unread = myGroups.reduce((n, g) => n + g.unread, 0);
  const households = directory.data?.filter((e) => e.householdId).length;

  // Two tiles per row on phones, three on wider screens.
  const content = Math.min(width, 820) - 32;
  const columns = content > 560 ? 3 : 2;
  const tileWidth = (content - 12 * (columns - 1)) / columns;

  const go = (href: Href) => router.push(href);
  const staffTools =
    user?.role === "admin" || user?.role === "staff"
      ? { title: "Staff site", detail: "People, attendance, check-in and more", path: "/" }
      : user?.role === "volunteer"
        ? { title: "Kids check-in", detail: "Today's roster and pickups", path: "/checkin" }
        : null;
  const openStaff = (path: string) =>
    Platform.OS === "web" ? window.open(path, "_blank", "noopener") : void WebBrowser.openBrowserAsync(`${API_URL}${path}`);

  const refreshing = me.isRefetching || directory.isRefetching || sermons.isRefetching || groups.isRefetching;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.brand}
            onRefresh={() => void Promise.all([me.refetch(), directory.refetch(), sermons.refetch(), groups.refetch()])}
          />
        }
      >
        {/* Brand "color blocks" banner with the reversed logo, per the brand guide. */}
        <View style={styles.banner}>
          <Image source={require("../../../../assets/brand/color-blocks.jpg")} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(20,28,27,0.38)" }]} />
          <Image
            source={require("../../../../assets/brand/logo-alt-white.png")}
            style={styles.bannerLogo}
            contentFit="contain"
            contentPosition="left"
            accessibilityLabel="First Baptist Church"
          />
          <Text style={styles.hello}>
            {greeting()}
            {member ? `, ${member.firstName}` : ""}
          </Text>
        </View>

        {latest && (
          <Pressable
            onPress={() => go({ pathname: "/sermons/[id]", params: { id: latest.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Play the latest sermon: ${latest.title}`}
            style={({ pressed }) => [styles.sermon, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
          >
            {latest.imageUrl ? (
              <Image source={{ uri: latest.imageUrl }} style={styles.sermonImage} contentFit="cover" transition={200} />
            ) : (
              <View style={[styles.sermonImage, { backgroundColor: t.brandSoft }]} />
            )}
            <View style={styles.play}>
              <Ionicons name="play" size={22} color="#fff" />
            </View>
            <View style={{ padding: 14, gap: 2 }}>
              <Text style={{ color: t.brand, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Latest sermon</Text>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }} numberOfLines={2}>
                {latest.title}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{[latest.date && longDate(latest.date), latest.speaker].filter(Boolean).join(" · ")}</Text>
            </View>
          </Pressable>
        )}

        <View style={styles.grid}>
          <Tile
            icon="people"
            title="Directory"
            detail={households !== undefined ? `${households} households` : "Find church family"}
            onPress={() => go("/directory")}
            width={tileWidth}
          />
          <Tile icon="play-circle" title="Sermons" detail={latest ? `Latest: ${latest.title}` : "Recent messages"} onPress={() => go("/sermons")} width={tileWidth} />
          <Tile
            icon="chatbubbles"
            title="Groups"
            detail={
              myGroups.length === 0
                ? "You're not in a group yet"
                : unread
                  ? `${unread} new ${unread === 1 ? "message" : "messages"}`
                  : myGroups.map((g) => g.name).join(", ")
            }
            badge={unread}
            onPress={() => go("/groups")}
            width={tileWidth}
          />
          <Tile icon="person-circle" title="My profile" detail="Contact details and what you share" onPress={() => go("/profile")} width={tileWidth} />
          {staffTools && (
            <Tile icon="briefcase" title={staffTools.title} detail={staffTools.detail} onPress={() => openStaff(staffTools.path)} width={tileWidth} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 18, paddingBottom: 32, maxWidth: 820, width: "100%", alignSelf: "center" },
  banner: { borderRadius: 20, overflow: "hidden", padding: 18, paddingTop: 16, gap: 18, minHeight: 150, justifyContent: "space-between" },
  bannerLogo: { width: 190, height: 50 },
  hello: { fontSize: 26, fontFamily: fonts.heading, color: "#ffffff", letterSpacing: -0.2 },
  sermon: { borderRadius: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  sermonImage: { width: "100%", aspectRatio: 16 / 9 },
  play: {
    position: "absolute",
    right: 14,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { minHeight: 132, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontSize: 17, fontFamily: fonts.heading },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
