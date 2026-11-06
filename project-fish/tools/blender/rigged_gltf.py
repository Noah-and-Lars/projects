"""Reading and writing animated, skinned glTF files for the guns that bring
their own arms (convert_fn502.py; convert_beretta.py has its own copy of
the same code): the download's accessors, quaternion and matrix maths,
sampling a channel as glTF's LINEAR does, posing a skeleton and its skinned
meshes, finding loose pieces of a mesh, and writing a .glb with embedded
WebP textures.

Plain numpy, so the converters can check everything they change. (Blender
is only used for the textures.)
"""

import json
import math
import os
import struct
import tempfile

import numpy as np

COMPONENTS = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32, 5122: np.int16, 5120: np.int8}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def inside(folder, uri):
    """The path of a file the download names, which must be a plain file in
    its own folder (or its textures/ folder, or loose beside scene.gltf),
    not one reaching out of it."""
    base = os.path.realpath(folder)
    if uri.startswith('data:') or os.path.isabs(uri) or '..' in uri.replace('\\', '/').split('/'):
        raise SystemExit(f'unexpected file {uri!r} in the download')
    for candidate in (uri, os.path.basename(uri)):
        path = os.path.realpath(os.path.join(folder, candidate))
        if os.path.commonpath([base, path]) == base and os.path.isfile(path):
            return path
    raise SystemExit(f'{uri} not found in {folder}')


def read_gltf(folder):
    """The download's scene.gltf, and a function reading an accessor as an
    array (rows of its type's width)."""
    with open(os.path.join(folder, 'scene.gltf')) as f:
        g = json.load(f)
    with open(inside(folder, g['buffers'][0]['uri']), 'rb') as f:
        data = f.read()

    def accessor(i):
        a = g['accessors'][i]
        view = g['bufferViews'][a['bufferView']]
        n = WIDTH[a['type']]
        dt = np.dtype(COMPONENTS[a['componentType']])
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = view.get('byteStride') or n * dt.itemsize
        rows = np.frombuffer(data, np.uint8, count=stride * (a['count'] - 1) + n * dt.itemsize, offset=offset)
        rows = np.lib.stride_tricks.as_strided(rows, (a['count'], n * dt.itemsize), (stride, 1))
        out = np.ascontiguousarray(rows).view(dt).reshape(a['count'], n)
        if a.get('normalized'):
            out = out.astype(np.float64) / np.iinfo(dt).max
        return out

    return g, accessor


# --- Maths ----------------------------------------------------------------------

def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def matrix_quat(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q, np.float64)
    return q / np.linalg.norm(q)


def slerp(a, b, t):
    d = float(a @ b)
    if d < 0:
        b, d = -b, -d
    if d > 0.9995:
        r = a + t * (b - a)
        return r / np.linalg.norm(r)
    th = math.acos(d)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)


def sample(times, values, t, path):
    """A channel's value at time t (held before its first key and after its
    last), interpolated as glTF's LINEAR does."""
    if t <= times[0]:
        return values[0].copy()
    if t >= times[-1]:
        return values[-1].copy()
    i = int(np.searchsorted(times, t)) - 1
    f = (t - times[i]) / (times[i + 1] - times[i])
    if path == 'rotation':
        return slerp(values[i], values[i + 1], f)
    return values[i] * (1 - f) + values[i + 1] * f


def trs_matrix(t, r, s=(1, 1, 1)):
    m = np.eye(4)
    m[:3, :3] = quat_matrix(r) * np.asarray(s)
    m[:3, 3] = t
    return m


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], np.float64).reshape(4, 4).T
    return trs_matrix(n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1]))


# --- The rig --------------------------------------------------------------------

class Rig:
    """The skeleton as a list of bones (name, parent, rest translation and
    rotation, inverse bind matrix) and a pose evaluator."""

    def __init__(self):
        self.names, self.parents, self.t, self.r, self.ibm = [], [], [], [], []

    def index(self, name):
        return self.names.index(name)

    def world(self, pose=None):
        """World matrices of every bone (rig space) for a pose: {bone: {'translation': v, 'rotation': q}}."""
        out = []
        for k in range(len(self.names)):
            t, r = self.t[k], self.r[k]
            if pose and k in pose:
                t = pose[k].get('translation', t)
                r = pose[k].get('rotation', r)
            m = trs_matrix(t, r)
            p = self.parents[k]
            out.append(m if p is None else out[p] @ m)
        return out


