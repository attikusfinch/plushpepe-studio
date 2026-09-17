"""Validate the local collection and rebuild its catalog using Python's stdlib."""
import gzip
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_header(path, require_rgba=False):
    data = path.read_bytes()
    require(data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR', f'Invalid PNG: {path}')
    width, height, depth, color = struct.unpack('>IIBB', data[16:26])
    require((width, height) == (512, 512), f'Unexpected PNG size: {path}')
    if require_rgba:
        require(depth == 8 and color == 6, f'Expected 8-bit RGBA PNG: {path}')


def exact_files(folder, suffix, ids):
    expected = {f'{model_id}{suffix}' for model_id in ids}
    actual = {path.name for path in folder.glob(f'*{suffix}')}
    require(actual == expected, f'Incomplete collection in {folder}: missing {sorted(expected - actual)}, extra {sorted(actual - expected)}')


def main():
    originals = [f'{number:03d}' for number in range(1, 84)]
    models = [f'{number:03d}' for number in range(34, 84)]
    sources = ROOT / 'assets/sources/tgs'
    references = PUBLIC / 'references'
    pngs = PUBLIC / 'models/standing/png'
    vectors = PUBLIC / 'models/standing/lottie'
    for folder, suffix, ids in [(sources, '.tgs', originals), (references, '.png', originals), (pngs, '.png', models), (vectors, '.json', models)]:
        exact_files(folder, suffix, ids)
    for model_id in originals:
        png_header(references / f'{model_id}.png')
        with gzip.open(sources / f'{model_id}.tgs', 'rt', encoding='utf-8') as stream:
            data = json.load(stream)
        require(data.get('layers') and data.get('w') == 512 and data.get('h') == 512, f'Invalid TGS: {model_id}')
    catalog = {
        'schemaVersion': 1,
        'name': 'Plush Pepe Studio',
        'modelCount': len(models),
        'poses': [{'id': '002', 'name': 'Стоя', 'referenceUrl': '/references/002.png', 'sourceFile': 'assets/sources/tgs/002.tgs'}],
        'models': [],
    }
    for model_id in models:
        png = pngs / f'{model_id}.png'
        vector = vectors / f'{model_id}.json'
        source = sources / f'{model_id}.tgs'
        reference = references / f'{model_id}.png'
        png_header(png, require_rgba=True)
        data = json.loads(vector.read_text(encoding='utf-8'))
        require((data.get('w'), data.get('h')) == (512, 512) and data.get('layers'), f'Invalid vector: {model_id}')
        require(data.get('op', 0) - data.get('ip', 0) == 1, f'Expected single-frame vector: {model_id}')
        catalog['models'].append({
            'id': model_id,
            'name': f'Plush Pepe {model_id}',
            'poseId': '002',
            'previewUrl': f'/models/standing/png/{model_id}.png',
            'vectorUrl': f'/models/standing/lottie/{model_id}.json',
            'referenceUrl': f'/references/{model_id}.png',
            'sourceFile': f'assets/sources/tgs/{model_id}.tgs',
            'width': 512,
            'height': 512,
            'notes': 'Серый силуэт, как в оригинале.' if model_id == '061' else '',
            'sha256': {'png': digest(png), 'vector': digest(vector), 'reference': digest(reference), 'source': digest(source)},
        })
    path = PUBLIC / 'catalog.json'
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('OK: 83 TGS sources, 83 reference PNGs, 50 standing PNGs, 50 single-frame vectors.')
    print(f'Catalog: {path}')


if __name__ == '__main__':
    main()
