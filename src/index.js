import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import io from 'socket.io-client';

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
let cameraPitchAngle = 90; // 初始化相机俯仰角度
let loadedChunks = []; // 存储格式: { x, z, mesh: groundMesh, buildings: [] }
const chunkSize = 50; // 每个地形块的大小

// 添加边界常量
const WORLD_BOUNDS = {
    min: -500,  // -1000/2
    max: 500    // 1000/2
};

// 在文件开头添加出生点常量
const SPAWN_POSITION = { x: 0, y: 1, z: 0 }; // y=1 确保车辆在地面上方

// 添加漂移相关状态
let isDrifting = false;
let driftFactor = 50;
const MAX_DRIFT_FACTOR = 50; // 最大漂移系数
const DRIFT_INCREASE_RATE = 2; // 漂移增加速率
const DRIFT_DECREASE_RATE = 0.05; // 漂移恢复速率

// 添加一个变量来记录上一次的驱动力状态
let lastDriveState = 'N'; // 'D', 'N', 或 'R'

// 添加速度限制常量
const MAX_SPEED = 350; // 最大速度 (km/h)
const MAX_SPEED_MS = MAX_SPEED / 3.6; // 转换为 m/s

// 在文件开头添加全局变量
let sky; // 天空盒引用
let skyFollowCamera = true; // 控制天空盒是否跟随相机
let sun, moon;
let dayNightCycle = true; // 控制昼夜循环开关

// 在文件开头添加socket.io相关变量
let socket;
let otherPlayers = new Map(); // 存储其他玩家信息
let playerId = ''; // 当前玩家ID

// 在文件开头添加调试标志
const DEBUG = true;

init();
animate();

function init() {
    keysPressed = { 
        ArrowUp: false, 
        ArrowDown: false, 
        ArrowLeft: false, 
        ArrowRight: false, 
        Space: false,
        r: false,
        R: false,
        t: false,
        T: false
    };

    // 初始化Three.js场景
    scene = new THREE.Scene();

    // 初始化相机，设置视角和位置
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    

    // 初始化渲染器，设置大小
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 添加方向光源
    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);


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

    // 将车辆添加到物理世界
    vehicle.addToWorld(world);

    // 为每个轮子建Three.js网格，并添加到场景
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
    // 在初始化时预加载玩家出生点周围的区块
    const spawnChunkX = Math.floor(SPAWN_POSITION.x / chunkSize) * chunkSize;
    const spawnChunkZ = Math.floor(SPAWN_POSITION.z / chunkSize) * chunkSize;
    
    // 预加载3x3的区块网格
    for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
            const chunkX = spawnChunkX + x * chunkSize;
            const chunkZ = spawnChunkZ + z * chunkSize;
            createTerrainChunk(chunkX, chunkZ);
        }
    }

    // 添加速度表DOM元素
    createSpeedometer();

    // 创建跟随玩家的天空盒
    createFollowingSky();
    
    // 创建云朵
    createClouds();

    // 添加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    // 初始化socket连接
    initSocketEvents();
}

// 添加创建云朵的函数
function createClouds() {
    const cloudCount = 40;
    for (let i = 0; i < cloudCount; i++) {
        const cloudGroup = new THREE.Group();
        
        // 为每朵云创建3-6个部分
        const parts = Math.floor(Math.random() * 4) + 3;
        for (let j = 0; j < parts; j++) {
            const geometry = new THREE.SphereGeometry(
                Math.random() * 5 + 3,
                8,
                8
            );
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                fog: false // 禁用云朵的雾效
            });
            const cloudPart = new THREE.Mesh(geometry, material);
            
            cloudPart.position.set(
                Math.random() * 10 - 5,
                Math.random() * 2,
                Math.random() * 10 - 5
            );
            
            cloudGroup.add(cloudPart);
        }
        
        // 在更大范围内随机放置云朵
        cloudGroup.position.set(
            Math.random() * 1600 - 800,
            Math.random() * 100 + 200,
            Math.random() * 1600 - 800
        );
        
        cloudGroup.userData = {
            speed: Math.random() * 0.1 + 0.05,
            direction: new THREE.Vector3(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize()
        };
        
        sky.add(cloudGroup); // 将云朵添加为天空盒的子对象
    }
}

