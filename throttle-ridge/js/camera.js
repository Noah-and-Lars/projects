// Side-scroller camera: side-on, tilted down about 14 degrees with a fairly
// narrow field of view, so the track reads as a sculpted 3D berm and the four
// riders sit in clearly separate depth lanes. The player sits left of centre so more of
// the track ahead is visible. Zooms out a little with speed and big air,
// follows smoothly, and shakes on hard landings.
import * as THREE from 'three';

const FOV = 32;            // fairly narrow lens: reads like 2D with 3D depth
const TILT = 0.24;         // radians of downward tilt (~14 degrees): the riding
                           // surface and the riders' depth lanes stay readable
const BASE_HEIGHT = 11.2;  // metres visible vertically at rest (~bike = 1/6 screen)
const PLAYER_SCREEN_X = 0.34; // player at about a third from the left

export function createCameraRig() {
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 1500);
  const st = { x: 0, y: 3, look: 0, height: BASE_HEIGHT, shake: 0, init: false, air: 0 };

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function addShake(amount) { st.shake = Math.min(1.0, st.shake + amount); }

  function update(dt, target, track, laneZ, snap = false) {
    const { x, y, vx, vy, airTime } = target;
    const speed = Math.hypot(vx, vy);
    st.air += ((airTime > 0.25 ? Math.min(1.3, airTime) : 0) - st.air) * Math.min(1, dt * 2.5);

    // Visible height grows a little with speed and air time. On very wide
    // screens keep at least ~22 m of width; on tall ones at least ~11 m.
    let height = BASE_HEIGHT + Math.min(2.2, speed * 0.09) + st.air * 2.6;
    height = Math.max(height, 16 / camera.aspect);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const width = height * camera.aspect;

    // Look ahead in the direction of travel: player left of centre when
    // moving forward, drifting toward centre when slow or going backwards.
    const fwd = Math.max(-0.4, Math.min(1, vx / 8));
    const look = width * (0.5 - PLAYER_SCREEN_X) * fwd + Math.max(-1, Math.min(2.5, vx * 0.06));

    const k = (r) => (snap || !st.init ? 1 : 1 - Math.exp(-dt * r));
    st.height += (height - st.height) * k(1.6);
    st.look += (look - st.look) * k(1.8);
    st.x += (x - st.x) * k(12);
    // Vertical follow: snappier when the player nears the screen edge.
    const dy = y - st.y;
    const edge = Math.abs(dy) > st.height * 0.28 ? 9 : 4.5;
    st.y += dy * k(edge);
    st.init = true;

    const dist = st.height / (2 * tanHalf);
    const cx = st.x + st.look;
    const focusY = st.y + 0.55;
    let cy = focusY + Math.tan(TILT) * dist;

    let ox = 0, oy = 0;
    if (st.shake > 0.001) {
      const s = st.shake * st.shake * 0.35;
      ox = (Math.random() - 0.5) * s; oy = (Math.random() - 0.5) * s;
      st.shake *= Math.exp(-dt * 7);
    }
    // The camera stays in front of the track's cut face (z > track edge), so
    // it can never end up inside the terrain.
    camera.position.set(cx + ox, cy + oy, laneZ + dist);
    camera.lookAt(cx + ox, focusY + oy, laneZ);
  }

  return { camera, resize, update, addShake, state: st };
}
