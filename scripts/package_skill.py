"""Validate and package the public skill, using only the Python standard library."""
from pathlib import Path
import hashlib
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'skills' / '1gp-leaderboard'
FILES = ['SKILL.md', 'agents/openai.yaml', 'references/rest-api.md', 'references/browser-example.md']


def package():
    text = (SOURCE / 'SKILL.md').read_text()
    assert text.startswith('---\nname: 1gp-leaderboard\ndescription: '), 'Missing skill metadata'
    version = re.search(r'^  version: "(\d+\.\d+\.\d+)"$', text, re.M)
    assert version, 'Missing release version'
    for name in FILES:
        path = SOURCE / name
        assert path.is_file() and not path.is_symlink(), f'Invalid package member: {name}'
        content = path.read_text()
        assert content.strip() and '[TODO' not in content, f'Unfinished file: {name}'
        for target in re.findall(r'\]\(([^)]+)\)', content):
            if '://' not in target:
                ref = (path.parent / target).resolve()
                assert ref.is_relative_to(SOURCE.resolve()) and ref.is_file(), f'Broken reference: {target}'
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    archive = dist / '1gp-leaderboard.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name in sorted(FILES):
            info = zipfile.ZipInfo('1gp-leaderboard/' + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, (SOURCE / name).read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert sorted(z.namelist()) == sorted('1gp-leaderboard/' + p for p in FILES)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
    print(f'Packaged 1gp-leaderboard v{version.group(1)}: {archive.name} ({archive.stat().st_size} bytes)')
    return version.group(1)


if __name__ == '__main__':
    package()