function createTerrainChunk(x, z) {
    // 创建地面
    const groundGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
    const isOutsideCity = (x < WORLD_BOUNDS.min || x > WORLD_BOUNDS.max || 
                          z < WORLD_BOUNDS.min || z > WORLD_BOUNDS.max);
    
    // 根据是否在城市边界内选择不同的地面材质和生成逻辑
    if (isOutsideCity) {
        // 城市外的自然地形
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x007700, side: THREE.DoubleSide });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(x, 0, z);
        
        // 添加随机地形起伏
        const vertices = groundMesh.geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            if (i % 3 === 1) { // 只修改y坐标
                vertices[i] = Math.random() * 2; // 随机高度
            }
        }
        groundMesh.geometry.attributes.position.needsUpdate = true;
        scene.add(groundMesh);

        // 添加自然元素（树木、岩石等）
        const naturalElements = [];
        for (let i = x - chunkSize/2; i < x + chunkSize/2; i += 10) {
            for (let j = z - chunkSize/2; j < z + chunkSize/2; j += 10) {
                if (Math.random() < 0.3) { // 30%的概率生成自然元素
                    const elementType = Math.random() < 0.5 ? 'tree' : 'rock';
                    const element = createNaturalElement(elementType, i, j);
                    if (element.mesh) {
                        naturalElements.push(element);
                    }
                }
            }
        }

        // 保存自然地形区块
        loadedChunks.push({ 
            x, 
            z, 
            mesh: groundMesh, 
            buildings: naturalElements 
        });

    } else {
        // 城市内的地（保持原来的城市生成逻辑）
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(x, 0, z);
        scene.add(groundMesh);

        // 在区块内创建建筑物
        const buildings = [];
        for (let i = x - chunkSize/2; i < x + chunkSize/2; i += 20) {
            for (let j = z - chunkSize/2; j < z + chunkSize/2; j += 15) {
                const height = Math.random() * 20 + 10;

                // 创建建筑物网格
                const buildingGeometry = new THREE.BoxGeometry(5, height, 5);
                const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
                const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
                buildingMesh.position.set(i, height/2, j);
                scene.add(buildingMesh);

                // 创建黑色边框
                const borderMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
                const borderGeometry = new THREE.BoxGeometry(5.01, height + 0, 5.01);
                const borderMesh = new THREE.LineSegments(
                    new THREE.EdgesGeometry(borderGeometry), 
                    borderMaterial
                );
                borderMesh.position.set(i, height/2, j);
                scene.add(borderMesh);

                // 创建建筑物物理体
                const buildingShape = new CANNON.Box(new CANNON.Vec3(2.5, height/2, 2.5));
                const buildingBody = new CANNON.Body({ mass: 0 });
                buildingBody.addShape(buildingShape);
                buildingBody.position.set(i, height/2, j);
                world.addBody(buildingBody);

                buildings.push({
                    mesh: buildingMesh,
                    body: buildingBody,
                    border: borderMesh
                });
            }
        }

        // 保存城市区块
        loadedChunks.push({ 
            x, 
            z, 
            mesh: groundMesh, 
            buildings: buildings 
        });
    }
}

// 添加创建自然元素的辅助函数
function createNaturalElement(type, x, z) {
    let mesh, body;
    
    if (type === 'tree') {
        // 创建树干
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
        const trunkMaterial = new THREE.MeshBasicMaterial({ color: 0x4b3621 });
        const trunkMesh = new THREE.Mesh(trunkGeometry, trunkMaterial);
        
        // 创建树冠
        const leavesGeometry = new THREE.ConeGeometry(2, 4, 8);
        const leavesMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 });
        const leavesMesh = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leavesMesh.position.y = 3;
        
        // 组合树干和树冠
        mesh = new THREE.Group();
        mesh.add(trunkMesh);
        mesh.add(leavesMesh);
        mesh.position.set(x, 1, z);
        scene.add(mesh);
        
        // 创建简单的物理碰撞体
        const treeShape = new CANNON.Cylinder(0.5, 0.5, 2, 8);
        body = new CANNON.Body({ mass: 0 });
        body.addShape(treeShape);
        body.position.set(x, 1, z);
        world.addBody(body);
        
    } else if (type === 'rock') {
        // 创建岩石
        const rockGeometry = new THREE.DodecahedronGeometry(Math.random() * 1 + 0.5);
        const rockMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
        mesh = new THREE.Mesh(rockGeometry, rockMaterial);
        mesh.position.set(x, 0.5, z);
        scene.add(mesh);
        
        // 创建岩石的物理碰撞体
        const rockShape = new CANNON.Sphere(0.75);
        body = new CANNON.Body({ mass: 0 });
        body.addShape(rockShape);
        body.position.set(x, 0.5, z);
        world.addBody(body);
    }
    
    return { mesh, body };
}

function onKeyDown(event) {
    // 保持现有的按键处理
    keysPressed[event.key] = true;

    if (event.key === 'c') {
        isFirstPersonView = !isFirstPersonView;
        updateCameraPosition();
    }

    // 添加R键重生功能
    if (event.key === 'r' || event.key === 'R') {
        resetVehicle();
    }

    // 添加T键转正功能
    if (event.key === 't' || event.key === 'T') {
        straightenVehicle();
    }
}

