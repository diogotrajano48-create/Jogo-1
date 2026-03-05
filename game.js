// --- CONFIGURAÇÃO INICIAL (Versão Global Three.js) ---
let scene, camera, renderer, controls;
let stalker, cabinets = [], walls = [];
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isRunning = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

const GAME_TIME = 300;
let timeLeft = GAME_TIME;
let gameActive = false;
let isHiding = false;
let hidingCooldown = 0;
let stalkerWanderTarget = new THREE.Vector3();
let stamina = 100;
let hasSecondChance = true;
let isQTEActive = false;
let qteRotation = 0;
let qteTargetRotation = 0;
let qteTargetWidth = 60; // graus
let qteTimer = 0;
let walkTime = 0;
let tensionGain;
let hidingGlobalCooldown = 0;
let hasBullet = true;
let reloadTimer = 0;
let stalkerStunTimer = 0;
let raycaster = new THREE.Raycaster(); // Cooldown de 30s para entrar de novo

// Elementos DOM
const timerValue = document.getElementById('timer-value');
const staminaBar = document.getElementById('stamina-bar');
const interactionPrompt = document.getElementById('interaction-prompt');
const menuOverlay = document.getElementById('menu-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const winOverlay = document.getElementById('win-overlay');
const hidingOverlay = document.getElementById('hiding-overlay');
const hidingTimerValue = document.getElementById('hiding-timer');
const qteOverlay = document.getElementById('qte-overlay');
const qteNeedle = document.getElementById('qte-needle');
const qteTarget = document.getElementById('qte-target');
const qteTimerBar = document.getElementById('qte-timer-bar');
const ammoStatus = document.getElementById('ammo-status');
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

        // Novo som de tensão (Zumbido tenso)
        const tensionOsc = audioCtx.createOscillator();
        tensionGain = audioCtx.createGain();
        tensionOsc.type = 'sawtooth';
        tensionOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
        tensionGain.gain.setValueAtTime(0, audioCtx.currentTime);

        const lowpass2 = audioCtx.createBiquadFilter();
        lowpass2.type = 'lowpass';
        lowpass2.frequency.setValueAtTime(120, audioCtx.currentTime);

        tensionOsc.connect(lowpass2);
        lowpass2.connect(tensionGain);
        tensionGain.connect(audioCtx.destination);
        tensionOsc.start();

    } catch (e) { }
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

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.03); // Reduzido de 0.05 para 0.03 para menos claustrofobia

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // PointerLockControls (SEM FORÇAR TRAVA DE MOUSE NO INIT)
    controls = new THREE.PointerLockControls(camera, document.body);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.20);
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

    createStalker();
    createMaze();
    setupEventListeners();

    // Iniciar loop de renderização para garantir o visual imediato
    animate();

}

function createMaze() {
    const wallGeo = new THREE.BoxGeometry(4, 4, 4);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(350, 350),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Layout baseado no estilo "Bearly Buried" (Matriz fixa)
    // # = Parede, C = Armário, S = Spawn Jogador, . = Vazio
    const layout = [
        "#########################",
        "#...A.......#...........#",
        "#.#######...#...#######.#",
        "#.#.....#...#...#.....#.#",
        "#.#..C..#.......#..C..#.#",
        "#.#.....#...#...#.....#.#",
        "#.#######...#...#######.#",
        "#...........#...........#",
        "#######..#######..#######",
        "#...........#...........#",
        "#.#######...#...#######.#",
        "#.#.....#...#...#.....#.#",
        "#.C.....#.......#.....C.#",
        "#.#.....#...#...#.....#.#",
        "#.#######...#...#######.#",
        "#...........#...........#",
        "#######..#######..#######",
        "#...........#...........#",
        "#.#######...#...#######.#",
        "#.#.....#...#...#.....#.#",
        "#.#..C..#...S...#..C..#.#",
        "#.#.....#.......#.....#.#",
        "#.#######.......#######.#",
        "#.......................#",
        "#########################"
    ];

    const offsetX = -(layout[0].length * 4) / 2;
    const offsetZ = -(layout.length * 4) / 2;

    for (let z = 0; z < layout.length; z++) {
        for (let x = 0; x < layout[z].length; x++) {
            const char = layout[z][x];
            const posX = offsetX + (x * 4);
            const posZ = offsetZ + (z * 4);

            if (char === '#') {
                addWall(posX, posZ, wallGeo, wallMat);
            } else if (char === 'C') {
                createCabinet(posX, posZ);
            } else if (char === 'S') {
                camera.position.set(posX, 1.6, posZ);
            } else if (char === 'A') {
                // Ponto de spawn do Assassino
                stalker.position.set(posX, 1.4, posZ);
            }
        }
    }
}

