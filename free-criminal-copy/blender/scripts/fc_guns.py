# Free Criminal guns, built in Blender in the game's gun frame: x right, y up, z forward (muzzle at +z, grip just behind z=0).
# Each gun keeps the grip / handguard / sight positions the game's HOLD table expects, so the first-person hands still fit.
import bpy, bmesh, math
import numpy as np
from mathutils import Vector

GUN = {}   # key -> root object

def gpart(ob, key): ob['fc_part'] = key; return ob

def prof(name, pts, w, mat, bevel, parent, key, x=0.0, seg=2, smooth=False):
    """A side profile (points as (z, y), counter-clockwise or not) extruded across x by w, with bevelled edges."""
    bm = bmesh.new()
    vs = [bm.verts.new(V(x - w / 2, y, z)) for z, y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=nv, vec=Vector((w, 0, 0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for fc in bm.faces: fc.material_index = MIDX[mat]; fc.smooth = smooth
    ob = new_obj(name, bm, [M(k) for k in MNAMES], parent)
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(35)
    return gpart(ob, key)

def gbox(name, size, pos, mat, parent, key, bevel=0.0, rot=(0, 0, 0), seg=2):
    return gpart(box(name, size, pos, parent, mat, bevel, rot, 'body', seg), key)

def gcyl(name, r, length, pos, mat, parent, key, axis='z', seg=16, r2=None):
    return gpart(cyl(name, r, length, pos, parent, mat, axis, seg, 'body', r2), key)

def rrect_pts(zc, yc, d, h, ang=0.0, r=0.0):   # a rectangle in (z, y) of depth d (along z) and height h, tilted by ang (radians, top towards +z)
    c, s = math.cos(ang), math.sin(ang); out = []
    for dz, dy in ((-d / 2, -h / 2), (d / 2, -h / 2), (d / 2, h / 2), (-d / 2, h / 2)):
        out.append((zc + dz * c - dy * s, yc + dz * s + dy * c))
    return out

def rail(name, z0, z1, y, mat, parent, key, w=0.024, x=0.0, step=0.014):
    gbox(name, (w, 0.007, z1 - z0), (x, y, (z0 + z1) / 2), mat, parent, key)
    i = 0; z = z0 + 0.008
    while z < z1:
        gbox('%s_s%d' % (name, i), (w + 0.006, 0.005, 0.007), (x, y + 0.005, z), mat, parent, key); z += step; i += 1

def trigger(z, y, parent, key, mat='gD'):
    gbox('tg_b', (0.01, 0.006, 0.062), (0, y - 0.032, z + 0.012), mat, parent, key)
    gbox('tg_f', (0.01, 0.032, 0.006), (0, y - 0.016, z + 0.042), mat, parent, key)
    gbox('tg_r', (0.01, 0.02, 0.006), (0, y - 0.022, z - 0.015), mat, parent, key, rot=(0.5, 0, 0))
    gbox('trig', (0.005, 0.024, 0.005), (0, y - 0.013, z + 0.012), 'trig', parent, key, rot=(0.15, 0, 0))

def pgrip(z, y, parent, key, mat='gP', ang=0.32, h=0.11, d=0.046, w=0.034):
    """A pistol grip centred on (z, y), leaning back by ang, with a slightly flared base and a textured panel each side."""
    prof('grip', rrect_pts(z, y, d, h, ang), w, mat, 0.007, parent, key, seg=3)
    bz = z - math.sin(ang) * h / 2; by = y - math.cos(ang) * h / 2
    gbox('gripbase', (w + 0.004, 0.01, d + 0.006), (0, by, bz), mat, parent, key, bevel=0.003, rot=(ang, 0, 0))
    for s in (1, -1):
        gbox('grippan%d' % s, (0.003, h * 0.5, d * 0.6), (s * (w / 2 + 0.0005), y - 0.005, z - 0.004), 'gDk', parent, key, rot=(ang, 0, 0))

def mag(z, y, parent, key, w=0.03, d=0.05, segs=5, step=0.035, bend=0.17, mat='mag', tilt=0.0):
    yy, zz, a = y, z, tilt
    for i in range(segs):
        gbox('mag%d' % i, (w, step * 1.05, d), (0, yy, zz), mat, parent, key, rot=(a, 0, 0))
        yy -= math.cos(a) * step * 0.95; zz += math.sin(a) * step * 0.95; a += bend
    gbox('magbase', (w + 0.004, 0.012, d + 0.006), (0, yy + step * 0.45, zz - math.sin(a) * step * 0.45), 'gun2', parent, key, rot=(a - bend, 0, 0))

def scope(y, z, length, r, parent, key, mat='gDk'):
    gcyl('sc_tube', r, length, (0, y, z), mat, parent, key, 'z', 18)
    gcyl('sc_obj', r, 0.07, (0, y, z + length / 2 + 0.03), mat, parent, key, 'z', 18, r2=r * 1.55)
    gcyl('sc_objr', r * 1.55, 0.025, (0, y, z + length / 2 + 0.075), mat, parent, key, 'z', 18)
    gcyl('sc_lens', r * 1.3, 0.004, (0, y, z + length / 2 + 0.086), 'scopeglass', parent, key, 'z', 18)
    gcyl('sc_ocu', r * 1.35, 0.05, (0, y, z - length / 2 - 0.02), mat, parent, key, 'z', 18, r2=r)
    gcyl('sc_ocur', r * 1.35, 0.045, (0, y, z - length / 2 - 0.065), 'gDk', parent, key, 'z', 18)
    gcyl('sc_eye', r * 1.1, 0.004, (0, y, z - length / 2 - 0.089), 'bore', parent, key, 'z', 18)
    gcyl('sc_tur1', r * 0.65, 0.04, (0, y + r + 0.012, z + 0.01), mat, parent, key, 'y', 14)
    gcyl('sc_tur2', r * 0.6, 0.035, (r + 0.012, y, z + 0.01), mat, parent, key, 'x', 14)
    for i, zz in enumerate((z - length * 0.28, z + length * 0.28)):
        gbox('sc_mnt%d' % i, (0.014, y - 0.03, 0.024), (0, 0.03 + (y - 0.03) / 2, zz), mat, parent, key, bevel=0.002)
        gcyl('sc_ring%d' % i, r + 0.004, 0.018, (0, y, zz), mat, parent, key, 'z', 18)

def serrations(x, y, z0, n, step, h, parent, key, d=0.004):
    for i in range(n): gbox('ser%d_%d' % (int(x * 1000), i), (0.002, h, d), (x, y, z0 + i * step), 'gDk', parent, key)

def root_for(key):
    r = bpy.data.objects.new('gun_' + key, None); bpy.context.scene.collection.objects.link(r); GUN[key] = r; return r

# ------------------------------------------------------------------------------------------------ the guns
def build_pistol():
    k = 'pistol'; R = root_for(k)
    prof('slide', [(-0.02, 0.022), (0.168, 0.022), (0.172, 0.034), (0.17, 0.05), (0.158, 0.055), (-0.016, 0.055), (-0.02, 0.046)], 0.03, 'gP', 0.004, R, k, seg=3)
    gbox('slidetop', (0.02, 0.004, 0.17), (0, 0.055, 0.076), 'gD', R, k, bevel=0.001)
    for s in (1, -1): serrations(s * 0.0155, 0.038, -0.012, 6, 0.007, 0.024, R, k)
    gbox('port', (0.002, 0.012, 0.04), (0.016, 0.044, 0.08), 'gun2', R, k)
    gbox('fsight', (0.006, 0.008, 0.005), (0, 0.059, 0.16), 'gDk', R, k); gbox('rsight', (0.018, 0.008, 0.006), (0, 0.059, -0.008), 'gDk', R, k)
    gbox('rsnotch', (0.004, 0.005, 0.007), (0, 0.061, -0.008), 'gP', R, k)
    gcyl('muzzle', 0.0075, 0.014, (0, 0.038, 0.17), 'bore', R, k, 'z', 12); gcyl('bore', 0.004, 0.016, (0, 0.038, 0.171), 'bore', R, k, 'z', 10)
    prof('frame', [(-0.025, 0.0), (0.165, 0.0), (0.165, 0.023), (-0.025, 0.023)], 0.028, 'gD', 0.003, R, k)
    rail('frail', 0.07, 0.14, -0.004, 'gD', R, k, w=0.02, step=0.012)
    trigger(0.0, 0.0, R, k)
    pgrip(-0.026, -0.052, R, k, 'gD', 0.3, 0.105, 0.046, 0.032)
    gbox('beaver', (0.03, 0.01, 0.03), (0, -0.004, -0.035), 'gD', R, k, bevel=0.003)
    return R

def build_revolver():
    k = 'revolver'; R = root_for(k)
    gcyl('barrel', 0.011, 0.18, (0, 0.052, 0.16), 'steel', R, k, 'z', 18); gcyl('bore', 0.005, 0.01, (0, 0.052, 0.251), 'bore', R, k, 'z', 10)
    gbox('rib', (0.012, 0.012, 0.18), (0, 0.064, 0.16), 'steel2', R, k, bevel=0.002); gbox('underlug', (0.017, 0.022, 0.165), (0, 0.034, 0.168), 'steel', R, k, bevel=0.004)
    gbox('fsight', (0.004, 0.012, 0.012), (0, 0.072, 0.243), 'steel2', R, k); gbox('fsred', (0.003, 0.01, 0.008), (0, 0.074, 0.244), 'red', R, k)
    gcyl('cyl', 0.031, 0.062, (0, 0.04, 0.035), 'steel2', R, k, 'z', 24)
    for i in range(6):
        a = i * math.pi / 3; gcyl('flute%d' % i, 0.006, 0.05, (math.cos(a) * 0.031, 0.04 + math.sin(a) * 0.031, 0.03), 'grey', R, k, 'z', 10)
        gcyl('chamber%d' % i, 0.0055, 0.004, (math.cos(a + 0.52) * 0.019, 0.04 + math.sin(a + 0.52) * 0.019, 0.067), 'bore', R, k, 'z', 10)
    gcyl('axis', 0.012, 0.066, (0, 0.04, 0.035), 'grey', R, k, 'z', 12)
    prof('frame', [(-0.025, 0.0), (0.09, 0.0), (0.09, 0.015), (0.075, 0.015), (0.075, 0.07), (0.09, 0.07), (0.09, 0.08), (-0.025, 0.08), (-0.025, 0.012)], 0.026, 'steel', 0.003, R, k)
    gbox('topstrap', (0.022, 0.012, 0.09), (0, 0.078, 0.035), 'steel', R, k, bevel=0.002); gbox('rsight', (0.012, 0.008, 0.012), (0, 0.086, -0.01), 'gun2', R, k)
    gbox('hammer', (0.01, 0.024, 0.016), (0, 0.074, -0.03), 'grey', R, k, rot=(-0.5, 0, 0), bevel=0.002); gbox('spur', (0.008, 0.007, 0.012), (0, 0.087, -0.04), 'gun2', R, k)
    trigger(0.0, 0.012, R, k, 'steel')
    prof('backstrap', rrect_pts(-0.038, 0.01, 0.046, 0.05, 0.38), 0.028, 'steel', 0.004, R, k)
    prof('wgrip', rrect_pts(-0.05, -0.025, 0.05, 0.1, 0.38), 0.036, 'wood', 0.008, R, k, seg=3)
    for i, (z, y) in enumerate(((-0.042, -0.01), (-0.054, -0.04))): gbox('fgroove%d' % i, (0.038, 0.006, 0.05), (0, y, z), 'wood2', R, k, rot=(0.38, 0, 0))
    gbox('gripcap', (0.038, 0.012, 0.052), (0, -0.07, -0.068), 'wood2', R, k, rot=(0.38, 0, 0), bevel=0.003)
    return R

def build_smg():
    k = 'smg'; R = root_for(k)
    prof('recv', [(-0.055, 0.0), (0.195, 0.0), (0.195, 0.058), (0.185, 0.066), (-0.05, 0.066), (-0.055, 0.058)], 0.042, 'gP', 0.005, R, k, seg=3)
    gbox('topcover', (0.034, 0.01, 0.25), (0, 0.068, 0.07), 'gD', R, k, bevel=0.002); rail('rail', -0.02, 0.18, 0.075, 'gDk', R, k, w=0.022)
    gbox('frontblock', (0.044, 0.03, 0.06), (0, 0.02, 0.16), 'gM', R, k, bevel=0.004)
    gcyl('shroud', 0.019, 0.08, (0, 0.03, 0.24), 'gD', R, k, 'z', 16)
    for i in range(4):
        for s in (1, -1): gcyl('hole%d_%d' % (i, s), 0.005, 0.004, (s * 0.019, 0.03, 0.215 + i * 0.015), 'bore', R, k, 'x', 8)
    gcyl('barrel', 0.009, 0.06, (0, 0.03, 0.3), 'gDk', R, k, 'z', 12); gcyl('muzzle', 0.012, 0.02, (0, 0.03, 0.325), 'gDk', R, k, 'z', 12); gcyl('bore', 0.005, 0.004, (0, 0.03, 0.335), 'bore', R, k, 'z', 10)
    gbox('fsight', (0.01, 0.018, 0.014), (0, 0.085, 0.17), 'gDk', R, k); gbox('rsight', (0.02, 0.018, 0.014), (0, 0.085, -0.01), 'gDk', R, k)
    gbox('cocking', (0.008, 0.014, 0.022), (0.025, 0.055, 0.12), 'gun2', R, k, bevel=0.002)
    for s in (1, -1): gbox('port%d' % s, (0.002, 0.02, 0.05), (s * 0.0215, 0.035, 0.11), 'gDk', R, k)
    pgrip(-0.03, -0.055, R, k, 'gD', 0.12, 0.11)
    trigger(0.0, 0.0, R, k)
    gbox('magazine', (0.03, 0.15, 0.036), (0, -0.12, -0.038), 'gDk', R, k, rot=(0.12, 0, 0), bevel=0.003); gbox('magbase', (0.034, 0.012, 0.04), (0, -0.2, -0.047), 'gun2', R, k, bevel=0.002)
    prof('fgrip', rrect_pts(0.17, -0.04, 0.032, 0.07, 0.08), 0.026, 'gD', 0.006, R, k, seg=3)
    for s in (1, -1): gbox('stockbar%d' % s, (0.012, 0.012, 0.17), (s * 0.027, 0.03, -0.07), 'gun2', R, k, bevel=0.003)
    gbox('butt', (0.06, 0.05, 0.012), (0, 0.025, -0.16), 'gun2', R, k, bevel=0.003)
    return R

def build_pump():
    k = 'pump'; R = root_for(k)
    prof('recv', [(-0.07, -0.012), (0.11, -0.012), (0.11, 0.05), (0.1, 0.056), (-0.065, 0.056), (-0.07, 0.045)], 0.036, 'gD', 0.004, R, k, seg=3)
    gbox('port', (0.002, 0.026, 0.06), (0.019, 0.03, 0.04), 'gun2', R, k)
    gbox('loadport', (0.016, 0.002, 0.07), (0, -0.013, 0.03), 'gun2', R, k)
    trigger(-0.02, -0.012, R, k)
    gcyl('barrel', 0.0118, 0.58, (0, 0.048, 0.42), 'gDk', R, k, 'z', 16); gcyl('bore', 0.007, 0.004, (0, 0.048, 0.711), 'bore', R, k, 'z', 10)
    gbox('rib', (0.006, 0.004, 0.5), (0, 0.061, 0.42), 'gun2', R, k); gbox('bead', (0.004, 0.006, 0.004), (0, 0.064, 0.7), 'bead', R, k)
    gcyl('magtube', 0.011, 0.38, (0, 0.017, 0.29), 'gD', R, k, 'z', 14); gcyl('magcap', 0.0125, 0.02, (0, 0.017, 0.48), 'gD', R, k, 'z', 14)
    gcyl('forend', 0.023, 0.19, (0, 0.02, 0.33), 'wood', R, k, 'z', 10)
    for i in range(7): gcyl('rib%d' % i, 0.024, 0.005, (0, 0.02, 0.255 + i * 0.024), 'wood2', R, k, 'z', 10)
    prof('stock', [(-0.07, 0.045), (-0.07, -0.03), (-0.16, -0.045), (-0.41, -0.1), (-0.415, -0.085), (-0.415, 0.0), (-0.3, 0.01), (-0.2, 0.03)], 0.04, 'wood', 0.008, R, k, seg=3)
    gbox('pad', (0.044, 0.112, 0.022), (0, -0.05, -0.422), 'rubber', R, k, rot=(0.06, 0, 0), bevel=0.004)
    return R

def build_carbine():
    k = 'carbine'; R = root_for(k)
    prof('recv', [(-0.1, -0.02), (0.16, -0.02), (0.16, 0.04), (-0.1, 0.04)], 0.036, 'gun2', 0.003, R, k)
    gcyl('dustcover', 0.019, 0.24, (0, 0.04, 0.02), 'gun3', R, k, 'z', 16)
    gbox('port', (0.002, 0.03, 0.07), (0.019, 0.025, 0.06), 'gDk', R, k); gbox('safety', (0.006, 0.01, 0.11), (0.021, 0.0, 0.02), 'gun3', R, k, bevel=0.002)
    gbox('rsblock', (0.026, 0.022, 0.04), (0, 0.055, 0.17), 'gDk', R, k, bevel=0.003); gbox('rsleaf', (0.02, 0.012, 0.03), (0, 0.07, 0.17), 'gDk', R, k)
    prof('lhand', [(0.175, -0.026), (0.365, -0.022), (0.365, 0.014), (0.175, 0.014)], 0.044, 'wood', 0.006, R, k, seg=3)
    gcyl('uhand', 0.016, 0.17, (0, 0.048, 0.26), 'wood', R, k, 'z', 12); gcyl('gastube', 0.009, 0.06, (0, 0.048, 0.37), 'gDk', R, k, 'z', 12)
    gbox('gasblock', (0.024, 0.04, 0.03), (0, 0.03, 0.39), 'gDk', R, k, bevel=0.003)
    gcyl('barrel', 0.0095, 0.24, (0, 0.012, 0.48), 'gDk', R, k, 'z', 14); gcyl('bore', 0.005, 0.004, (0, 0.013, 0.623), 'bore', R, k, 'z', 10)
    gbox('fstower', (0.012, 0.05, 0.016), (0, 0.04, 0.52), 'gDk', R, k, bevel=0.002); gbox('fspost', (0.004, 0.02, 0.004), (0, 0.072, 0.52), 'gDk', R, k)
    gcyl('brake', 0.014, 0.045, (0, 0.013, 0.6), 'gDk', R, k, 'z', 12)
    mag(0.07, -0.05, R, k, 0.03, 0.05, 5, 0.035, 0.17, 'mag')
    trigger(-0.005, -0.02, R, k)
    pgrip(-0.075, -0.065, R, k, 'wood2', 0.33, 0.1)
    prof('stock', [(-0.11, 0.035), (-0.11, -0.03), (-0.2, -0.045), (-0.385, -0.1), (-0.39, -0.085), (-0.39, 0.0), (-0.3, 0.012), (-0.2, 0.028)], 0.04, 'wood', 0.007, R, k, seg=3)
    gbox('pad', (0.042, 0.108, 0.016), (0, -0.05, -0.395), 'rubber', R, k, rot=(0.06, 0, 0), bevel=0.003)
    return R

def build_dmr():
    k = 'dmr'; R = root_for(k)
    prof('upper', [(-0.06, 0.01), (0.18, 0.01), (0.18, 0.064), (-0.06, 0.064)], 0.05, 'od', 0.005, R, k, seg=3)
    prof('lower', [(-0.06, -0.04), (-0.06, 0.01), (0.14, 0.01), (0.14, -0.02), (0.1, -0.02), (0.1, -0.04)], 0.046, 'od2', 0.004, R, k)
    rail('rail', -0.06, 0.5, 0.07, 'gDk', R, k, w=0.026)
    gbox('port', (0.002, 0.026, 0.05), (0.026, 0.04, 0.09), 'gDk', R, k)
    gcyl('hguard', 0.03, 0.34, (0, 0.032, 0.36), 'od', R, k, 'z', 8)
    for i in range(6):
        for s in (1, -1): gbox('slot%d_%d' % (i, s), (0.004, 0.014, 0.03), (s * 0.028, 0.032, 0.24 + i * 0.05), 'gDk', R, k)
    gcyl('barrel', 0.011, 0.18, (0, 0.03, 0.6), 'gD', R, k, 'z', 14); gcyl('brake', 0.016, 0.05, (0, 0.03, 0.71), 'gDk', R, k, 'z', 12); gcyl('bore', 0.006, 0.004, (0, 0.03, 0.736), 'bore', R, k, 'z', 10)
    for i in range(3): gbox('bslot%d' % i, (0.034, 0.004, 0.005), (0, 0.042, 0.695 + i * 0.012), 'bore', R, k)
    scope(0.115, 0.06, 0.24, 0.017, R, k)
    gbox('magazine', (0.032, 0.17, 0.06), (0, -0.11, 0.11), 'gDk', R, k, rot=(0.06, 0, 0), bevel=0.003)
    trigger(-0.005, -0.035, R, k)
    pgrip(-0.075, -0.085, R, k, 'od2', 0.3, 0.1)
    gcyl('buffer', 0.016, 0.14, (0, 0.01, -0.17), 'od2', R, k, 'z', 12)
    prof('stock', [(-0.19, -0.07), (-0.41, -0.07), (-0.41, 0.03), (-0.19, 0.03)], 0.046, 'od', 0.006, R, k, seg=3)
    gbox('cheek', (0.04, 0.03, 0.16), (0, 0.045, -0.29), 'od2', R, k, bevel=0.005); gbox('pad', (0.05, 0.11, 0.02), (0, -0.02, -0.415), 'rubber', R, k, bevel=0.003)
    return R

def build_auto():
    k = 'auto'; R = root_for(k)
    prof('recv', [(-0.14, -0.035), (0.22, -0.035), (0.22, 0.075), (-0.14, 0.075)], 0.07, 'gD', 0.006, R, k, seg=3)
    gbox('top', (0.072, 0.02, 0.36), (0, 0.07, 0.04), 'gP', R, k, bevel=0.004)
    gbox('handlep1', (0.012, 0.05, 0.03), (0, 0.1, -0.03), 'gP', R, k, bevel=0.002); gbox('handlep2', (0.012, 0.05, 0.03), (0, 0.1, 0.15), 'gP', R, k, bevel=0.002)
    gbox('handle', (0.03, 0.012, 0.22), (0, 0.125, 0.06), 'gP', R, k, bevel=0.003)
    prof('hguard', [(0.21, -0.01), (0.37, -0.01), (0.37, 0.06), (0.21, 0.06)], 0.06, 'gP', 0.005, R, k, seg=3)
    for i in range(3): gbox('vent%d' % i, (0.062, 0.01, 0.025), (0, 0.045, 0.24 + i * 0.04), 'bore', R, k)
    gcyl('barrel', 0.017, 0.2, (0, 0.03, 0.46), 'gDk', R, k, 'z', 16); gcyl('muzzle', 0.025, 0.06, (0, 0.03, 0.58), 'gDk', R, k, 'z', 16); gcyl('bore', 0.011, 0.004, (0, 0.03, 0.611), 'bore', R, k, 'z', 12)
    gcyl('drum', 0.085, 0.075, (0, -0.1, 0.12), 'gM', R, k, 'x', 24); gcyl('drumf', 0.06, 0.078, (0, -0.1, 0.12), 'gD', R, k, 'x', 20); gbox('drumneck', (0.04, 0.04, 0.05), (0, -0.02, 0.12), 'gD', R, k)
    trigger(-0.02, -0.04, R, k)
    pgrip(-0.09, -0.09, R, k, 'gD', 0.25, 0.1)
    prof('stock', [(-0.15, -0.04), (-0.39, -0.04), (-0.39, 0.04), (-0.15, 0.04)], 0.05, 'gD', 0.006, R, k, seg=3)
    gbox('pad', (0.056, 0.09, 0.02), (0, 0.0, -0.395), 'rubber', R, k, bevel=0.003)
    prof('fgrip', rrect_pts(0.27, -0.04, 0.04, 0.06, 0.0), 0.03, 'gP', 0.006, R, k, seg=3)
    return R

def build_sniper():
    k = 'sniper'; R = root_for(k)
    gcyl('action', 0.02, 0.24, (0, 0.03, 0.06), 'od2', R, k, 'z', 18)
    prof('chassis', [(-0.07, -0.02), (0.21, -0.02), (0.21, 0.02), (-0.07, 0.02)], 0.042, 'od', 0.005, R, k, seg=3)
    rail('rail', -0.05, 0.24, 0.056, 'gDk', R, k, w=0.026)
    gcyl('bolt', 0.006, 0.05, (0.045, 0.04, -0.03), 'steel2', R, k, 'x', 10); gcyl('knob', 0.012, 0.018, (0.07, 0.038, -0.034), 'gDk', R, k, 'x', 12)
    gcyl('barrel', 0.0135, 0.56, (0, 0.03, 0.5), 'gD', R, k, 'z', 16)
    for i in range(6):
        a = i * math.pi / 3; gcyl('flute%d' % i, 0.003, 0.38, (math.cos(a) * 0.0125, 0.03 + math.sin(a) * 0.0125, 0.47), 'gDk', R, k, 'z', 6)
    gcyl('brake', 0.02, 0.07, (0, 0.03, 0.79), 'gDk', R, k, 'z', 14); gcyl('bore', 0.007, 0.004, (0, 0.03, 0.826), 'bore', R, k, 'z', 10)
    for i in range(3): gbox('bslot%d' % i, (0.042, 0.005, 0.008), (0, 0.045, 0.77 + i * 0.016), 'bore', R, k)
    prof('forend', [(0.21, -0.015), (0.53, -0.012), (0.53, 0.035), (0.21, 0.035)], 0.048, 'od', 0.006, R, k, seg=3)
    for s in (1, -1): gbox('bipod%d' % s, (0.012, 0.012, 0.12), (s * 0.018, -0.025, 0.42), 'gun2', R, k, bevel=0.003)
    scope(0.11, 0.07, 0.34, 0.022, R, k)
    gbox('magazine', (0.03, 0.08, 0.06), (0, -0.045, 0.05), 'gDk', R, k, rot=(0.05, 0, 0), bevel=0.003)
    trigger(-0.03, -0.02, R, k)
    pgrip(-0.09, -0.07, R, k, 'od2', 0.25, 0.1)
    prof('stock', [(-0.11, 0.06), (-0.11, -0.08), (-0.18, -0.08), (-0.36, -0.075), (-0.36, 0.045), (-0.2, 0.06)], 0.046, 'od', 0.006, R, k, seg=3)
    gbox('cheek', (0.044, 0.035, 0.17), (0, 0.065, -0.27), 'od2', R, k, bevel=0.005); gbox('pad', (0.05, 0.13, 0.025), (0, -0.01, -0.37), 'rubber', R, k, bevel=0.004)
    gbox('monopod', (0.012, 0.06, 0.012), (0, -0.1, -0.32), 'gDk', R, k)
    return R

def build_lmg():
    k = 'lmg'; R = root_for(k)
    prof('recv', [(-0.12, -0.035), (0.2, -0.035), (0.2, 0.055), (-0.12, 0.055)], 0.07, 'gM', 0.005, R, k, seg=3)
    prof('feedcover', [(-0.08, 0.055), (0.12, 0.055), (0.12, 0.085), (-0.08, 0.085)], 0.072, 'gD', 0.006, R, k, seg=3)
    gbox('handlep', (0.012, 0.03, 0.03), (0, 0.1, 0.14), 'gun2', R, k); gbox('handle', (0.03, 0.012, 0.12), (0, 0.12, 0.14), 'gun2', R, k, bevel=0.003)
    gbox('pouch', (0.11, 0.14, 0.15), (0, -0.11, 0.06), 'od', R, k, bevel=0.02, seg=3); gbox('flap', (0.112, 0.02, 0.15), (0, -0.04, 0.06), 'od2', R, k, bevel=0.005)
    gbox('belt', (0.03, 0.04, 0.03), (0.045, -0.01, 0.12), 'brass', R, k, bevel=0.003)
    prof('hguard', [(0.2, -0.035), (0.38, -0.03), (0.38, 0.025), (0.2, 0.025)], 0.06, 'gP', 0.005, R, k, seg=3)
    gcyl('gastube', 0.009, 0.2, (0, -0.02, 0.34), 'gDk', R, k, 'z', 12)
    gcyl('barrel', 0.0145, 0.4, (0, 0.03, 0.52), 'gD', R, k, 'z', 16); gbox('heatshield', (0.03, 0.016, 0.24), (0, 0.05, 0.42), 'gun2', R, k, bevel=0.003)
    for s in (1, -1): gbox('bipod%d' % s, (0.012, 0.012, 0.22), (s * 0.026, 0.004, 0.56), 'gDk', R, k, bevel=0.003)
    gbox('bipodx', (0.06, 0.016, 0.02), (0, 0.006, 0.45), 'gDk', R, k)
    gcyl('flash', 0.02, 0.05, (0, 0.03, 0.74), 'gDk', R, k, 'z', 12, r2=0.015); gcyl('bore', 0.008, 0.004, (0, 0.03, 0.766), 'bore', R, k, 'z', 10)
    gbox('fsight', (0.008, 0.03, 0.008), (0, 0.07, 0.66), 'gDk', R, k)
    trigger(-0.03, -0.04, R, k)
    pgrip(-0.09, -0.09, R, k, 'gD', 0.28, 0.1)
    gbox('stocktop', (0.05, 0.03, 0.22), (0, 0.02, -0.25), 'gM', R, k, bevel=0.005); gbox('stockplate', (0.05, 0.1, 0.03), (0, -0.02, -0.36), 'gM', R, k, bevel=0.005)
    gbox('stockstrut', (0.012, 0.08, 0.012), (0, -0.03, -0.24), 'gM', R, k)
    return R

def build_gl():
    k = 'gl'; R = root_for(k)
    gcyl('drum', 0.075, 0.14, (0, 0.0, 0.05), 'od2', R, k, 'z', 24)
    for i in range(6):
        a = i * math.pi / 3 + 0.5; gcyl('tube%d' % i, 0.022, 0.142, (math.cos(a) * 0.045, math.sin(a) * 0.045, 0.05), 'gDk', R, k, 'z', 12)
        gcyl('tbore%d' % i, 0.016, 0.004, (math.cos(a) * 0.045, math.sin(a) * 0.045, 0.122), 'bore', R, k, 'z', 12)
    gcyl('barrel', 0.03, 0.26, (0, 0.045, 0.27), 'od', R, k, 'z', 18); gcyl('bore', 0.024, 0.004, (0, 0.045, 0.401), 'bore', R, k, 'z', 16)
    gbox('topframe', (0.07, 0.02, 0.16), (0, 0.085, 0.2), 'gD', R, k, bevel=0.004); rail('rail', 0.12, 0.3, 0.1, 'gDk', R, k)
    for s in (1, -1): gbox('strut%d' % s, (0.016, 0.13, 0.016), (s * 0.035, 0.02, 0.13), 'gD', R, k, bevel=0.003)
    gbox('sight', (0.03, 0.03, 0.04), (0, 0.12, 0.14), 'gDk', R, k, bevel=0.003); gbox('sightlens', (0.026, 0.02, 0.004), (0, 0.125, 0.161), 'scopeglass', R, k)
    prof('fgrip', rrect_pts(0.28, -0.025, 0.035, 0.07, 0.1), 0.03, 'gD', 0.006, R, k, seg=3)
    gbox('lowframe', (0.042, 0.035, 0.2), (0, -0.06, -0.05), 'gD', R, k, bevel=0.004)
    trigger(-0.06, -0.06, R, k)
    pgrip(-0.1, -0.11, R, k, 'gD', 0.3, 0.1)
    gcyl('buffer', 0.014, 0.14, (0, 0.01, -0.12), 'gD', R, k, 'z', 12)
    gbox('stock', (0.044, 0.09, 0.16), (0, -0.02, -0.22), 'gD', R, k, bevel=0.006); gbox('pad', (0.05, 0.1, 0.02), (0, -0.02, -0.3), 'rubber', R, k, bevel=0.003)
    return R

def build_rifle():
    k = 'rifle'; R = root_for(k)
    prof('upper', [(-0.065, 0.003), (0.205, 0.003), (0.205, 0.073), (-0.065, 0.073)], 0.066, 'gun3', 0.005, R, k, seg=3)
    prof('lower', [(-0.07, -0.048), (-0.07, 0.012), (0.16, 0.012), (0.16, -0.03), (0.143, -0.03), (0.143, -0.088), (0.058, -0.088), (0.058, -0.03), (0.0, -0.03), (0.0, -0.048)], 0.06, 'gD', 0.004, R, k)
    rail('rail', -0.08, 0.22, 0.077, 'gDk', R, k, w=0.03)
    gbox('port', (0.002, 0.028, 0.055), (0.034, 0.04, 0.1), 'gDk', R, k); gbox('charge', (0.03, 0.012, 0.04), (0, 0.055, -0.07), 'gDk', R, k, bevel=0.002)
    mag(0.112, -0.15, R, k, 0.038, 0.07, 3, 0.04, 0.2, 'gDk', tilt=0.22)
    pgrip(-0.07, -0.1, R, k, 'gDk', 0.36, 0.12, 0.052)
    trigger(0.0, -0.045, R, k)
    gcyl('buffer', 0.016, 0.14, (0, 0.01, -0.18), 'gDk', R, k, 'z', 12)
    prof('stock', [(-0.23, -0.057), (-0.43, -0.057), (-0.43, 0.033), (-0.23, 0.033)], 0.048, 'gD', 0.006, R, k, seg=3)
    gbox('pad', (0.054, 0.11, 0.02), (0, -0.012, -0.44), 'rubber', R, k, bevel=0.003); gbox('cheek', (0.044, 0.03, 0.12), (0, 0.045, -0.33), 'gD', R, k, bevel=0.005)
    gcyl('hguard', 0.03, 0.3, (0, 0.03, 0.36), 'gun3', R, k, 'z', 8)
    for i in range(5):
        for s in (1, -1): gbox('vent%d_%d' % (i, s), (0.004, 0.016, 0.026), (s * 0.029, 0.028, 0.27 + i * 0.045), 'gDk', R, k)
    rail('hrail', 0.25, 0.5, 0.064, 'gDk', R, k, w=0.03)
    prof('fgrip', rrect_pts(0.33, -0.02, 0.06, 0.05, 0.45), 0.03, 'gDk', 0.006, R, k, seg=3)
    gcyl('barrel', 0.0115, 0.22, (0, 0.028, 0.6), 'gDk', R, k, 'z', 14); gbox('gasblock', (0.03, 0.04, 0.03), (0, 0.045, 0.52), 'gDk', R, k, bevel=0.003)
    gcyl('brake', 0.017, 0.06, (0, 0.028, 0.71), 'gun2', R, k, 'z', 12); gcyl('bore', 0.006, 0.004, (0, 0.028, 0.741), 'bore', R, k, 'z', 10)
    gbox('fspost', (0.008, 0.04, 0.008), (0, 0.085, 0.515), 'gDk', R, k)
    for s in (1, -1): gbox('fsear%d' % s, (0.004, 0.028, 0.014), (s * 0.012, 0.085, 0.515), 'gDk', R, k)
    # the open red-dot sight: the frame and the dot stay exactly where the game aims through them
    gbox('rd_base', (0.034, 0.018, 0.07), (0, 0.092, 0.02), 'gDk', R, k, bevel=0.003)
    gbox('rd_bot', (0.04, 0.007, 0.045), (0, 0.1015, 0.02), 'gDk', R, k, bevel=0.002); gbox('rd_top', (0.04, 0.007, 0.045), (0, 0.1385, 0.02), 'gDk', R, k, bevel=0.002)
    for s in (1, -1): gbox('rd_side%d' % s, (0.006, 0.04, 0.045), (s * 0.017, 0.12, 0.02), 'gDk', R, k, bevel=0.002)
    gbox('rd_dot', (0.003, 0.003, 0.002), (0, 0.12, 0.04), 'reddot', R, k)
    return R

def build_knife():
    k = 'knife'; R = root_for(k)
    prof('blade', [(0.075, 0.012), (0.2, 0.013), (0.255, 0.008), (0.3, -0.006), (0.255, -0.02), (0.15, -0.022), (0.075, -0.02)], 0.004, 'blade', 0.0018, R, k, seg=2, smooth=True)
    gbox('fuller', (0.0045, 0.006, 0.14), (0, 0.003, 0.15), 'steel2', R, k)
    gbox('guard', (0.05, 0.012, 0.022), (0, -0.004, 0.072), 'gun2', R, k, bevel=0.003)
    gbox('handle', (0.032, 0.042, 0.12), (0, -0.004, 0.005), 'gD', R, k, bevel=0.008, seg=3)
    for i in range(4): gbox('groove%d' % i, (0.034, 0.004, 0.008), (0, 0.0, -0.035 + i * 0.025), 'gDk', R, k)
    gbox('pommel', (0.036, 0.044, 0.016), (0, -0.004, -0.062), 'steel2', R, k, bevel=0.004)
    return R

BUILDERS = {'rifle': build_rifle, 'pistol': build_pistol, 'revolver': build_revolver, 'smg': build_smg, 'pump': build_pump, 'carbine': build_carbine,
            'dmr': build_dmr, 'auto': build_auto, 'sniper': build_sniper, 'lmg': build_lmg, 'gl': build_gl, 'knife': build_knife}

def build_guns(keys=None):
    for k in (keys or BUILDERS): BUILDERS[k]()
    return GUN

def export_guns(path):
    """Every gun into one file, each as its own part, in its own root's frame."""
    depsgraph = bpy.context.evaluated_depsgraph_get(); buckets = {}
    for key, root in GUN.items():
        root_inv = root.matrix_world.inverted()
        for ob in root.children:
            if ob.type != 'MESH': continue
            r = eval_tris(ob, depsgraph, root_inv)
            if r is None: continue
            co, tri, tm, uv = r
            for i in range(len(tri)): buckets.setdefault(key, []).append((co[tri[i]], tm[i], None))
    return write_fcm(buckets, path)
