# Car details: lights, grille, plates, panel lines, handles, mirrors, exhausts, interior, wheels — and the exporter.
import bpy, bmesh, math, struct, json, os
import numpy as np
from mathutils import Vector, Matrix

def rrect(cx, cy, w, h, r, n=4, skew=0.0):   # rounded rectangle outline (2D), skew shifts the top edge sideways
    pts = []; r = min(r, w / 2, h / 2)
    for ci, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a0 = ci * math.pi / 2
        for i in range(n + 1):
            a = a0 + (math.pi / 2) * i / n
            x = cx + sx * (w / 2 - r) + r * math.cos(a); y = cy + sy * (h / 2 - r) + r * math.sin(a)
            pts.append((x + skew * (y - cy) / h, y))
    return pts

def patch(name, pts2, plane, at, S, parent, matname, offset=0.004, cuts=2, target=None, near=None):
    """A flat shape (pts2 in the plane's 2D coords) pressed onto the body: plane 'z' = front/rear faces (2D = x,y; at = z side ±1),
    'x' = sides (2D = z,y; at = ±1), 'y' = top (2D = x,z). Shrinkwrap projects it along that axis onto the body."""
    bm = bmesh.new(); vs = []
    for p in pts2:
        if plane == 'z': g = (p[0], p[1], near if near is not None else at * (S.H + 0.3))
        elif plane == 'x': g = (near if near is not None else at * (S.w / 2 + 0.3), p[1], p[0])
        else: g = (p[0], near if near is not None else S.Ht + 0.3, p[1])
        vs.append(bm.verts.new(V(*g)))
    f = bm.faces.new(vs)
    if cuts:
        bmesh.ops.poke(bm, faces=[f])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for fc in bm.faces: fc.material_index = MIDX[matname]; fc.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [M(k) for k in MNAMES], parent)
    md = ob.modifiers.new('wrap', 'SHRINKWRAP'); md.target = target; md.offset = offset
    if near is not None: md.wrap_method = 'NEAREST_SURFACEPOINT'
    else:
        md.wrap_method = 'PROJECT'; md.use_negative_direction = True; md.use_positive_direction = True
        if plane == 'z': md.use_project_y = True
        elif plane == 'x': md.use_project_x = True
        else: md.use_project_z = True
    ob['fc_part'] = 'body'
    return ob

