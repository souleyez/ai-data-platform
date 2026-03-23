import json
import sys

from uie_extract import SCHEMA, _load_taskflow, _normalize_result, _normalize_schema


def _emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    default_model = "uie-base"
    try:
        _load_taskflow(default_model, tuple(SCHEMA))
    except Exception as exc:
        print(f"[uie-worker] preload failed: {exc!r}", file=sys.stderr, flush=True)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id = None
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            text = str(payload.get("text") or "").strip()
            model_name = str(payload.get("model") or default_model).strip() or default_model
            schema_key = _normalize_schema(payload.get("schema"))

            if not text:
                _emit({"id": request_id, "ok": True, "slots": {}})
                continue

            runner = _load_taskflow(model_name, schema_key)
            result = runner(text[:4000])
            _emit({
                "id": request_id,
                "ok": True,
                "slots": _normalize_result(result, schema_key),
            })
        except Exception as exc:
            _emit({
                "id": request_id,
                "ok": False,
                "error": repr(exc),
            })


if __name__ == "__main__":
    main()