function onKeyUp(event) {
    // 松开键时设置对应键值为false
    keysPressed[event.key] = false;
    
    // 当松开前进或后退键时，检查是否需要切换到N档
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && 
        !keysPressed['ArrowUp'] && !keysPressed['ArrowDown']) {
        lastDriveState = 'N';
    }
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
        cameraAngle -= deltaX * 0.01; // 水平旋转，左右移动控制水平旋转
        lastMouseX = event.clientX;
    }

    // 垂直方向的移动，用来调整视角的高低
    const deltaY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    cameraPitchAngle -= deltaY * 0.01; // 更新俯仰角度，高低调节

    // 限制俯仰角度的范围，防止过度旋转
    const maxPitch = Math.PI / 4;  // 最大俯仰角度，45度
    const minPitch = Math.PI / 4; // 最小俯仰角度，-45度
    cameraPitchAngle = Math.max(minPitch, Math.min(maxPitch, cameraPitchAngle));
}

function onMouseUp(event) {
    if (event.button === 2) { // 右键
        isDragging = false;
    }
}

function animate() {
    // 动画循环
    // if (isFirstPersonView) {
    //     alert(isFirstPersonView);
    // }
    requestAnimationFrame(animate);
    updatePhysics(); // 更新物理世界
    updateTerrain(); // 更新地形
    render(); // 渲染场景
    updateSpeedometer();

    // 更新云朵位置
    // updateClouds();/*  */

    // 更新天空盒位置
    updateSky();

    // 可选：添加昼夜循环
    updateDayNightCycle();

    // 发送位置更新
    if(socket && chassisMesh) {
        socket.emit('update_position', {
            position: chassisMesh.position,
            quaternion: chassisMesh.quaternion
        });
    }
}

function updatePhysics() {
    const maxSteerVal = 0.8; // 最大转向角
    const maxForce = 4444; // 最大发动机力
    const brakeForce = 10000000; // 刹车力
    const assistBrakeForce = 5; // 助刹车力，调小了这个值

    // 获取车辆速度
    const velocity = vehicle.chassisBody.velocity;
    const speed = velocity.length();
    const speedKmh = speed * 3.6;


    // 检查是否超速
    if (speedKmh >= MAX_SPEED) {
        console.log("Speed Limit!");
        vehicle.applyEngineForce(0, 1);
        vehicle.applyEngineForce(0, 3);
        vehicle.applyEngineForce(0, 2);
        vehicle.applyEngineForce(0, 0);
    } else {
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
    }

    // 应用手刹刹车力
    // console.log('Space pressed:', keysPressed.Space); // 在调用 setBrake 前输出 Space 键状态
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
    });


// 检查是否处于第一人称视角并更新相机
if (!isFirstPersonView) {
    // 如果是第三人称视角
    let cameraOffset = new THREE.Vector3().copy(originalCameraOffset);

    // 计算相机目标位置
    const targetCameraPosition = new THREE.Vector3();
    targetCameraPosition.copy(chassisMesh.position).add(cameraOffset.applyQuaternion(chassisMesh.quaternion));

    // 平滑相机移动
    currentCameraPosition.lerp(targetCameraPosition, 0.1);
    camera.position.copy(currentCameraPosition);

    // **新相机朝向车辆右方**
    const rightOffset = new THREE.Vector3(1, 0, 0); // 车辆的右侧方向
    rightOffset.applyQuaternion(chassisMesh.quaternion); // 将右侧方向转化为车辆当前朝向的局部坐标系
    const targetLookAt = new THREE.Vector3().copy(chassisMesh.position).add(rightOffset);
    
    currentCameraLookAt.lerp(targetLookAt, 0.1);
    camera.lookAt(currentCameraLookAt);
} else {
    // 如果是第一人称视角
    const firstPersonOffset = new THREE.Vector3(0, 0.8, 0); // 相机相对于车体的位置
    currentCameraPosition.copy(chassisMesh.position).add(firstPersonOffset);
    
    // **更新相机朝向车辆右方**
    const rightOffset = new THREE.Vector3(1, 0, 0); // 车辆的右侧方向
    rightOffset.applyQuaternion(chassisMesh.quaternion); // 右侧方向转为车辆当前朝的局部坐标系
    currentCameraLookAt.copy(chassisMesh.position).add(rightOffset); // 相机朝向右侧
    
    camera.position.copy(currentCameraPosition);
    camera.lookAt(currentCameraLookAt);
}
    // 检查视角并更新相机位置和朝向
    if (!isFirstPersonView) {
        let cameraOffset = new THREE.Vector3().copy(originalCameraOffset);

        // 计算相机目标位置
        const targetCameraPosition = new THREE.Vector3();
        targetCameraPosition.copy(chassisMesh.position).add(cameraOffset.applyQuaternion(chassisMesh.quaternion));

        // 平滑相机移动
        currentCameraPosition.lerp(targetCameraPosition, 0.1);
        camera.position.copy(currentCameraPosition);

        // **计算车辆右方方向**
        const rightOffset = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);

        // **计算俯仰角的影响**
        const lookAtOffset = new THREE.Vector3().copy(rightOffset);
        lookAtOffset.y = Math.sin(cameraPitchAngle); // 根据俯仰角度调整相机的上下朝向
        lookAtOffset.normalize(); // 确保向量长度为1

        const targetLookAt = new THREE.Vector3().copy(chassisMesh.position).add(lookAtOffset);

        // 平滑相机朝向
        currentCameraLookAt.lerp(targetLookAt, 0.1);
        camera.lookAt(currentCameraLookAt);
    } else {
        const firstPersonOffset = new THREE.Vector3(0, 0.8, 0);
        // 将firstPersonOffset根据车辆的旋转进行变换
        firstPersonOffset.applyQuaternion(chassisMesh.quaternion);
        currentCameraPosition.copy(chassisMesh.position).add(firstPersonOffset);

        const rightOffset = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisMesh.quaternion);

        // **计算俯仰角的影响**
        const lookAtOffset = new THREE.Vector3().copy(rightOffset);
        lookAtOffset.y = Math.sin(cameraPitchAngle); // 根据俯仰角度调整相机的上下朝向
        lookAtOffset.normalize(); // 确保向量长度为1

        currentCameraLookAt.copy(chassisMesh.position).add(lookAtOffset);

        // 应用车辆的旋转到相机
        camera.position.copy(currentCameraPosition);
        camera.quaternion.copy(chassisMesh.quaternion);
        camera.rotateY(Math.PI / 2); // 让相机向右侧
        camera.lookAt(currentCameraLookAt);
    }
}

