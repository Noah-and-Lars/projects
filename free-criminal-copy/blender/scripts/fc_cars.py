# Free Criminal cars, built in Blender from the game's own car sizes and traced side outlines.
# Game frame: x right, y up, z forward (nose at +z). Blender frame: x right, y back (nose at -y), z up.
import bpy, bmesh, json, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else FC_ROOT
DATA = json.load(open(os.path.join(ROOT, 'cardata.json')))
CT, CSTY, STY_OF = DATA['CT'], DATA['CSTY'], DATA['STY_OF']
CT['taxi'] = dict(CT['sedan'], taxi=1); CT['police'] = dict(CT['sedan'], police=1)
CSTY['suv']['front'] = [[0.04, 0.6], [0.012, 0.575], [0, 0.52], [0, 0.3], [0.015, 0.22], [0.045, 0.16]]
CSTY['pickup']['front'] = [[0.035, 0.6], [0.01, 0.575], [0, 0.52], [0, 0.3], [0.015, 0.2], [0.04, 0.14]]
CSTY['van']['front'] = [[0.05, 0.5], [0.015, 0.475], [0, 0.43], [0, 0.25], [0.015, 0.16], [0.04, 0.11]]

def V(x, y, z):  # game -> blender
    return Vector((x, -z, y))

def cr_smooth(p, k):
    if len(p) < 3: return list(p)
    o = []
    for i in range(len(p) - 1):
        a, b, c, d = p[max(0, i - 1)], p[i], p[i + 1], p[min(len(p) - 1, i + 2)]
        o.append(b)
        for j in range(1, k + 1):
            t = j / (k + 1); t2 = t * t; t3 = t2 * t
            o.append([0.5 * ((2 * b[q]) + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t3) for q in range(2)])
    o.append(p[-1]); return o

def interp(poly, f):  # poly sorted by f ascending; linear
    if f <= poly[0][0]: return poly[0][1]
    if f >= poly[-1][0]: return poly[-1][1]
    for i in range(len(poly) - 1):
        a, b = poly[i], poly[i + 1]
        if a[0] <= f <= b[0]:
            if b[0] - a[0] < 1e-9: return b[1]
            return a[1] + (b[1] - a[1]) * (f - a[0]) / (b[0] - a[0])
    return poly[-1][1]

