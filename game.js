// --- CONFIGURAÇÃO INICIAL (Versão Global Three.js) ---
let scene, camera, renderer, controls;
let stalker, cabinets = [];
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isRunning = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const GAME_TIME = 300;
let timeLeft = GAME_TIME;
let gameActive = false;
let isHiding = false;
let stamina = 100;
let walkTime = 0;

// Elementos DOM
const timerValue = document.getElementById('timer-value');
const staminaBar = document.getElementById('stamina-bar');
const interactionPrompt = document.getElementById('interaction-prompt');
const menuOverlay = document.getElementById('menu-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const winOverlay = document.getElementById('win-overlay');
const hidingOverlay = document.getElementById('hiding-overlay');
const startButton = document.getElementById('start-button');

// --- SISTEMA DE ÁUDIO NO INÍCIO ---
let audioCtx;
function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const drone = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        drone.type = 'sawtooth';
        drone.frequency.setValueAtTime(45, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(200, audioCtx.currentTime);
        drone.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(audioCtx.destination);
        drone.start();
        console.log("Áudio Atmosférico Iniciado");
    } catch (e) { console.error("Áudio Error", e); }
}

function playScareSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(110, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(10, audioCtx.currentTime + 1);
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1);
}

// --- INICIALIZAÇÃO MOTOR ---
function init() {
    console.log("Motor de Jogo Carregando...");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.15);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // PointerLockControls (SEM FORÇAR TRAVA DE MOUSE NO INIT)
    controls = new THREE.PointerLockControls(camera, document.body);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.03);
    scene.add(ambientLight);

    const flashlight = new THREE.SpotLight(0xffffff, 12, 30, Math.PI / 6, 1.0);
    flashlight.name = "Flashlight";
    flashlight.castShadow = true;
    camera.add(flashlight);
    flashlight.position.set(0.4, -0.3, 0.5);
    flashlight.target = new THREE.Object3D();
    camera.add(flashlight.target);
    flashlight.target.position.set(0, -0.3, -20);
    scene.add(camera);

    createMaze();
    createStalker();
    setupEventListeners();

    // Iniciar loop de renderização para garantir o visual imediato
    animate();
    console.log("Motor Pronto");
}

function createMaze() {
    const variation = Math.floor(Math.random() * 10);
    const size = 15;
    const wallGeo = new THREE.BoxGeometry(4, 4, 4);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(250, 250),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes Base Externas
    for (let i = -size; i <= size; i++) {
        addWall(i * 4, -size * 4, wallGeo, wallMat);
        addWall(i * 4, size * 4, wallGeo, wallMat);
        addWall(-size * 4, i * 4, wallGeo, wallMat);
        addWall(size * 4, i * 4, wallGeo, wallMat);
    }

    // Estruturas Internas Aleatórias
    for (let x = -size + 2; x < size - 2; x += 2) {
        for (let z = -size + 2; z < size - 2; z += 2) {
            const pseudoRandom = Math.sin(x * variation + z) * 10000;
            if (pseudoRandom - Math.floor(pseudoRandom) > 0.6) {
                addWall(x * 4, z * 4, wallGeo, wallMat);
                if (pseudoRandom - Math.floor(pseudoRandom) > 0.95) createCabinet(x * 4, z * 4 + 2);
            }
        }
    }
}

function addWall(x, z, geo, mat) {
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, 2, z);
    wall.castShadow = true;
    scene.add(wall);
}

function createCabinet(x, z) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x110800 })));
    group.position.set(x, 1.25, z);
    scene.add(group);
    cabinets.push(group);
}

function createStalker() {
    stalker = new THREE.Group();
    stalker.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x000000 })));
    const light = new THREE.PointLight(0xff0000, 3, 10);
    light.position.set(0, 1.2, 0.6);
    stalker.add(light);
    stalker.position.set(40, 1.4, 40);
    scene.add(stalker);
}