function addWall(x, z, geo, mat) {
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, 2, z);
    wall.castShadow = true;
    scene.add(wall);
    walls.push(wall);
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
    startButton.onclick = (e) => {
        e.stopPropagation();
        if (!audioCtx) initAudio();
        gameActive = true;
        menuOverlay.classList.add('hidden');
    };

    document.body.onmousedown = (e) => {
        // Se o clique for para travar o mouse (ex: voltando do menu ou QTE), não atira
        if (!controls.isLocked) return;

        if (gameActive && !isHiding && !isQTEActive && e.button === 0) {
            shoot();
        }
    };

    document.body.onclick = () => {
        if (gameActive && !isHiding && !isQTEActive) {
            controls.lock();
        }
    };

    window.onkeydown = (e) => {
        // QTE tem prioridade total
        if (isQTEActive && (e.code === 'Space' || e.keyCode === 32)) {
            checkQTE();
            return;
        }

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
        // Saiu do armário (por escolha ou expulsão)
        isHiding = false;
        hidingOverlay.classList.add('hidden');
        camera.position.y = 1.6;
        hidingGlobalCooldown = 30.0; // Inicia os 30 segundos de restrição
    } else {
        if (hidingGlobalCooldown > 0) return; // Não deixa entrar se estiver no cooldown

        let near = false;
        cabinets.forEach(c => {
            if (camera.position.distanceTo(c.position) < 2.5) near = true;
        });
        if (near) {
            isHiding = true;
            hidingCooldown = 10.0; // Agora esse é o tempo MÁXIMO lá dentro
            hidingOverlay.classList.remove('hidden');
            camera.position.y = 1.2;

            setStalkerWanderTarget();
        }
    }
}

function setStalkerWanderTarget() {
    const size = 15 * 4;
    stalkerWanderTarget.set(
        (Math.random() - 0.5) * size * 2,
        1.4,
        (Math.random() - 0.5) * size * 2
    );
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

        if (isHiding) {
            hidingCooldown = Math.max(0, hidingCooldown - delta);
            hidingTimerValue.textContent = `Você será expulso em ${Math.ceil(hidingCooldown)}s`;

            if (hidingCooldown <= 0) {
                toggleHiding(); // EXPULSÃO
            }
            updateStalker(delta);
        } else {
            updatePlayer(delta);
            updateStalker(delta);
        }

        if (isRunning && (moveForward || moveLeft || moveRight || moveBackward))
            stamina = Math.max(0, stamina - delta * 25);
        else
            stamina = Math.min(100, stamina + delta * 15);
        staminaBar.style.width = stamina + '%';

        // Atualizar cooldown global dos armários
        if (hidingGlobalCooldown > 0) {
            hidingGlobalCooldown = Math.max(0, hidingGlobalCooldown - delta);
        }

        // Atualizar timers de tiro e atordoamento
        if (reloadTimer > 0) {
            reloadTimer = Math.max(0, reloadTimer - delta);
            if (reloadTimer <= 0) {
                hasBullet = true;
                ammoStatus.textContent = "CARREGADA";
                ammoStatus.style.color = "#fff";
            } else {
                ammoStatus.textContent = `RECARREGANDO... (${Math.ceil(reloadTimer)}s)`;
                ammoStatus.style.color = "#ff0000";
            }
        }

        if (stalkerStunTimer > 0) {
            stalkerStunTimer = Math.max(0, stalkerStunTimer - delta);
        }
    }

    if (isQTEActive) {
        updateQTE(delta);
    }

    renderer.render(scene, camera);
    prevTime = time;
}

