"""Tests for modules/technical_checks.py::check_https_enforcement."""

from unittest.mock import MagicMock, patch

from modules.technical_checks import check_https_enforcement


def _mock_response(final_url):
    resp = MagicMock()
    resp.url = final_url
    resp.is_redirect = False
    resp.headers = {}
    return resp


def test_skips_check_when_original_url_is_http():
    result = check_https_enforcement("http://example.com/")
    assert result["enforced"] is None
    assert result["issues"] == []


@patch("modules.technical_checks.requests.get")
def test_enforced_when_http_redirects_to_https(mock_get):
    mock_get.return_value = _mock_response("https://example.com/")
    result = check_https_enforcement("https://example.com/")
    assert result["enforced"] is True
    assert result["issues"] == []
    mock_get.assert_called_once()
    assert mock_get.call_args[0][0] == "http://example.com/"


@patch("modules.technical_checks.requests.get")
def test_not_enforced_when_http_stays_http(mock_get):
    mock_get.return_value = _mock_response("http://example.com/")
    result = check_https_enforcement("https://example.com/")
    assert result["enforced"] is False
    assert len(result["issues"]) == 1
    assert result["issues"][0]["severity"] == "Critical"


@patch("modules.technical_checks.requests.get", side_effect=OSError("connection refused"))
def test_network_failure_is_treated_as_unknown_not_a_failure(mock_get):
    result = check_https_enforcement("https://example.com/")
    assert result["enforced"] is None
    assert result["issues"] == []