function setupEventListeners() {
    // BOTÃO DE INICIAR (MAIS SIMPLES AGORA)
    startButton.onclick = (e) => {
        e.stopPropagation(); // Evita conflitos de clique
        console.log("Botão Iniciar acionado!");

        if (!audioCtx) initAudio();

        // Iniciamos o jogo imediatamente
        gameActive = true;
        menuOverlay.classList.add('hidden');

        // Se o usuário QUISER travar o mouse para olhar, uma nova interação será solicitada
        // mas o jogo já estará rodando em 1ª pessoa fixo se necessário
    };

    // Permitimos travar o mouse ao clicar na tela durante o jogo
    document.body.onclick = () => {
        if (gameActive && !isHiding) {
            controls.lock();
        }
    };

    window.onkeydown = (e) => {
        if (!gameActive) return;
        if (e.code === 'KeyW') moveForward = true;
        if (e.code === 'KeyS') moveBackward = true;
        if (e.code === 'KeyA') moveLeft = true;
        if (e.code === 'KeyD') moveRight = true;
        if (e.code === 'ShiftLeft') isRunning = true;
        if (e.code === 'KeyE') toggleHiding();
    };

    window.onkeyup = (e) => {
        if (e.code === 'KeyW') moveForward = false;
        if (e.code === 'KeyS') moveBackward = false;
        if (e.code === 'KeyA') moveLeft = false;
        if (e.code === 'KeyD') moveRight = false;
        if (e.code === 'ShiftLeft') isRunning = false;
    };
}

function toggleHiding() {
    if (isHiding) {
        isHiding = false;
        hidingOverlay.classList.add('hidden');
        camera.position.y = 1.6;
    } else {
        let near = false;
        cabinets.forEach(c => {
            if (camera.position.distanceTo(c.position) < 2.5) near = true;
        });
        if (near) {
            isHiding = true;
            hidingOverlay.classList.remove('hidden');
            camera.position.y = 1.2;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);

    if (gameActive) {
        timeLeft -= delta;
        const mins = Math.floor(timeLeft / 60);
        const secs = Math.floor(timeLeft % 60);
        timerValue.textContent = mins.toString().padStart(2, '0') + ":" + secs.toString().padStart(2, '0');

        if (timeLeft <= 0) win();

        const fl = scene.getObjectByName("Flashlight");
        if (fl) fl.intensity = Math.random() > 0.98 ? Math.random() * 6 : 12;

        if (!isHiding) {
            updatePlayer(delta);
            updateStalker(delta);
        }

        if (isRunning && (moveForward || moveLeft || moveRight || moveBackward))
            stamina = Math.max(0, stamina - delta * 25);
        else
            stamina = Math.min(100, stamina + delta * 15);
        staminaBar.style.width = stamina + '%';
    }

    renderer.render(scene, camera);
    prevTime = time;
}

function updatePlayer(delta) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    let speed = isRunning && stamina > 5 ? 400.0 : 200.0;
    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    if (moveForward || moveBackward || moveLeft || moveRight) {
        walkTime += delta * (isRunning ? 15 : 10);
        camera.position.y = 1.6 + Math.sin(walkTime) * 0.05;
    }

    let near = false;
    cabinets.forEach(c => { if (camera.position.distanceTo(c.position) < 2.5) near = true; });
    interactionPrompt.style.display = near ? 'block' : 'none';
}

function updateStalker(delta) {
    const spd = 1.8 + (1 - (timeLeft / GAME_TIME)) * 1.5;
    const dir = new THREE.Vector3().subVectors(camera.position, stalker.position);
    dir.y = 0;
    dir.normalize();
    stalker.position.add(dir.multiplyScalar(spd * delta));
    stalker.lookAt(camera.position.x, 1.4, camera.position.z);

    if (stalker.position.distanceTo(camera.position) < 1.4) die();
}

function die() {
    gameActive = false;
    playScareSound();
    controls.unlock();
    gameOverOverlay.classList.remove('hidden');
}

function win() {
    gameActive = false;
    controls.unlock();
    winOverlay.classList.remove('hidden');
}

document.getElementById('restart-button').onclick = () => location.reload();
document.getElementById('win-restart-button').onclick = () => location.reload();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Iniciamos o motor assim que o script for lido
init();