def strip(name, pts2, width, plane, at, S, parent, matname, target, offset=0.003):
    """A thin line (a polyline in the plane's 2D coords) pressed onto the body — panel gaps and trim lines."""
    bm = bmesh.new(); rings = []
    for i, p in enumerate(pts2):
        a = pts2[max(0, i - 1)]; b = pts2[min(len(pts2) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1; nx, ny = -dy / l * width / 2, dx / l * width / 2
        ring = []
        for s in (-1, 1):
            q = (p[0] + s * nx, p[1] + s * ny)
            if plane == 'z': g = (q[0], q[1], at * (S.H + 0.3))
            elif plane == 'x': g = (at * (S.w / 2 + 0.3), q[1], q[0])
            else: g = (q[0], S.Ht + 0.3, q[1])
            ring.append(bm.verts.new(V(*g)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        f = bm.faces.new((rings[i][0], rings[i][1], rings[i + 1][1], rings[i + 1][0])); f.material_index = MIDX[matname]; f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [M(k) for k in MNAMES], parent)
    md = ob.modifiers.new('wrap', 'SHRINKWRAP'); md.wrap_method = 'PROJECT'; md.target = target; md.offset = offset
    md.use_negative_direction = True; md.use_positive_direction = True
    if plane == 'z': md.use_project_y = True
    elif plane == 'x': md.use_project_x = True
    else: md.use_project_z = True
    ob['fc_part'] = 'body'
    return ob

def box(name, size, pos, parent, matname, bevel=0.0, rot=(0, 0, 0), part='body', seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[2], v.co.z * size[1]))   # size given in game (w, h, d)
    for f in bm.faces: f.material_index = MIDX[matname]; f.smooth = bevel > 0
    ob = new_obj(name, bm, [M(k) for k in MNAMES], parent)
    ob.location = V(*pos); ob.rotation_euler = (rot[0], -rot[2], rot[1])
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'NONE'
    ob['fc_part'] = part
    return ob

def cyl(name, r, length, pos, parent, matname, axis='z', seg=16, part='body', r2=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length)
    for v in bm.verts:   # built along blender z; turn to the game axis asked for
        c = v.co
        if axis == 'z': v.co = Vector((c.x, -c.z, c.y))      # game z (forward) = blender -y
        elif axis == 'x': v.co = Vector((c.z, c.y, c.x))
        else: v.co = Vector((c.x, c.y, c.z))                  # game y (up) = blender z
    for f in bm.faces: f.material_index = MIDX[matname]; f.smooth = True
    ob = new_obj(name, bm, [M(k) for k in MNAMES], parent); ob.location = V(*pos); ob['fc_part'] = part
    return ob

def side_x(S, f, y):   # where the body side is at this height (from the section), for things bolted onto the side
    P, k = S.section(f); pts = P[1:6]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        if a[1] <= y <= b[1]: return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) if b[1] > a[1] else a[0]
    return pts[-1][0] if y > pts[-1][1] else pts[0][0]

def add_details(S, root, body):
    t = S.t; st = S.st; w = S.w; H = S.H; y0 = S.ybot(0.5); Ht = S.Ht
    yn = S.Y(st['front'][0][1]); hz = S.Z(st['front'][1][0])
    big = STY_OF[t['key']] in ('suv', 'pickup', 'van'); lh = 0.13 if not big else 0.16
    hy = yn - 0.03 - lh / 2      # the lamp sits just under the bonnet's leading edge, on the nose, never folding onto the bonnet
    rf = [p for p in st['rear'] if p[0] >= 0.99]; yt = S.Y(max(p[1] for p in rf)); ty = yt - 0.06; tz = -H
    sporty = STY_OF[t['key']] in ('fast', 'super', 'muscle'); big = STY_OF[t['key']] in ('suv', 'pickup', 'van')
    nose_bot = S.ybot(0.0); nose_top = S.ytop(0.0)
    # headlights: a swept lens that wraps round the corner, in a dark housing, with a bright running-light strip along its base
    fh = next((f for f in np.linspace(0, 0.08, 81) if S.ytop(f) >= hy), 0.04); hwh = S.hw(fh); zh = S.Z(fh)       # the nose at headlight height
    ft = next((f for f in np.linspace(1, 0.92, 81) if S.ytop(f) >= ty), 0.96); hwt = S.hw(ft); zt = S.Z(ft)         # the tail at tail-light height
    for s in (1, -1):
        lw = 0.56 if not big else 0.42; cx = s * (hwh + 0.1 - lw / 2); sk = s * (-0.1 if not big else -0.02)
        patch('hl_house%d' % s, rrect(cx, hy, lw + 0.02, lh + 0.02, 0.035, 3, skew=sk), 'z', 1, S, root, 'lensdark', 0.002, 3, body, near=zh + 0.04)
        ob = patch('hl_lens%d' % s, rrect(cx, hy, lw, lh, 0.03, 3, skew=sk), 'z', 1, S, root, 'lens', 0.0045, 3, body, near=zh + 0.04); ob['fc_part'] = 'lamp'; ob['fc_lamp'] = 'head'
        patch('hl_drl%d' % s, rrect(cx, hy - lh / 2 + 0.014, lw - 0.08, 0.012, 0.005, 2, skew=sk), 'z', 1, S, root, 'white', 0.006, 2, body, near=zh + 0.04)
        for o in (-0.12, 0.04):
            cyl('hl_proj%d_%d' % (s, int(o * 100)), 0.028, 0.012, (cx - s * (lw / 2 - 0.2) + o, hy + 0.01, S.Z(fh + 0.004)), root, 'chrome', 'z', 14)
        # tail lights: a dark lens with a bright bar and an amber section, wrapping onto the sides, and the bar across the boot
        tw = 0.5 if not big else 0.3; th = 0.11 if not big else 0.3; tcx = s * (hwt + 0.08 - tw / 2)
        patch('tl_house%d' % s, rrect(tcx, ty, tw + 0.02, th + 0.02, 0.03, 3), 'z', -1, S, root, 'taildark', 0.002, 3, body, near=zt - 0.04)
        ob = patch('tl_lens%d' % s, rrect(tcx, ty, tw, th, 0.025, 3), 'z', -1, S, root, 'tail', 0.0045, 3, body, near=zt - 0.04); ob['fc_part'] = 'lamp'; ob['fc_lamp'] = 'tail'
        patch('tl_amber%d' % s, rrect(tcx + s * (tw / 2 - 0.09), ty - th * 0.2, 0.1, th * 0.4, 0.01, 2), 'z', -1, S, root, 'amber', 0.006, 2, body, near=zt - 0.04)
        patch('tl_rev%d' % s, rrect(tcx - s * (tw / 2 - 0.07), ty - th * 0.2, 0.08, th * 0.35, 0.01, 2), 'z', -1, S, root, 'white', 0.006, 2, body, near=zt - 0.04)
    if not big:
        patch('tl_bar', rrect(0, ty + 0.01, w * 0.5, 0.018, 0.005, 2), 'z', -1, S, root, 'tail', 0.004, 1, body)
    # the grille: a dark panel between the lights with chrome slats and a badge, the lower intake, number plates
    gy = hy - 0.02 if not big else hy; gh = 0.09 if not big else 0.22; gw_ = w * 0.42 if not big else w * 0.5
    patch('grille_rim', rrect(0, gy, gw_ + 0.03, gh + 0.03, 0.03, 3), 'z', 1, S, root, 'chrome', 0.003, 2, body)
    patch('grille', rrect(0, gy, gw_, gh, 0.025, 3), 'z', 1, S, root, 'black', 0.005, 2, body)
    nslat = 3 if not big else 5
    for i in range(nslat):
        yy = gy - gh / 2 + gh * (i + 0.5) / nslat
        ob = patch('slat%d' % i, rrect(0, yy, gw_ - 0.04, 0.008, 0.003, 1), 'z', 1, S, root, 'chrome', 0.008, 1, body); ob['fc_part'] = 'det'
    ob = cyl('badge', 0.036, 0.01, (0, gy, S.H + 0.0), root, 'chrome', 'z', 16); ob['fc_part'] = 'det'
    iy = nose_bot + (nose_top - nose_bot) * 0.45; ih = (nose_top - nose_bot) * 0.42
    patch('intake', rrect(0, iy, w * 0.6, ih, 0.04, 3), 'z', 1, S, root, 'black', 0.003, 2, body)
    for yy in (-0.3, 0, 0.3):
        ob = patch('intake_slat%d' % int(yy * 10), rrect(0, iy + yy * ih, w * 0.56, 0.007, 0.003, 1), 'z', 1, S, root, 'dark', 0.006, 1, body); ob['fc_part'] = 'det'
    for s in (1, -1):   # fog lights
        patch('fog%d' % s, rrect(s * w * 0.36, iy - ih * 0.05, 0.11, 0.06, 0.02, 2), 'z', 1, S, root, 'black', 0.004, 1, body)
        ob = cyl('fogl%d' % s, 0.024, 0.01, (s * w * 0.36, iy - ih * 0.05, S.H), root, 'lens', 'z', 12); ob['fc_part'] = 'det'
    patch('plate_f', rrect(0, iy, 0.5, 0.11, 0.01, 1), 'z', 1, S, root, 'plate', 0.012, 1, body)
    ob = patch('plate_fb', rrect(-0.2, iy, 0.07, 0.1, 0.005, 1), 'z', 1, S, root, 'plateblue', 0.0135, 1, body); ob['fc_part'] = 'det'
    py = max(y0 + 0.25, ty - 0.28) if not big else ty - th / 2 - 0.12
    patch('plate_rh', rrect(0, py, 0.56, 0.15, 0.015, 1), 'z', -1, S, root, 'black', 0.003, 1, body)
    patch('plate_r', rrect(0, py, 0.5, 0.11, 0.01, 1), 'z', -1, S, root, 'plate', 0.012, 1, body)
    ob = patch('plate_rb', rrect(0.2, py, 0.07, 0.1, 0.005, 1), 'z', -1, S, root, 'plateblue', 0.0135, 1, body); ob['fc_part'] = 'det'
    ob = cyl('badge_r', 0.03, 0.01, (0, py + 0.16, -S.H), root, 'chrome', 'z', 16); ob['fc_part'] = 'det'
    # the lower bumper trims: a dark diffuser at the back, a dark lip under the nose
    rb = S.ybot(1.0); patch('diffuser', rrect(0, rb + 0.06, w * 0.76, 0.08, 0.02, 2), 'z', -1, S, root, 'black', 0.003, 2, body)
    patch('lip', rrect(0, nose_bot + 0.045, w * 0.8, 0.05, 0.02, 2), 'z', 1, S, root, 'black', 0.003, 2, body)
    # panel gaps: the bonnet line down each wing, the doors, the boot; the plastic cowl under the windscreen
    for s in (1, -1):
        fx = [(s * (S.hw(f) - 0.09), S.Z(f)) for f in np.linspace(S.gs - 0.012, 0.045, 10)]
        strip('bonnet%d' % s, fx, 0.007, 'y', 1, S, root, 'under', body, 0.0025)
        doors = [S.Z(f) for f in st['doors']]
        for i, z in enumerate(doors):
            strip('door%d_%d' % (s, i), [(z, S.ybot(0.5) + 0.06), (z, S.ytop(st['doors'][i]) - 0.005)], 0.007, 'x', s, S, root, 'under', body, 0.0025)
        for i in range(len(doors) - 1):   # door handles, near the rear edge of each door
            z = doors[i + 1] + 0.2; yy = S.ytop(st['doors'][i + 1]) - 0.11
            box('handle%d_%d' % (s, i), (0.016, 0.028, 0.13), (s * (side_x(S, st['doors'][i + 1], yy) + 0.004), yy, z), root, 'chrome', 0.006, part='det')
            box('handlec%d_%d' % (s, i), (0.012, 0.012, 0.1), (s * (side_x(S, st['doors'][i + 1], yy) + 0.0), yy - 0.016, z), root, 'under', 0.004, part='det')
        # side indicator, fuel flap (right rear wing)
        box('ind%d' % s, (0.006, 0.022, 0.06), (s * (side_x(S, st['doors'][0] - 0.07, S.ytop(st['doors'][0]) - 0.1) + 0.002), S.ytop(st['doors'][0]) - 0.1, S.Z(st['doors'][0] - 0.07)), root, 'amber', 0.003, part='det')
    if not S.bed and not S.cargo:
        fz = S.Z(min(0.9, st['doors'][-1] + 0.06)); fy = S.ytop(st['doors'][-1] + 0.06) - 0.14
        strip('fuel', [(fz - 0.065, fy - 0.065), (fz + 0.065, fy - 0.065), (fz + 0.065, fy + 0.065), (fz - 0.065, fy + 0.065), (fz - 0.065, fy - 0.065)], 0.005, 'x', 1, S, root, 'under', body, 0.0025)
    if not S.cargo:
        strip('cowl', [(-S.gw / 2 - 0.02, S.Z(S.gs) + 0.03), (S.gw / 2 + 0.02, S.Z(S.gs) + 0.03)], 0.055, 'y', 1, S, root, 'under', body, 0.002)
    # mirrors on the A pillars: a stalk, a rounded cap, the glass behind
    for s in (1, -1):
        fm = S.gs + 0.025; ym = S.ytop(S.gs) + 0.07; xm = side_x(S, fm, min(ym, S.ytop(S.gs) - 0.02)); zm = S.Z(fm)
        box('mstalk%d' % s, (0.08, 0.035, 0.07), (s * (xm + 0.01), ym - 0.01, zm), root, 'under', 0.008, part='body')
        box('mcap%d' % s, (0.12, 0.085, 0.2), (s * (xm + 0.1), ym + 0.03, zm - 0.03), root, 'paint', 0.03, part='body', seg=4)
        box('mglass%d' % s, (0.1, 0.07, 0.01), (s * (xm + 0.1), ym + 0.03, zm - 0.135), root, 'mirror', 0.0, part='body')
    # a shark-fin aerial, wipers parked on the cowl
    if not S.cargo and not S.bed:
        box('fin', (0.05, 0.05, 0.16), (0, S.Ht + 0.015, S.Z(S.roofR) - 0.15), root, 'under', 0.018, part='det', seg=3)
    for s in (1, -1):
        ob = box('wiper%d' % s, (0.5, 0.012, 0.02), (s * 0.24, S.ytop(S.gs) + 0.03, S.Z(S.gs) + 0.1), root, 'under', 0.004, rot=(0, s * 0.1, 0), part='det')
    # exhausts
    ex = [-w * 0.3, w * 0.3] if sporty else [w * 0.3]
    for i, x in enumerate(ex):
        for o in ([-0.06, 0.06] if sporty else [0]):
            cyl('exh%d_%d' % (i, int(o * 100)), 0.036, 0.12, (x + o, S.ybot(0.99) + 0.07, -S.H + 0.04), root, 'chrome', 'z', 14)
            ob = cyl('exhi%d_%d' % (i, int(o * 100)), 0.027, 0.124, (x + o, S.ybot(0.99) + 0.07, -S.H + 0.04), root, 'black', 'z', 12); ob['fc_part'] = 'det'
    # inside: a dashboard, steering wheel, seats
    yb = S.ytop(S.gs); dz = S.Z(S.gs) - 0.3
    box('dash', (S.gw - 0.1, 0.14, 0.34), (0, yb + 0.0, dz), root, 'interior', 0.03, part='det')
    box('dash2', (S.gw - 0.2, 0.03, 0.05), (0, yb + 0.085, dz - 0.12), root, 'dark', 0.008, part='det')
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=18, radius1=0.16, radius2=0.16, depth=0.03)
    for f in bm.faces: f.material_index = MIDX['black']; f.smooth = True
    ob = new_obj('swheel', bm, [M(k) for k in MNAMES], root); ob['fc_part'] = 'det'
    ob.location = V(0.4, yb + 0.16, dz - 0.3); ob.rotation_euler = (math.radians(-70), 0, 0)
    md = ob.modifiers.new('sol', 'SOLIDIFY'); md.thickness = 0.03
    for s in (1, -1):
        box('seat%d' % s, (0.48, 0.14, 0.5), (s * 0.4, yb - 0.3, t['cz'] - 0.2), root, 'seat', 0.04, part='det')
        box('seatb%d' % s, (0.48, 0.62, 0.12), (s * 0.4, yb - 0.02, t['cz'] - 0.45), root, 'seat', 0.04, part='det')
        box('seath%d' % s, (0.26, 0.16, 0.1), (s * 0.4, yb + 0.37, t['cz'] - 0.47), root, 'seat', 0.03, part='det')
    if st['bp'] is not None:
        box('bench', (S.gw - 0.2, 0.55, 0.12), (0, yb - 0.05, t['cz'] - 1.1), root, 'seat', 0.04, part='det')
        box('benchs', (S.gw - 0.2, 0.14, 0.5), (0, yb - 0.3, t['cz'] - 0.9), root, 'seat', 0.04, part='det')
    box('console', (0.24, 0.2, 0.7), (0, yb - 0.22, t['cz'] - 0.1), root, 'interior', 0.02, part='det')
    # wreck and trim: the lower body trim line along the rockers
    for s in (1, -1):
        strip('rocker%d' % s, [(S.Z(st['doors'][0]) + 0.1, S.ybot(0.5) + 0.03), (S.Z(st['doors'][-1]) - 0.2, S.ybot(0.5) + 0.03)], 0.05, 'x', s, S, root, 'black', body, 0.002)
    if t.get('spoiler'):
        fsp = max(S.ge + 0.03, 0.945); ysp = S.ytop(fsp)
        box('spoiler', (w * 0.86, 0.035, 0.26), (0, ysp + 0.13, S.Z(fsp)), root, 'paint', 0.012, part='body')
        for s in (1, -1): box('spost%d' % s, (0.05, 0.12, 0.08), (s * 0.5, ysp + 0.06, S.Z(fsp) + 0.02), root, 'black', 0.008, part='body')
    if t.get('scoop'):
        z = S.Z(0.2); box('scoop', (0.5, 0.09, 0.7), (0, S.ytop(0.2) + 0.03, z), root, 'black', 0.025, part='body')
    if t.get('vents'):
        for s in (1, -1): patch('vent%d' % s, rrect(-S.L * 0.32 + S.R + 0.42, S.ybot(0.5) + (S.ytop(0.5) - S.ybot(0.5)) * 0.5, 0.55, 0.14, 0.04, 3), 'x', s, S, root, 'black', 0.004, 2, body)
    if t.get('police'):
        rz = S.Z((S.roofF + S.roofR) / 2); ry = S.Ht
        box('bar', (w * 0.84, 0.05, 0.3), (0, ry + 0.035, rz), root, 'bar', 0.012, part='body')
        box('barfoot1', (0.06, 0.05, 0.1), (w * 0.3, ry + 0.01, rz), root, 'bar', 0.0, part='body')
        box('barfoot2', (0.06, 0.05, 0.1), (-w * 0.3, ry + 0.01, rz), root, 'bar', 0.0, part='body')
        box('barmid', (0.2, 0.09, 0.26), (0, ry + 0.105, rz), root, 'lamp', 0.012, part='body')
        for s in (1, -1):
            box('antenna%d' % s, (0.01, 0.55 if s > 0 else 0.45, 0.01), (s * 0.22, ry + 0.3, rz - 0.7), root, 'black', 0.0, part='det')
        # push bar at the nose
        for s in (1, -1):
            cyl('push%d' % s, 0.018, nose_top - nose_bot + 0.1, (s * 0.32, (nose_top + nose_bot) / 2, S.H + 0.12), root, 'black', 'y', 10)
            cyl('pushb%d' % s, 0.018, 0.2, (s * 0.32, nose_bot + 0.1, S.H + 0.03), root, 'black', 'z', 10)
        cyl('pushx', 0.016, 0.72, (0, nose_top - 0.06, S.H + 0.12), root, 'black', 'x', 10)
        cyl('pushx2', 0.016, 0.72, (0, nose_bot + 0.1, S.H + 0.12), root, 'black', 'x', 10)
        box('spot', (0.1, 0.1, 0.07), (-S.gw / 2 - 0.0, S.ytop(S.gs) + 0.12, S.Z(S.gs) - 0.05), root, 'black', 0.02, part='det')

