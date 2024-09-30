import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let scene, camera, renderer;
let world, vehicle;
let chassisMesh, wheelMeshes = [];
let keysPressed = {};
let currentCameraPosition;
let currentCameraLookAt;
let originalCameraOffset = new THREE.Vector3(-5, 2, 0);
let cameraAngle = 0;
let isDragging = false;
let lastMouseX = 0;

init();
animate();

function init() {
    keysPressed = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };

    // 初始化Three.js场景
    scene = new THREE.Scene();

    // 初始化相机，设置视角和位置
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // 初始化渲染器，并设置大小
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 添加方向光源
    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    // 创建并添加地面
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x007700 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    scene.add(groundMesh);

    // 初始化Cannon.js物理世界
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0); // 设置重力
    world.broadphase = new CANNON.SAPBroadphase(world); // 使用SAPBroadphase进行碰撞检测
    world.defaultContactMaterial.friction = 0.2; // 降低默认摩擦力
    world.defaultContactMaterial.restitution = 0.1; // 添加一些弹性
    world.solver.iterations = 10; // 增加求解器迭代次数

    // 创建地面物理体并添加到物理世界
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // 创建车体物理体
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
    const chassisBody = new CANNON.Body({ mass: 150 });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 1, 0);

    // 创建车体的Three.js网格，并添加到场景
    chassisMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1, 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    scene.add(chassisMesh);

    // 创建车辆
    vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
    });

    // 轮子选项
    const wheelOptions = {
        radius: 0.5,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 20, // 降低悬挂刚度
        suspensionRestLength: 0.4, // 增加悬挂休息长度
        frictionSlip: 2, // 降低摩擦滑动
        dampingRelaxation: 3, // 增加阻尼松弛
        dampingCompression: 3, // 降低阻尼压缩
        maxSuspensionForce: 100000,
        rollInfluence: 0.1,
        axleLocal: new CANNON.Vec3(0, 0, 1),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 0),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
    };

    // 添加前轮
    wheelOptions.chassisConnectionPointLocal.set(-1.5, 0, 1);
    vehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(-1.5, 0, -1);
    vehicle.addWheel(wheelOptions);

    // 添加后轮
    wheelOptions.chassisConnectionPointLocal.set(1.5, 0, 1);
    vehicle.addWheel(wheelOptions);

    wheelOptions.chassisConnectionPointLocal.set(1.5, 0, -1);
    vehicle.addWheel(wheelOptions);

    // 将车辆添加到物理世界
    vehicle.addToWorld(world);

    // 为每个轮子创建Three.js网格，并添加到场景
    vehicle.wheelInfos.forEach((wheel) => {
        const wheelMesh = new THREE.Mesh(
            // new THREE.CylinderGeometry(wheel.radius, wheel.radius, 0.4, 32),
            new THREE.SphereGeometry(wheel.radius, 32, 16 ),
            new THREE.MeshBasicMaterial({ color: 0x888888 })
        );
        wheelMesh.rotation.x = Math.PI / 2;
        wheelMeshes.push(wheelMesh);
        scene.add(wheelMesh);
    });

    // 键盘控
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 初始化相机
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // 设置初始相机位置和朝向
    const initialCameraOffset = new THREE.Vector3(-5, 2, 0);
    currentCameraPosition = new THREE.Vector3().copy(chassisMesh.position).add(initialCameraOffset);
    currentCameraLookAt = new THREE.Vector3().copy(chassisMesh.position);
    
    camera.position.copy(currentCameraPosition);
    camera.lookAt(currentCameraLookAt);

    // 添加鼠标事件监听器
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function onKeyDown(event) {
    // 按下键时设置对应键值为true
    keysPressed[event.key] = true;
}

function onKeyUp(event) {
    // 松开键时设置对应键值为false
    keysPressed[event.key] = false;
}

function onMouseDown(event) {
    if (event.button === 2) { // 右键
        isDragging = true;
        lastMouseX = event.clientX;
        event.preventDefault();
    }
}

function onMouseMove(event) {
    if (isDragging) {
        const deltaX = event.clientX - lastMouseX;
        cameraAngle -= deltaX * 0.01; // 注意这里的减号
        lastMouseX = event.clientX;
    }
}

function onMouseUp(event) {
    if (event.button === 2) { // 右键
        isDragging = false;
    }
}