function updateTerrain() {
    const vehiclePosition = vehicle.chassisBody.position;
    const currentChunkX = Math.floor(vehiclePosition.x / chunkSize) * chunkSize;
    const currentChunkZ = Math.floor(vehiclePosition.z / chunkSize) * chunkSize;

    // 定义一个更大的预加载区域(3x3的区块网格)
    const adjacentChunks = [
        [0, 0], [chunkSize, 0], [-chunkSize, 0],
        [0, chunkSize], [0, -chunkSize],
        [chunkSize, chunkSize], [chunkSize, -chunkSize],
        [-chunkSize, chunkSize], [-chunkSize, -chunkSize]
    ];

    adjacentChunks.forEach(offset => {
        const [offsetX, offsetZ] = offset;
        const chunkX = currentChunkX + offsetX;
        const chunkZ = currentChunkZ + offsetZ;

        // 检查地形块是否已经加载
        if (!loadedChunks.some(chunk => chunk.x === chunkX && chunk.z === chunkZ)) {
            createTerrainChunk(chunkX, chunkZ);
        }
    });

    // 修改移除超出视距的地形块的逻辑
    loadedChunks = loadedChunks.filter(chunk => {
        const distance = Math.sqrt(
            Math.pow(chunk.x - vehiclePosition.x, 2) + 
            Math.pow(chunk.z - vehiclePosition.z, 2)
        );
        if (distance > chunkSize * 2) { // 增加保留距离
            // 移除地面
            scene.remove(chunk.mesh);
            
            // 移除所有建筑物、边框和自然元素
            chunk.buildings.forEach(building => {
                // 移除建筑物
                scene.remove(building.mesh);
                // 移除黑色边框
                if (building.border) {
                    scene.remove(building.border);
                }
                // 移除物理体
                if (building.body) {
                    world.removeBody(building.body);
                }
            });
            
            return false;
        }
        return true;
    });
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
        const firstPersonOffset = new THREE.Vector3(0, 0.8, 0); // 相机相对于车体的位置
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

// 添加重生函数
function resetVehicle() {
    // 重置位置
    vehicle.chassisBody.position.set(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);
    
    // 重置速度
    vehicle.chassisBody.velocity.setZero();
    vehicle.chassisBody.angularVelocity.setZero();
    
    // 重置方向（使用四元数设置为默认朝向）
    vehicle.chassisBody.quaternion.set(0, 0, 0, 1);
    
    // 重置所有车轮
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.wheelInfos[i].suspensionLength = 0;
        vehicle.wheelInfos[i].suspensionForce = 0;
        vehicle.wheelInfos[i].suspensionRelativeVelocity = 0;
        vehicle.wheelInfos[i].deltaRotation = 0;
    }
    
    // 更新车辆的物理状态
    vehicle.chassisBody.wakeUp();
}

