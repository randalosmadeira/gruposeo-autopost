# Publication safety invariants

These invariants are fail-closed and apply before any WordPress transfer, including remote drafts.

1. Reader-facing title, content and meta description must contain no internal scaffold, review token, source-verification marker, prompt residue, placeholder or operational error.
2. Meta description is resolved automatically from a valid existing excerpt or generated deterministically from semantic article text and persisted before WordPress is called.
3. The bulk publication modal refreshes the current user's WordPress project list directly from `projects` whenever it opens; parent-provided projects are fallback only.
4. Database trigger `guard_article_reader_content` prevents known internal electoral scaffolds from persisting as reader-facing article content and records detection codes in `articles.config`.
5. Publication stays blocked when editorial HTML, minimum content, scheduled time, review/source gates or featured-image requirements fail.
