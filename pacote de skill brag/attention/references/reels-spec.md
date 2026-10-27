# Instagram Reels: platform facts (researched 2026-10)

Tags: **[P]** primary (Meta/Instagram), **[S]** secondary report of a primary
statement, **[U]** unverified/third-party. Never present [U] items as rules
to the user; use them only as soft defaults.

## Ranking signals

- **[S]** Mosseri (Jan 2025): the three most important signals are **watch
  time**, **likes per reach**, **sends per reach**. Likes weigh slightly more
  for followers; **sends weigh more for non-followers** (new reach).
- **[P]** Saves and comments are signals; relative weight not published.
- **[P]** **Skip rate** = % of views that skipped in the first 3 s. Shown in
  Insights. Not confirmed as a ranking input, but it is watch time's front
  door.
- **[P]** Originality: Instagram is less likely to recommend reposts,
  content with visible watermarks (TikTok, CapCut, etc.), and accounts that
  mostly reshare. Adding only borders/subtitles does not make content
  original.
- **[U]** "Replay rate is a top factor", "sends are 3–5× likes", "keep skip
  rate under 30%": no primary source.

## Export spec

- **[P]** MP4, H.264, progressive, closed GOP, yuv420p, moov atom at front
  (`-movflags +faststart`). 23–60 fps. AAC ≤ 48 kHz, 128 kbps. ≤ 25 Mbps,
  ≤ 300 MB. Aspect 9:16 recommended.
- **Target:** 1080×1920, 30 fps, H.264 CRF ~18, AAC 48 kHz 128 kbps.
- **[P]** Only Reels ≤ 3 min are eligible for non-follower recommendation.
- **[U, mixed]** 7–30 s favours completion; brag's 15–25 s sits inside it.
  Optimise share-of-video-watched, not raw length.

## Safe zones (1080×1920)

From Meta's Reels ads guide **[P]**, used for organic Reels too:

| Zone | Pixels | Keep out |
|---|---|---|
| Top | 0–270 | Text, logos (profile/audio UI) |
| Bottom | 1250–1920 | Text, CTA (caption, username, audio bar) |
| Left/right | 65 px each side | Text |
| Right rail, lower half | x > 960, y > 960 **[U]** | Key elements (like/comment/send buttons) |

**Safe box for anything readable: x 65–1015, y 270–1250** (≈ 950×980).
Backgrounds and motion may fill the full frame.

Square/landscape exports: no Reels safe zones; use brag defaults.

## Audio

- **[P]** Audio helps reach new audiences; multiple audio tracks can be
  layered in-app.
- **[U, high confidence]** Licensed/trending library music can only be
  attached in the Instagram app, never baked into an upload with rights.
  Hence the **no-music render**: the user adds trending audio in-app over
  SFX/voice.
- **[S]** Business accounts are limited to the Meta Sound Collection.
- **[S/U]** A large share of Reels are watched muted. Burned-in text is
  mandatory.

## Caption, hashtags, cover

- **[P/S]** Max **5 hashtags** (Dec 2025); extras are ignored. Specific beats
  generic. Hashtags help search, not reach.
- **[S]** Search is keyword-driven: put plain-language keywords in the
  **first caption line**, in on-screen text, and in the cover title.
- **[P]** Cover: 9:16; the profile grid crops to 3:4 / 1:1, so keep the cover
  title **centred** (inside y ≈ 560–1360).
- CTA aligned with signals: **ask for a send** ("manda pra quem…"). Instagram
  demotes engagement bait.

## Trial Reels and Insights

- **[P]** Trial Reels are shown to non-followers first; the creator can
  share to followers later (manually or automatically based on
  performance). Use them to A/B hook variants.
- **[P]** Insights (since Aug 2025): retention graph ("the flatter the
  line, the more engaged"), skip rate, average watch time, total watch time,
  views, reach, likes, comments, saves, shares/sends.
- **[P]** Graph API `GET /{ig-media-id}/insights` exposes aggregates
  (`views`, `reach`, `shares`, `saved`, `ig_reels_avg_watch_time` in **ms**,
  `reels_skip_rate`), **not** the second-by-second curve. The curve is
  in-app only, so analyze mode reads screenshots.

## Sources

creators.instagram.com (/blog/the-latest-with-instagram,
/blog/tips-for-improving-your-reach, /faq);
developers.facebook.com (instagram-media insights; ig-user/media Reels
specs); help.instagram.com/202865988324236; socialmediatoday.com (retention
insights Aug 2025; hashtag cap); Meta Ads Guide Reels safe zones.
