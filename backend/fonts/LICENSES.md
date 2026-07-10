# Bundled Font Licenses

All fonts in this directory are from the Noto project and are licensed under
the **SIL Open Font License 1.1** (OFL-1.1), which permits bundling and
redistribution, including in commercial products. Full license text:
https://openfontlicense.org

| File | Family | Source |
|---|---|---|
| NotoSans-Regular.ttf, NotoSans-Bold.ttf | Noto Sans (Latin/Greek/Cyrillic) | github.com/notofonts/latin-greek-cyrillic |
| NotoNaskhArabic-Regular.ttf, NotoNaskhArabic-Bold.ttf | Noto Naskh Arabic | github.com/notofonts/arabic |
| NotoSansHebrew-Regular.ttf | Noto Sans Hebrew | github.com/notofonts/hebrew |
| NotoSansCJKsc-Regular.otf | Noto Sans CJK SC (Han + kana + hangul) | github.com/notofonts/noto-cjk |

Copyright © The Noto Project Authors.

Only the SC variant of Noto Sans CJK is bundled (regional glyph preferences
for TC/JP/KR are deferred — see MULTILINGUAL_EXPORT_ARCHITECTURE.md §2).
Fonts are subset-embedded per document at export time, so PDF size carries
only the glyphs actually used, never these full files.
