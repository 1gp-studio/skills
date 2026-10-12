"""Validate and package every public skill, using only the Python standard library."""
from pathlib import Path
import hashlib
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / 'skills'
DIST = ROOT / 'dist'


def members(source):
    """Every file in the skill folder is shipped; nothing generated or hidden is allowed in it."""
    files = sorted(p.relative_to(source).as_posix() for p in source.rglob('*') if not p.is_dir())
    for name in files:
        path = source / name
        assert not any(part.startswith('.') for part in Path(name).parts), f'Hidden file in {source.name}: {name}'
        assert path.is_file() and not path.is_symlink(), f'Invalid package member: {source.name}/{name}'
    assert 'SKILL.md' in files and 'agents/openai.yaml' in files, f'{source.name} needs SKILL.md and agents/openai.yaml'
    return files


def package_one(source):
    name = source.name
    files = members(source)
    text = (source / 'SKILL.md').read_text(encoding='utf-8')
    assert text.startswith(f'---\nname: {name}\ndescription: '), f'Missing skill metadata: {name}'
    version = re.search(r'^  version: "(\d+\.\d+\.\d+)"$', text, re.M)
    assert version, f'Missing version: {name}'
    for member in files:
        path = source / member
        content = path.read_text(encoding='utf-8')
        assert content.strip() and '[TODO' not in content, f'Unfinished file: {name}/{member}'
        for target in re.findall(r'\]\(([^)]+)\)', content):
            if '://' not in target:
                ref = (path.parent / target).resolve()
                assert ref.is_relative_to(source.resolve()) and ref.is_file(), f'Broken reference in {name}/{member}: {target}'
    archive = DIST / f'{name}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for member in files:
            info = zipfile.ZipInfo(f'{name}/{member}', date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, (source / member).read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert sorted(z.namelist()) == sorted(f'{name}/{p}' for p in files)
    print(f'Packaged {name} v{version.group(1)}: {archive.name} ({archive.stat().st_size} bytes)')
    return archive


def package():
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob('*.zip'):
        old.unlink()
    archives = [package_one(source) for source in sorted(p for p in SKILLS.iterdir() if p.is_dir())]
    assert archives, 'No skills found'
    sums = ''.join(f'{hashlib.sha256(a.read_bytes()).hexdigest()}  {a.name}\n' for a in archives)
    (DIST / 'SHA256SUMS').write_text(sums)
    return [a.name for a in archives]


if __name__ == '__main__':
    package()
