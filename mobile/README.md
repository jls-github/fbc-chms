# FBC Enumclaw member app

One Expo (React Native) codebase for **iOS, Android and the web**. Church
members sign in with their email or phone number and get:

- **Directory** — households A–Z with photos, tap-to-call/text/email/maps
- **Sermons** — the latest from fbcenumclaw.com (read from the website's Subsplash-powered media pages)
- **Chats** — a chat for each community group and ministry team they belong to
- **Profile** — what they share in the directory, their contact details, password, delete account

It talks to the same API as the staff site (`/api/v1/app/*`, bearer tokens).
The web version is served by the main server at **https://manage.fbcenumclaw.com/app**.

## Develop

```bash
npm install
cp .env.example .env.local   # point EXPO_PUBLIC_API_URL at your local API
npx expo start               # press w for web, i for iOS simulator, a for Android
```

Routes live in `src/app/` (Expo Router). Types come from `../src/shared` —
import them with `import type` only (the app doesn't bundle server code).

## Ship

- **Web:** `npm run build` in the repo root exports it into `dist/member-app`,
  which the server serves at `/app`. It deploys with the rest of the site.
- **iOS / Android:** built in the cloud with EAS (no Xcode or Android Studio needed):

  ```bash
  npx eas-cli@latest login               # free Expo account
  npx eas-cli@latest build -p all --profile preview      # installable test builds
  npx eas-cli@latest build -p all --profile production   # store builds
  npx eas-cli@latest submit -p ios                         # needs an Apple Developer account ($99/yr)
  npx eas-cli@latest submit -p android                     # needs a Google Play developer account ($25)
  ```

  Bundle ID / package: `com.fbcenumclaw.app`.

### Store checklist

- [x] In-app account deletion (Apple 5.1.1(v), Google Play) — Profile → Delete my account
- [x] App icons (`assets/`)
- [ ] Privacy policy URL (both stores require one) — publish a page on fbcenumclaw.com based on `docs/PRIVACY.md`, which also has the store privacy-questionnaire answers
- [ ] Screenshots and store descriptions
- [ ] Apple review needs a demo login: create a member account for the reviewer