// 添加转正函数
function straightenVehicle() {
    // 获取当前位置
    const currentPosition = vehicle.chassisBody.position.clone();
    
    // 保持当前y轴旋转朝向），但重置其他轴的旋转
    const currentRotation = new CANNON.Quaternion();
    vehicle.chassisBody.quaternion.copy(currentRotation);
    
    // 获取当前y轴旋转角度
    const euler = new CANNON.Vec3();
    vehicle.chassisBody.quaternion.toEuler(euler);
    
    // 创建新的四元数，只保留y轴旋转
    const newQuaternion = new CANNON.Quaternion();
    newQuaternion.setFromEuler(0, euler.y, 0);
    
    // 应用新的旋转
    vehicle.chassisBody.quaternion.copy(newQuaternion);
    
    // 稍微抬升车辆以防止卡在地面
    vehicle.chassisBody.position.y = Math.max(currentPosition.y, SPAWN_POSITION.y);
    
    // 重置速度
    vehicle.chassisBody.velocity.setZero();
    vehicle.chassisBody.angularVelocity.setZero();
    
    // 重置车轮状态
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.wheelInfos[i].suspensionLength = 0;
        vehicle.wheelInfos[i].suspensionForce = 0;
        vehicle.wheelInfos[i].suspensionRelativeVelocity = 0;
        vehicle.wheelInfos[i].deltaRotation = 0;
    }
    
    // 唤醒物理体
    vehicle.chassisBody.wakeUp();
}

// 修改车辆更新函数
// function updateVehicle() {
//     const velocity = vehicle.chassisBody.velocity;
//     const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
//     const speedKmh = speed * 3.6;

//     console.log(speedKmh);

//     // 检查是否超速
//     if (speedKmh >= MAX_SPEED) {
//         // // 计算当前速度方向的单位向量
//         // const directionX = velocity.x / speed;
//         // const directionZ = velocity.z / speed;
        
//         // // 将速度限制在最大值
//         // vehicle.chassisBody.velocity.x = directionX * MAX_SPEED_MS;
//         // vehicle.chassisBody.velocity.z = directionZ * MAX_SPEED_MS;
        
//         // // 如果仍在加速，则不再施加额外的力
//         // if (keysPressed['ArrowUp']) {
//         //     vehicle.applyEngineForce(0, 2);
//         //     vehicle.applyEngineForce(0, 3);
//         // }
//         vehicle.applyEngineForce(0, 2);
//         vehicle.applyEngineForce(0, 3);
//     } else {
//         // 正常的驱动力控制
//         const maxForce = 2000;
//         if (keysPressed['ArrowUp']) {
//             vehicle.applyEngineForce(maxForce, 2);
//             vehicle.applyEngineForce(maxForce, 3);
//         } else if (keysPressed['ArrowDown']) {
//             vehicle.applyEngineForce(-maxForce / 2, 2);
//             vehicle.applyEngineForce(-maxForce / 2, 3);
//         } else {
//             vehicle.applyEngineForce(0, 2);
//             vehicle.applyEngineForce(0, 3);
//         }
//     }

//     // 处理漂移状态
//     if (keysPressed[' '] && speed > 10) { // 速度大于10时才能漂移
//         isDrifting = true;
//         // 逐渐增加漂移系数
//         driftFactor = Math.min(driftFactor + DRIFT_INCREASE_RATE, MAX_DRIFT_FACTOR);
//     } else {
//         isDrifting = false;
//         // 漂移系数逐渐恢复
//         driftFactor = Math.max(driftFactor - DRIFT_DECREASE_RATE, 0);
//     }

//     // 更新车轮转向
//     const maxSteerVal = 0.5;
//     const steerValue = maxSteerVal * (keysPressed['ArrowLeft'] ? 1 : keysPressed['ArrowRight'] ? -1 : 0);

//     // 应用漂移效果
//     if (isDrifting) {
//         // 在漂移时增加转向角度
//         const driftSteerMultiplier = 1.5;
//         vehicle.setSteeringValue(steerValue * driftSteerMultiplier, 0);
//         vehicle.setSteeringValue(steerValue * driftSteerMultiplier, 1);
//     } else {
//         vehicle.setSteeringValue(steerValue, 0);
//         vehicle.setSteeringValue(steerValue, 1);
//     }

//     // 更新车轮驱动力
//     const maxForce = 1000;
//     const brakeForce = 1000000;
    
//     // 前进/后退控制
//     if (keysPressed['ArrowUp']) {
//         vehicle.applyEngineForce(maxForce, 2);
//         vehicle.applyEngineForce(maxForce, 3);
//     } else if (keysPressed['ArrowDown']) {
//         vehicle.applyEngineForce(-maxForce / 2, 2);
//         vehicle.applyEngineForce(-maxForce / 2, 3);
//     } else {
//         vehicle.applyEngineForce(0, 2);
//         vehicle.applyEngineForce(0, 3);
//     }

//     // 漂移时的特殊处理
//     if (isDrifting) {
//         // 减小后轮的摩擦力
//         vehicle.wheelInfos[2].frictionSlip = 0.5 - driftFactor;
//         vehicle.wheelInfos[3].frictionSlip = 0.5 - driftFactor;
        
