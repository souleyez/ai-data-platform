import json
import os
import sys
from functools import lru_cache


SCHEMA = [
    "\u4eba\u7fa4",
    "\u6210\u5206",
    "\u83cc\u682a",
    "\u529f\u6548",
    "\u5242\u91cf",
    "\u673a\u6784",
    "\u6307\u6807",
]


def _read_payload():
    if len(sys.argv) > 1 and sys.argv[1].strip():
        return json.loads(sys.argv[1])
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def _normalize_schema(schema):
    if not schema:
        return tuple(SCHEMA)

    normalized = []
    for item in schema:
        value = str(item or "").strip()
        if value and value not in normalized:
            normalized.append(value)
    return tuple(normalized or SCHEMA)


@lru_cache(maxsize=16)
def _load_taskflow(model_name: str, schema_key):
    os.environ.setdefault("FLAGS_enable_pir_api", "0")
    from paddlenlp import Taskflow

    task_path = os.environ.get(
        "PADDLE_UIE_TASK_PATH",
        os.path.join(os.path.expanduser("~"), ".paddlenlp", "taskflow-runtime", model_name),
    )
    return Taskflow(
        "information_extraction",
        schema=list(schema_key),
        model=model_name,
        task_path=task_path,
    )


def _normalize_result(raw, schema=None):
    schema_key = _normalize_schema(schema)
    if isinstance(raw, list):
        raw = raw[0] if raw else {}
    slots = {}
    for key in schema_key:
        items = raw.get(key) or []
        normalized = []
        for item in items:
            if isinstance(item, dict):
                value = str(item.get("text") or "").strip()
            else:
                value = str(item or "").strip()
            if value and value not in normalized:
                normalized.append(value)
        slots[key] = normalized
    return slots


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    payload = _read_payload()
    text = str(payload.get("text") or "").strip()
    model_name = str(payload.get("model") or "uie-base").strip() or "uie-base"
    schema = payload.get("schema")

    if not text:
        print(json.dumps({"ok": True, "slots": {}}, ensure_ascii=False))
        return

    try:
        schema_key = _normalize_schema(schema)
        runner = _load_taskflow(model_name, schema_key)
        result = runner(text[:4000])
        print(json.dumps({"ok": True, "slots": _normalize_result(result, schema_key)}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": repr(exc)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
