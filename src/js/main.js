import * as THREE from "three";

import Stats from "three/addons/libs/stats.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HDRJPGLoader } from "@monogrid/gainmap-js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";

const environments = {
  "Hội trường bách khoa": {
    filename: "hoi_truong_bach_khoa.JPG",
    front: "Hành lang bách khoa",
    left: "Hành lang bách khoa",
  },
  "Hành lang bách khoa": {
    filename: "hanh_lang_bach_khoa.JPG",
    behind: "Hội trường bách khoa",
    right: "Hội trường bách khoa",
  },
};

const params = {
  envMap: Object.keys(environments)[0],
  roughness: 0.0,
  metalness: 1.0,
  exposure: 1.0,
  debug: false,
};

let container, stats;
let camera, scene, renderer, controls;
let torusMesh, planeMesh;
let hdrJpg, hdrJpgPMREMRenderTarget, hdrJpgEquirectangularMap;

const fileSizes = {};
const resolutions = {};

init();
animate();

function init() {
  const lbl = document.getElementById("lbl_left");

  container = document.createElement("div");
  document.body.appendChild(container);

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    1,
    500
  );
  camera.position.set(0, 0, -120);

  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Tạo hình học và vật liệu
  let geometry = new THREE.TorusKnotGeometry(18, 8, 200, 40, 1, 3);
  let material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: params.metalness,
    roughness: params.roughness,
  });

  torusMesh = new THREE.Mesh(geometry, material);
  // scene.add(torusMesh);

  geometry = new THREE.PlaneGeometry(200, 200);
  material = new THREE.MeshBasicMaterial();

  planeMesh = new THREE.Mesh(geometry, material);
  planeMesh.position.y = -50;
  planeMesh.rotation.x = -Math.PI * 0.5;
  // scene.add(planeMesh);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  THREE.DefaultLoadingManager.onLoad = function () {
    pmremGenerator.dispose();
  };

  // Tạo các mũi tên chỉ hướng
  const arrowSize = 50;
  const arrowColor = "black";
  const arrowY = -100;
  const arrowX = 200;

  const arrowData = {
    front: {
      direction: new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, arrowY, arrowX),
    },
    behind: {
      direction: new THREE.Vector3(0, 0, -1),
      position: new THREE.Vector3(0, arrowY, -arrowX),
    },
    left: {
      direction: new THREE.Vector3(1, 0, 0),
      position: new THREE.Vector3(arrowX, arrowY, 0),
    },
    right: {
      direction: new THREE.Vector3(-1, 0, 0),
      position: new THREE.Vector3(-arrowX, arrowY, 0),
    },
  };

  function findMatchingProperties(object1, object2) {
    const matchingProperties = [];
    for (const key in object1) {
      if (object2.hasOwnProperty(key)) {
        matchingProperties.push(key);
      }
    }
    return matchingProperties;
  }

  function loadEnvironment(name) {
    params.envMap = name
    const filename = environments[name].filename;
    hdrJpg = new HDRJPGLoader(renderer).load(
      `../../src/images/${filename}`,
      function () {
        resolutions[filename] = hdrJpg.width + "x" + hdrJpg.height;
        displayStats(filename);
        hdrJpgEquirectangularMap = hdrJpg.renderTarget.texture;
        hdrJpgPMREMRenderTarget = pmremGenerator.fromEquirectangular(
          hdrJpgEquirectangularMap
        );
        hdrJpgEquirectangularMap.mapping =
          THREE.EquirectangularReflectionMapping;
        hdrJpgEquirectangularMap.needsUpdate = true;
        hdrJpg.dispose();

        const matchingProperties = findMatchingProperties(
          environments[name],
          arrowData
        );
        console.log(matchingProperties);
        scene.clear()
        matchingProperties.forEach((property) => {
          const arrowHelper = new THREE.ArrowHelper(
            arrowData[property].direction,
            arrowData[property].position,
            arrowSize,
            arrowColor,
            arrowSize,
            arrowSize * 0.6
          );
          scene.add(arrowHelper);
        })
      },
      function (progress) {
        fileSizes[filename] = humanFileSize(progress.total);
      }
    );
  }

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  stats = new Stats();
  container.appendChild(stats.dom);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 50;
  controls.maxDistance = 300;

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("click", onMouseClick);

  loadEnvironment(Object.keys(environments)[0]);
  const gui = new GUI();
  gui
    .add(params, "envMap", Object.keys(environments))
    .onChange(function (value) {
      loadEnvironment(value);
    });
  gui.add(params, "exposure", 0, 2, 0.01);
  gui.open();

  function displayStats(value) {
    lbl.innerHTML =
      value +
      " size : " +
      fileSizes[value] +
      ", Resolution: " +
      resolutions[value];
  }

  const maxDistance = 20;

  const getDirection = (point) => {
    if (
      Math.abs(arrowX - point.z) < maxDistance &&
      Math.abs(point.x) < maxDistance
    ) {
      return "front";
    } else if (
      Math.abs(arrowX + point.z) < maxDistance &&
      Math.abs(point.x) < maxDistance
    ) {
      return "behind";
    } else if (
      Math.abs(arrowX - point.x) < maxDistance &&
      Math.abs(point.z) < maxDistance
    ) {
      return "left";
    } else if (
      Math.abs(arrowX + point.x) < maxDistance &&
      Math.abs(point.z) < maxDistance
    ) {
      return "right";
    }
  };

  function onMouseClick(event) {
    event.preventDefault();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    intersects.forEach((intersect) => {
      console.log("Click button: ", intersect.object.type);
      if (intersect.object.type === "Mesh") {
        const direction = getDirection(intersect.point);
        const nextEnv = environments[params.envMap][direction]
        console.log(environments[params.envMap][direction]);
        loadEnvironment(nextEnv);
      }
    });
  }
}

function humanFileSize(bytes, si = true, dp = 1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + " B";
  }

  const units = si
    ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
    : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + " " + units[u];
}

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  stats.begin();
  render();
  stats.end();
}

function render() {
  torusMesh.material.roughness = params.roughness;
  torusMesh.material.metalness = params.metalness;

  let pmremRenderTarget, equirectangularMap;

  pmremRenderTarget = hdrJpgPMREMRenderTarget;
  equirectangularMap = hdrJpgEquirectangularMap;

  const newEnvMap = pmremRenderTarget ? pmremRenderTarget.texture : null;

  if (newEnvMap && newEnvMap !== torusMesh.material.envMap) {
    planeMesh.material.map = newEnvMap;
    planeMesh.material.needsUpdate = true;
  }

  torusMesh.rotation.y += 0.005;
  planeMesh.visible = params.debug;

  scene.environment = equirectangularMap;
  scene.background = equirectangularMap;
  renderer.toneMappingExposure = params.exposure;

  renderer.render(scene, camera);
}
