// The Yard: block editor for building vehicles.
import * as THREE from 'three';
import { OrbitCam } from './orbit';
import { pickGrid, placementAnchor, type Pick } from './pick';
import { h, toast, modal } from '../ui/dom';
import { VehicleGrid, partCells, mirrorPlacement, mirrorCellX, type PartInstance } from '../sim-core/grid';
import { History, placeCmd, removeCmd, paintCmd, propCmd, type Command } from '../sim-core/history';
import { PARTS, partDef, CATEGORY_LABELS, CELL, type Category, type PartDef } from '../sim-core/parts';
import { PALETTE, PALETTE_NAMES, DEFAULT_COLOR } from '../sim-core/palette';
import { rotateAbout } from '../sim-core/rotations';
import { validate, type Issue } from '../sim-core/validator';
import { budget, PART_LIMIT, COST_LIMIT } from '../sim-core/budget';
import { assemble } from '../sim-core/assembly';
import { keyToCell } from '../sim-core/grid';
import { serialize, deserialize, encodeFile, decodeFile, VehicleFileError, type VehicleFile } from '../sim-core/vehicle-format';
import { buildVehicleMesh, buildPartGhost, type VehicleMesh } from '../render/vehicle-mesh';
import { Lights } from '../render/world-view';
import { PRESETS } from '../sim-core/presets';
import { saveVehicle, listVehicles, deleteVehicle, loadVehicle, AUTOSAVE } from '../storage/db';

type Tool = 'place' | 'erase' | 'paint' | 'pick' | 'inspect';
const TOOL_INFO: Record<Tool, { label: string; key: string; hint: string }> = {
  place: { label: 'Place', key: 'B', hint: 'Click a face or the floor to add the part.' },
  erase: { label: 'Erase', key: 'X', hint: 'Click a part to remove it.' },
  paint: { label: 'Paint', key: 'P', hint: 'Click a part to paint it with the swatch.' },
  pick: { label: 'Eyedrop', key: 'K', hint: 'Click a part to copy its type and colour.' },
  inspect: { label: 'Inspect', key: 'V', hint: 'Click a part to edit its settings.' },
};

function chartPaperTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4efe3';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(42,91,215,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  g.strokeStyle = 'rgba(27,42,74,0.45)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Yard {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  grid = new VehicleGrid();
  history = new History(this.grid);
  name = 'Runabout';
  createdAt = Date.now();
  tool: Tool = 'place';
  partType = 'plate';
  rot = 0;
  color = DEFAULT_COLOR;
  mirror = true;
  mirrorPlane = 0;
  showCom = true;
  showHull = false;
  private hullOverlay = new THREE.Group();
  selected: number | null = null;
  issues: Issue[] = [];
  root: HTMLElement;
  onTest: (file: VehicleFile) => void = () => {};

  private orbit: OrbitCam;
  private vmesh: VehicleMesh | null = null;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private hover: Pick | null = null;
  private hoverBox: THREE.LineSegments;
  private mirrorMesh: THREE.Mesh;
  private comMarker: THREE.Group;
  private flash: THREE.Group = new THREE.Group();
  private flashUntil = 0;
  private raycaster = new THREE.Raycaster();
  private dirty = true;
  private autosaveTimer = 0;
  private els: Record<string, HTMLElement> = {};
  private category: Category = 'structure';
  private search = '';
  active = false;

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.scene.background = new THREE.Color('#e9e2d1');
    this.scene.fog = new THREE.Fog('#e9e2d1', 40, 120);
    new Lights(this.scene, 14).follow(new THREE.Vector3(0, 0, 0));
    const floorTex = chartPaperTexture();
    floorTex.repeat.set(100, 100);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Bow arrow on the floor: vehicles face −Z.
    const arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.35, 0), new THREE.Vector2(0.35, 0), new THREE.Vector2(0.35, 0.8), new THREE.Vector2(0.7, 0.8), new THREE.Vector2(0, 1.6), new THREE.Vector2(-0.7, 0.8), new THREE.Vector2(-0.35, 0.8)])),
      new THREE.MeshBasicMaterial({ color: '#f26a21', transparent: true, opacity: 0.8 }),
    );
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.003, -5);
    this.scene.add(arrow);

    this.hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#f26a21', depthTest: false, transparent: true }));
    this.hoverBox.renderOrder = 10;
    this.scene.add(this.hoverBox);
    this.mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#2a5bd7', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    this.mirrorMesh.rotation.y = Math.PI / 2;
    this.scene.add(this.mirrorMesh);
    this.comMarker = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: '#d7263d', depthTest: false }));
    ball.renderOrder = 11;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), new THREE.MeshBasicMaterial({ color: '#1b2a4a', depthTest: false }));
    ring.renderOrder = 11;
    this.comMarker.add(ball, ring);
    this.scene.add(this.comMarker, this.flash, this.hullOverlay);

    this.orbit = new OrbitCam(this.camera, canvas);
    this.orbit.onHover = (x, y) => this.updateHover(x, y);
    this.orbit.onTap = (x, y, e) => { this.updateHover(x, y); this.act(e); };

    this.root = h('div', { class: 'yard-ui' });
    overlay.append(this.root);
    this.buildUI();
    window.addEventListener('keydown', this.onKey);
  }

  // ---------- lifecycle ----------
  async loadInitial() {
    try {
      const saved = await loadVehicle(AUTOSAVE);
      if (saved) { this.loadFile(saved.file, false); return; }
    } catch { /* no storage */ }
    this.setGrid(PRESETS[0].build(), 'Runabout');
  }

  show() { this.active = true; this.root.style.display = ''; this.dirty = true; }
  hide() { this.active = false; this.root.style.display = 'none'; }

  setGrid(g: VehicleGrid, name: string, createdAt = Date.now()) {
    this.grid = g;
    this.history.reset(g);
    this.name = name;
    this.createdAt = createdAt;
    this.selected = null;
    (this.els.name as HTMLInputElement).value = name;
    this.changed(false);
    this.frame();
  }

  loadFile(raw: unknown, notify = true) {
    try {
      const r = deserialize(raw);
      this.setGrid(r.grid, r.name, r.createdAt);
      if (notify) toast(r.warnings.length ? `Loaded with ${r.warnings.length} warning(s): ${r.warnings[0]}` : `Loaded “${r.name}”`, r.warnings.length ? 'warn' : 'info');
    } catch (e) {
      toast(e instanceof VehicleFileError ? e.message : 'Could not read that vehicle file', 'error');
    }
  }

  file(): VehicleFile { return serialize(this.grid, this.name, this.createdAt); }

  run(cmd: Command) {
    this.history.run(cmd);
    this.changed();
  }

  changed(autosave = true) {
    this.dirty = true;
    this.issues = validate(this.grid);
    this.renderIssues();
    this.renderBudget();
    this.renderInspector();
    if (autosave) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = window.setTimeout(() => {
        saveVehicle({ name: AUTOSAVE, file: this.file(), updatedAt: Date.now() }).catch(() => {});
      }, 800);
    }
  }

  frame() {
    const b = this.grid.bounds();
    if (!b) { this.orbit.target.set(0, 0.5, 0); this.orbit.dist = 8; return; }
    const c = [(b[0][0] + b[1][0] + 1) / 2, (b[0][1] + b[1][1] + 1) / 2, (b[0][2] + b[1][2] + 1) / 2].map((v) => v * CELL);
    const size = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) * CELL + 1;
    this.orbit.target.set(c[0], c[1], c[2]);
    this.orbit.dist = Math.max(4, size * 1.9);
  }

  // ---------- 3D interaction ----------
  private updateHover(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    this.hover = pickGrid(this.grid, [o.x, o.y, o.z], [d.x, d.y, d.z]);
    this.updateGhost();
  }

  private placementFor(pick: Pick) {
    const pos = placementAnchor(this.partType, this.rot, pick);
    const ok = this.grid.canPlace(this.partType, pos, this.rot);
    return { pos, ok };
  }

  private updateGhost() {
    const p = this.hover;
    const showPlace = this.tool === 'place' && p;
    if (this.ghost && (!showPlace || this.ghostKey !== `${this.partType}/${this.rot}/${this.color}`)) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
    this.hoverBox.visible = false;
    if (!p) return;
    if (showPlace) {
      const key = `${this.partType}/${this.rot}/${this.color}`;
      if (!this.ghost) { this.ghost = buildPartGhost(this.partType, this.rot, this.color); this.ghostKey = key; this.scene.add(this.ghost); }
      const { pos, ok } = this.placementFor(p);
      this.ghost.position.set(pos[0] * CELL, pos[1] * CELL, pos[2] * CELL);
      this.ghost.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
        if (m && 'emissive' in m) m.emissive.set(ok ? '#000000' : '#c0182c');
      });
      this.ghost.visible = true;
      this.boxAround(partCells({ type: this.partType, pos, rot: this.rot }), ok ? '#f26a21' : '#d7263d');
    } else if (p.partId !== null) {
      const part = this.grid.parts.get(p.partId)!;
      this.boxAround(partCells(part), this.tool === 'erase' ? '#d7263d' : '#f26a21');
    }
  }

  private boxAround(cells: [number, number, number][], color: string) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const c of cells) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], c[i]); mx[i] = Math.max(mx[i], c[i] + 1); }
    this.hoverBox.position.set(((mn[0] + mx[0]) / 2) * CELL, ((mn[1] + mx[1]) / 2) * CELL, ((mn[2] + mx[2]) / 2) * CELL);
    this.hoverBox.scale.set((mx[0] - mn[0]) * CELL + 0.01, (mx[1] - mn[1]) * CELL + 0.01, (mx[2] - mn[2]) * CELL + 0.01);
    (this.hoverBox.material as THREE.LineBasicMaterial).color.set(color);
    this.hoverBox.visible = true;
  }

  /** The mirror partner of a placed part, if one exists. */
  private partner(p: PartInstance): PartInstance | undefined {
    if (!this.mirror) return undefined;
    const m = mirrorPlacement(p, this.mirrorPlane);
    if (!m) return undefined;
    const q = this.grid.partAt(m.pos[0], m.pos[1], m.pos[2]);
    if (!q || q.id === p.id || q.type !== p.type) return undefined;
    const qc = partCells(q).map((c) => c.join()).sort().join('|');
    const mc = partCells({ type: p.type, ...m }).map((c) => c.join()).sort().join('|');
    return qc === mc ? q : undefined;
  }

  private act(e: PointerEvent) {
    const p = this.hover;
    if (!p) return;
    const tool: Tool = e.button === 2 ? 'erase' : e.altKey ? 'pick' : this.tool;
    const part = p.partId !== null ? this.grid.parts.get(p.partId)! : undefined;
    if (tool === 'place') {
      const { pos, ok } = this.placementFor(p);
      if (!ok) { toast('No room there', 'warn'); return; }
      if (this.grid.size >= PART_LIMIT) { toast(`Part limit (${PART_LIMIT}) reached`, 'warn'); return; }
      const a = this.grid.make(this.partType, pos, this.rot, this.color);
      const list = [a];
      if (this.mirror) {
        const m = mirrorPlacement(a, this.mirrorPlane);
        if (m) {
          // Temporarily reserve a's cells when checking the mirror.
          this.grid.add(a);
          const ok2 = this.grid.canPlace(this.partType, m.pos, m.rot);
          this.grid.remove(a.id);
          if (ok2) list.push(this.grid.make(this.partType, m.pos, m.rot, this.color, a.props));
        }
      }
      this.run(placeCmd(list, list.length > 1 ? 'Place ×2' : 'Place'));
    } else if (!part) {
      return;
    } else if (tool === 'erase') {
      const list = [part];
      const q = this.partner(part);
      if (q) list.push(q);
      if (this.selected && list.some((x) => x.id === this.selected)) this.selected = null;
      this.run(removeCmd(list));
    } else if (tool === 'paint') {
      const list = [part];
      const q = this.partner(part);
      if (q) list.push(q);
      const ch = list.filter((x) => x.color !== this.color).map((x) => ({ id: x.id, from: x.color, to: this.color }));
      if (ch.length) this.run(paintCmd(ch));
    } else if (tool === 'pick') {
      this.partType = part.type;
      this.color = part.color;
      this.rot = part.rot;
      this.setTool('place');
      this.renderParts();
      this.renderSwatches();
    } else if (tool === 'inspect') {
      this.selected = part.id;
      this.renderInspector();
    }
    this.updateGhost();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod && k === 's') { e.preventDefault(); this.save(); return; }
    if (mod) return;
    const dir = e.shiftKey ? 3 : 1;
    switch (k) {
      case 'r': this.rot = rotateAbout(this.rot, 'y', dir); break;
      case 't': this.rot = rotateAbout(this.rot, 'x', dir); break;
      case 'y': this.rot = rotateAbout(this.rot, 'z', dir); break;
      case 'b': this.setTool('place'); break;
      case 'x': case 'delete': case 'backspace': this.setTool('erase'); break;
      case 'p': this.setTool('paint'); break;
      case 'k': this.setTool('pick'); break;
      case 'v': this.setTool('inspect'); break;
      case 'm': this.toggleMirror(); break;
      case '[': this.mirrorPlane--; this.dirty = true; break;
      case ']': this.mirrorPlane++; this.dirty = true; break;
      case 'f': this.frame(); break;
      case 'g': this.showCom = !this.showCom; this.dirty = true; break;
      case 'enter': this.test(); break;
      default: return;
    }
    e.preventDefault();
    this.renderInspector();
    this.updateGhost();
  };

  undo() { if (this.history.undo()) { this.changed(); toast('Undo'); } }
  redo() { if (this.history.redo()) { this.changed(); toast('Redo'); } }
  setTool(t: Tool) {
    this.tool = t;
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    this.renderInspector();
    this.updateGhost();
  }
  toggleMirror() {
    this.mirror = !this.mirror;
    this.els.mirrorBtn.classList.toggle('active', this.mirror);
    this.els.mirrorBtn.setAttribute('aria-pressed', String(this.mirror));
    this.dirty = true;
  }

  test() {
    const errors = this.issues.filter((i) => i.level === 'error');
    if (errors.length) {
      toast(errors[0].message, 'error');
      this.showIssue(errors[0]);
      return;
    }
    this.onTest(this.file());
  }

  // ---------- per-frame ----------
  resize(w: number, h: number) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  update(_dt: number) {
    this.orbit.update();
    if (this.dirty) {
      this.dirty = false;
      if (this.vmesh) { this.scene.remove(this.vmesh.group); this.vmesh.dispose(); }
      this.vmesh = buildVehicleMesh(this.grid);
      this.scene.add(this.vmesh.group);
      const b = this.grid.bounds();
      const span = b ? Math.max(b[1][1] + 2, 4) * CELL : 1;
      const len = b ? (b[1][2] - b[0][2] + 6) * CELL : 3;
      this.mirrorMesh.visible = this.mirror;
      this.mirrorMesh.scale.set(Math.max(len, 3), Math.max(span, 1.5), 1);
      this.mirrorMesh.position.set(this.mirrorPlane * CELL, Math.max(span, 1.5) / 2, b ? ((b[0][2] + b[1][2] + 1) / 2) * CELL : 0);
      const bud = budget(this.grid);
      this.comMarker.visible = this.showCom && this.grid.size > 0;
      this.comMarker.position.set(bud.com[0], bud.com[1], bud.com[2]);
      this.rebuildHullOverlay();
      this.updateGhost();
    }
    this.comMarker.quaternion.copy(this.camera.quaternion);
    if (this.flash.children.length && performance.now() > this.flashUntil) this.flash.clear();
    else this.flash.visible = Math.floor(performance.now() / 180) % 2 === 0;
  }

  /** Leak finder: sealed air (cobalt) and open-top air (lagoon) inside the hull. */
  private rebuildHullOverlay() {
    this.hullOverlay.children.forEach((c) => { (c as THREE.InstancedMesh).geometry.dispose(); ((c as THREE.InstancedMesh).material as THREE.Material).dispose(); });
    this.hullOverlay.clear();
    if (!this.showHull || !this.grid.size) return;
    const hull = assemble(this.grid).hull;
    const geo = new THREE.BoxGeometry(CELL * 0.8, CELL * 0.8, CELL * 0.8);
    const M = new THREE.Matrix4();
    for (const [cells, color] of [[hull.sealedCells, '#2a5bd7'], [hull.openCells, '#2fa39b']] as const) {
      if (!cells.length) continue;
      const im = new THREE.InstancedMesh(geo.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }), cells.length);
      cells.forEach((k, i) => { const c = keyToCell(k); im.setMatrixAt(i, M.makeTranslation((c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL, (c[2] + 0.5) * CELL)); });
      im.renderOrder = 5;
      this.hullOverlay.add(im);
    }
    geo.dispose();
  }

  // ---------- DOM ----------
  private buildUI() {
    const tools = (Object.keys(TOOL_INFO) as Tool[]).map((t) =>
      h('button', { class: 'tool' + (t === this.tool ? ' active' : ''), 'data-tool': t, title: `${TOOL_INFO[t].label} (${TOOL_INFO[t].key})`, onclick: () => this.setTool(t) },
        h('span', { class: 'glyph g-' + t }), h('span', {}, TOOL_INFO[t].label), h('kbd', {}, TOOL_INFO[t].key)));
    this.els.name = h('input', { class: 'name-input', value: this.name, maxlength: 48, 'aria-label': 'Vehicle name', onchange: (e: Event) => { this.name = (e.target as HTMLInputElement).value.trim() || 'Untitled'; this.changed(); } });
    this.els.mirrorBtn = h('button', { class: 'tool active', title: 'Mirror left/right (M). [ and ] move the plane.', 'aria-pressed': 'true', onclick: () => this.toggleMirror() }, h('span', { class: 'glyph g-mirror' }), h('span', {}, 'Mirror'), h('kbd', {}, 'M'));

    const top = h('header', { class: 'topbar sheet' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }), 'TIDEWRIGHT', h('small', {}, 'YARD')),
      this.els.name,
      h('nav', { class: 'modes', 'aria-label': 'Mode' },
        h('button', { class: 'mode active' }, 'Build'),
        h('button', { class: 'mode', disabled: true, title: 'Logic wiring arrives in a later phase' }, 'Wire'),
        h('button', { class: 'mode', disabled: true, title: 'Measuring tools arrive later' }, 'Measure'),
        h('button', { class: 'mode test', onclick: () => this.test(), title: 'Drive it on the island (Enter)' }, '▶ Test')),
      h('div', { class: 'top-actions' },
        h('button', { class: 'btn', onclick: () => this.undo(), title: 'Undo (Ctrl+Z)' }, '↶'),
        h('button', { class: 'btn', onclick: () => this.redo(), title: 'Redo (Ctrl+Y)' }, '↷'),
        h('button', { class: 'btn', onclick: () => this.newVehicle() }, 'New'),
        h('button', { class: 'btn', onclick: () => this.library() }, 'Fleet'),
        h('button', { class: 'btn primary', onclick: () => this.save() }, 'Save')));

    this.els.search = h('input', { class: 'search', placeholder: 'Search parts…', 'aria-label': 'Search parts', oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value.toLowerCase(); this.renderParts(); } });
    this.els.cats = h('div', { class: 'cats', role: 'tablist' });
    this.els.parts = h('div', { class: 'part-list' });
    const drawer = h('aside', { class: 'drawer sheet' }, h('div', { class: 'sheet-title' }, 'Parts'), this.els.search, this.els.cats, this.els.parts);

    this.els.toolbox = h('div', { class: 'toolbox' }, ...tools, this.els.mirrorBtn);
    this.els.inspector = h('div', { class: 'inspector-body' });
    this.els.swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Paint swatches' });
    this.els.issues = h('div', { class: 'issues' });
    const insp = h('aside', { class: 'inspector sheet' },
      h('div', { class: 'sheet-title' }, 'Inspector'), this.els.toolbox, this.els.inspector,
      h('div', { class: 'sheet-sub' }, 'Paint'), this.els.swatches,
      h('div', { class: 'sheet-sub' }, 'Checks'), this.els.issues);

    this.els.budget = h('footer', { class: 'budget sheet' });
    this.root.append(top, drawer, insp, this.els.budget);
    this.renderCats(); this.renderParts(); this.renderSwatches(); this.renderInspector();
  }

  private renderCats() {
    const cats = Object.keys(CATEGORY_LABELS) as Category[];
    this.els.cats.replaceChildren(...cats.map((c) =>
      h('button', { class: 'cat' + (c === this.category ? ' active' : ''), role: 'tab', 'aria-selected': String(c === this.category), onclick: () => { this.category = c; this.search = ''; (this.els.search as HTMLInputElement).value = ''; this.renderCats(); this.renderParts(); } }, CATEGORY_LABELS[c])));
  }

  private renderParts() {
    const list = PARTS.filter((p) => (this.search ? (p.name + ' ' + p.desc).toLowerCase().includes(this.search) : p.category === this.category));
    this.els.parts.replaceChildren(...list.map((p) => this.partButton(p)));
  }

  private partButton(p: PartDef) {
    return h('button', { class: 'part' + (p.id === this.partType ? ' active' : ''), title: p.desc, onclick: () => { this.partType = p.id; this.setTool('place'); this.renderParts(); } },
      h('span', { class: 'part-icon s-' + p.shape, style: { background: p.shape === 'wheel' ? '#2a2c31' : PALETTE[this.color] } }),
      h('span', { class: 'part-name' }, p.name),
      h('span', { class: 'part-meta' }, `${p.size.join('×')} · ${p.mass} kg · ¤${p.cost}`));
  }

  private renderSwatches() {
    this.els.swatches.replaceChildren(...PALETTE.map((c, i) =>
      h('button', { class: 'swatch' + (i === this.color ? ' active' : ''), role: 'radio', 'aria-checked': String(i === this.color), title: PALETTE_NAMES[i], 'aria-label': PALETTE_NAMES[i], style: { background: c }, onclick: () => { this.color = i; if (this.tool !== 'paint' && this.tool !== 'place') this.setTool('paint'); this.renderSwatches(); this.renderParts(); this.updateGhost(); } })));
  }

  private renderInspector() {
    const el = this.els.inspector;
    if (!el) return;
    const kids: (HTMLElement | string)[] = [];
    kids.push(h('p', { class: 'hint' }, TOOL_INFO[this.tool].hint));
    if (this.tool === 'place') {
      const def = partDef(this.partType);
      kids.push(h('div', { class: 'kv' }, h('b', {}, def.name), h('span', {}, def.desc)),
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'Rotate'),
          h('button', { class: 'btn sm', onclick: () => { this.rot = rotateAbout(this.rot, 'y'); this.updateGhost(); } }, 'R yaw'),
          h('button', { class: 'btn sm', onclick: () => { this.rot = rotateAbout(this.rot, 'x'); this.updateGhost(); } }, 'T pitch'),
          h('button', { class: 'btn sm', onclick: () => { this.rot = rotateAbout(this.rot, 'z'); this.updateGhost(); } }, 'Y roll')));
    }
    if (this.mirror) kids.push(h('p', { class: 'hint mono' }, `Mirror plane x = ${(this.mirrorPlane * CELL).toFixed(2)} m  ([ / ] to move)`));
    const sel = this.selected !== null ? this.grid.parts.get(this.selected) : undefined;
    if (this.tool === 'inspect' && sel) {
      const def = partDef(sel.type);
      kids.push(h('div', { class: 'kv' }, h('b', {}, def.name), h('span', {}, def.desc)));
      for (const pd of def.props ?? []) {
        const cur = sel.props[pd.key] ?? pd.default;
        const apply = (v: number | string | boolean) => {
          const targets = [sel];
          const q = this.partner(sel);
          if (q) targets.push(q);
          this.run(propCmd(targets.map((t) => ({ id: t.id, from: { ...t.props }, to: { ...t.props, [pd.key]: v } }))));
        };
        let input: HTMLElement;
        if (pd.kind === 'choice') input = h('select', { onchange: (e: Event) => apply((e.target as HTMLSelectElement).value) }, ...pd.options!.map((o) => h('option', { value: o, selected: o === cur }, o)));
        else if (pd.kind === 'bool') input = h('input', { type: 'checkbox', checked: !!cur, onchange: (e: Event) => apply((e.target as HTMLInputElement).checked) });
        else input = h('input', { type: 'range', min: pd.min, max: pd.max, step: pd.step, value: cur, onchange: (e: Event) => apply(Number((e.target as HTMLInputElement).value)) });
        kids.push(h('label', { class: 'row' }, h('span', { class: 'label' }, pd.label), input, pd.kind === 'number' ? h('span', { class: 'mono' }, Number(cur).toFixed(2)) : ''));
      }
      if (!def.props?.length) kids.push(h('p', { class: 'hint' }, 'This part has no settings.'));
    }
    el.replaceChildren(...kids);
  }

  private renderIssues() {
    const el = this.els.issues;
    if (!el) return;
    el.replaceChildren(...this.issues.map((i) =>
      h('div', { class: 'issue ' + i.level },
        h('span', { class: 'issue-glyph', 'aria-label': i.level }, i.level === 'error' ? '✕' : i.level === 'warning' ? '!' : 'i'),
        h('span', {}, i.message),
        i.parts.length ? h('button', { class: 'btn sm', onclick: () => this.showIssue(i) }, 'Show') : '')));
  }

  showIssue(i: Issue) {
    this.flash.clear();
    if (!i.parts.length) return;
    const mat = new THREE.LineBasicMaterial({ color: i.level === 'error' ? '#d7263d' : '#ffb000', depthTest: false });
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const id of i.parts) {
      const p = this.grid.parts.get(id);
      if (!p) continue;
      for (const c of partCells(p)) {
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], c[k]); mx[k] = Math.max(mx[k], c[k] + 1); }
        const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL, CELL, CELL)), mat);
        box.position.set((c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL, (c[2] + 0.5) * CELL);
        box.renderOrder = 12;
        this.flash.add(box);
      }
    }
    this.flashUntil = performance.now() + 3000;
    this.orbit.target.set(((mn[0] + mx[0]) / 2) * CELL, ((mn[1] + mx[1]) / 2) * CELL, ((mn[2] + mx[2]) / 2) * CELL);
  }

  private renderBudget() {
    const el = this.els.budget;
    if (!el) return;
    const b = budget(this.grid);
    const bar = (label: string, value: string, frac: number, title: string) =>
      h('div', { class: 'meter', title },
        h('span', { class: 'meter-label' }, label),
        h('span', { class: 'meter-value mono' }, value),
        h('span', { class: 'meter-bar' }, h('span', { class: 'meter-fill' + (frac > 1 ? ' over' : ''), style: { width: Math.min(100, frac * 100) + '%' } })));
    el.replaceChildren(
      bar('Parts', `${b.parts} / ${PART_LIMIT}`, b.parts / PART_LIMIT, 'Part count against the Yard limit'),
      bar('Cost', `¤${b.cost.toLocaleString()}`, b.cost / COST_LIMIT, `Build cost against a ¤${COST_LIMIT.toLocaleString()} budget`),
      bar('Mass', `${(b.mass / 1000).toFixed(2)} t`, b.mass / 6000, 'Total mass including full fuel'),
      bar('Power', `${b.powerKw.toFixed(0)} kW`, b.kwPerTonne / 120, `${b.kwPerTonne.toFixed(0)} kW per tonne`),
      bar('Fuel', `${b.fuel.toFixed(0)} L`, b.fuel / 200, 'Fuel capacity'),
      bar('Top speed', `${(b.topSpeed * 3.6).toFixed(0)} km/h`, b.topSpeed / 60, 'Estimated flat-road top speed'),
      this.floatMeter(),
      h('button', { class: 'meter com' + (this.showCom ? ' active' : ''), title: 'Toggle the centre-of-mass marker (G)', onclick: () => { this.showCom = !this.showCom; this.dirty = true; this.renderBudget(); } },
        h('span', { class: 'meter-label' }, 'CoM'), h('span', { class: 'meter-value mono' }, b.com.map((v) => v.toFixed(2)).join(' '))),
    );
  }

  private floatMeter() {
    const m = assemble(this.grid);
    const ratio = m.mass > 0 ? m.hull.maxBuoyancy / (m.mass * 9.81) : 0;
    return h('button', { class: 'meter com' + (this.showHull ? ' active' : ''), title: 'Reserve buoyancy: how many times its own weight the hull can float. Click to show sealed (cobalt) and open-top (lagoon) hull air.', onclick: () => { this.showHull = !this.showHull; this.dirty = true; this.renderBudget(); } },
      h('span', { class: 'meter-label' }, 'Float'), h('span', { class: 'meter-value mono' }, ratio ? `×${ratio.toFixed(1)}` : '—'),
      h('span', { class: 'meter-bar' }, h('span', { class: 'meter-fill' + (ratio < 1 ? ' over' : ''), style: { width: Math.min(100, (ratio / 4) * 100) + '%' } })));
  }

  // ---------- storage ----------
  private thumbnail(): string | undefined {
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      c.getContext('2d')!.drawImage(this.canvas, 0, 0, 160, 100);
      return c.toDataURL('image/png');
    } catch { return undefined; }
  }

  thumbRequest: (() => string | undefined) | null = null;

  async save() {
    try {
      await saveVehicle({ name: this.name, file: this.file(), updatedAt: Date.now(), thumb: this.thumbRequest?.() ?? this.thumbnail() });
      toast(`Saved “${this.name}” to your fleet`);
    } catch {
      toast('Saving needs browser storage; use Export instead', 'error');
    }
  }

  newVehicle() {
    modal('Start a new vehicle?', h('p', {}, 'Unsaved changes to the current vehicle will be lost (it stays in your fleet if you saved it).'), [
      { label: 'Cancel' },
      { label: 'Blank', onClick: () => this.setGrid(new VehicleGrid(), 'Untitled') },
      ...PRESETS.map((p) => ({ label: p.name, primary: true, onClick: () => this.setGrid(p.build(), p.name.split(' (')[0]) })),
    ]);
  }

  async library() {
    const list = h('div', { class: 'fleet' }, h('p', { class: 'hint' }, 'Loading…'));
    const fileInput = h('input', { type: 'file', accept: '.twv,.json', style: { display: 'none' } }) as HTMLInputElement;
    let close = () => {};
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try { this.loadFile(await decodeFile(new Uint8Array(await f.arrayBuffer()))); close(); } catch { toast('Could not read that file', 'error'); }
    };
    const body = h('div', {}, list, fileInput);
    close = modal('Fleet', body, [
      { label: 'Import file…', onClick: () => { fileInput.click(); return false; } },
      { label: 'Export current', onClick: () => { this.exportFile(); return false; } },
      { label: 'Close', primary: true },
    ]);
    const render = async () => {
      let saved: Awaited<ReturnType<typeof listVehicles>> = [];
      try { saved = await listVehicles(); } catch { /* none */ }
      const rows = [
        ...PRESETS.map((p) => h('div', { class: 'fleet-row' }, h('div', { class: 'fleet-thumb preset' }, 'STARTER'), h('div', { class: 'fleet-info' }, h('b', {}, p.name), h('small', {}, 'Built-in')),
          h('button', { class: 'btn', onclick: () => { this.setGrid(p.build(), p.name.split(' (')[0]); close(); } }, 'Open'))),
        ...saved.map((v) => h('div', { class: 'fleet-row' },
          v.thumb ? h('img', { class: 'fleet-thumb', src: v.thumb, alt: '' }) : h('div', { class: 'fleet-thumb' }),
          h('div', { class: 'fleet-info' }, h('b', {}, v.name), h('small', {}, `${v.file.blocks.length} parts · ${new Date(v.updatedAt).toLocaleString()}`)),
          h('button', { class: 'btn', onclick: () => { this.loadFile(v.file); close(); } }, 'Open'),
          h('button', { class: 'btn danger', onclick: async () => { await deleteVehicle(v.name); render(); } }, 'Delete'))),
      ];
      if (!saved.length) rows.push(h('p', { class: 'hint' }, 'Nothing saved yet. Press Save to add the current vehicle to your fleet.'));
      list.replaceChildren(...rows);
    };
    render();
  }

  async exportFile() {
    const bytes = await encodeFile(this.file());
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }));
    const a = h('a', { href: url, download: `${this.name.replace(/[^\w-]+/g, '_') || 'vehicle'}.twv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Exported .twv file');
  }
}

export { mirrorCellX };
