"""Package only the static app for a manual Cloudflare Direct Upload release."""

from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def package() -> None:
    """Exclude source notebooks, local chat files and development material."""
    target = ROOT / "dist/chat-insights.zip"
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((ROOT / "site").rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(ROOT / "site"))
    print(target)


if __name__ == "__main__":
    package()