function checkCollision(pos, radius) {
    // Verificar colisão com paredes (4x4x4)
    for (let wall of walls) {
        if (Math.abs(pos.x - wall.position.x) < 2 + radius &&
            Math.abs(pos.z - wall.position.z) < 2 + radius) {
            return true;
        }
    }
    // Verificar colisão com armários
    for (let cab of cabinets) {
        if (Math.abs(pos.x - cab.position.x) < 0.6 + radius &&
            Math.abs(pos.z - cab.position.z) < 0.4 + radius) {
            return true;
        }
    }
    return false;
}

function updatePlayer(delta) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    // Rebalanceamento de velocidades:
    // Andar: 110 (Abaixo do stalker) | Correr: 300 (Acima do stalker)
    let speed = isRunning && stamina > 5 ? 300.0 : 110.0;
    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

    // Hitbox reduzida para não travar nas paredes (de 1.0 para 0.5)
    const playerRadius = 0.5;
    const oldPos = camera.position.clone();

    // Movimentação Lateral com Colisão
    controls.moveRight(-velocity.x * delta);
    if (checkCollision(camera.position, playerRadius)) {
        camera.position.copy(oldPos);
    }

    // Movimentação Frontal com Colisão
    const posAfterSide = camera.position.clone();
    controls.moveForward(-velocity.z * delta);
    if (checkCollision(camera.position, playerRadius)) {
        camera.position.copy(posAfterSide);
    }

    if (moveForward || moveBackward || moveLeft || moveRight) {
        walkTime += delta * (isRunning ? 15 : 10);
        camera.position.y = 1.6 + Math.sin(walkTime) * 0.05;
    }

    let near = false;
    cabinets.forEach(c => { if (camera.position.distanceTo(c.position) < 2.5) near = true; });

    if (hidingGlobalCooldown > 0 && near) {
        interactionPrompt.style.display = 'block';
        interactionPrompt.textContent = `Recuperando o fôlego... (${Math.ceil(hidingGlobalCooldown)}s)`;
    } else {
        interactionPrompt.style.display = near ? 'block' : 'none';
        interactionPrompt.textContent = "Pressione [E] para se esconder";
    }
}

function updateStalker(delta) {
    if (stalkerStunTimer > 0) return; // Assassinio atordoado pelo tiro

    // Rebalanceamento: Stalker (Base 14.0 -> Max 20.0)
    // Fica acima da caminhada (11.0) mas abaixo da corrida (30.0)
    const spd = (14.0 + (1 - (timeLeft / GAME_TIME)) * 6.0) * (isHiding ? 0.6 : 1.0);

    let targetPos;
    if (isHiding) {
        // Se estiver escondido, o stalker vaga em direção ao alvo aleatório
        targetPos = stalkerWanderTarget;
        if (stalker.position.distanceTo(stalkerWanderTarget) < 2) {
            setStalkerWanderTarget();
        }
    } else {
        // Se não estiver escondido, ele persegue o jogador
        targetPos = camera.position;
    }

    const dir = new THREE.Vector3().subVectors(targetPos, stalker.position);
    dir.y = 0;
    dir.normalize();

    const moveStep = dir.multiplyScalar(spd * delta);
    const oldPos = stalker.position.clone();

    // Movimentação com Colisão para o Stalker (Eixo X)
    stalker.position.x += moveStep.x;
    if (checkCollision(stalker.position, 0.6)) {
        stalker.position.x = oldPos.x;
    }

    // Movimentação com Colisão para o Stalker (Eixo Z)
    stalker.position.z += moveStep.z;
    if (checkCollision(stalker.position, 0.6)) {
        stalker.position.z = oldPos.z;
        // Se bater na parede enquanto vaga, mude o alvo para não ficar preso
        if (isHiding && Math.random() > 0.98) setStalkerWanderTarget();
    }

    stalker.lookAt(targetPos.x, 1.4, targetPos.z);

    // Sistema de Som de Proximidade
    if (tensionGain) {
        const dist = stalker.position.distanceTo(camera.position);
        const maxDist = 35; // Começa a ouvir a essa distância
        let vol = Math.max(0, 1 - (dist / maxDist));
        vol = Math.pow(vol, 2.5); // Curva exponencial para ficar bem alto só de perto
        tensionGain.gain.setTargetAtTime(vol * 0.25, audioCtx.currentTime, 0.1);
    }

    if (!isHiding && !isQTEActive && stalker.position.distanceTo(camera.position) < 1.4) {
        if (hasSecondChance) {
            startQTE();
        } else {
            die();
        }
    }
}

