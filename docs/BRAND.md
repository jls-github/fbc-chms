# Brand

Applied from the *FBC Enumclaw Brand Guide v1.0* (January 2026).

| Guide | In the apps |
| --- | --- |
| **Logos** | Extracted from the guide PDF into `src/web/public/brand/` (staff site) and `mobile/assets/brand/` (member app): primary, alternative (sidebar/headers), Color-White-Outline (dark mode), reversed white (over color blocks), logomark. |
| **Colors** | Grow in Grace teal `#40605f` / `#8bada6` is the primary UI color (`brand-*` in `src/web/styles.css`, `mobile/src/lib/theme.ts`). Worship God olive `#8c8738` / `#a8a44f` and Build the Kingdom rust `#8a4820` / `#bb5e2d` are accents (rust marks unread badges). Neutral `#58595b` is `ink`; the guide's light background `#eef3f2` is `canvas`. Dark-mode chart line is `#6f978f` so it meets contrast on dark surfaces. |
| **Fonts** | Filson Pro is listed first in the font stack and is used wherever it's installed. It's a licensed font, so the apps ship **Figtree** (OFL) as a close stand-in. Charter is used for long-form copy (built into Apple devices; serif fallback elsewhere). To use Filson Pro on the web, add its licensed webfont files and an `@font-face` for "Filson Pro" in `src/web/styles.css`. |
| **Elements** | The color-blocks banner appears on sign-in screens, the leader report form, the kiosk, the printed directory cover and the member app's home screen. |
| **App icon** | The Color_OL logomark on teal (`mobile/assets/icon.png`), also the favicon. |
