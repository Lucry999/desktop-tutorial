# ClipForge AI

A polished starter dashboard for an AI-powered TikTok content workflow.

## Included

- Overview dashboard
- AI video idea generator UI
- Script generation UI
- 9:16 video preview mockup
- Content calendar
- Video library
- Automation controls
- Analytics dashboard
- Responsive layout for desktop and mobile

## Run locally

This first version is a static frontend, so no build step is required.

Open `index.html` in a browser.

## Next backend integrations

The UI is intentionally separated from provider credentials. The next step is to connect:

1. An LLM for hooks/scripts.
2. A video generation/rendering service.
3. Text-to-speech.
4. Subtitle generation.
5. TikTok's official publishing flow.
6. A scheduler/queue and persistent database.

Keep API keys in server-side environment variables. Never put provider secrets into `app.js` or other browser code.

## Important

Use official TikTok APIs and follow TikTok's current developer, content, automation and age requirements. This project does not attempt to bypass platform restrictions.
