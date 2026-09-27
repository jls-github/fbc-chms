import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { MyProfile } from "@shared/schemas";
import { Button, Card, confirm, FormError, Loading, TextField } from "../../../components/ui";
import { api, errorMessage, fieldError } from "../../../lib/api";
import { useAuth, useMe, type Me } from "../../../lib/auth";
import { fonts, useTheme } from "../../../lib/theme";

type Member = NonNullable<MyProfile["member"]>;
type PrivacyKey = "dirShowPhone" | "dirShowEmail" | "dirShowAddress" | "dirShowBirthday" | "directoryOptOut";

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      <Card style={{ gap: 14 }}>{children}</Card>
      {footer && <Text style={{ color: t.muted, fontSize: 13, paddingHorizontal: 4, lineHeight: 18 }}>{footer}</Text>}
    </View>
  );
}

function Toggle({ label, detail, value, onChange, disabled }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>{label}</Text>
        {detail && <Text style={{ color: t.muted, fontSize: 13 }}>{detail}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: t.brandFill, false: t.border }}
        thumbColor={Platform.OS === "android" && !value ? "#f4f4f5" : "#ffffff"}
        // react-native-web colors the "on" knob separately.
        {...(Platform.OS === "web" ? ({ activeThumbColor: "#ffffff" } as object) : {})}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const me = useMe();
  const member = me.data?.profile.member;

  const save = useMutation({
    mutationFn: (patch: Partial<Member>) => api.patch<MyProfile>("/app/me/profile", patch),
    onSuccess: (profile) => {
      qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, profile } : old));
      void qc.invalidateQueries({ queryKey: ["directory"] });
    },
  });

  const [contact, setContact] = useState({ email: "", phone: "", address1: "", address2: "", city: "", state: "", postalCode: "" });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (member) {
      setContact({
        email: member.email ?? "",
        phone: member.phone ?? "",
        address1: member.address1 ?? "",
        address2: member.address2 ?? "",
        city: member.city ?? "",
        state: member.state ?? "",
        postalCode: member.postalCode ?? "",
      });
    }
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const privacy = useMutation({
    mutationFn: (usageOptOut: boolean) => api.patch<{ user: Me["user"] }>("/auth/me", { usageOptOut }),
    onSuccess: ({ user }) => qc.setQueryData<Me>(["me"], (old) => (old ? { ...old, user } : old)),
  });

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/password/change", pw),
    onSuccess: () => setPw({ currentPassword: "", newPassword: "" }),
  });

  if (!member) return <Loading />;
  const set = (k: keyof typeof contact) => (v: string) => {
    setSaved(false);
    setContact((c) => ({ ...c, [k]: v }));
  };
  const toggle = (key: PrivacyKey) => (value: boolean) => save.mutate({ [key]: value });
  const hidden = member.directoryOptOut;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 26, fontFamily: fonts.heading }}>
          {member.firstName} {member.lastName}
        </Text>
        {member.householdName && <Text style={{ color: t.muted, fontSize: 15 }}>{member.householdName}</Text>}
      </View>

      <Section title="In the church directory" footer="These choices apply to the app and the printed directory. Staff can still see your details.">
        <Toggle label="List me in the directory" value={!hidden} onChange={(v) => save.mutate({ directoryOptOut: !v })} />
        <View style={[styles.divider, { backgroundColor: t.border }]} />
        <Toggle label="Show my phone number" value={member.dirShowPhone} onChange={toggle("dirShowPhone")} disabled={hidden} />
        <Toggle label="Show my email" value={member.dirShowEmail} onChange={toggle("dirShowEmail")} disabled={hidden} />
        <Toggle label="Show my address" value={member.dirShowAddress} onChange={toggle("dirShowAddress")} disabled={hidden} detail="Shared by everyone in your household who allows it" />
        <Toggle label="Show my birthday" value={member.dirShowBirthday} onChange={toggle("dirShowBirthday")} disabled={hidden} detail="Month and day only" />
        {save.error && <FormError message={errorMessage(save.error)} />}
      </Section>

      <Section title="My contact details">
        <TextField label="Email" value={contact.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={fieldError(save.error, "email")} />
        <TextField label="Phone" value={contact.phone} onChangeText={set("phone")} keyboardType="phone-pad" autoComplete="tel" error={fieldError(save.error, "phone")} />
        <TextField label="Street address" value={contact.address1} onChangeText={set("address1")} autoComplete="street-address" />
        <TextField label="Apartment, suite, etc." value={contact.address2} onChangeText={set("address2")} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 2 }}>
            <TextField label="City" value={contact.city} onChangeText={set("city")} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="State" value={contact.state} onChangeText={set("state")} autoCapitalize="characters" maxLength={20} />
          </View>
          <View style={{ flex: 1.3 }}>
            <TextField label="ZIP" value={contact.postalCode} onChangeText={set("postalCode")} keyboardType="number-pad" />
          </View>
        </View>
        <Button
          title={saved ? "Saved" : "Save contact details"}
          icon={saved ? "checkmark" : undefined}
          loading={save.isPending}
          onPress={() => save.mutate(contact, { onSuccess: () => setSaved(true) })}
        />
      </Section>

      <Section
        title="Privacy"
        footer="We count things like “how many people used the app this week” — never who did what or what you looked at. Nothing is shared with anyone outside the church. Turning this off also removes your activity for the current day, week and month."
      >
        <Toggle
          label="Share anonymous usage statistics"
          value={!me.data?.user.usageOptOut}
          onChange={(share) => privacy.mutate(!share)}
          disabled={privacy.isPending}
        />
        {privacy.error && <FormError message={errorMessage(privacy.error)} />}
      </Section>

      <Section title="Password">
        <TextField label="Current password" value={pw.currentPassword} onChangeText={(v) => setPw((p) => ({ ...p, currentPassword: v }))} secureTextEntry autoComplete="current-password" error={fieldError(changePassword.error, "currentPassword")} />
        <TextField label="New password" value={pw.newPassword} onChangeText={(v) => setPw((p) => ({ ...p, newPassword: v }))} secureTextEntry autoComplete="new-password" hint="At least 8 characters." error={fieldError(changePassword.error, "newPassword")} />
        {changePassword.isSuccess && <Text style={{ color: t.success }}>Password changed.</Text>}
        <Button title="Change password" variant="secondary" loading={changePassword.isPending} disabled={!pw.currentPassword || !pw.newPassword} onPress={() => changePassword.mutate()} />
      </Section>

      <View style={{ gap: 10 }}>
        <Button
          title="Sign out"
          variant="secondary"
          icon="log-out-outline"
          onPress={async () => {
            if (await confirm("Sign out?", "You'll need your password to sign back in.", "Sign out")) void signOut();
          }}
        />
        {me.data?.user.role === "member" && (
          <Button
            title="Delete my account"
            variant="danger"
            icon="trash-outline"
            onPress={async () => {
              const ok = await confirm(
                "Delete your account?",
                "You'll be signed out on every device and won't be able to sign in again. Your listing in the church directory stays — ask the church office if you'd like it removed.",
                "Delete account",
                true,
              );
              if (!ok) return;
              try {
                await api.delete("/app/me");
              } finally {
                await signOut();
              }
            }}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 24, paddingBottom: 48, maxWidth: 640, width: "100%", alignSelf: "center" },
  sectionTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth },
});
