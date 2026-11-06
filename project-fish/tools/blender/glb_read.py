"""Reading the game's own .glb files (made by glTF-Transform: meshes
compressed with EXT_meshopt_compression, positions and the like quantized
with KHR_mesh_quantization, textures WebP) in plain numpy, for the build
scripts that reuse parts of them (convert_retarget.py takes the soldier's
first-person arms from assets/soldier.glb).

read_glb(path) gives the glTF JSON, a function reading an accessor as an
array (rows of its type's width, normalized integers as floats, as
rigged_gltf.read_gltf does) and one returning a bufferView's bytes
(decompressed). Only the meshopt codecs glTF-Transform writes are read:
the vertex codec (version 0) with the octahedral, quaternion and
exponential filters, and the index codec (versions 0 and 1).
"""

import json
import struct

import numpy as np

COMPONENTS = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32, 5122: np.int16, 5120: np.int8}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# --- The vertex codec -----------------------------------------------------------

def _decode_bytes(data, pos, size):
    """One byte stream of a vertex block: `size` bytes (a multiple of 16) in
    groups of 16, each 0, 2, 4 or 8 bits a byte (with escapes) or raw."""
    out = np.zeros(size, np.uint8)
    groups = size // 16
    header = data[pos:pos + (groups + 3) // 4]
    pos += (groups + 3) // 4
    for gi in range(groups):
        bits = (header[gi // 4] >> ((gi % 4) * 2)) & 3
        base = gi * 16
        if bits == 0:
            continue
        if bits == 3:
            out[base:base + 16] = np.frombuffer(data, np.uint8, 16, pos)
            pos += 16
            continue
        width = 2 if bits == 1 else 4
        packed = 4 if bits == 1 else 8
        extra = pos + packed
        sentinel = (1 << width) - 1
        k = 0
        for b in data[pos:pos + packed]:
            for shift in range(8 - width, -1, -width):
                v = (b >> shift) & sentinel
                if v == sentinel:
                    v = data[extra]
                    extra += 1
                out[base + k] = v
                k += 1
        pos = extra
    return out, pos


def decode_vertex_buffer(data, count, stride):
    """meshopt_decodeVertexBuffer: `count` vertices of `stride` bytes."""
    if data[0] != 0xA0:
        raise SystemExit(f'unsupported meshopt vertex codec version {data[0] & 15}')
    block = min((8192 // stride) & ~15, 256)
    last = np.frombuffer(data, np.uint8, stride, len(data) - stride).astype(np.int64)
    out = np.zeros((count, stride), np.uint8)
    pos = 1
    for start in range(0, count, block):
        n = min(block, count - start)
        aligned = (n + 15) & ~15
        for k in range(stride):
            raw, pos = _decode_bytes(data, pos, aligned)
            v = raw[:n].astype(np.int64)
            delta = (v >> 1) ^ -(v & 1)  # unzigzag
            col = (last[k] + np.cumsum(delta)) & 0xFF
            out[start:start + n, k] = col
            last[k] = col[-1]
    return out.reshape(-1).tobytes()


def _filter_octahedral(raw, count, stride):
    t = np.int8 if stride == 4 else np.int16
    a = np.frombuffer(raw, t).reshape(count, 4).astype(np.float64)
    top = float((1 << (8 * np.dtype(t).itemsize - 1)) - 1)
    x, y = a[:, 0].copy(), a[:, 1].copy()
    z = a[:, 2] - np.abs(x) - np.abs(y)
    t_ = np.minimum(z, 0)
    x += np.where(x >= 0, t_, -t_)
    y += np.where(y >= 0, t_, -t_)
    s = top / np.sqrt(x * x + y * y + z * z)
    out = a.copy()
    for i, c in enumerate((x, y, z)):
        v = c * s
        out[:, i] = np.trunc(v + np.where(v >= 0, 0.5, -0.5))
    return out.astype(t).tobytes()


def _filter_quaternion(raw, count):
    a = np.frombuffer(raw, np.int16).reshape(count, 4).astype(np.int64)
    sf = a[:, 3] | 3
    ss = (1 / np.sqrt(2)) / sf
    xyz = a[:, :3] * ss[:, None]
    w = np.sqrt(np.maximum(1 - (xyz ** 2).sum(1), 0))
    vals = np.c_[xyz, w] * 32767
    vals = np.trunc(vals + np.where(vals >= 0, 0.5, -0.5)).astype(np.int64)
    qc = a[:, 3] & 3
    out = np.zeros((count, 4), np.int64)
    rows = np.arange(count)
    out[rows, (qc + 1) & 3] = vals[:, 0]
    out[rows, (qc + 2) & 3] = vals[:, 1]
    out[rows, (qc + 3) & 3] = vals[:, 2]
    out[rows, (qc + 0) & 3] = vals[:, 3]
    return out.astype(np.int16).tobytes()


def _filter_exponential(raw):
    v = np.frombuffer(raw, np.int32).astype(np.int64)
    e = v >> 24
    m = ((v & 0xFFFFFF) ^ 0x800000) - 0x800000
    return np.ldexp(m.astype(np.float64), e).astype(np.float32).tobytes()


# --- The index codec ------------------------------------------------------------

def _vbyte(data, pos):
    v, shift = 0, 0
    while True:
        b = data[pos]
        pos += 1
        v |= (b & 127) << shift
        shift += 7
        if b < 128:
            return v, pos


def decode_index_buffer(data, count):
    """meshopt_decodeIndexBuffer (triangle lists), versions 0 and 1."""
    if data[0] & 0xF0 != 0xE0 or data[0] & 15 > 1:
        raise SystemExit(f'unsupported meshopt index codec {data[0]:#x}')
    version = data[0] & 15
    fecmax = 13 if version >= 1 else 15
    code = 1
    pos = 1 + count // 3
    aux = len(data) - 16
    edges = [(0, 0)] * 16
    verts = [0] * 16
    eo = vo = 0
    nxt = last = 0
    out = np.zeros(count, np.uint32)

    def index(pos, last):
        v, pos = _vbyte(data, pos)
        return (last + ((v >> 1) ^ -(v & 1))) & 0xFFFFFFFF, pos

    for i in range(0, count, 3):
        ct = data[code]
        code += 1
        if ct < 0xF0:
            fe = ct >> 4
            a, b = edges[(eo - 1 - fe) & 15]
            fec = ct & 15
            if fec < fecmax:
                c = nxt if fec == 0 else verts[(vo - 1 - fec) & 15]
                if fec == 0:
                    nxt += 1
                out[i:i + 3] = (a, b, c)
                verts[vo] = c
                vo = (vo + (fec == 0)) & 15
            else:
                if fec != 15:
                    c = last + (fec - (fec ^ 3))
                else:
                    c, pos = index(pos, last)
                last = c
                out[i:i + 3] = (a, b, c)
                verts[vo] = c
                vo = (vo + 1) & 15
            edges[eo] = (c, b)
            eo = (eo + 1) & 15
            edges[eo] = (a, c)
            eo = (eo + 1) & 15
        else:
            if ct < 0xFE:
                ca = data[aux + (ct & 15)]
                feb, fec = ca >> 4, ca & 15
                a = nxt
                nxt += 1
                b = nxt if feb == 0 else verts[(vo - feb) & 15]
                if feb == 0:
                    nxt += 1
                c = nxt if fec == 0 else verts[(vo - fec) & 15]
                if fec == 0:
                    nxt += 1
                push_b, push_c = feb == 0, fec == 0
            else:
                ca = data[pos]
                pos += 1
                fea = 0 if ct == 0xFE else 15
                feb, fec = ca >> 4, ca & 15
                if ca == 0:
                    nxt = 0
                if fea == 0:
                    a = nxt
                    nxt += 1
                else:
                    a = 0
                if feb == 0:
                    b = nxt
                    nxt += 1
                else:
                    b = verts[(vo - feb) & 15]
                if fec == 0:
                    c = nxt
                    nxt += 1
                else:
                    c = verts[(vo - fec) & 15]
                if fea == 15:
                    a, pos = index(pos, last)
                    last = a
                if feb == 15:
                    b, pos = index(pos, last)
                    last = b
                if fec == 15:
                    c, pos = index(pos, last)
                    last = c
                push_b, push_c = feb in (0, 15), fec in (0, 15)
            out[i:i + 3] = (a, b, c)
            verts[vo] = a
            vo = (vo + 1) & 15
            verts[vo] = b
            vo = (vo + push_b) & 15
            verts[vo] = c
            vo = (vo + push_c) & 15
            edges[eo] = (b, a)
            eo = (eo + 1) & 15
            edges[eo] = (c, b)
            eo = (eo + 1) & 15
            edges[eo] = (a, c)
            eo = (eo + 1) & 15
    return out


# --- The file ---------------------------------------------------------------------

def read_glb(path):
    with open(path, 'rb') as f:
        blob = f.read()
    magic, version, length = struct.unpack_from('<III', blob, 0)
    if magic != 0x46546C67 or version != 2:
        raise SystemExit(f'{path} is not a glTF 2 binary')
    pos, g, chunks = 12, None, []
    while pos < length:
        size, kind = struct.unpack_from('<II', blob, pos)
        body = blob[pos + 8:pos + 8 + size]
        if kind == 0x4E4F534A:
            g = json.loads(body)
        elif kind == 0x004E4942:
            chunks.append(body)
        pos += 8 + size
    buffers = []
    for i, b in enumerate(g['buffers']):
        if 'uri' in b:
            raise SystemExit(f'{path}: external buffers are not read')
        buffers.append(chunks[0] if i == 0 and chunks else None)  # (meshopt fallback buffers have no data)
    cache = {}

    def view(i):
        if i in cache:
            return cache[i]
        v = g['bufferViews'][i]
        ext = v.get('extensions', {}).get('EXT_meshopt_compression')
        if ext:
            src = buffers[ext['buffer']]
            raw = src[ext.get('byteOffset', 0):ext.get('byteOffset', 0) + ext['byteLength']]
            count, stride = ext['count'], ext['byteStride']
            mode, filt = ext['mode'], ext.get('filter', 'NONE')
            if mode == 'ATTRIBUTES':
                out = decode_vertex_buffer(raw, count, stride)
                if filt == 'OCTAHEDRAL':
                    out = _filter_octahedral(out, count, stride)
                elif filt == 'QUATERNION':
                    out = _filter_quaternion(out, count)
                elif filt == 'EXPONENTIAL':
                    out = _filter_exponential(out)
                elif filt != 'NONE':
                    raise SystemExit(f'unknown meshopt filter {filt}')
            elif mode == 'TRIANGLES':
                idx = decode_index_buffer(raw, count)
                out = idx.astype(np.uint16 if stride == 2 else np.uint32).tobytes()
            else:
                raise SystemExit(f'meshopt mode {mode} is not read')
        else:
            src = buffers[v['buffer']]
            out = src[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        cache[i] = out
        return out

    def accessor(i):
        a = g['accessors'][i]
        data = view(a['bufferView'])
        bv = g['bufferViews'][a['bufferView']]
        n = WIDTH[a['type']]
        dt = np.dtype(COMPONENTS[a['componentType']])
        ext = bv.get('extensions', {}).get('EXT_meshopt_compression')
        stride = (ext['byteStride'] if ext else bv.get('byteStride')) or n * dt.itemsize
        offset = a.get('byteOffset', 0)
        rows = np.frombuffer(data, np.uint8, count=stride * (a['count'] - 1) + n * dt.itemsize, offset=offset)
        rows = np.lib.stride_tricks.as_strided(rows, (a['count'], n * dt.itemsize), (stride, 1))
        out = np.ascontiguousarray(rows).view(dt).reshape(a['count'], n)
        if a.get('normalized'):
            out = np.maximum(out.astype(np.float64) / np.iinfo(dt).max, -1.0)
        return out

    return g, accessor, view
