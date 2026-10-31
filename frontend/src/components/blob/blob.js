import * as THREE from "three/webgpu";
import {
  positionGeometry,
  output,
  uniform,
  varying,
  vec3,
  vec4,
} from "three/tsl";
import { psrdnoise } from "./tsl/psrdnoise.js";

export class Blob {
  constructor(canvas) {
    this.renderer = new THREE.WebGPURenderer({
      canvas: canvas,
      powerPreference: "high-performance",
      antialias: true,
      alpha: true,
    });

    this.detail = 2 ** 5;

    this.renderer.setSize(canvas.width, canvas.height);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    let scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      canvas.width / canvas.height,
      0.1,
      1000,
    );

    camera.position.z = 5;

    // Create high resolution sphere geometry
    const sphereGeometry = new THREE.IcosahedronGeometry(1, this.detail);

    this.material = new THREE.MeshPhongNodeMaterial({
      color: 0xffe0d4,
      specular: 0xffffff,
      shininess: 100,
    });

    // Blob parameters as TSL uniforms
    this.spikeRatio = uniform(1);
    this.spikes = uniform(1);
    this.time = uniform(0);

    // Compute the displacement and normal perturbation in TSL
    // Bases on https://stegu.github.io/psrdnoise/3d-tutorial/3d-psrdnoise-tutorial-07.html
    // The displacement is computed per vertex.
    const normalizedPosition = positionGeometry.normalize();
    const snoiseResult = psrdnoise(
      normalizedPosition.mul(this.spikes).add(this.time),
      vec3(0, 0, 0),
      0,
    ).toVar("snoiseResult");
    const snoise = snoiseResult.w.toVar("snoise");
    const newLength = this.spikeRatio
      .oneMinus()
      .add(this.spikeRatio.mul(snoise))
      .toVar("newLength");
    const position = normalizedPosition
      .mul(newLength)
      .toVar("blobVertexPosition");

    // Set perFragmentNormals to false to use cheaper per-vertex normals
    const perFragmentNormals = false;
    const sphereNormal = normalizedPosition;
    const snoiseGradient = (
      perFragmentNormals ? snoiseResult.xyz : varying(snoiseResult.xyz)
    ).toVar("snoiseGradient");
    // We work in the unit sphere coordinates, but we applied the noise function to a scaled unit sphere, so we need
    // to scale the gradient accordingly (chain rule of partial derivatives).
    const gradient = snoiseGradient.mul(this.spikes).toVar("gradient");

    // Perturb normal
    const normalPerturbation = gradient
      .sub(gradient.dot(sphereNormal).mul(sphereNormal))
      .toVar("normalPerturbation");
    const normal = sphereNormal
      .sub(this.spikeRatio.mul(normalPerturbation))
      .normalize()
      .toVar("blobNormal");

    // Override the default material inputs
    this.material.positionNode = position;
    this.material.normalNode = normal;

    // Apply gamma correction to the output color (for legacy compatibility)
    this.gamma = uniform(1);
    this.material.outputNode = vec4(output.rgb.pow(this.gamma), output.a);

    this.directionalLight1 = new THREE.DirectionalLight();
    this.directionalLight1.castShadow = true;
    this.directionalLight1.shadow.mapSize.set(2048, 2048);
    scene.add(this.directionalLight1);

    this.directionalLight1Helper = new THREE.DirectionalLightHelper(
      this.directionalLight1,
      0.25,
    );
    scene.add(this.directionalLight1Helper);

    this.directionalLight2 = new THREE.DirectionalLight();
    this.directionalLight2.castShadow = true;
    this.directionalLight2.shadow.mapSize.set(2048, 2048);
    scene.add(this.directionalLight2);

    this.directionalLight2Helper = new THREE.DirectionalLightHelper(
      this.directionalLight2,
      0.25,
    );
    scene.add(this.directionalLight2Helper);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(this.ambientLight);

