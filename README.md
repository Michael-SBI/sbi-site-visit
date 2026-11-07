# SBI Site Visit Record

Mark up plans and site photos on the Samsung tablet or the PC on an endless canvas, and save them into the job folder in Drive. It replaces the Concepts subscription.

- **Live:** https://michael-sbi.github.io/sbi-site-visit/
- **Criteria (what it's built to):** [SBI Markup App: build criteria](https://claude.ai/artifact/RienCyp5XTePuTJBoSf9KH)
- **Built on:** [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT licence), pdf.js, jsPDF. Hosted on GitHub Pages: $0 a month.

## One-time set-up (Michael)

### 1. Google sign-in (about 5 minutes)
1. Open [Google Cloud console](https://console.cloud.google.com/) as michael@spokebi.com.au. Create a project called `SBI Site Visit Record`.
2. **APIs & Services > Library:** turn on **Google Drive API**.
3. **Google Auth Platform > Branding:** app name `SBI Site Visit Record`, support email michael@spokebi.com.au.
4. **Audience:** set it to **Internal**. Only spokebi.com.au accounts can then sign in, and Google doesn't need to review the app.
5. **Data access:** add the scope `https://www.googleapis.com/auth/drive`.
6. **Clients > Create client:** type **Web application**, name `Site Visit Record web`.
   - Authorised JavaScript origins: `https://michael-sbi.github.io` and `http://localhost:5174`
   - No redirect URIs.
7. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It isn't a secret. Either:
   - put it in `public/config.json` as `googleClientId` and push, so every device gets it, or
   - paste it into the app's **Settings > Google client ID** on each device.

### 2. ClickUp token
ClickUp > your avatar > **Settings > Apps > API Token**. Make a new named token, `Site Visit Record tablet`, and paste it into the app's **Settings > Your ClickUp token**. It stays on that device. If the tablet goes missing, delete that token in ClickUp.

### 3. Put it on the tablet
Open the live link in Chrome on the tablet, then **⋮ > Add to home screen** (or **Install app**). It opens full screen like an app and works without internet for drawing.

## How it files things (SBI filing rules)

| What | Job with a 🤝 23 job folder | Deal with no job folder yet |
|---|---|---|
| Markup of a PDF | `4.0 PLANS / 4.5 SBI drawings & markups` (made if missing) | My Drive / SBI Site Visit Record / {deal} |
| Sketch, no plan | `2.0 SITE- PICS_IMAGES_DOCS_NOTES / Site Measures` | same |
| Photos | `2.0 SITE- PICS_IMAGES_DOCS_NOTES` | My Drive / SBI Site Visit Record / {deal} / Photos |
| Post | Comment with the PDF link on the deal's Site Visit Canvas subtask (else Site measure, else the deal) | PDF and photos attached to the deal, plus the comment |

Each save writes two files: `{name}.pdf` (anyone can open it) and `{name}.excalidraw` (the editable drawing). Saving again updates the same two files.

Names: `YYMMDD SBI - Markup of [source drawing] - FOR INFO`, or `YYMMDD SBI - Site visit record` for a sketch.

Sold jobs: Post copies the link only, because the sales task is closed. Paste it on the project task it's for.

## Developing

```bash
npm install
npm run dev -- --port 5174
```

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/pages.yml`).
