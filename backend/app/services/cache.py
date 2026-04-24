import json
import time
from typing import Any, Callable, Optional
from functools import wraps
from ..utils.logger import get_logger

logger = get_logger(__name__)

_memory_cache: dict = {}


class CacheService:
    def __init__(self):
        self._redis = None

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        try:
            import redis.asyncio as aioredis
            from ..config import settings
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
            await self._redis.ping()
            logger.info("Redis connected")
        except Exception:
            logger.info("Redis unavailable, using in-memory cache")
            self._redis = None
        return self._redis

    async def get(self, key: str) -> Optional[Any]:
        entry = _memory_cache.get(key)
        if entry and entry["expires"] > time.time():
            return entry["value"]

        r = await self._get_redis()
        if r:
            try:
                raw = await r.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        _memory_cache[key] = {"value": value, "expires": time.time() + ttl}
        r = await self._get_redis()
        if r:
            try:
                await r.setex(key, ttl, json.dumps(value, default=str))
            except Exception:
                pass

    async def invalidate_pattern(self, pattern: str) -> None:
        prefix = pattern.rstrip("*")
        stale = [k for k in list(_memory_cache.keys()) if k.startswith(prefix)]
        for k in stale:
            del _memory_cache[k]

        r = await self._get_redis()
        if r:
            try:
                keys = await r.keys(pattern)
                if keys:
                    await r.delete(*keys)
            except Exception:
                pass

    async def flush_all(self) -> None:
        _memory_cache.clear()
        r = await self._get_redis()
        if r:
            try:
                await r.flushdb()
            except Exception:
                pass


cache = CacheService()


def cached(ttl: int = 300, key_prefix: str = ""):
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key_parts = [key_prefix or func.__name__] + [str(a) for a in args] + [f"{k}={v}" for k, v in sorted(kwargs.items())]
            cache_key = ":".join(key_parts)

            cached_val = await cache.get(cache_key)
            if cached_val is not None:
                return cached_val

            result = await func(*args, **kwargs)
            if result is not None:
                await cache.set(cache_key, result, ttl=ttl)
            return result
        return wrapper
    return decorator
