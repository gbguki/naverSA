"""광고 운영 룰 엔진. 파라미터는 rules_store에서 주입."""


def _round_to_10(value: int, floor: int) -> int:
    return max(floor, (value // 10) * 10)


def _cap_change(current: int, recommended: int, max_change_pct: float) -> int:
    max_up = int(current * (1 + max_change_pct / 100))
    max_down = int(current * (1 - max_change_pct / 100))
    return max(min(recommended, max_up), max_down)


def _match_tier(tiers: list[dict], roas: float) -> dict | None:
    for t in tiers:
        lo = t.get("roasMin", 0)
        hi = t.get("roasMax")
        if roas >= lo and (hi is None or roas < hi):
            return t
    return None


def recommend_bid(*, current_bid: int, roas7: float, clicks7: int, params: dict) -> tuple[int | None, str]:
    """광고그룹 입찰가 추천. params는 rules_store의 bid 규칙 params."""
    min_clicks = params.get("minClicks", 10)
    max_change = params.get("maxChangePct", 30)
    floor = params.get("bidFloor", 70)
    tiers = params.get("tiers", [])

    if clicks7 < min_clicks:
        return None, f"클릭 {clicks7}회 < {min_clicks}회 (데이터 부족)"

    tier = _match_tier(tiers, roas7)
    if not tier:
        return None, f"ROAS {roas7:.0f}% · 매칭 티어 없음"

    change_pct = tier.get("changePct", 0)
    label = tier.get("label", f"{change_pct:+d}%")
    if change_pct == 0:
        return None, f"ROAS {roas7:.0f}% · {label}"

    target = int(current_bid * (1 + change_pct / 100))
    target = _cap_change(current_bid, target, max_change)
    return _round_to_10(target, floor), f"ROAS {roas7:.0f}% · {label}"


def recommend_keyword_bid(*, current_bid: int, imp30: int, clk30: int, sales30: int,
                          conv30: int, avgRnk30: float, params: dict) -> tuple[int | None, str]:
    """키워드 입찰가 추천 (30일 기준). params는 rules_store의 keyword 규칙 params."""
    min_clicks = params.get("minClicks", 5)
    min_imp = params.get("minImpressions", 100)
    max_change = params.get("maxChangePct", 30)
    floor = params.get("bidFloor", 70)
    low_imp_boost = params.get("lowImpBoost", 20)
    low_rank_ctr_thr = params.get("lowRankCtrThreshold", 1.0)
    low_rank_thr = params.get("lowRankThreshold", 10.0)
    low_rank_boost = params.get("lowRankBoost", 20)
    tiers = params.get("tiers", [])

    ctr = (clk30 / imp30 * 100) if imp30 else 0.0
    roas = (conv30 / sales30 * 100) if sales30 else 0.0

    if imp30 == 0:
        return None, "노출 0회 (신규/집행 직전)"

    if imp30 < min_imp:
        target = _cap_change(current_bid, int(current_bid * (1 + low_imp_boost / 100)), max_change)
        return _round_to_10(target, floor), f"노출 {imp30}회 < {min_imp} · +{low_imp_boost}% (테스트 확대)"

    if avgRnk30 > low_rank_thr and ctr < low_rank_ctr_thr:
        target = _cap_change(current_bid, int(current_bid * (1 + low_rank_boost / 100)), max_change)
        return _round_to_10(target, floor), f"평균순위 {avgRnk30:.1f}위 · CTR {ctr:.1f}% · +{low_rank_boost}% (순위 부족)"

    if clk30 < min_clicks:
        return None, f"클릭 {clk30}회 < {min_clicks} (CTR {ctr:.1f}%, 수집 중)"

    tier = _match_tier(tiers, roas)
    if not tier:
        return None, f"ROAS {roas:.0f}% · 매칭 티어 없음"
    change_pct = tier.get("changePct", 0)
    label = tier.get("label", f"{change_pct:+d}%")
    if change_pct == 0:
        return None, f"ROAS {roas:.0f}% · {label}"
    target = _cap_change(current_bid, int(current_bid * (1 + change_pct / 100)), max_change)
    return _round_to_10(target, floor), f"ROAS {roas:.0f}% · {label}"