function startQTE() {
    isQTEActive = true;
    gameActive = false; // Pausa o tempo do jogo
    controls.unlock(); // Solta o mouse para o QTE ser visível
    qteOverlay.classList.remove('hidden');

    // Configurar alvo aleatório (em graus)
    qteTargetRotation = Math.random() * 360;
    qteRotation = 0;
    qteTimer = 2.5; // Um pouco menos de tempo para ser mais tenso
    qteTarget.style.transform = `rotate(${qteTargetRotation}deg)`;
}

function updateQTE(delta) {
    qteRotation += delta * 480; // Velocidade da agulha
    if (qteRotation >= 360) qteRotation = 0;
    qteNeedle.style.transform = `rotate(${qteRotation}deg)`;

    qteTimer -= delta;
    const progress = (qteTimer / 2.5) * 100;
    qteTimerBar.style.width = Math.max(0, progress) + '%';

    if (qteTimer <= 0) {
        failQTE(); // Tempo esgotado
    }
}

function checkQTE() {
    // Ajustar para que o topo do círculo seja 0 graus no CSS, mas o transform rotate do alvo é relativo
    // A borda do alvo no CSS 'border-top-color' fica no topo se rotate(0)

    let diff = Math.abs(qteRotation - qteTargetRotation);
    // Lidar com a continuidade do círculo
    if (diff > 180) diff = 360 - diff;

    if (diff < qteTargetWidth / 2) {
        successQTE();
    } else {
        failQTE();
    }
}

function successQTE() {
    isQTEActive = false;
    gameActive = true;
    hasSecondChance = false;
    qteOverlay.classList.add('hidden');

    // Teleportar stalker para os corredores abertos das extremidades do mapa
    // Posições 44 ou -44 são garantidamente espaços vazios no layout 25x25
    const safePos = 44;
    const farX = camera.position.x > 0 ? -safePos : safePos;
    const farZ = camera.position.z > 0 ? -safePos : safePos;

    stalker.position.set(farX, 1.4, farZ);
    stalkerWanderTarget.set(farX, 1.4, farZ);

    playScareSound();
    controls.lock();
}

function failQTE() {
    isQTEActive = false;
    qteOverlay.classList.add('hidden');
    die();
}

function shoot() {
    if (!hasBullet || reloadTimer > 0) return;

    hasBullet = false;
    reloadTimer = 60.0; // 60 segundos de recarga

    // Som de tiro (oscilador rápido)
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);

    // Raycasting para acertar o stalker
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObject(stalker, true);

    if (intersects.length > 0) {
        stalkerStunTimer = 20.0; // Stalker parado por 20 seg
        playScareSound(); // Som de feedback de acerto

        // Efeito visual de tremor rápido
        camera.position.x += (Math.random() - 0.5) * 0.2;
    }
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
