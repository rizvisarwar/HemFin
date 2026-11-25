"""Write the OpenAPI spec to api/openapi.json. Needs no database."""

import json
from pathlib import Path

from hemfin.main import create_app


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "openapi.json"
    spec = create_app().openapi()
    out.write_text(
        json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