def add_decals(S, root, body):
    """The livery panels down each side (the game paints the police/taxi texture on them): a grid pressed onto the body,
    with texture coordinates laid out exactly as the game's liveryMat draws them. Points over the wheel arches are tucked inside."""
    t = S.t; H = S.H; zA = H - 0.3; zB = -H + 0.26; yb = S.Y(S.st['glass'][0][1]); y0 = S.Y(S.st['rock']); yT = yb - 0.075; yB = y0 + 0.1
    nz, ny = 48, 8; R = S.R + 0.035
    for sd in (1, -1):
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new('uv'); grid = []; keep = []
        for i in range(nz + 1):
            row = []
            for j in range(ny + 1):
                z = zB + (zA - zB) * i / nz; y = yB + (yT - yB) * j / ny
                hole = any(math.hypot(z - sz * t['l'] * 0.32, y - t['wr']) < R for sz in (1, -1)) or y > S.ytop((H - z) / S.L) - 0.03
                v = bm.verts.new(V(sd * (t['w'] / 2 - 0.1) if hole else sd * (t['w'] / 2 + 0.3), y, z)); row.append(v)
                if not hole: keep.append(len(bm.verts) - 1)
            grid.append(row)
        bm.verts.ensure_lookup_table(); bm.verts.index_update()
        for i in range(nz):
            for j in range(ny):
                q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
                f = bm.faces.new(tuple(reversed(q)) if sd > 0 else q); f.material_index = MIDX['white']; f.smooth = True   # faces turned outwards
                for lp in f.loops:
                    co = lp.vert.co; z = -co.y; y = co.z
                    lp[uvl].uv = ((zA - z) / (zA - zB) if sd > 0 else (z - zB) / (zA - zB), (y - yB) / (yT - yB))
        ob = new_obj('decal%s' % ('R' if sd > 0 else 'L'), bm, [M(k) for k in MNAMES], root); ob['fc_part'] = 'decalR' if sd > 0 else 'decalL'
        vg = ob.vertex_groups.new(name='wrap'); vg.add(keep, 1.0, 'REPLACE')
        md = ob.modifiers.new('wrap', 'SHRINKWRAP'); md.wrap_method = 'PROJECT'; md.target = body; md.offset = 0.006; md.vertex_group = 'wrap'
        md.use_project_x = True; md.use_negative_direction = sd > 0; md.use_positive_direction = sd < 0

