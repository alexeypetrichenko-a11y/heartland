"""Audit both builds and optionally archive the verified local HTTPS review files."""
import argparse
from hashlib import sha256
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = Path("europe-2023/1.0.0-draft.3")
PREFIX = Path("review") / PACKAGE
FILES = {
    "manifest.json", "scenario.json", "week1.session.json", "world-spec.json",
    "provenance.json", "calibration-report.json", "NOTICE.md", "ATTRIBUTION.json",
}


def digest(path):
    return sha256(path.read_bytes()).digest()


def audit(folder, review, restricted):
    files = []
    packaged = set()
    for entry in folder.rglob("*"):
        if entry.is_symlink():
            raise ValueError(f"Unexpected symlink: {entry}")
        if not entry.is_file():
            continue
        relative = entry.relative_to(folder)
        files.append(relative)
        if relative.is_relative_to(PREFIX):
            name = str(relative.relative_to(PREFIX))
            if not review or name not in FILES or digest(entry) != digest(ROOT / "scenarios" / PACKAGE / name):
                raise ValueError(f"Unexpected or altered scenario asset: {entry}")
            packaged.add(name)
            continue
        if digest(entry) in restricted or relative.parts[0] == "review":
            raise ValueError(f"Unexpected scenario, research or source file: {entry}")
        if relative == Path("index.html") or (review and relative == Path("benchmark.html")):
            continue
        if relative.parts[0] == "assets" and len(relative.parts) == 2 and entry.suffix in {".css", ".js"}:
            continue
        public = ROOT / "public" / relative
        if not public.is_file() or digest(entry) != digest(public):
            raise ValueError(f"Unexpected build entry: {entry}")

    if packaged != (FILES if review else set()) or Path("index.html") not in files:
        raise ValueError(f"Incomplete build: {folder}")
    print(f"{folder.name}: {len(files)} files, {len(packaged)} approved package assets")
    return sorted(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Write a ZIP of the verified review build contents")
    args = parser.parse_args()
    restricted = {
        digest(path)
        for tree in (ROOT / "scenarios", ROOT / "docs/world")
        for path in tree.rglob("*")
        if path.is_file()
    }
    audit(ROOT / "dist", False, restricted)
    review = ROOT / "dist-world04.local"
    files = audit(review, True, restricted)
    if args.archive:
        if args.archive.resolve().is_relative_to(review):
            raise ValueError("The archive must be outside the review build.")
        with ZipFile(args.archive, "w", compression=ZIP_DEFLATED) as archive:
            for relative in files:
                archive.write(review / relative, relative)
        with ZipFile(args.archive) as archive:
            if sorted(archive.namelist()) != sorted(map(str, files)) or any(
                sha256(archive.read(str(relative))).digest() != digest(review / relative) for relative in files
            ):
                raise ValueError("Archive verification failed.")
        print(f"Archive SHA-256 {digest(args.archive).hex()}")


if __name__ == "__main__":
    main()
