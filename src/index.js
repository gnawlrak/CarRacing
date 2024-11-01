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

    // 创建并添加地面
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
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

    // 创建城市地形


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
        // 城市内的地形（保持原有的城市生成逻辑）
        const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(x, 0, z);
        scene.add(groundMesh);

        // 在区块内创建建筑物
        const buildings = [];
        const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });

        // 在区块范围内创建建筑物
        for (let i = x - chunkSize/2; i < x + chunkSize/2; i += 20) {
            for (let j = z - chunkSize/2; j < z + chunkSize/2; j += 15) {
                const height = Math.random() * 20 + 10;
                
                // 创建建筑物网格
                const buildingGeometry = new THREE.BoxGeometry(5, height, 5);
                const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
                buildingMesh.position.set(i, height/2, j);
                scene.add(buildingMesh);

                // 创建建筑物物理体
                const buildingShape = new CANNON.Box(new CANNON.Vec3(2.5, height/2, 2.5));
                const buildingBody = new CANNON.Body({ mass: 0 });
                buildingBody.addShape(buildingShape);
                buildingBody.position.set(i, height/2, j);
                world.addBody(buildingBody);

                buildings.push({ 
                    mesh: buildingMesh, 
                    body: buildingBody 
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
}

function updatePhysics() {
    const maxSteerVal = 0.8; // 最大转向角
    const maxForce = 4444; // 最大发动机力
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
    rightOffset.applyQuaternion(chassisMesh.quaternion); // 将右侧方向转化为车辆当前朝向的局部坐标系
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
        camera.rotateY(Math.PI / 2); // 让相机朝向右侧
        camera.lookAt(currentCameraLookAt);
    }
}

function updateTerrain() {
    const vehiclePosition = vehicle.chassisBody.position;

    // 删除以下边界限制代码
    // if (vehiclePosition.x < WORLD_BOUNDS.min) vehiclePosition.x = WORLD_BOUNDS.min;
    // if (vehiclePosition.x > WORLD_BOUNDS.max) vehiclePosition.x = WORLD_BOUNDS.max;
    // if (vehiclePosition.z < WORLD_BOUNDS.min) vehiclePosition.z = WORLD_BOUNDS.min;
    // if (vehiclePosition.z > WORLD_BOUNDS.max) vehiclePosition.z = WORLD_BOUNDS.max;

    const currentChunkX = Math.floor(vehiclePosition.x / chunkSize) * chunkSize;
    const currentChunkZ = Math.floor(vehiclePosition.z / chunkSize) * chunkSize;

    // 定义一个二维区域来检测需要加载的新地形块
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
        if (distance > chunkSize * 2) {
            // 移除地面
            scene.remove(chunk.mesh);
            
            // 移除所有建筑物和自然元素
            chunk.buildings.forEach(building => {
                if (building.mesh instanceof THREE.Group) {
                    // 如果是组合体（比如树），移除所有子元素
                    building.mesh.children.forEach(child => {
                        scene.remove(child);
                    });
                }
                scene.remove(building.mesh);
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
    
    // 保持当前y轴旋转（朝向），但重置其他轴的旋转
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

