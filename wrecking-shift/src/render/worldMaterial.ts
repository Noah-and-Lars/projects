import * as THREE from 'three';

/**
 * Lit material for voxel chunk meshes.
 * Vertex attributes: color (rgb sRGB albedo, a = AO), aux (x = emissive, y = glass).
 */
export function makeWorldMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aux;\nvarying vec2 vAux;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAux;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= pow(vColor.rgb, vec3(2.2));\nfloat vAO = vColor.a;')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= vAO;\nreflectedLight.directDiffuse *= mix(1.0, vAO, 0.3);',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vAux.x * 2.0;');
  };
  mat.customProgramCacheKey = () => 'voxel-world-v1';
  return mat;
}
