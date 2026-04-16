"""네이버 검색광고 API 클라이언트. 요청별로 인스턴스 생성 (멀티유저)."""
import base64
import hashlib
import hmac
import time

import requests

BASE_URL = "https://api.searchad.naver.com"


class NaverAdsClient:
    def __init__(self, *, api_key: str, secret_key: str, customer_id: str):
        self.api_key = api_key
        self.secret_key = secret_key
        self.customer_id = customer_id

    def _header(self, method: str, uri: str) -> dict:
        ts = str(int(time.time() * 1000))
        msg = f"{ts}.{method}.{uri}"
        sig = base64.b64encode(hmac.new(self.secret_key.encode(), msg.encode(), hashlib.sha256).digest()).decode()
        return {
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "X-API-KEY": self.api_key,
            "X-Customer": self.customer_id,
            "X-Signature": sig,
        }

    def get(self, uri: str, params: dict | None = None):
        r = requests.get(BASE_URL + uri, headers=self._header("GET", uri), params=params)
        r.raise_for_status()
        return r.json()

    def put(self, uri: str, data: dict, params: dict | None = None):
        r = requests.put(BASE_URL + uri, headers=self._header("PUT", uri), json=data, params=params)
        r.raise_for_status()
        return r.json()

    def post(self, uri: str, data: dict):
        r = requests.post(BASE_URL + uri, headers=self._header("POST", uri), json=data)
        r.raise_for_status()
        return r.json()
