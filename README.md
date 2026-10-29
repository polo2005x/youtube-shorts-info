# YouTube Shorts Info

Userscript that adds the missing details to YouTube Shorts:

- **Grid cards** (channel Shorts tab, home/search shelves): uploader handle and upload date under the view count, e.g. `@MrBeast · 23 Oct 2026`. Hover the date for the full timestamp and relative time; click the handle to open the channel.
- **Shorts player**: an upload-date badge between the channel name and the title, e.g. `📅 16 Oct 2026 · 2 weeks ago`.

Dates are color-coded by age (edit `AGE_TIERS` at the top of the script to change):

| Age | Color |
|---|---|
| < 24 hours | green |
| < 3 days | teal |
| < 7 days | blue |
| < 28 days | amber |
| older | default grey |

Data comes from YouTube's own `youtubei/v1/player` endpoint (no API key needed). Lookups are lazy (only cards near the viewport), cached, and limited to 4 at a time.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [youtube-shorts-info.user.js](https://raw.githubusercontent.com/polo2005x/youtube-shorts-info/main/youtube-shorts-info.user.js) and confirm the install.

Updates are picked up automatically from this repo.
