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
let isFirstPersonView = false; // 新增变量以跟踪视角状态

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
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
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
    const chassisShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 1));
    const chassisBody = new CANNON.Body({ mass: 1000 });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 1, 0);

    // 正确的网格尺寸应该与物理体匹配
    chassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2 * 2, 2 * 0.5, 2 * 1),  // 将半尺寸转为全尺寸
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
        suspensionStiffness: 40, // 降低悬挂刚度
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

    // ��车辆添加到物理世界
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

    // 创建城市地形
    createCityTerrain();
}


// 创建城市地形的函数
function createCityTerrain() {
    const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // 蓝色建筑物
    const roadMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 }); // 灰色道路

    
    // 创建建筑物和道路
    for (let i = -50; i < 50; i += 20) { // 修改间距
        for (let j = -50; j < 50; j += 15) {
            const height = Math.random() * 20 + 10; // 随机高度
            const buildingGeometry = new THREE.BoxGeometry(5, height, 5);
            const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
            buildingMesh.position.set(i, height / 2, j); // 确保建筑物底部在地面上
            scene.add(buildingMesh);

            // 为每个建筑物创建Cannon.js的物理体
            const buildingShape = new CANNON.Box(new CANNON.Vec3(2.5, height / 2, 2.5)); // 碰撞箱
            const buildingBody = new CANNON.Body({ mass: 0 }); // 静止物体，质量设为0
            buildingBody.addShape(buildingShape);
            buildingBody.position.set(i, height / 2, j); // 设置物理体位置
            world.addBody(buildingBody); // 将物理体添加到物理世界
            
            // 物理体位置设置
            buildingBody.position.set(i, height / 2, j); // 将物理体设置在建筑物的中心

            // 在建筑物之间添加道路
            if (i < 50 && j < 50) {
                const roadGeometry = new THREE.PlaneGeometry(20, 20); // 道路几何
                const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
                roadMesh.rotation.x = -Math.PI / 2; // 平放
                roadMesh.position.set(i, 0.01, j); // 设置道路位置
                scene.add(roadMesh);
            }
        }
    }
}


function onKeyDown(event) {
    // 按下键时设置对应键值为true
    keysPressed[event.key] = true;

    if (event.key === 'c') { // 切换视角
        isFirstPersonView = !isFirstPersonView; // 切换视角状态
        updateCameraPosition(); // 更新相机位置
    }
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
    const maxForce = 3300; // 最大发动机力
    const brakeForce = 10000000; // 刹车力
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
    console.log('Space pressed:', keysPressed.Space); // 在调用 setBrake 前输出 Space 键状态
    if (keysPressed.Space) {
        vehicle.setBrake(brakeForce, 1); // 应用刹车力到后轮
        vehicle.setBrake(brakeForce, 0); // 应用刹车力到前轮
    } else {
        vehicle.setBrake(0, 1); // 释放后轮的刹车
        vehicle.setBrake(0, 0); // 释放前轮的刹车
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




function updateCameraPosition() {
    if (isFirstPersonView) {
        // 第一人称视角
        const firstPersonOffset = new THREE.Vector3(0, 1.5, 0); // 相机相对于车体的位置
        currentCameraPosition.copy(chassisMesh.position).add(firstPersonOffset);
        currentCameraLookAt.copy(chassisMesh.position).add(new THREE.Vector3(3, 0, 0)); // 永远朝向车的正右方
    } else {
        // 第三人称视角
        const initialCameraOffset = new THREE.Vector3(-5, 2, 0);
        currentCameraPosition.copy(chassisMesh.position).add(initialCameraOffset);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(chassisMesh.quaternion); // 车辆的前方方向
        currentCameraLookAt.copy(chassisMesh.position).add(forward); // 更新相机朝向
    }

    // 确保相机位置和朝向的平滑过渡
    camera.position.lerp(currentCameraPosition, 0.1);
    camera.lookAt(currentCameraLookAt);
}