def clip_pose(clip, t):
    pose = {}
    for (bone, path), (times, values) in clip['tracks'].items():
        pose.setdefault(bone, {})[path] = sample(times, values, t, path)
    return pose


def skin(rig, mesh, pose=None):
    """A mesh's vertices posed (rig space)."""
    mats = np.array([w @ b for w, b in zip(rig.world(pose), rig.ibm)])
    p = np.c_[mesh['position'], np.ones(len(mesh['position']))]
    out = np.zeros((len(p), 3))
    for k in range(4):
        out += mesh['weights'][:, k:k + 1] * np.einsum('nij,nj->ni', mats[mesh['joints'][:, k]], p)[:, :3]
    return out


def loose_pieces(position, triangles):
    """Which loose piece each triangle belongs to (pieces share no corners;
    corners at the same place count as shared)."""
    _, corner = np.unique(np.round(position, 5), axis=0, return_inverse=True)
    corner = corner.ravel()
    parent = np.arange(corner.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    tris = corner[triangles]
    for a, b, c in tris:
        ra = find(a)
        parent[find(b)] = ra
        parent[find(c)] = ra
    return np.array([find(t[0]) for t in tris])


def cut(tracks, start, end, still_length=1 / 30):
    """The keys of every track between start and end (seconds), from 0, with
    a key at each end (sampled there); every key in between kept as it is.
    start == end makes a still: two equal keys still_length apart."""
    out = {}
    for key in sorted(tracks):
        times, values = tracks[key]
        path = key[1]
        if end > start:
            inner = (times > start + 1e-4) & (times < end - 1e-4)
            t = [0.0] + list(times[inner] - start) + [end - start]
            v = [sample(times, values, start, path)] + list(values[inner]) + [sample(times, values, end, path)]
        else:
            v0 = sample(times, values, start, path)
            t, v = [0.0, still_length], [v0, v0]
        out[key] = (np.array(t), np.array(v))
    return out


# --- Writing the file -----------------------------------------------------------

def webp_bytes(image, name, quality, folder_name):
    """A Blender image saved as WebP (its pixels as they are now)."""
    folder = os.path.join(tempfile.gettempdir(), folder_name)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + '.webp')
    image.file_format = 'WEBP'
    image.save(filepath=path, quality=quality)
    with open(path, 'rb') as f:
        return f.read()


class Writer:
    def __init__(self, generator, copyright_):
        self.g = {'asset': {'version': '2.0', 'generator': generator, 'copyright': copyright_},
                  'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [], 'meshes': [], 'skins': [],
                  'materials': [], 'textures': [], 'images': [], 'samplers': [], 'animations': [],
                  'accessors': [], 'bufferViews': [], 'buffers': [],
                  'extensionsUsed': ['EXT_texture_webp'], 'extensionsRequired': ['EXT_texture_webp']}
        self.data = bytearray()

    def view(self, raw, target=None):
        while len(self.data) % 4:
            self.data.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(raw)}
        if target:
            v['target'] = target
        self.data += raw
        self.g['bufferViews'].append(v)
        return len(self.g['bufferViews']) - 1

    def accessor(self, array, kind, component=5126, target=None, bounds=False):
        array = np.ascontiguousarray(array, dtype={5126: np.float32, 5123: np.uint16, 5125: np.uint32}[component])
        a = {'bufferView': self.view(array.tobytes(), target), 'componentType': component,
             'count': int(array.shape[0]), 'type': kind}
        if bounds:
            flat = array.reshape(array.shape[0], -1)
            a['min'] = [float(x) for x in flat.min(0)]
            a['max'] = [float(x) for x in flat.max(0)]
        self.g['accessors'].append(a)
        return len(self.g['accessors']) - 1

    def texture(self, name, data, sampler=0):
        self.g['images'].append({'name': name, 'mimeType': 'image/webp', 'bufferView': self.view(data)})
        self.g['textures'].append({'sampler': sampler, 'extensions': {'EXT_texture_webp': {'source': len(self.g['images']) - 1}}})
        return {'index': len(self.g['textures']) - 1}

    def write(self, path):
        while len(self.data) % 4:
            self.data.append(0)
        self.g['buffers'] = [{'byteLength': len(self.data)}]
        text = json.dumps(self.g, separators=(',', ':')).encode()
        text += b' ' * (-len(text) % 4)
        out = bytearray(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(self.data)))
        out += struct.pack('<II', len(text), 0x4E4F534A) + text
        out += struct.pack('<II', len(self.data), 0x004E4942) + self.data
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(out)


