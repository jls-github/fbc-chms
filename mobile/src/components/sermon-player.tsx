import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

/** The church's Subsplash player, embedded (phones use a WebView; see sermon-player.web.tsx). */
export function SermonPlayer({ url, title }: { url: string; title: string }) {
  return (
    <View style={styles.frame} accessibilityLabel={`${title} player`}>
      <WebView
        source={{ uri: `${url}?info=0` }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction
        // Keep the player's own links from navigating the embedded view away.
        setSupportMultipleWindows={false}
        style={{ backgroundColor: "#000" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 16, overflow: "hidden" },
});
