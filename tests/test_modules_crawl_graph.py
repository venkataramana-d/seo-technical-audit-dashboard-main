"""Unit tests for the crawl-depth graph / site-structure report (02-AUDIT-ENGINE.md §2)."""
from modules.crawl_graph import (
    bfs_depths,
    build_depth_report,
    build_link_graph,
    excessive_depth_issues,
    shortest_click_path,
)
from modules.sitewide import SiteLink

ROOT = "http://s/"


def _link(src, tgt, link_type="internal"):
    return SiteLink(source_url=src, target_url=tgt, link_type=link_type)


# Site shape:
#   / -> /a, /b
#   /a -> /c
#   /c -> /d        (so /d is 3 clicks deep)
#   /b -> /a        (a shorter route to /a still via depth 1)
#   /orphan is crawled but linked from nowhere
LINKS = [
    _link(ROOT, "http://s/a"),
    _link(ROOT, "http://s/b"),
    _link("http://s/a", "http://s/c"),
    _link("http://s/c", "http://s/d"),
    _link("http://s/b", "http://s/a"),
    _link(ROOT, "http://ext/", link_type="external"),  # external ignored
]
PAGES = {ROOT, "http://s/a", "http://s/b", "http://s/c", "http://s/d", "http://s/orphan"}


def test_build_link_graph_ignores_external_and_unknown_targets():
    graph = build_link_graph(LINKS, nodes=PAGES)
    assert graph[ROOT] == {"http://s/a", "http://s/b"}
    assert "http://ext/" not in {t for tgts in graph.values() for t in tgts}


def test_bfs_depths_shortest_path():
    graph = build_link_graph(LINKS, nodes=PAGES)
    depths = bfs_depths(ROOT, graph)
    assert depths[ROOT] == 0
    assert depths["http://s/a"] == 1
    assert depths["http://s/b"] == 1
    assert depths["http://s/c"] == 2
    assert depths["http://s/d"] == 3
    assert "http://s/orphan" not in depths  # unreachable


def test_shortest_click_path():
    graph = build_link_graph(LINKS, nodes=PAGES)
    assert shortest_click_path(ROOT, ROOT, graph) == [ROOT]
    assert shortest_click_path(ROOT, "http://s/d", graph) == [
        ROOT, "http://s/a", "http://s/c", "http://s/d",
    ]
    assert shortest_click_path(ROOT, "http://s/orphan", graph) is None


def test_depth_report():
    report = build_depth_report(ROOT, PAGES, LINKS)
    assert report.max_depth == 3
    assert report.pages_per_depth == {0: 1, 1: 2, 2: 1, 3: 1}  # root + a,b + c + d
    assert report.reachable_count == 5
    assert report.unreachable_urls == ["http://s/orphan"]
    assert report.deepest_pages[0] == ("http://s/d", 3)
    assert report.avg_depth == round((0 + 1 + 1 + 2 + 3) / 5, 2)


def test_excessive_depth_issue_flags_pages_beyond_threshold():
    report = build_depth_report(ROOT, PAGES, LINKS)
    issues = excessive_depth_issues(report, LINKS, PAGES, max_recommended_depth=2)
    assert len(issues) == 1
    assert issues[0].issue_type == "page_excessive_crawl_depth"
    assert issues[0].affected_urls == ["http://s/d"]  # only /d is > 2 clicks


def test_no_excessive_depth_issue_when_shallow():
    report = build_depth_report(ROOT, PAGES, LINKS)
    assert excessive_depth_issues(report, LINKS, PAGES, max_recommended_depth=5) == []


def test_root_only_site():
    report = build_depth_report(ROOT, {ROOT}, [])
    assert report.max_depth == 0
    assert report.pages_per_depth == {0: 1}
    assert report.unreachable_urls == []