    this.sphere = new THREE.Mesh(sphereGeometry, this.material);
    this.sphere.receiveShadow = true;
    this.sphere.castShadow = true;
    scene.add(this.sphere);

    this.render = () => this.renderer.render(scene, camera);

    this.lastTimestamp = -1;
  }

  animate(
    timestamp,
    {
      detail,
      blobSize,
      spikeRatio,
      spikes,
      speed,
      gammaFactor,
      shadows,
      blobMaterial,
      ambientLight,
      directionalLight1,
      directionalLight2,
    },
  ) {
    this.renderer.shadowMap.enabled = shadows;
    this.gamma.value = gammaFactor;

    this.ambientLight.intensity = ambientLight.intensity;
    this.ambientLight.color.set(ambientLight.color);

    this.directionalLight1.intensity = directionalLight1.intensity;
    this.directionalLight1.color.set(directionalLight1.color);
    this.directionalLight1.position.set(
      directionalLight1.positionX,
      directionalLight1.positionY,
      directionalLight1.positionZ,
    );
    const directionalLight1Distance = this.directionalLight1.position.length();
    this.directionalLight1.castShadow = shadows;
    this.directionalLight1.shadow.camera.left = -blobSize;
    this.directionalLight1.shadow.camera.right = blobSize;
    this.directionalLight1.shadow.camera.bottom = -blobSize;
    this.directionalLight1.shadow.camera.top = blobSize;
    this.directionalLight1.shadow.camera.near = directionalLight1Distance - blobSize;
    this.directionalLight1.shadow.camera.far = directionalLight1Distance + blobSize;
    this.directionalLight1.shadow.bias = directionalLight1.bias;
    this.directionalLight1.shadow.normalBias = directionalLight1.normalBias;
    this.directionalLight1Helper.visible = directionalLight1.helper;
    this.directionalLight1Helper.parent.updateMatrixWorld();
    this.directionalLight1Helper.update();

    this.directionalLight2.intensity = directionalLight2.intensity;
    this.directionalLight2.color.set(directionalLight2.color);
    this.directionalLight2.position.set(
      directionalLight2.positionX,
      directionalLight2.positionY,
      directionalLight2.positionZ,
    );
    const directionalLight2Distance = this.directionalLight2.position.length();
    this.directionalLight2.castShadow = shadows;
    this.directionalLight2.shadow.camera.left = -blobSize;
    this.directionalLight2.shadow.camera.right = blobSize;
    this.directionalLight2.shadow.camera.bottom = -blobSize;
    this.directionalLight2.shadow.camera.top = blobSize;
    this.directionalLight2.shadow.camera.near = directionalLight2Distance + blobSize;
    this.directionalLight2.shadow.camera.far = directionalLight2Distance - blobSize;
    this.directionalLight2.shadow.bias = directionalLight2.bias;
    this.directionalLight2.shadow.normalBias = directionalLight2.normalBias;
    this.directionalLight2Helper.visible = directionalLight2.helper;
    this.directionalLight2Helper.parent.updateMatrixWorld();
    this.directionalLight2Helper.update();

    this.sphere.scale.set(blobSize, blobSize, blobSize);

    this.material.color.set(blobMaterial.color);
    this.material.emissive.set(blobMaterial.emissive);
    this.material.specular.set(blobMaterial.specular);
    this.material.shininess = blobMaterial.shininess;
    this.material.wireframe = blobMaterial.wireframe;

    this.spikeRatio.value = spikeRatio;
    this.spikes.value = spikes;

    const timeDiff =
      this.lastTimestamp === -1 ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.time.value += (timeDiff * speed) / 1000;

    if (this.detail !== detail) {
      const geometryToDispose = this.sphere.geometry;
      this.sphere.geometry = new THREE.IcosahedronGeometry(1, detail);
      geometryToDispose.dispose();
      this.detail = detail;
    }

    this.render();
  }
}