//         // 保持前轮的高摩擦力
//         vehicle.wheelInfos[0].frictionSlip = 1;
//         vehicle.wheelInfos[1].frictionSlip = 1;

//         // 添加侧向力以增强漂移效果
//         const driftForce = new CANNON.Vec3();
//         const rightVector = new CANNON.Vec3();
//         vehicle.chassisBody.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0), rightVector);
//         rightVector.scale(speed * driftFactor * (steerValue > 0 ? -1 : 1), driftForce);
//         vehicle.chassisBody.applyImpulse(driftForce, vehicle.chassisBody.position);
//     } else {
//         // 恢复正常的轮胎摩擦力
//         for (let i = 0; i < 4; i++) {
//             vehicle.wheelInfos[i].frictionSlip = 1;
//         }
//     }

//     // 添加视觉效果（可选）
//     if (isDrifting && speed > 10) {
//         createDriftParticles();
//     }
// }

// 添加漂移粒子效果（可选）
function createDriftParticles() {
    // 为后轮创建漂移痕迹
    const wheelPositions = [
        vehicle.wheelInfos[2].worldTransform.position,
        vehicle.wheelInfos[3].worldTransform.position
    ];

    wheelPositions.forEach(pos => {
        const particleGeometry = new THREE.SphereGeometry(0.1);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.5
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        particle.position.set(pos.x, 0.1, pos.z);
        scene.add(particle);

        // 粒子淡出动画
        const fadeOut = setInterval(() => {
            particle.material.opacity -= 0.02;
            if (particle.material.opacity <= 0) {
                scene.remove(particle);
                clearInterval(fadeOut);
            }
        }, 50);
    });
}