# ---------------------------------------------------------------- wheels (unit radius; the game scales them to each car)
def build_wheel(name='wheel'):
    bm = bmesh.new(); W = 0.24
    # the tyre: a profile revolved round the axle (x), with a shallow tread groove pattern
    prof = [(-W / 2, 0.68), (-W / 2 + 0.01, 0.74), (-W / 2 + 0.03, 0.9), (-W / 2 + 0.02, 0.985), (-W / 2 + 0.05, 1.0), (W / 2 - 0.05, 1.0), (W / 2 - 0.02, 0.985), (W / 2 - 0.03, 0.9), (W / 2 - 0.01, 0.74), (W / 2, 0.68)]
    rings = []; n = 36
    for i in range(n):
        a = 2 * math.pi * i / n; ring = []
        for j, (x, r) in enumerate(prof):
            rr = r
            if j in (4, 5) and (i % 3 == 0): rr = 0.985
            ring.append(bm.verts.new(Vector((x, rr * math.cos(a), rr * math.sin(a)))))
        rings.append(ring)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(len(prof) - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j])); f.material_index = MIDX['tyre']; f.smooth = True
    # the rim: a dished face with ten twin spokes, a centre cap and lug nuts, the barrel behind
    rim_r = 0.7; dish = W / 2 - 0.02
    face_ring = [bm.verts.new(Vector((dish, rim_r * math.cos(2 * math.pi * i / n), rim_r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    inner_ring = [bm.verts.new(Vector((dish - 0.03, (rim_r - 0.08) * math.cos(2 * math.pi * i / n), (rim_r - 0.08) * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    back_ring = [bm.verts.new(Vector((-dish, rim_r * math.cos(2 * math.pi * i / n), rim_r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    for i in range(n):
        f = bm.faces.new((rings[i][0], rings[(i + 1) % n][0], face_ring[(i + 1) % n], face_ring[i])); f.material_index = MIDX['rim']; f.smooth = True
        f = bm.faces.new((face_ring[i], face_ring[(i + 1) % n], inner_ring[(i + 1) % n], inner_ring[i])); f.material_index = MIDX['rim']; f.smooth = True
        f = bm.faces.new((rings[i][-1], back_ring[i], back_ring[(i + 1) % n], rings[(i + 1) % n][-1])); f.material_index = MIDX['rimdark']; f.smooth = True
        f = bm.faces.new((back_ring[i], inner_ring[i], inner_ring[(i + 1) % n], back_ring[(i + 1) % n])); f.material_index = MIDX['hub']; f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [M(k) for k in MNAMES]); ob['fc_part'] = 'wheel'
    # spokes and hub as bevelled boxes/cylinders joined later by the exporter
    parts = [ob]
    for k in range(5):
        a = k * 2 * math.pi / 5
        for o in (-0.055, 0.055):
            b = box('spoke%d_%d' % (k, int(o * 1000)), (0.05, 0.56, 0.06), (dish - 0.045, 0, 0), None, 'rim', 0.012, part='wheel')
            b.location = Vector((dish - 0.045, math.cos(a) * 0.33 - math.sin(a) * o, math.sin(a) * 0.33 + math.cos(a) * o))
            b.rotation_euler = (a + math.pi / 2, 0, 0)
            b.parent = ob; parts.append(b)
    hub = cyl('hub', 0.2, 0.05, (0, 0, 0), ob, 'rim', 'x', 18, part='wheel'); hub.location = Vector((dish - 0.03, 0, 0))
    cap = cyl('cap', 0.09, 0.02, (0, 0, 0), ob, 'chrome', 'x', 16, part='wheel'); cap.location = Vector((dish - 0.0, 0, 0))
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        nut = cyl('nut%d' % k, 0.025, 0.02, (0, 0, 0), ob, 'chrome', 'x', 6, part='wheel'); nut.location = Vector((dish - 0.0, math.cos(a) * 0.14, math.sin(a) * 0.14))
    disc = cyl('disc', 0.6, 0.03, (0, 0, 0), ob, 'rimdark', 'x', 24, part='wheel'); disc.location = Vector((dish - 0.14, 0, 0))
    return ob

# ---------------------------------------------------------------- exporter
def eval_tris(ob, depsgraph, root_inv):
    """Triangles of the evaluated object (modifiers applied) in the root's frame, with material names."""
    ev = ob.evaluated_get(depsgraph); me = ev.to_mesh()
    if me is None or len(me.polygons) == 0:
        ev.to_mesh_clear(); return None
    try: me.calc_loop_triangles()
    except Exception: pass
    mw = root_inv @ ob.matrix_world
    nv = len(me.vertices); co = np.empty(nv * 3, dtype=np.float64); me.vertices.foreach_get('co', co); co = co.reshape(nv, 3)
    co4 = np.c_[co, np.ones(nv)]; co = (co4 @ np.array(mw).T)[:, :3]
    nt = len(me.loop_triangles); tri = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', tri); tri = tri.reshape(nt, 3)
    pidx = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('polygon_index', pidx)
    npoly = len(me.polygons); pm = np.empty(npoly, dtype=np.int64); me.polygons.foreach_get('material_index', pm)
    mats = [m['fc'] if m and 'fc' in m else 'paint' for m in me.materials] or ['paint']
    tm = [mats[min(pm[p], len(mats) - 1)] for p in pidx]
    uv = None
    if me.uv_layers.active:
        nl = len(me.loops); uvd = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uvd); uvd = uvd.reshape(nl, 2)
        lp = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', lp); uv = uvd[lp.reshape(nt, 3)]
    ev.to_mesh_clear()
    return co, tri, tm, uv

def to_game(co):   # blender (x, y, z) -> game (x, z, -y)
    return np.c_[co[:, 0], co[:, 2], -co[:, 1]]

def smooth_normals(P, deg=32.0):
    """P: (n,3,3) triangle corners. Per-corner normals averaged over faces that share the position and are within deg degrees."""
    n = P.shape[0]
    fn = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); l = np.linalg.norm(fn, axis=1); l[l == 0] = 1; fn /= l[:, None]
    key = np.round(P.reshape(-1, 3) * 2000).astype(np.int64)
    k1 = key[:, 0] * 73856093 ^ key[:, 1] * 19349663 ^ key[:, 2] * 83492791
    order = np.argsort(k1, kind='stable'); ks = k1[order]
    cs = math.cos(math.radians(deg)); out = np.empty((n * 3, 3))
    fnc = np.repeat(fn, 3, axis=0)
    starts = np.r_[0, np.flatnonzero(np.diff(ks)) + 1, len(ks)]
    for s, e in zip(starts[:-1], starts[1:]):
        idx = order[s:e]; N = fnc[idx]
        d = N @ N.T; m = (d >= cs).astype(np.float64)
        out[idx] = m @ N
    l = np.linalg.norm(out, axis=1); l[l == 0] = 1
    return out / l[:, None]

def export_car(root, path, parts_wanted=('body', 'glass', 'det', 'lamp', 'wheel', 'decal')):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    root_inv = root.matrix_world.inverted()
    buckets = {}
    def walk(ob):
        yield ob
        for c in ob.children: yield from walk(c)
    for ob in walk(root):
        if ob.type != 'MESH' or ob.hide_render: continue
        r = eval_tris(ob, depsgraph, root_inv)
        if r is None: continue
        co, tri, tm, uv = r
        part = ob.get('fc_part', 'body')
        for i in range(len(tri)):
            mname = tm[i]; p = part
            if mname == 'glass' and part == 'body': p = 'glass'
            buckets.setdefault(p, []).append((co[tri[i]], mname, uv[i] if uv is not None else None))
    body = next((ob for ob in walk(root) if ob.type == 'MESH' and any(m.type == 'SUBSURF' for m in ob.modifiers)), None)
    if body is not None:
        sub = next(m for m in body.modifiers if m.type == 'SUBSURF'); lv = sub.levels
        for level, part, only_body in ((1, 'mid', False), (0, 'lo', True)):
            sub.levels = level; bpy.context.view_layer.update(); depsgraph = bpy.context.evaluated_depsgraph_get()
            for ob in walk(root):
                if ob.type != 'MESH' or ob.hide_render: continue
                if only_body and ob is not body: continue
                if not only_body and ob.get('fc_part', 'body') != 'body': continue
                r = eval_tris(ob, depsgraph, root_inv)
                if r is None: continue
                co, tri, tm, uv = r
                for i in range(len(tri)):
                    if tm[i] == 'glass' and not only_body: continue
                    buckets.setdefault(part, []).append((co[tri[i]], tm[i], None))
        sub.levels = lv; bpy.context.view_layer.update()
    return write_fcm(buckets, path)

def write_fcm(buckets, path):
    out = {}; blobs = []
    for p, items in buckets.items():
        P = to_game(np.array([it[0] for it in items]).reshape(-1, 3)).reshape(-1, 3, 3)
        # export winding: blender's is counter-clockwise in a right-handed frame; our axis swap keeps handedness, keep order
        cols = np.array([hexrgb(COLORS[it[1]]) for it in items]); cols = np.repeat(cols, 3, axis=0)
        N = smooth_normals(P)
        pos = P.reshape(-1, 3).astype(np.float32)
        has_uv = items[0][2] is not None
        uvs = np.array([it[2] for it in items]).reshape(-1, 2) if has_uv else np.zeros((len(pos), 2))
        # weld identical corners (same position, normal, colour) into shared vertices
        key = np.c_[np.round(pos * 5000), np.round(N * 100), np.round(cols * 255), np.round(uvs * 4000)]
        _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
        inv = inv.reshape(-1)
        vpos = pos[first]; vn = N[first]; vc = cols[first]; vu = uvs[first]
        blob = bytearray()
        o_pos = len(blob); blob += vpos.astype('<f4').tobytes()
        o_nor = len(blob); blob += np.clip(np.round(vn * 127), -127, 127).astype(np.int8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_col = len(blob); blob += np.clip(np.round(vc * 255), 0, 255).astype(np.uint8).tobytes()
        while len(blob) % 4: blob += b'\0'
        o_uv = len(blob)
        if has_uv: blob += vu.astype('<f4').tobytes()
        o_idx = len(blob); big = len(vpos) > 65000
        blob += (inv.astype('<u4') if big else inv.astype('<u2')).tobytes()
        while len(blob) % 4: blob += b'\0'
        out[p] = dict(v=int(len(vpos)), i=int(len(inv)), po=o_pos, no=o_nor, co=o_col, io=o_idx, i32=big, **({'uo': o_uv} if has_uv else {}))
        blobs.append(bytes(blob))
    # offsets become absolute
    hdr = {'parts': {}}; off = 0
    for (p, meta), blob in zip(out.items(), blobs):
        meta = dict(meta); meta.update(po=meta['po'] + off, no=meta['no'] + off, co=meta['co'] + off, io=meta['io'] + off)
        if 'uo' in meta: meta['uo'] += off
        hdr['parts'][p] = meta; off += len(blob)
    hj = json.dumps(hdr).encode(); pad = (4 - (8 + len(hj)) % 4) % 4
    with open(path, 'wb') as f:
        f.write(b'FCM1'); f.write(struct.pack('<I', len(hj) + pad)); f.write(hj + b' ' * pad)
        for b in blobs: f.write(b)
    return {p: (m['v'], m['i'] // 3) for p, m in hdr['parts'].items()}
