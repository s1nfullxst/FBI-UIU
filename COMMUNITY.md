# Website community resources

The calendar uses the existing public /stats feed (up to 12 upcoming sessions). Month navigation and game/day filters use the visitor's local timezone. It does not imply the complete server schedule.

Recruitment and gallery content are maintained in community-content.json. Recruitment statuses are open, closed, or unconfirmed. Add updated_at as an ISO date when leadership confirms a status; keep department and note accurate.

Gallery entries use src (a same-origin path to a PNG, JPEG or WebP), caption, category (Operations or Training) and optional credit. Upload approved screenshots into the repository, for example gallery/patrol.jpg, then add an entry such as:

```json
{"src":"./gallery/patrol.jpg","caption":"Description approved by the contributors","category":"Operations","credit":"Optional approved credit"}
```

Only add screenshots and identifying credits with permission from the contributors. No photos or recruitment openings were invented for this update. An empty gallery has an explicit empty state.

Case timeline summaries follow each published report's section order. The recorded 18 October 2026 closed status is a management confirmation, not an invented closure date.

The searchable command guide covers 39 current commands with access labels. Update it when commands change. Website behavior is bundled in stats.js; no bot update is required for these resources.