function animate() {
    // 动画循环
    requestAnimationFrame(animate);
    updatePhysics(); // 更新物理世界
    render(); // 渲染场景
}

function updatePhysics() {
    const maxSteerVal = 0.8; // 最大转向角
    const maxForce = 2400; // 最大发动机力
    const brakeForce = 15; // 刹车力
    const assistBrakeForce = 5; // 辅助刹车力，调小了这个值

    // 根据键盘输入应用发动机力
    if (keysPressed.ArrowUp) {
        vehicle.applyEngineForce(maxForce, 1);
        vehicle.applyEngineForce(maxForce, 3);
        vehicle.applyEngineForce(maxForce, 0);
        vehicle.applyEngineForce(maxForce, 2);
    } else if (keysPressed.ArrowDown) {
        vehicle.applyEngineForce(-maxForce, 1);
        vehicle.applyEngineForce(-maxForce, 3);
        vehicle.applyEngineForce(-maxForce, 0);
        vehicle.applyEngineForce(-maxForce, 2);
    } else {
        vehicle.applyEngineForce(0, 1);
        vehicle.applyEngineForce(0, 3);
        vehicle.applyEngineForce(0, 2);
        vehicle.applyEngineForce(0, 0);
    }
   

    // 应用手刹刹车力
    if (keysPressed.Space) {
        vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 0);
    } else {
        vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 0);
    }

    // 根据键盘输入应用转向角
    if (keysPressed.ArrowLeft) {
        vehicle.setSteeringValue(maxSteerVal, 2);
        vehicle.setSteeringValue(maxSteerVal, 3);
    } else if (keysPressed.ArrowRight) {
        vehicle.setSteeringValue(-maxSteerVal, 2);
        vehicle.setSteeringValue(-maxSteerVal, 3);
    } else {
        vehicle.setSteeringValue(0, 2);
        vehicle.setSteeringValue(0, 3);
    }
    
    // 更新物理世界
    const timeStep = 1 / 120; // 将时间步长从1/60秒改为1/120秒
    world.step(timeStep);

    // 获取车辆速度
    const velocity = vehicle.chassisBody.velocity;
    const speed = velocity.length();

    // 如果速度低于阈值,则停止车辆
    const minSpeed = 0.1; // 最小速度阈值,单位是米/秒
    if (speed < minSpeed) {
        vehicle.applyEngineForce(0, 0);
        vehicle.applyEngineForce(0, 1);
        vehicle.applyEngineForce(0, 2);
        vehicle.applyEngineForce(0, 3);
        vehicle.setBrake(assistBrakeForce, 0);
        vehicle.setBrake(assistBrakeForce, 1);
        vehicle.setBrake(assistBrakeForce, 2);
        vehicle.setBrake(assistBrakeForce, 3);
    }

    // 更新车体和轮子的位置信息
    chassisMesh.position.copy(vehicle.chassisBody.position);
    chassisMesh.quaternion.copy(vehicle.chassisBody.quaternion);

    vehicle.wheelInfos.forEach((wheel, index) => {
        vehicle.updateWheelTransform(index);
        const t = wheel.worldTransform;
        wheelMeshes[index].position.copy(t.position);
        wheelMeshes[index].quaternion.copy(t.quaternion);
        wheelMeshes[index].rotation.x = Math.PI / 2;
    });

    // 更新相机位置
    let cameraOffset = new THREE.Vector3().copy(originalCameraOffset);
    if (isDragging || Math.abs(cameraAngle) > 0.001) {
        cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
        if (!isDragging) {
            // 慢慢回到原始位置
            cameraAngle *= 0.95;
            if (Math.abs(cameraAngle) < 0.001) cameraAngle = 0;
        }
    }

    const targetCameraPosition = new THREE.Vector3();
    targetCameraPosition.copy(chassisMesh.position).add(cameraOffset.applyQuaternion(chassisMesh.quaternion));
    
    // 平滑相机移动
    currentCameraPosition.lerp(targetCameraPosition, 0.1);
    camera.position.copy(currentCameraPosition);

    // 平滑相机朝向
    currentCameraLookAt.lerp(chassisMesh.position, 0.1);
    camera.lookAt(currentCameraLookAt);
}

function render() {
    // 渲染Three.js场景
    renderer.render(scene, camera);
}

// 禁用右键菜单
document.addEventListener('contextmenu', event => event.preventDefault());
