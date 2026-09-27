import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** The sign-in token lives in the device keychain/keystore; on the web, in localStorage. */
const KEY = "fbc.session";

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function saveToken(token: string | null) {
  if (Platform.OS === "web") {
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {
      /* private browsing: stay signed in for this tab only */
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
