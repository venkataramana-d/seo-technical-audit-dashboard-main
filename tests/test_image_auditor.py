"""Regression tests for modules/image_auditor.py false-positive fixes:
- <picture><source> elements must not be flagged for missing alt/dimensions/lazy
  (those attributes belong on the fallback <img>, not <source>).
- the bad-filename regex must not flag ordinary words that merely start with
  "img"/"image"/"photo" (e.g. "photography-guide.jpg").
- alt="" (correct for decorative images) is advisory (Low), not Medium.
"""

from bs4 import BeautifulSoup

from modules.image_auditor import (
    BAD_NAMING_RE,
    _compute_summary,
    _extract_image_data,
    _is_keyword_stuffed,
    analyze_images_advanced,
)


def test_keyword_stuffed_only_flags_real_repetition():
    # Long DESCRIPTIVE alt is not stuffing (this was the false positive: any alt
    # over 100 chars was flagged).
    assert not _is_keyword_stuffed(
        "A team of professionals collaborating in a modern office during a corporate "
        "leadership development workshop session"
    )
    assert not _is_keyword_stuffed("Ransomware prevention training course overview diagram")
    # Genuine keyword stuffing = a keyword repeated to game ranking.
    assert _is_keyword_stuffed(
        "training training training corporate training leadership training course training"
    )
    assert _is_keyword_stuffed("seo seo seo seo audit seo tool seo")


def _summary(html):
    soup = BeautifulSoup(html, "lxml")
    images = _extract_image_data(soup, "https://example.com/")
    return images, _compute_summary(images, check_sizes=False)


def test_picture_source_not_flagged_missing_alt_or_dimensions_or_lazy():
    html = """
    <picture>
      <source srcset="/img/hero-800.webp" media="(min-width:800px)">
      <source srcset="/img/hero-400.webp">
      <img src="/img/hero.jpg" alt="Descriptive hero" loading="lazy" width="800" height="400">
    </picture>
    """
    images, summary = _summary(html)
    # 2 <source> + 1 <img> extracted, but only the <img> is judged for alt/dims/lazy.
    assert summary["missing_alt"] == 0
    assert summary["no_lazy"] == 0
    assert summary["no_dimensions"] == 0
    # and no per-image alt/lazy/dimension issue on the <source> records
    for img in images:
        if img["tag_name"] == "source":
            assert "Missing alt text" not in img["issues"]
            assert "Missing lazy loading" not in img["issues"]
            assert "Missing width/height dimensions" not in img["issues"]


def test_real_img_missing_alt_still_flagged():
    html = '<img src="/a.jpg">'
    _images, summary = _summary(html)
    assert summary["missing_alt"] == 1


def test_bad_naming_regex_does_not_flag_descriptive_words():
    for stem in ("photography-guide", "imagery-hero", "imagine", "imgurl-note", "photonics"):
        assert not BAD_NAMING_RE.search(stem), stem


def test_bad_naming_regex_flags_generic_stems():
    for stem in ("img001", "image_1", "photo-3", "IMG_2043", "screenshot", "untitled"):
        assert BAD_NAMING_RE.search(stem), stem


def test_empty_alt_is_low_severity_advisory():
    html = '<img src="/divider.svg" alt="">'
    result = analyze_images_advanced(BeautifulSoup(html, "lxml"), "https://example.com/")
    empty_alt_issues = [i for i in result["issues"] if "Empty alt text" in i["issue"]]
    assert empty_alt_issues, "expected an empty-alt advisory"
    assert empty_alt_issues[0]["severity"] == "Low"
