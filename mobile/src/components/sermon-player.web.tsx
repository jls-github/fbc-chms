import { StyleSheet, View } from "react-native";

/** Web version of the Subsplash player: a plain iframe. */
export function SermonPlayer({ url, title }: { url: string; title: string }) {
  return (
    <View style={styles.frame}>
      <iframe
        src={`${url}?info=0`}
        title={`${title} player`}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        style={{ border: 0, width: "100%", height: "100%" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", borderRadius: 16, overflow: "hidden" },
});
