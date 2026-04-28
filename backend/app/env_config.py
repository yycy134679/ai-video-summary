from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ENV_FILE = PROJECT_ROOT / ".env"


def get_config_value(name: str, default: str = "") -> str:
    dotenv_values = load_dotenv_values(PROJECT_ENV_FILE)
    value = dotenv_values.get(name)
    if value is not None:
        return value.strip()
    return os.getenv(name, default).strip()


def get_config_value_int(name: str, default: int) -> int:
    """读取整数类型配置，无效时返回 default。"""
    raw_value = get_config_value(name)
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


def get_config_value_bool(name: str, default: bool = False) -> bool:
    """读取布尔类型配置，支持 1/0、true/false、yes/no、on/off。"""
    raw_value = get_config_value(name)
    if not raw_value:
        return default
    normalized = raw_value.lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return default


def load_dotenv_values(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}

    for line in lines:
        parsed = _parse_dotenv_line(line)
        if parsed is None:
            continue
        key, value = parsed
        values[key] = value
    return values


def _parse_dotenv_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None

    key, value = stripped.split("=", maxsplit=1)
    key = key.strip()
    if key.startswith("export "):
        key = key.removeprefix("export ").strip()
    if not key:
        return None

    return key, _clean_dotenv_value(value)


def _clean_dotenv_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]

    hash_index = value.find(" #")
    if hash_index >= 0:
        value = value[:hash_index]
    return value.strip()