# ---------------------------------------------------------------- materials
MATS = {}
def mat(name, rgb, metal=0.0, rough=0.4, alpha=1.0, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.get('fc_' + name) or bpy.data.materials.new('fc_' + name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else m.surface_render_method
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    m['fc'] = name
    MATS[name] = m; return m

def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

# the exporter writes these colours as vertex colours; 'paint' is a marker the game swaps for the car's colour
COLORS = {'paint': '#ff00ff', 'under': '#141516', 'trim': '#1b1c1e', 'black': '#0e0f10', 'chrome': '#d7dadd', 'dark': '#26282b',
          'lens': '#eef3f7', 'lensdark': '#20262c', 'tail': '#c0141b', 'taildark': '#5a0a0e', 'amber': '#ffb347', 'plate': '#ecebe6', 'plateblue': '#22324e',
          'mirror': '#9aa7b2', 'interior': '#2a2b2e', 'seat': '#3a3b3f', 'tyre': '#161616', 'rim': '#c6cacf', 'rimdark': '#7d8186', 'hub': '#3a3d41', 'glass': '#0a1016',
          'white': '#f0f1f2', 'taxi': '#f07a1c', 'red': '#c3171b', 'blue': '#1d4fa3', 'bar': '#1a1b1d', 'lamp': '#dfe6ee',
          # guns
          'gD': '#1b1c1e', 'gP': '#26282b', 'gM': '#34383c', 'gDk': '#121314', 'gun2': '#2a2b2d', 'gun3': '#2f3133', 'steel': '#b4b8bd', 'steel2': '#9ea3a8',
          'wood': '#6e4425', 'wood2': '#5a361c', 'od': '#4b4f3a', 'od2': '#3c4030', 'tan': '#8f7f5c', 'trig': '#0d0d0d', 'reddot': '#ff2020', 'scopeglass': '#2b5c7a',
          'brass': '#c9a25a', 'blade': '#cfd4d9', 'bore': '#0a0a0a', 'bead': '#d8d0b0', 'rubber': '#141414', 'mag': '#2b2a24', 'grey': '#7c8086'}
def M(name):
    rgb = hexrgb(COLORS[name])
    if name == 'paint': return mat(name, (0.12, 0.3, 0.62), 0.35, 0.22)
    if name == 'chrome' or name == 'rim': return mat(name, rgb, 1.0, 0.12)
    if name == 'glass': return mat(name, rgb, 0.0, 0.05, 0.85)
    if name in ('lens', 'lamp'): return mat(name, rgb, 0.0, 0.1, 1.0, 0.3)
    if name == 'tail': return mat(name, rgb, 0.0, 0.1, 1.0, 0.3)
    if name == 'mirror': return mat(name, rgb, 1.0, 0.05)
    if name in ('steel', 'steel2', 'blade', 'brass', 'grey'): return mat(name, rgb, 1.0, 0.3)
    if name in ('gD', 'gP', 'gM', 'gDk', 'gun2', 'gun3', 'od', 'od2'): return mat(name, rgb, 0.4, 0.45)
    return mat(name, rgb, 0.0, 0.5)

def new_obj(name, bm, mats, parent=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if parent: ob.parent = parent
    return ob

# ---------------------------------------------------------------- the car's outline
class Shape:
    def __init__(self, t):
        self.t = t; st = CSTY[STY_OF[t['key']]]; self.st = st
        L = t['l']; self.L = L; self.H = L / 2; self.w = t['w']; self.Ht = t['ht']; self.wr = t['wr']; self.R = t['wr'] + 0.07
        K = 2
        fr = st['front']; re = st['rear']
        im = [i for i, p in enumerate(fr) if p[0] == min(q[0] for q in fr)]
        self.front_up = cr_smooth(list(reversed(fr[:im[0] + 1])), K); self.front_lo = cr_smooth(fr[im[-1]:], K)
        im = [i for i, p in enumerate(re) if p[0] == max(q[0] for q in re)]
        self.rear_lo = cr_smooth(re[:im[0] + 1], K); self.rear_up = cr_smooth(re[im[-1]:], K)
        steps = bool(st.get('bed') or st.get('cargo'))
        top = list(reversed(st['top'])); self.top = top if steps else cr_smooth(top, K)
        self.topline = self.front_up + self.top + self.rear_up                       # the body top, nose to tail
        rock = st['rock']
        self.botline = self.front_lo + [[self.front_lo[-1][0] + 0.03, rock], [self.rear_lo[0][0] - 0.03, rock]] + self.rear_lo
        self.glass = cr_smooth(st['glass'], K); self.n0 = len(st['glass']); self.gi = lambda i: i * (K + 1)
        self.gs = self.glass[0][0]; self.ge = self.glass[-1][0]
        self.roofF = self.glass[self.gi(3)][0]; self.roofR = self.glass[self.gi(self.n0 - 4)][0]
        self.gw = self.w - 0.15 if not st.get('cargo') else self.w * 0.97 - 0.24 - 0.02
        self.bp = st['bp']; self.doors = st['doors']; self.cw = st['cw']
        self.bed = st.get('bed'); self.cargo = st.get('cargo')
    def Y(self, v): return v * self.Ht
    def Z(self, f): return self.H - f * self.L
    def ytop(self, f): return self.Y(interp(self.topline, f))
    def ybot(self, f): return self.Y(interp(self.botline, f))
    def yglass(self, f): return self.Y(interp(self.glass, f)) if self.gs <= f <= self.ge else None
    def hw(self, f):   # half width in plan: the game's taper towards both ends, then round corners at the bumpers
        z = abs(self.Z(f)); H = self.H; k = 1
        e = (z - H * 0.62) / (H * 0.38)
        if e > 0: k -= 0.07 * e * e
        hw = self.w / 2 * k
        d = min(f, 1 - f) * self.L; rc = 0.2 if (self.cargo or self.bed) else 0.3
        if d < rc: hw = hw - rc + math.sqrt(max(0, rc * rc - (rc - d) ** 2))
        return hw
    def kind(self, f):
        if self.cargo and f >= self.cargo[0][0] - 1e-6: return 'cargo'
        if self.bed and f >= self.bed[0] - 1e-6: return 'bed'
        g = self.yglass(f)
        if g is not None and g > self.ytop(f) + 0.012: return 'glass'
        return 'hood'
    def stations(self):
        L = self.L; fs = set()
        for d in (0, 0.012, 0.035, 0.07, 0.12, 0.19, 0.28, 0.4): fs.add(d / L); fs.add(1 - d / L)
        n = int(L / 0.1); fs.update(i / n for i in range(n + 1))
        fs.update([self.gs, self.gs + 0.004, self.roofF, self.roofR, self.ge - 0.004, self.ge])
        for f in self.doors: fs.update([f - 0.012, f + 0.012])
        if self.bp is not None: fs.update([self.bp - 0.03, self.bp + 0.03])
        if self.bed: fs.update([self.bed[0] - 0.004, self.bed[0], self.bed[1]])
        if self.cargo: fs.update([self.cargo[0][0] - 0.004, self.cargo[0][0]])
        fs = sorted(f for f in fs if 0 <= f <= 1); out = []
        for f in fs:
            if not out or f - out[-1] > 0.007: out.append(f)
            elif f == 1: out[-1] = 1
        return out
    def section(self, f):  # the right half, floor centre to roof centre, 11 points (game x, y)
        yb = self.ybot(f); yt = self.ytop(f); hw = self.hw(f); k = self.kind(f); gw = self.gw / 2
        belt = yt
        if k == 'glass':   # the sill rises gently from the cowl to the deck, never below the body top
            belt = max(yt, self.ytop(self.gs) + (self.ytop(self.ge) - self.ytop(self.gs)) * (f - self.gs) / (self.ge - self.gs)); yt = self.yglass(f)
        if k == 'bed': belt = self.Y(self.bed[3]); yt = belt
        if k == 'cargo': yt = self.Y(1.0); belt = self.Y(self.cargo[0][1])
        hb = max(0.06, belt - yb)
        P = [(0, yb), (hw - 0.11, yb), (hw - 0.05, yb + min(0.07, hb * 0.3)), (hw - 0.008, yb + hb * 0.42), (hw + 0.016, belt - hb * 0.3), (hw - 0.02, belt)]
        if k == 'glass':
            h = yt - belt; tp = 0.12 if self.cargo else 0.34
            P += [(gw + 0.012, belt + 0.01), (gw, belt + 0.025 + h * 0.03), (gw - tp * h * 0.86, belt + h * 0.88), (gw - tp * h - 0.05, yt), (0, yt + 0.012)]
        elif k == 'bed':
            fl = self.Y(self.bed[2])
            P += [(hw - 0.035, belt + 0.01), (hw - 0.1, belt + 0.012), (hw - 0.11, fl + 0.02), (hw * 0.55, fl), (0, fl)]
        elif k == 'cargo':
            P += [(hw - 0.02, belt + 0.03), (hw - 0.012, yt - 0.3), (hw - 0.05, yt - 0.07), (hw - 0.2, yt), (0, yt + 0.012)]
        else:
            P += [(hw - 0.055, yt - 0.004), (hw - 0.12, yt), (hw * 0.62, yt + 0.006), (hw * 0.3, yt + 0.011), (0, yt + 0.013)]
        return P, k

# ---------------------------------------------------------------- body
def build_body(S, name):
    fs = S.stations(); loops = []; kinds = []
    bm = bmesh.new(); cl = bm.edges.layers.float.new('crease_edge')
    for f in fs:
        P, k = S.section(f); z = S.Z(f); kinds.append(k)
        vs = [bm.verts.new(V(x, y, z)) for x, y in P]
        vs += [bm.verts.new(V(-x, y, z)) for x, y in reversed(P[1:-1])]
        loops.append(vs)
    bm.verts.ensure_lookup_table()
    NJ = 10
    def idx(j): return j if j <= NJ else j
    def L(j): return j if j in (0, NJ) else 20 - j
    faces = []
    gs, ge, roofF, roofR, bp, cw, doors = S.gs, S.ge, S.roofF, S.roofR, S.bp, S.cw, S.doors
    sg_end = ge - cw
    def side_glass(f):
        if not (gs + 0.01 <= f <= sg_end): return False
        if bp is not None and abs(f - bp) < 0.03: return False
        return True
    def material(i, j, side):
        fa, fb = fs[i], fs[i + 1]; ka, kb = kinds[i], kinds[i + 1]; fm = (fa + fb) / 2
        if j == 0: return 'under'
        if ka == 'bed' and kb == 'bed':
            return 'paint' if j <= 7 else 'under'
        if ka == 'glass' and kb == 'glass':
            if j == 9: return 'glass' if (fm < roofF or fm > roofR) else 'paint'
            if j == 7: return 'glass' if side_glass(fm) else ('black' if (bp is not None and abs(fm - bp) < 0.03) else 'paint')
            if j == 8: return 'glass' if (roofF + 0.02 < fm < sg_end - 0.02 and side_glass(fm) and not S.cargo) else 'paint'
        return 'paint'
    for i in range(len(loops) - 1):
        a, b = loops[i], loops[i + 1]
        for j in range(NJ):
            for side in (1, -1):
                if side > 0: q = (a[j], a[j + 1], b[j + 1], b[j])
                else: q = (a[L(j)], b[L(j)], b[L(j + 1)], a[L(j + 1)])
                try: fc = bm.faces.new(q)
                except ValueError: continue
                fc.material_index = MIDX[material(i, j, side)]; fc.smooth = True
    # end caps: bands across the loop from the floor up (a tailgate stops at the top of the bed walls)
    for vs, kd, flip in ((loops[0], kinds[0], True), (loops[-1], kinds[-1], False)):
        top = 6 if kd == 'bed' else NJ - 1
        for j in range(top + 1):
            q = (vs[j], vs[j + 1], vs[L(j + 1)], vs[L(j)])
            if q[2] is q[1] or q[3] is q[0]: q = (vs[j], vs[j + 1], vs[L(j)]) if q[2] is q[1] else (vs[j], vs[j + 1], vs[L(j + 1)])
            try:
                fc = bm.faces.new(tuple(reversed(q)) if flip else q); fc.material_index = MIDX['paint']; fc.smooth = True
            except ValueError: pass
    # creases: the shoulder line, the floor edge, the window sill, the cowl and deck lines, the bed walls
    for i in range(len(loops) - 1):
        a, b = loops[i], loops[i + 1]
        gl = kinds[i] == 'glass' and kinds[i + 1] == 'glass'
        for j, c in ((5, 0.7), (1, 0.5), (6, 0.6 if gl else 0), (9, 0.45 if gl and S.roofF < fs[i] and fs[i + 1] < S.roofR else 0)):
            if c <= 0: continue
            for jj in (j, L(j)):
                e = bm.edges.get((a[jj], b[jj]))
                if e: e[cl] = c
        if kinds[i] == 'bed' and kinds[i + 1] == 'bed':
            for jj in (6, 7, 8, L(6), L(7), L(8)):
                e = bm.edges.get((a[jj], b[jj]))
                if e: e[cl] = 0.9
    for i in range(len(loops)):
        k0 = kinds[i - 1] if i > 0 else None; k1 = kinds[i + 1] if i + 1 < len(loops) else None
        edge_c = 0
        if (k0 == 'hood' and kinds[i] == 'glass') or (kinds[i] == 'glass' and k1 == 'hood') or (kinds[i] == 'glass' and k1 in ('bed', 'cargo')): edge_c = 0.7
        if i == 0 or i == len(loops) - 1: edge_c = 0.35
        if edge_c:
            vs = loops[i]
            for j in range(len(vs)):
                if edge_c == 0.7 and not (6 <= j <= 14): continue
                e = bm.edges.get((vs[j], vs[(j + 1) % len(vs)]))
                if e: e[cl] = max(e[cl], edge_c)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [M(k) for k in MNAMES])
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    return ob

MNAMES = ['paint', 'under', 'trim', 'black', 'chrome', 'dark', 'lens', 'lensdark', 'tail', 'taildark', 'amber', 'plate', 'plateblue', 'mirror', 'interior', 'seat', 'glass', 'white', 'taxi', 'red', 'blue', 'bar', 'lamp', 'tyre', 'rim', 'rimdark', 'hub',
          'gD', 'gP', 'gM', 'gDk', 'gun2', 'gun3', 'steel', 'steel2', 'wood', 'wood2', 'od', 'od2', 'tan', 'trig', 'reddot', 'scopeglass', 'brass', 'blade', 'bore', 'bead', 'rubber', 'mag', 'grey']
MIDX = {k: i for i, k in enumerate(MNAMES)}

def cut_arches(ob, S):
    t = S.t; R = S.R + 0.015
    for sx in (1, -1):
        for sz in (1, -1):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=R, radius2=R, depth=0.62)
            for v in bm.verts: v.co = Vector((v.co.z, v.co.y, v.co.x))   # along x
            cyl = new_obj('arch', bm, [])
            cyl.location = V(sx * (t['w'] / 2 - 0.22), t['wr'] + 0.012, sz * t['l'] * 0.32)
            cyl.display_type = 'WIRE'; cyl.hide_render = True; cyl.hide_set(True)
            md = ob.modifiers.new('arch', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cyl; md.solver = 'EXACT'
            cyl.parent = ob

def wheel_wells(S, parent):
    t = S.t; R = S.R + 0.02; parts = []
    bm = bmesh.new()
    for sx in (1, -1):
        for sz in (1, -1):
            x0 = sx * (t['w'] / 2 - 0.5); x1 = sx * (t['w'] / 2 + 0.02); zc = sz * t['l'] * 0.32
            ring = []
            n = 18
            for k in range(2):
                xx = x0 if k == 0 else x1
                ring.append([bm.verts.new(V(xx, t['wr'] + R * math.sin(a), zc + R * math.cos(a))) for a in [-0.35 + (math.pi + 0.7) * i / n for i in range(n + 1)]])
            for i in range(n):
                f = bm.faces.new((ring[0][i], ring[0][i + 1], ring[1][i + 1], ring[1][i])); f.material_index = MIDX['under']; f.smooth = True
            cap = bm.faces.new(ring[0] + [bm.verts.new(V(x0, t['wr'] - 0.15, zc + R * math.cos(-0.35))), bm.verts.new(V(x0, t['wr'] - 0.15, zc - R * math.cos(0.35)))]) if False else None
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj('wells', bm, [M(k) for k in MNAMES], parent)

def clear_scene():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0: bpy.data.meshes.remove(me)

def build_car(key):
    t = dict(CT[key]); t['key'] = key; S = Shape(t)
    root = bpy.data.objects.new(key, None); bpy.context.scene.collection.objects.link(root)
    body = build_body(S, key + '_body'); body.parent = root
    cut_arches(body, S)
    wheel_wells(S, root)
    add_details(S, root, body)
    if key in ('sedan', 'police', 'taxi'): add_decals(S, root, body)
    return root, S, body