// 创建速度表和挡位显示
function createSpeedometer() {
    const speedometer = document.createElement('div');
    speedometer.id = 'speedometer';
    speedometer.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 150px;
        height: 150px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: Arial, sans-serif;
        z-index: 1000;
    `;

    // 添加挡位显示
    const gearDisplay = document.createElement('div');
    gearDisplay.id = 'gear-display';
    gearDisplay.style.cssText = `
        position: absolute;
        top: 20px;
        font-size: 24px;
        font-weight: bold;
        color: #44ff44;
    `;

    // 添加速度数值显示
    const speedValue = document.createElement('div');
    speedValue.id = 'speed-value';
    speedValue.style.cssText = `
        font-size: 36px;
        font-weight: bold;
        margin-bottom: 5px;
    `;

    // 添加单位显示
    const speedUnit = document.createElement('div');
    speedUnit.textContent = 'km/h';
    speedUnit.style.cssText = `
        font-size: 14px;
        opacity: 0.8;
    `;

    // 添加速度指示器
    const speedIndicator = document.createElement('div');
    speedIndicator.id = 'speed-indicator';
    speedIndicator.style.cssText = `
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        border-radius: 50%;
        clip-path: polygon(50% 50%, 50% 0, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0);
        background: linear-gradient(90deg, #44ff44 0%, #ffff44 50%, #ff4444 100%);
        opacity: 0.3;
        transform-origin: center;
    `;

    // 添加速度刻度（可选）
    const speedMarks = document.createElement('div');
    speedMarks.style.cssText = `
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
    `;

    
    speedometer.appendChild(speedIndicator);
    speedometer.appendChild(gearDisplay);
    speedometer.appendChild(speedValue);
    speedometer.appendChild(speedUnit);
    speedometer.appendChild(speedMarks);
    document.body.appendChild(speedometer);
}

// 更新速度表和挡位
function updateSpeedometer() {
    const velocity = vehicle.chassisBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const speedKmh = Math.round(speed * 3.6);
    
    const speedValue = document.getElementById('speed-value');
    const speedIndicator = document.getElementById('speed-indicator');
    const gearDisplay = document.getElementById('gear-display');
    
    // 更新速度显示
    speedValue.textContent = speedKmh;
    

    // 改进的挡位判断逻辑
    if (speed < 0.5) {
        // 完全停止时显示N
        gearDisplay.textContent = 'N';
        gearDisplay.style.color = '#ffff44';
        lastDriveState = 'N';
    } else {
        // 检查当前驱动输入
        if (keysPressed['ArrowUp']) {
            // 按下前进键
            lastDriveState = 'D';
        } else if (keysPressed['ArrowDown']) {
            // 按下后退键
            lastDriveState = 'R';
        }
        // 没有按键时保持上一个状态
        
        // 显示当前挡位
        gearDisplay.textContent = lastDriveState;
        switch(lastDriveState) {
            case 'D':
                gearDisplay.style.color = '#44ff44';
                break;
            case 'R':
                gearDisplay.style.color = '#ff4444';
                break;
            case 'N':
                gearDisplay.style.color = '#ffff44';
                break;
        }
    }
}

// 添加更新云朵的函数
function updateClouds() {
    scene.children.forEach(child => {
        if (child instanceof THREE.Group && child.children.length > 0 && child.userData.direction) {
            // 确保child.userData.direction存在后再使用clone
            child.position.add(
                child.userData.direction.clone().multiplyScalar(child.userData.speed)
            );
            
            // 如果云朵移出范围，将其传送到对面
            const limit = 500;
            if (child.position.x > limit) child.position.x = -limit;
            if (child.position.x < -limit) child.position.x = limit;
            if (child.position.z > limit) child.position.z = -limit;
            if (child.position.z < -limit) child.position.z = limit;
            
            // 让云朵轻上下浮动
            child.position.y += Math.sin(Date.now() * 0.001) * 0.05;
        }
    });
}

// 添加更新天空盒的函数
function updateSky() {
    if (sky && vehicle) {
        const vehiclePos = vehicle.chassisBody.position;
        sky.position.set(vehiclePos.x, 0, vehiclePos.z);
        
        if (dayNightCycle) {
            const time = Date.now() * 0.000001; // 控制昼夜循环速度
            const dayMix = (Math.sin(time) + 1) * 0.5;
            
            // 更新天空颜色
            const uniforms = sky.material.uniforms;
            const dayTopColor = new THREE.Color(0x0077ff);
            const dayBottomColor = new THREE.Color(0x87ceeb);
            const nightTopColor = new THREE.Color(0x000033);
            const nightBottomColor = new THREE.Color(0x000066);
            
            uniforms.topColor.value.lerpColors(nightTopColor, dayTopColor, dayMix);
            uniforms.bottomColor.value.lerpColors(nightBottomColor, dayBottomColor, dayMix);
            
            // 更新太阳和月亮位置
            const radius = 800;
            const height = Math.sin(time) * radius;
            const depth = Math.cos(time) * radius;
            
            // 太阳位置和亮度
            sun.position.set(0, height, -depth);
            sun.material.color.setRGB(1, dayMix * 0.5 + 0.5, dayMix * 0.3 + 0.7);
            sun.children[0].material.opacity = dayMix; // 调整光晕
            
            // 月亮位置和亮度（与太阳相反）
            moon.position.set(0, -height, depth);
            moon.material.color.setRGB(
                0.7 + (1 - dayMix) * 0.3,
                0.7 + (1 - dayMix) * 0.3,
                0.7 + (1 - dayMix) * 0.3
            );
            moon.children[0].material.opacity = 1 - dayMix; // 调整光晕
            
            // 更新环境光
            const ambientLight = scene.children.find(child => child instanceof THREE.AmbientLight);
            if (ambientLight) {
                ambientLight.intensity = 0.2 + dayMix * 0.8;
            }
        }
        
        // 更新云朵
        updateClouds();
    }
}

// 可选：添加昼夜循环
function updateDayNightCycle() {
    if (sky) {
        const time = Date.now() * 0.000001; // 控制昼夜循环速度
        const topColor = sky.material.uniforms.topColor.value;
        const bottomColor = sky.material.uniforms.bottomColor.value;
        
        // 根据时间更新天空颜色
        const dayTop = new THREE.Color(0x0077ff);
        const dayBottom = new THREE.Color(0x87ceeb);
        const nightTop = new THREE.Color(0x000033);
        const nightBottom = new THREE.Color(0x000066);
        
        const dayMix = (Math.sin(time) + 1) * 0.5;
        topColor.lerpColors(nightTop, dayTop, dayMix);
        bottomColor.lerpColors(nightBottom, dayBottom, dayMix);
        
        // 更新太阳/月亮位置
        if (sky.children[0]) {
            const celestialBody = sky.children[0];
            celestialBody.position.y = Math.sin(time) * 800;
            celestialBody.position.z = Math.cos(time) * 800;
            
            // 根据时间更改发光体颜色（太阳/月亮）
            const sunColor = new THREE.Color(0xffffaa);
            const moonColor = new THREE.Color(0x888888);
            celestialBody.material.color.lerpColors(moonColor, sunColor, dayMix);
        }
    }
}

// 添加创建跟随天空盒的函数
function createFollowingSky() {
    // 创建天空球体
    const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
    
    // 创建渐变材质
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0x87ceeb) },
            offset: { value: 400 },
            exponent: { value: 0.6 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + offset).y;
                gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
            }
        `,
        side: THREE.BackSide,
        fog: false
    });

    sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    // 创建太阳
    const sunGeometry = new THREE.SphereGeometry(50, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        fog: false
    });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    
    // 添加太阳光晕
    const sunGlowGeometry = new THREE.SphereGeometry(60, 32, 32);
    const sunGlowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            viewVector: { value: camera.position }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                vec3 vNormal = normalize(normalMatrix * normal);
                vec3 vNormel = normalize(normalMatrix * viewVector);
                intensity = pow(0.6 - dot(vNormal, vNormel), 2.0);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float intensity;
            void main() {
                vec3 glow = vec3(1.0, 0.8, 0.0) * intensity;
                gl_FragColor = vec4(glow, 1.0);
            }
        `,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
    sun.add(sunGlow);
    sky.add(sun);

    // 创建月亮
    const moonGeometry = new THREE.SphereGeometry(40, 32, 32);
    const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        fog: false
    });
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    
    // 添加月亮光晕
    const moonGlowGeometry = new THREE.SphereGeometry(45, 32, 32);
    const moonGlowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            viewVector: { value: camera.position }
        },
        vertexShader: `
            uniform vec3 viewVector;
            varying float intensity;
            void main() {
                vec3 vNormal = normalize(normalMatrix * normal);
                vec3 vNormel = normalize(normalMatrix * viewVector);
                intensity = pow(0.6 - dot(vNormal, vNormel), 2.0);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float intensity;
            void main() {
                vec3 glow = vec3(0.8, 0.8, 0.8) * intensity;
                gl_FragColor = vec4(glow, 1.0);
            }
        `,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
    moon.add(moonGlow);
    sky.add(moon);
} 

// 添加3D文本显示玩家ID的函数
function createPlayerLabel(id) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    context.fillStyle = '#ffffff';
    context.font = '32px Arial';
    context.textAlign = 'center';
    context.fillText(id, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 2; // 位于车顶上方
    
    return sprite;
}

// 修改初始化其他玩家的函数
function initOtherPlayer(playerData) {
    if(DEBUG) console.log('Initializing other player:', playerData);
    
    // 检查玩家是否已存在，使用socketId检查
    if(Array.from(otherPlayers.values()).some(p => p.socketId === playerData.socketId)) {
        if(DEBUG) console.log('Player already exists:', playerData.socketId);
        return;
    }

    // 创建其他玩家的车辆模型
    const otherChassisGeometry = new THREE.BoxGeometry(4, 1, 2);
    const otherChassisMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: false,
        opacity: 1
    });
    const otherChassisMesh = new THREE.Mesh(otherChassisGeometry, otherChassisMaterial);
    
    // 设置初始位置
    if(playerData.position) {
        otherChassisMesh.position.copy(playerData.position);
    }
    if(playerData.quaternion) {
        otherChassisMesh.quaternion.copy(playerData.quaternion);
    }
    
    // 创建ID标签
    const label = createPlayerLabel(playerData.id);
    otherChassisMesh.add(label);
    
    scene.add(otherChassisMesh);
    
    // 使用socketId作为Map的key
    otherPlayers.set(playerData.socketId, {
        mesh: otherChassisMesh,
        label: label,
        id: playerData.id,
        socketId: playerData.socketId
    });

    if(DEBUG) console.log('Other player initialized:', playerData.id);
    if(DEBUG) console.log('Current other players:', otherPlayers);
}

// 修改socket事件处理
function initSocketEvents() {
    socket = io('http://localhost:3001', {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        if(DEBUG) console.log('Connected to server');
    });
    
    socket.on('players', players => {
        if(DEBUG) console.log('Received players list:', players);
        players.forEach(player => {
            if(player.id !== playerId) {
                initOtherPlayer(player);
            }
        });
    });
    
    socket.on('player_joined', data => {
        if(DEBUG) console.log('Player joined:', data);
        if(data.id !== playerId) {
            initOtherPlayer(data);
        }
    });
    
    socket.on('player_left', socketId => {
        if(DEBUG) console.log('Player left:', socketId);
        const player = otherPlayers.get(socketId);
        if(player) {
            scene.remove(player.mesh);
            otherPlayers.delete(socketId);
            if(DEBUG) console.log('Removed player:', socketId);
        }
    });
    
    socket.on('player_moved', data => {
        if(DEBUG) console.log('Player moved:', data);
        // 遍历所有玩家找到匹配的ID
        otherPlayers.forEach((player, socketId) => {
            if(player.id === data.id) {
                player.mesh.position.copy(data.position);
                player.mesh.quaternion.copy(data.quaternion);
            }
        });
    });
    
    socket.on('join_failed', message => {
        document.getElementById('error-message').textContent = message;
    });
}

// 修改joinGame函数
window.joinGame = function() {
    const idInput = document.getElementById('player-id');
    playerId = idInput.value.trim();
    
    if(playerId) {
        if(DEBUG) console.log('Joining game with ID:', playerId);
        socket.emit('join', playerId);
        document.getElementById('login-screen').style.display = 'none';
        
        // 为当前玩家的车辆添加ID标签
        const label = createPlayerLabel(playerId);
        chassisMesh.add(label);
    } else {
        document.getElementById('error-message').textContent = '请输入有效的ID';
    }
}



