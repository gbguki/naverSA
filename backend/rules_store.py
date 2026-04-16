"""규칙 저장소 — JSON 파일 기반.

규칙 구조:
- 각 규칙은 scope(적용 범위)와 params(기준값/티어) 포함
- scope: {"type": "global"} | {"type": "media", "campaignTps": ["WEB_SITE"]} | {"type": "campaign", "campaignIds": [...]}
- 입찰가 규칙 params:
    targetRoas, minClicks, maxChangePct, bidFloor,
    tiers: [{roasMin, roasMax, changePct, label}] (내림차순, 매칭되는 첫 티어 적용)
- 키워드 규칙 params: 상동 + minImpressions, rankCtrBoost(=저CTR·저순위 +증액)

해결(resolution): 특정 캠페인에 대해 enabled=true 규칙 중
  캠페인 매칭(scope=campaign, id 포함) > 매체 매칭(scope=media, tp 포함) > 전역(scope=global)
  에서 가장 구체적인 규칙 1개 사용.
"""
import json
import threading
from pathlib import Path

STORE_PATH = Path(__file__).parent.parent / "rules_store.json"
_lock = threading.Lock()


def _default_store() -> dict:
    return {
        "bid": [
            {
                "id": "default-bid",
                "name": "기본 입찰가 규칙",
                "enabled": True,
                "scope": {"type": "global"},
                "params": {
                    "targetRoas": 250.0,
                    "minClicks": 10,
                    "maxChangePct": 30,
                    "bidFloor": 70,
                    "tiers": [
                        {"roasMin": 400, "roasMax": None, "changePct": 20, "label": "ROAS 400% 이상: +20% 확대"},
                        {"roasMin": 250, "roasMax": 400, "changePct": 0, "label": "목표 달성: 유지"},
                        {"roasMin": 100, "roasMax": 250, "changePct": -15, "label": "목표 미달: -15%"},
                        {"roasMin": 0, "roasMax": 100, "changePct": -30, "label": "적자: -30%"},
                    ],
                },
            }
        ],
        "keyword": [
            {
                "id": "default-keyword",
                "name": "기본 키워드 규칙",
                "enabled": True,
                "scope": {"type": "global"},
                "params": {
                    "targetRoas": 250.0,
                    "minClicks": 5,
                    "minImpressions": 100,
                    "maxChangePct": 30,
                    "bidFloor": 70,
                    "lowImpBoost": 20,
                    "lowRankCtrThreshold": 1.0,
                    "lowRankThreshold": 10.0,
                    "lowRankBoost": 20,
                    "tiers": [
                        {"roasMin": 400, "roasMax": None, "changePct": 20, "label": "ROAS 400% 이상: +20% 확대"},
                        {"roasMin": 250, "roasMax": 400, "changePct": 0, "label": "목표 달성: 유지"},
                        {"roasMin": 100, "roasMax": 250, "changePct": -15, "label": "목표 미달: -15%"},
                        {"roasMin": 0, "roasMax": 100, "changePct": -30, "label": "적자: -30%"},
                    ],
                },
            }
        ],
    }


def load() -> dict:
    if not STORE_PATH.exists():
        store = _default_store()
        save(store)
        return store
    with STORE_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def save(store: dict) -> None:
    with _lock:
        with STORE_PATH.open("w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)


def resolve(kind: str, *, campaign_id: str, campaign_tp: str) -> dict | None:
    """특정 캠페인에 적용될 규칙 반환. 없으면 None.

    우선순위: campaign > media > global. 같은 계층 내에서는 리스트 순서(앞이 우선).
    """
    store = load()
    rules = [r for r in store.get(kind, []) if r.get("enabled")]
    if not rules:
        return None
    buckets = {"campaign": [], "media": [], "global": []}
    for r in rules:
        sc = r.get("scope", {})
        t = sc.get("type", "global")
        if t == "campaign" and campaign_id in sc.get("campaignIds", []):
            buckets["campaign"].append(r)
        elif t == "media" and campaign_tp in sc.get("campaignTps", []):
            buckets["media"].append(r)
        elif t == "global":
            buckets["global"].append(r)
    for level in ("campaign", "media", "global"):
        if buckets[level]:
            return buckets[level][0]
    return None