def write_rig(w, root_name, rig, frame_bone, gun_turn):
    """The rig's nodes into writer w: node 0 its root (the eye), the bones
    after it in skin order, then a `gun` node on frame_bone turned by
    gun_turn (a quaternion). Returns the first bone's node index."""
    g = w.g
    g['nodes'].append({'name': root_name, 'children': []})
    first = 1
    for k, name in enumerate(rig.names):
        node = {'name': name}
        if np.abs(rig.t[k]).max() > 0:
            node['translation'] = [float(x) for x in rig.t[k]]
        if np.abs(rig.r[k] - [0, 0, 0, 1]).max() > 0:
            node['rotation'] = [float(x) for x in rig.r[k] / np.linalg.norm(rig.r[k])]
        g['nodes'].append(node)
    for k, p in enumerate(rig.parents):
        if p is None:
            g['nodes'][0]['children'].append(first + k)
        else:
            g['nodes'][first + p].setdefault('children', []).append(first + k)
    g['skins'].append({'name': f'{root_name}_rig', 'joints': list(range(first, first + len(rig.names))),
                       'skeleton': first + rig.parents.index(None),
                       'inverseBindMatrices': w.accessor(np.array([m.T.reshape(-1) for m in rig.ibm]), 'MAT4')})
    g['nodes'].append({'name': 'gun', 'rotation': [float(x) for x in gun_turn]})
    g['nodes'][first + rig.index(frame_bone)].setdefault('children', []).append(len(g['nodes']) - 1)
    return first


def write_mesh(w, name, m, material):
    """A skinned mesh (position, normal, uv, joints, weights, triangles) as a
    node under the root, on skin 0."""
    g = w.g
    n = m['normal'] / np.linalg.norm(m['normal'], axis=1, keepdims=True)
    attrs = {'POSITION': w.accessor(m['position'], 'VEC3', target=34962, bounds=True),
             'NORMAL': w.accessor(n, 'VEC3', target=34962),
             'TEXCOORD_0': w.accessor(m['uv'], 'VEC2', target=34962),
             'JOINTS_0': w.accessor(m['joints'], 'VEC4', 5123, target=34962),
             'WEIGHTS_0': w.accessor(m['weights'], 'VEC4', target=34962)}
    prim = {'attributes': attrs, 'indices': w.accessor(m['triangles'].reshape(-1, 1), 'SCALAR', 5125, target=34963),
            'material': material}
    g['meshes'].append({'name': name, 'primitives': [prim]})
    g['nodes'].append({'name': name, 'mesh': len(g['meshes']) - 1, 'skin': 0})
    g['nodes'][0]['children'].append(len(g['nodes']) - 1)


def write_clips(w, clips, first):
    for name, clip in clips.items():
        anim = {'name': name, 'channels': [], 'samplers': []}
        for (bone, prop), (times, values) in clip['tracks'].items():
            kind = 'VEC4' if prop == 'rotation' else 'VEC3'
            anim['samplers'].append({'input': w.accessor(times.reshape(-1, 1), 'SCALAR', bounds=True),
                                     'output': w.accessor(values, kind), 'interpolation': 'LINEAR'})
            anim['channels'].append({'sampler': len(anim['samplers']) - 1,
                                     'target': {'node': first + bone, 'path': prop}})
        w.g['animations'].append(anim)
