# FamiTube Web Rules

- Keep `faq.html` synchronized with `index.html`, `learn-more.html`, and `mobile-preview.html`.
- Whenever `faq.html` is modified, keep English HTML, `I18N.id` translations, and `#faqJsonLd` (`FAQPage` JSON-LD) in sync, and verify with `npm run faq:check`.
- Tracked Git hooks live in `.githooks/` (`pre-commit`, `commit-msg`). Run `npm run prepare` (or `git config core.hooksPath .githooks`) if hooks are not yet active in a fresh clone.
- If a commit touches `index.html`, `learn-more.html`, or `mobile-preview.html` without requiring an FAQ change, include `[faq-ok]` in the commit message.
