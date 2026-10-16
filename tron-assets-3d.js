function initThreeScene() {
            const container = document.getElementById('canvas-container');
            const canvas = document.getElementById('game-canvas');

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x010409);
            scene.fog = new THREE.FogExp2(0x010409, 0.00038);

            camera = new THREE.PerspectiveCamera(
                62,
                container.clientWidth / container.clientHeight,
                0.5,
                4800
            );

            renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                powerPreference: 'high-performance'
            });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

            clock = new THREE.Clock();

            const ambientLight = new THREE.AmbientLight(0x1a3252, 1.5);
            scene.add(ambientLight);

            const dirLight1 = new THREE.DirectionalLight(0xd8f8ff, 1.0);
            dirLight1.position.set(300, 700, 400);
            scene.add(dirLight1);

            const dirLight2 = new THREE.DirectionalLight(0xff5500, 0.55);
            dirLight2.position.set(-400, 500, -600);
            scene.add(dirLight2);

            buildTronArena();
        }

        function createGridFloorTexture(tierType = 'MAIN') {
            const c = document.createElement('canvas');
            c.width = 1024;
            c.height = 1024;
            const ctx = c.getContext('2d');

            if (tierType === 'VOID') {
                ctx.fillStyle = '#010206';
                ctx.fillRect(0, 0, 1024, 1024);
                ctx.strokeStyle = 'rgba(255, 35, 55, 0.16)';
                ctx.lineWidth = 2;
                const step = 128;
                for (let i = 0; i <= 1024; i += step) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
                }
            } else {
                ctx.fillStyle = '#02050b';
                ctx.fillRect(0, 0, 1024, 1024);

                const tileStep = 128;
                for (let gx = 0; gx < 1024; gx += tileStep) {
                    for (let gy = 0; gy < 1024; gy += tileStep) {
                        const grad = ctx.createLinearGradient(gx, gy, gx + tileStep, gy + tileStep);
                        grad.addColorStop(0, 'rgba(12, 34, 58, 0.16)');
                        grad.addColorStop(0.5, 'rgba(2, 7, 15, 0.04)');
                        grad.addColorStop(1, 'rgba(0, 195, 255, 0.09)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(gx + 6, gy + 6, tileStep - 12, tileStep - 12);

                        ctx.strokeStyle = 'rgba(70, 165, 215, 0.11)';
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(gx + 10, gy + 10, tileStep - 20, tileStep - 20);
                    }
                }

                ctx.save();
                ctx.shadowColor = '#66eeff';
                ctx.shadowBlur = 12;
                ctx.strokeStyle = 'rgba(110, 230, 255, 0.42)';
                ctx.lineWidth = 4.5;
                for (let i = 0; i <= 1024; i += tileStep) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
                }
                ctx.restore();

                ctx.strokeStyle = 'rgba(235, 252, 255, 0.94)';
                ctx.lineWidth = 2.0;
                for (let i = 0; i <= 1024; i += tileStep) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
                }

                ctx.fillStyle = '#ffffff';
                for (let gx = 0; gx <= 1024; gx += tileStep) {
                    for (let gy = 0; gy <= 1024; gy += tileStep) {
                        ctx.fillRect(gx - 2.5, gy - 2.5, 5, 5);
                    }
                }
            }

            const texture = new THREE.CanvasTexture(c);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            if (renderer && renderer.capabilities) {
                texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            } else {
                texture.anisotropy = 4;
            }
            return texture;
        }

        function createStadiumFloorGeometry(polyPts, holes = [], uvScale = 180) {
            const shape = new THREE.Shape();
            polyPts.forEach((pt, idx) => {
                if (idx === 0) shape.moveTo(pt.x, -pt.z);
                else shape.lineTo(pt.x, -pt.z);
            });
            shape.closePath();

            holes.forEach(h => {
                const holePath = new THREE.Path();
                holePath.moveTo(h.minX, -h.minZ);
                holePath.lineTo(h.maxX, -h.minZ);
                holePath.lineTo(h.maxX, -h.maxZ);
                holePath.lineTo(h.minX, -h.maxZ);
                holePath.closePath();
                shape.holes.push(holePath);
            });

            const geo = new THREE.ShapeGeometry(shape);
            geo.rotateX(-Math.PI / 2);

            const posAttr = geo.attributes.position;
            const uvAttr = geo.attributes.uv;
            for (let i = 0; i < posAttr.count; i++) {
                const vx = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                uvAttr.setXY(i, vx / uvScale, vz / uvScale);
            }
            uvAttr.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        }

        function buildTronArena() {
            const iceWhiteMat = new THREE.MeshBasicMaterial({ color: 0xeafbff });
            const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

            // 0. Sub-Floor Derezzed Abyss Grid (Visible outside the active Shrinking Grid floor)
            const voidTex = createGridFloorTexture('VOID');
            const voidFloorGeo = createStadiumFloorGeometry(STADIUM_POLYGON, [], 160);
            const voidFloorMat = new THREE.MeshBasicMaterial({
                map: voidTex
            });
            const voidFloorMesh = new THREE.Mesh(voidFloorGeo, voidFloorMat);
            voidFloorMesh.position.y = -0.35;
            voidFloorMesh.renderOrder = 0;
            scene.add(voidFloorMesh);

            // 1. Active Shrinking Coliseum Smoked-Obsidian Glass Grid Floor (Y = 0)
            const mainGridTex = createGridFloorTexture('MAIN');
            const mainFloorGeo = createStadiumFloorGeometry(STADIUM_POLYGON, [], 160);
            const mainFloorMat = new THREE.MeshStandardMaterial({
                map: mainGridTex,
                roughness: 0.1,
                metalness: 0.85,
                emissive: new THREE.Color(0x003a5c),
                emissiveMap: mainGridTex,
                emissiveIntensity: 0.88
            });
            mainFloorMesh = new THREE.Mesh(mainFloorGeo, mainFloorMat);
            mainFloorMesh.position.y = 0;
            mainFloorMesh.renderOrder = 1;
            scene.add(mainFloorMesh);

            // 2. Iconic Inset Circular Disc Wars Launch Rings
            [860, -860].forEach((zPos, i) => {
                const discPlatformGroup = new THREE.Group();
                discPlatformGroup.position.set(0, 0.05, zPos);
                const ringRadii = [18, 34, 52];
                ringRadii.forEach((rad, idx) => {
                    const ringGeo = new THREE.RingGeometry(rad - 0.8, rad, 32);
                    ringGeo.rotateX(-Math.PI / 2);
                    const ringMesh = new THREE.Mesh(
                        ringGeo,
                        new THREE.MeshBasicMaterial({
                            color: i === 1 ? (idx === 1 ? 0xffcc00 : 0xff5500) : (idx === 1 ? 0xffffff : 0x00f3ff),
                            side: THREE.DoubleSide,
                            transparent: true,
                            opacity: 0.75,
                            depthWrite: false
                        })
                    );
                    ringMesh.renderOrder = 2;
                    discPlatformGroup.add(ringMesh);
                });
                scene.add(discPlatformGroup);
            });

            // Expanding Grid Floor Rezzing Pulse Ring
            const rezzRingGeo = new THREE.RingGeometry(8, 16, 64);
            rezzRingGeo.rotateX(-Math.PI / 2);
            gridRezzRingMesh = new THREE.Mesh(
                rezzRingGeo,
                new THREE.MeshBasicMaterial({
                    color: 0xd8faff,
                    transparent: true,
                    opacity: 0.0,
                    side: THREE.DoubleSide,
                    depthWrite: false
                })
            );
            gridRezzRingMesh.position.set(0, 0.12, 0);
            gridRezzRingMesh.renderOrder = 3;
            scene.add(gridRezzRingMesh);

            // 3. Outer Stadium Architecture Perimeter Walls (Static at 100% Stadium Footprint)
            const wallHeight = 18;
            const outerWallMat = new THREE.MeshBasicMaterial({
                color: 0x00d8ff,
                transparent: true,
                opacity: 0.08,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            STADIUM_EDGES.forEach(edge => {
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const edgeYaw = Math.atan2(edge.x2 - edge.x1, edge.z2 - edge.z1);

                const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(edge.len, wallHeight), outerWallMat);
                wMesh.position.set(midX, wallHeight * 0.5, midZ);
                wMesh.rotation.y = edgeYaw + Math.PI * 0.5;
                wMesh.renderOrder = 2;
                scene.add(wMesh);

                [wallHeight, 0.45].forEach((h, idx) => {
                    const rail = new THREE.Mesh(
                        new THREE.BoxGeometry(idx === 0 ? 0.6 : 0.3, idx === 0 ? 0.6 : 0.3, edge.len),
                        idx === 0 ? iceWhiteMat : cyanGlowMat
                    );
                    rail.position.set(midX, h, midZ);
                    rail.rotation.y = edgeYaw;
                    scene.add(rail);
                });
            });

            // 3b. Dynamic Shrinking Grid Containment Barrier (Scales inward with gameState.arenaScale!)
            shrinkBarrierGroup = new THREE.Group();
            const shrinkWallHeight = 14;
            shrinkWallMat = new THREE.MeshBasicMaterial({
                color: 0x00e5ff,
                transparent: true,
                opacity: 0.16,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            shrinkTopRailMat = new THREE.MeshBasicMaterial({ color: 0xeafbff });
            const shrinkBaseRailMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });

            STADIUM_EDGES.forEach(edge => {
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const edgeYaw = Math.atan2(edge.x2 - edge.x1, edge.z2 - edge.z1);

                const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(edge.len, shrinkWallHeight), shrinkWallMat);
                wMesh.position.set(midX, shrinkWallHeight * 0.5, midZ);
                wMesh.rotation.y = edgeYaw + Math.PI * 0.5;
                wMesh.renderOrder = 4;
                shrinkBarrierGroup.add(wMesh);

                [shrinkWallHeight, shrinkWallHeight * 0.45, 0.55].forEach((h, idx) => {
                    const rail = new THREE.Mesh(
                        new THREE.BoxGeometry(idx === 0 ? 0.95 : 0.55, idx === 0 ? 0.95 : 0.55, edge.len),
                        idx === 2 ? shrinkBaseRailMat : shrinkTopRailMat
                    );
                    rail.position.set(midX, h, midZ);
                    rail.rotation.y = edgeYaw;
                    shrinkBarrierGroup.add(rail);
                });
            });
            scene.add(shrinkBarrierGroup);

            // 4. Colossal Tron: Legacy Chamfered Stadium Grandstands, Vertical Light Monoliths & Crowd
            buildColiseumGrandstands();

            // 5. CLU's Docked Command Ship / Viewing Box & Aerial Recognizers
            buildCluCommandShip();
            buildPatrollingRecognizers();
            initParticlePools();
        }

        const SHARED_VOXEL_GEO = new THREE.BoxGeometry(0.65, 0.65, 0.65);
        const SHARED_FLARE_GEO = new THREE.CylinderGeometry(1.2, 2.8, 280, 12);
        const VOXEL_POOL_SIZE = 180;
        const FLARE_POOL_SIZE = 8;
        let voxelPool = [];
        let flarePool = [];
        let voxelPoolCursor = 0;
        let flarePoolCursor = 0;

        function initParticlePools() {
            const particleGroup = new THREE.Group();
            scene.add(particleGroup);

            for (let i = 0; i < VOXEL_POOL_SIZE; i++) {
                const mat = new THREE.MeshBasicMaterial({
                    color: 0x00f3ff,
                    transparent: true,
                    opacity: 1,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(SHARED_VOXEL_GEO, mat);
                mesh.visible = false;
                mesh.frustumCulled = false;
                particleGroup.add(mesh);
                voxelPool.push({
                    mesh,
                    vel: new THREE.Vector3(),
                    floorY: 0,
                    life: 0,
                    active: false
                });
            }

            for (let i = 0; i < FLARE_POOL_SIZE; i++) {
                const mat = new THREE.MeshBasicMaterial({
                    color: 0x00f3ff,
                    transparent: true,
                    opacity: 0.75,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(SHARED_FLARE_GEO, mat);
                mesh.visible = false;
                mesh.frustumCulled = false;
                particleGroup.add(mesh);
                flarePool.push({
                    mesh,
                    life: 0,
                    active: false
                });
            }
        }

        function acquirePooledVoxel(x, y, z, vx, vy, vz, colorHex, life, scale = 1.0) {
            if (voxelPool.length === 0) return;
            const p = voxelPool[voxelPoolCursor];
            voxelPoolCursor = (voxelPoolCursor + 1) % voxelPool.length;

            p.mesh.position.set(x, y, z);
            p.mesh.scale.setScalar(scale);
            p.mesh.material.color.setHex(colorHex);
            p.mesh.material.opacity = 1.0;
            p.mesh.visible = true;
            p.vel.set(vx, vy, vz);
            p.floorY = 0;
            p.life = life;
            if (!p.active) {
                p.active = true;
                derezzParticles.push(p);
            }
        }

        function acquirePooledFlare(x, y, z, colorHex) {
            if (flarePool.length === 0) return;
            const f = flarePool[flarePoolCursor];
            flarePoolCursor = (flarePoolCursor + 1) % flarePool.length;

            f.mesh.position.set(x, y + 140, z);
            f.mesh.scale.set(1, 1, 1);
            f.mesh.material.color.setHex(colorHex);
            f.mesh.material.opacity = 0.75;
            f.mesh.visible = true;
            f.life = 1.0;
            if (!f.active) {
                f.active = true;
                flareColumns.push(f);
            }
        }

        function buildColiseumGrandstands() {
            const stadiumGroup = new THREE.Group();

            const darkStructMat = new THREE.MeshStandardMaterial({
                color: 0x02060e,
                roughness: 0.25,
                metalness: 0.88
            });
            const cyanTrimMat = new THREE.MeshBasicMaterial({ color: 0x00d8ff });
            const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xeafbff });
            const orangeTrimMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });

            STADIUM_EDGES.forEach(edge => {
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const edgeYaw = Math.atan2(edge.x2 - edge.x1, edge.z2 - edge.z1);
                const outX = -edge.nx;
                const outZ = -edge.nz;
                const isNorthEnd = midZ < -950;

                for (let tier = 0; tier < 4; tier++) {
                    const outwardOffset = 52 + tier * 58;
                    const yHeight = 24 + tier * 32;
                    const tierLen = edge.len + outwardOffset * 0.85;

                    const bank = new THREE.Mesh(
                        new THREE.BoxGeometry(46, 26, tierLen),
                        darkStructMat
                    );
                    bank.position.set(midX + outX * outwardOffset, yHeight, midZ + outZ * outwardOffset);
                    bank.rotation.y = edgeYaw;
                    stadiumGroup.add(bank);

                    const strip = new THREE.Mesh(
                        new THREE.BoxGeometry(1.3, 1.5, tierLen),
                        isNorthEnd && tier >= 1 ? orangeTrimMat : (tier === 2 ? whiteLightMat : cyanTrimMat)
                    );
                    strip.position.set(
                        midX + outX * (outwardOffset - 23.5),
                        yHeight + 8,
                        midZ + outZ * (outwardOffset - 23.5)
                    );
                    strip.rotation.y = edgeYaw;
                    stadiumGroup.add(strip);
                }

                const ribCount = Math.max(2, Math.round(edge.len / 210));
                for (let r = 0; r <= ribCount; r++) {
                    const t = r / ribCount;
                    const rx = edge.x1 + (edge.x2 - edge.x1) * t;
                    const rz = edge.z1 + (edge.z2 - edge.z1) * t;

                    const rib = new THREE.Mesh(new THREE.BoxGeometry(220, 195, 10), darkStructMat);
                    rib.position.set(rx + outX * 165, 94, rz + outZ * 165);
                    rib.rotation.y = edgeYaw;
                    stadiumGroup.add(rib);

                    const slit = new THREE.Mesh(
                        new THREE.BoxGeometry(2.4, 175, 3.0),
                        isNorthEnd ? orangeTrimMat : whiteLightMat
                    );
                    slit.position.set(rx + outX * 62, 92, rz + outZ * 62);
                    slit.rotation.y = edgeYaw;
                    stadiumGroup.add(slit);
                }
            });

            const crowdCount = 9500;
            const crowdPositions = new Float32Array(crowdCount * 3);
            const crowdColors = new Float32Array(crowdCount * 3);

            const cCyan = new THREE.Color(0x00f3ff);
            const cWhite = new THREE.Color(0xe8fbff);
            const cOrange = new THREE.Color(0xff6600);

            for (let i = 0; i < crowdCount; i++) {
                const edge = STADIUM_EDGES[i % STADIUM_EDGES.length];
                const tier = i % 4;
                const t = Math.random();
                const baseX = edge.x1 + (edge.x2 - edge.x1) * t;
                const baseZ = edge.z1 + (edge.z2 - edge.z1) * t;
                const outward = 36 + tier * 58 + (Math.random() - 0.5) * 24;
                const y = 38 + tier * 32 + Math.random() * 8;

                crowdPositions[i * 3] = baseX - edge.nx * outward;
                crowdPositions[i * 3 + 1] = y;
                crowdPositions[i * 3 + 2] = baseZ - edge.nz * outward;

                const isNorth = baseZ < -900;
                const col = isNorth && Math.random() < 0.65
                    ? cOrange
                    : (Math.random() < 0.68 ? cCyan : cWhite);
                crowdColors[i * 3] = col.r;
                crowdColors[i * 3 + 1] = col.g;
                crowdColors[i * 3 + 2] = col.b;
            }

            const crowdGeo = new THREE.BufferGeometry();
            crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPositions, 3));
            crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdColors, 3));

            const crowdMat = new THREE.PointsMaterial({
                size: 3.2,
                vertexColors: true,
                transparent: true,
                opacity: 0.86
            });
            const crowdPoints = new THREE.Points(crowdGeo, crowdMat);
            stadiumGroup.add(crowdPoints);

            scene.add(stadiumGroup);
        }

        function buildCluCommandShip() {
            const shipGroup = new THREE.Group();
            const hullMat = new THREE.MeshStandardMaterial({
                color: 0x04070d,
                roughness: 0.2,
                metalness: 0.9
            });
            const orangeGlow = new THREE.MeshBasicMaterial({ color: 0xff5500 });
            const goldGlass = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.75
            });

            const mainHull = new THREE.Mesh(new THREE.BoxGeometry(340, 42, 130), hullMat);
            shipGroup.add(mainHull);

            const windowStrip = new THREE.Mesh(new THREE.BoxGeometry(290, 14, 132), goldGlass);
            windowStrip.position.set(0, 4, 0);
            shipGroup.add(windowStrip);

            [-150, 150].forEach(ox => {
                const spire = new THREE.Mesh(new THREE.BoxGeometry(22, 160, 48), hullMat);
                spire.position.set(ox, 45, -10);
                shipGroup.add(spire);

                const spireNeon = new THREE.Mesh(new THREE.BoxGeometry(24, 155, 2.5), orangeGlow);
                spireNeon.position.set(ox, 45, 15);
                shipGroup.add(spireNeon);
            });

            shipGroup.position.set(0, 215, -ARENA_HALF_Z - 145);
            scene.add(shipGroup);
        }

        function buildPatrollingRecognizers() {
            const hullMat = new THREE.MeshStandardMaterial({
                color: 0x050912,
                roughness: 0.25,
                metalness: 0.88
            });
            const orangeNeon = new THREE.MeshBasicMaterial({ color: 0xff4400 });

            for (let i = 0; i < 2; i++) {
                const rec = new THREE.Group();

                const topBeam = new THREE.Mesh(new THREE.BoxGeometry(110, 22, 36), hullMat);
                topBeam.position.set(0, 75, 0);
                rec.add(topBeam);

                const topTrim = new THREE.Mesh(new THREE.BoxGeometry(112, 2.4, 38), orangeNeon);
                topTrim.position.set(0, 75, 0);
                rec.add(topTrim);

                [-44, 44].forEach(lx => {
                    const leg = new THREE.Mesh(new THREE.BoxGeometry(20, 85, 32), hullMat);
                    leg.position.set(lx, 28, 0);
                    rec.add(leg);

                    const legTrim = new THREE.Mesh(new THREE.BoxGeometry(21, 82, 2.2), orangeNeon);
                    legTrim.position.set(lx, 28, 16);
                    rec.add(legTrim);

                    const foot = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 46), orangeNeon);
                    foot.position.set(lx, -16, 0);
                    rec.add(foot);
                });

                scene.add(rec);
                recognizers.push({
                    mesh: rec,
                    angle: i * Math.PI,
                    radiusX: ARENA_HALF_X + 360,
                    radiusZ: ARENA_HALF_Z + 360,
                    height: 250 + i * 45
                });
            }
        }

        // Updates the Shrinking Grid scale, visual laser walls, and derezzing border sparks
        function updateShrinkingGrid(dt) {
            if (gameState.status !== 'PLAYING') return;

            const totalCycles = Math.max(2, cycles.length);
            const aliveCycles = cycles.filter(c => c.alive).length;
            const casualtyRatio = 1.0 - (aliveCycles / totalCycles);

            if (matchElapsedTime > SHRINK_START_TIME) {
                const shrinkElapsed = matchElapsedTime - SHRINK_START_TIME;
                // Continuous time shrink + acceleration as riders get derezzed
                const targetScale = Math.max(
                    MIN_ARENA_SCALE,
                    1.0 - shrinkElapsed * 0.0115 - casualtyRatio * 0.18
                );

                const prevScale = gameState.arenaScale;
                gameState.arenaScale = THREE.MathUtils.lerp(gameState.arenaScale, targetScale, dt * 0.95);
                if (gameState.arenaScale > targetScale) {
                    gameState.arenaScale = Math.max(targetScale, gameState.arenaScale - dt * 0.012);
                }
                gameState.isShrinking = (prevScale - gameState.arenaScale) > 0.00005;
            } else {
                gameState.arenaScale = 1.0;
                gameState.isShrinking = false;
            }

            // Apply scale to the 3D obsidian floor and the glowing containment barrier
            if (mainFloorMesh) {
                mainFloorMesh.scale.set(gameState.arenaScale, 1, gameState.arenaScale);
            }
            if (shrinkBarrierGroup) {
                shrinkBarrierGroup.scale.set(gameState.arenaScale, 1, gameState.arenaScale);
            }

            // Pulse the containment barrier crimson/orange when shrinking is active
            if (shrinkWallMat && shrinkTopRailMat) {
                if (gameState.isShrinking || gameState.arenaScale < 0.98) {
                    const pulse = 0.5 + 0.5 * Math.sin(matchElapsedTime * 8.0);
                    shrinkWallMat.color.setHex(pulse > 0.5 ? 0xff2244 : 0xff5500);
                    shrinkWallMat.opacity = 0.22 + pulse * 0.14;
                    shrinkTopRailMat.color.setHex(pulse > 0.4 ? 0xffaa00 : 0xffffff);
                } else {
                    shrinkWallMat.color.setHex(0x00e5ff);
                    shrinkWallMat.opacity = 0.14;
                    shrinkTopRailMat.color.setHex(0xeafbff);
                }
            }

            // Spawn derezzing crimson/orange floor sparks along the shrinking perimeter
            if (gameState.isShrinking) {
                gameState.shrinkSparkTimer -= dt;
                if (gameState.shrinkSparkTimer <= 0) {
                    gameState.shrinkSparkTimer = 0.09;
                    const edge = STADIUM_EDGES[Math.floor(Math.random() * STADIUM_EDGES.length)];
                    const t = Math.random();
                    const s = gameState.arenaScale;
                    const sx = (edge.x1 + (edge.x2 - edge.x1) * t) * s;
                    const sz = (edge.z1 + (edge.z2 - edge.z1) * t) * s;
                    spawnBorderDerezzSpark(sx, sz);
                }
            }

            // Announce Shrinking Grid milestones on the combat feed
            const pct = Math.round(gameState.arenaScale * 100);
            const milestones = [95, 75, 50, 35];
            for (const m of milestones) {
                if (pct <= m && gameState.shrinkMilestoneAnnounced > m) {
                    gameState.shrinkMilestoneAnnounced = m;
                    const msg = m === 95
                        ? 'WARNING // OUTER GRID SECTORS DEREZZING'
                        : `WARNING // ACTIVE GRID SHRUNK TO ${m}%`;
                    showCombatFeed(msg, true);
                    break;
                }
            }
        }

        function spawnBorderDerezzSpark(x, z) {
            acquirePooledVoxel(
                x,
                0.8 + Math.random() * 3.0,
                z,
                (Math.random() - 0.5) * 12,
                14 + Math.random() * 22,
                (Math.random() - 0.5) * 12,
                Math.random() < 0.5 ? 0xff2244 : 0xff6600,
                0.75,
                1.8
            );
        }

        function createLightcycleMesh(neonColorHex) {
            const group = new THREE.Group();

            const bodyMat = new THREE.MeshStandardMaterial({
                color: 0x050912,
                roughness: 0.14,
                metalness: 0.92
            });

            const carbonMat = new THREE.MeshStandardMaterial({
                color: 0x0a111e,
                roughness: 0.35,
                metalness: 0.78
            });

            const glassMat = new THREE.MeshStandardMaterial({
                color: 0x0d2644,
                roughness: 0.06,
                metalness: 0.9,
                transparent: true,
                opacity: 0.24,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const neonMat = new THREE.MeshBasicMaterial({
                color: neonColorHex
            });

            const whiteCoreMat = new THREE.MeshBasicMaterial({
                color: 0xffffff
            });

            const laserSweepMat = new THREE.MeshBasicMaterial({
                color: neonColorHex,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const wheelRadius = WHEEL_RADIUS;
            const innerHubRadius = 0.76;
            const tireWidth = 0.74;

            const buildHublessWheel = (isRear = false) => {
                const wGroup = new THREE.Group();

                const outerTireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, tireWidth, 36, 1, true);
                outerTireGeo.rotateZ(Math.PI / 2);
                wGroup.add(new THREE.Mesh(outerTireGeo, bodyMat));

                const innerHubGeo = new THREE.CylinderGeometry(innerHubRadius, innerHubRadius, tireWidth * 0.96, 36, 1, true);
                innerHubGeo.rotateZ(Math.PI / 2);
                const innerMat = bodyMat.clone();
                innerMat.side = THREE.BackSide;
                wGroup.add(new THREE.Mesh(innerHubGeo, innerMat));

                const sideRingGeo = new THREE.RingGeometry(innerHubRadius, wheelRadius, 36);
                sideRingGeo.rotateY(Math.PI / 2);
                [-tireWidth * 0.48, tireWidth * 0.48].forEach(ox => {
                    const sideWall = new THREE.Mesh(sideRingGeo, carbonMat.clone());
                    sideWall.material.side = THREE.DoubleSide;
                    sideWall.position.x = ox;
                    wGroup.add(sideWall);
                });

                const outerRimGeo = new THREE.TorusGeometry(0.95, 0.065, 16, 44);
                outerRimGeo.rotateY(Math.PI / 2);
                const innerCoreGeo = new THREE.TorusGeometry(0.81, 0.032, 12, 44);
                innerCoreGeo.rotateY(Math.PI / 2);

                [-tireWidth * 0.5, tireWidth * 0.5].forEach(ox => {
                    const rim = new THREE.Mesh(outerRimGeo, neonMat);
                    rim.position.x = ox;
                    wGroup.add(rim);

                    const coreRim = new THREE.Mesh(innerCoreGeo, whiteCoreMat);
                    coreRim.position.x = ox;
                    wGroup.add(coreRim);
                });

                const fenderArcGeo = new THREE.TorusGeometry(wheelRadius + 0.04, 0.22, 14, 28, Math.PI * 0.95);
                fenderArcGeo.rotateY(Math.PI / 2);
                const fender = new THREE.Mesh(fenderArcGeo, bodyMat);
                fender.rotation.x = isRear ? -0.35 : 0.35;
                wGroup.add(fender);

                const fenderNeonGeo = new THREE.TorusGeometry(wheelRadius + 0.06, 0.038, 10, 28, Math.PI * 0.92);
                fenderNeonGeo.rotateY(Math.PI / 2);
                [-0.22, 0.22].forEach(ox => {
                    const fNeon = new THREE.Mesh(fenderNeonGeo, neonMat);
                    fNeon.position.x = ox;
                    fNeon.rotation.x = isRear ? -0.35 : 0.35;
                    wGroup.add(fNeon);
                });

                if (isRear) {
                    const emitterPillar = new THREE.Mesh(
                        new THREE.BoxGeometry(0.28, WALL_HEIGHT * 0.92, 0.34),
                        bodyMat
                    );
                    emitterPillar.position.set(0, 0, wheelRadius * 0.88);
                    wGroup.add(emitterPillar);

                    const emitterSlit = new THREE.Mesh(
                        new THREE.BoxGeometry(0.14, WALL_HEIGHT * 0.96, 0.38),
                        whiteCoreMat
                    );
                    emitterSlit.position.set(0, 0, wheelRadius * 0.92);
                    wGroup.add(emitterSlit);

                    const emitterGlowAura = new THREE.Mesh(
                        new THREE.BoxGeometry(0.24, WALL_HEIGHT, 0.32),
                        neonMat
                    );
                    emitterGlowAura.position.set(0, 0, wheelRadius * 0.90);
                    wGroup.add(emitterGlowAura);
                } else {
                    const noseProw = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.65), bodyMat);
                    noseProw.position.set(0, 0.15, -wheelRadius * 0.86);
                    noseProw.rotation.x = 0.35;
                    wGroup.add(noseProw);

                    const noseLaser = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.05, 0.68), neonMat);
                    noseLaser.position.set(0, 0.15, -wheelRadius * 0.87);
                    noseLaser.rotation.x = 0.35;
                    wGroup.add(noseLaser);
                }

                return wGroup;
            };

            const frontWheelGroup = buildHublessWheel(false);
            frontWheelGroup.position.set(0, wheelRadius, -1.85);
            group.add(frontWheelGroup);

            const rearWheelGroup = buildHublessWheel(true);
            rearWheelGroup.position.set(0, wheelRadius, 1.85);
            group.add(rearWheelGroup);

            const saddleGroup = new THREE.Group();
            group.add(saddleGroup);

            const tankSpine = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 2.35), bodyMat);
            tankSpine.position.set(0, 0.84, 0.05);
            saddleGroup.add(tankSpine);

            const seatPad = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.95), carbonMat);
            seatPad.position.set(0, 1.08, 0.48);
            saddleGroup.add(seatPad);

            const steeringBridge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.52), bodyMat);
            steeringBridge.position.set(0, 1.18, -0.96);
            steeringBridge.rotation.x = -0.25;
            saddleGroup.add(steeringBridge);

            [-0.32, 0.32].forEach(hx => {
                const forkMount = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 12), neonMat);
                forkMount.rotation.z = Math.PI / 2;
                forkMount.position.set(hx, 1.24, -0.98);
                saddleGroup.add(forkMount);
            });

            [-0.25, 0.25].forEach(sideX => {
                const lowerRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 2.55), neonMat);
                lowerRibbon.position.set(sideX, 0.92, 0.05);
                saddleGroup.add(lowerRibbon);

                const midRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 2.1), whiteCoreMat);
                midRibbon.position.set(sideX * 1.04, 0.74, 0.1);
                saddleGroup.add(midRibbon);

                const pegStrut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.36), carbonMat);
                pegStrut.position.set(sideX * 1.35, 0.52, 1.18);
                saddleGroup.add(pegStrut);

                const pegGlow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.32), neonMat);
                pegGlow.position.set(sideX * 1.35, 0.57, 1.18);
                saddleGroup.add(pegGlow);
            });

            const canopyGroup = new THREE.Group();
            canopyGroup.position.set(0, 1.22, -0.95);
            group.add(canopyGroup);

            [-0.26, 0.26].forEach(rx => {
                const archRail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 2.45), neonMat);
                archRail.position.set(rx, 0.76, 1.05);
                archRail.rotation.x = -0.10;
                canopyGroup.add(archRail);
            });

            const windscreen = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32, 0.42, 2.35, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
                glassMat
            );
            windscreen.rotation.x = Math.PI / 2 - 0.10;
            windscreen.rotation.y = Math.PI;
            windscreen.position.set(0, 0.62, 1.02);
            canopyGroup.add(windscreen);

            const holoSweepPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 4.8), laserSweepMat);
            holoSweepPlane.rotation.x = -Math.PI / 2;
            holoSweepPlane.position.set(0, 1.1, 0);
            group.add(holoSweepPlane);

            const cycleLight = new THREE.PointLight(neonColorHex, 1.5, 22);
            cycleLight.position.set(0, 1.8, 0);
            group.add(cycleLight);

            group.userData = {
                frontWheelGroup,
                rearWheelGroup,
                saddleGroup,
                canopyGroup,
                holoSweepPlane,
                laserSweepMat,
                wheelRadius
            };

            return group;
        }

        function createCharacterMesh(config) {
            const id = (config.id || '').toLowerCase();
            const neonColorHex = config.colorHex;

            const isSam = id.includes('flynn');
            const isRinzler = id.includes('rinzler');
            const isClu = id.includes('clu');
            const isQuorra = id.includes('quorra');
            const isTron = id.includes('tron');

            const root = new THREE.Group();

            const suitMat = new THREE.MeshStandardMaterial({
                color: 0x050811,
                roughness: 0.32,
                metalness: 0.78
            });
            const armorMat = new THREE.MeshStandardMaterial({
                color: isClu ? 0x0c0904 : 0x080f1d,
                roughness: 0.15,
                metalness: 0.92
            });
            const visorMat = new THREE.MeshStandardMaterial({
                color: isClu ? 0x331a00 : 0x02060d,
                roughness: 0.04,
                metalness: 0.98
            });
            const skinMat = new THREE.MeshStandardMaterial({
                color: 0xd8b49a,
                roughness: 0.55,
                metalness: 0.1
            });
            const neonMat = new THREE.MeshBasicMaterial({
                color: neonColorHex
            });
            const whiteCoreMat = new THREE.MeshBasicMaterial({
                color: 0xffffff
            });
            const holoGridMat = new THREE.MeshBasicMaterial({
                color: neonColorHex,
                wireframe: true,
                transparent: true,
                opacity: 0.0
            });

            const scale = isQuorra ? 0.94 : 1.0;
            root.scale.set(scale, scale, scale);

            const hips = new THREE.Group();
            hips.position.set(0, 1.28, 0);
            root.add(hips);

            const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.32), armorMat);
            hips.add(pelvisMesh);

            const beltStrip = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.34), neonMat);
            beltStrip.position.set(0, 0.08, 0);
            hips.add(beltStrip);

            const torso = new THREE.Group();
            torso.position.set(0, 0.12, 0);
            hips.add(torso);

            const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.28), suitMat);
            abdomen.position.set(0, 0.18, 0);
            torso.add(abdomen);

            const chestWidth = isQuorra ? 0.52 : 0.60;
            const chest = new THREE.Mesh(new THREE.BoxGeometry(chestWidth, 0.44, 0.34), armorMat);
            chest.position.set(0, 0.52, 0);
            torso.add(chest);

            if (isSam) {
                const samBar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.355), neonMat);
                samBar.position.set(0, 0.60, 0);
                torso.add(samBar);
                [-0.14, 0.14].forEach(rx => {
                    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.35), neonMat);
                    rib.position.set(rx, 0.40, 0);
                    torso.add(rib);
                });
            } else if (isTron) {
                [-0.11, 0.11].forEach(cx => {
                    [0.44, 0.60].forEach(cy => {
                        const sq = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.10, 0.355), neonMat);
                        sq.position.set(cx, cy, 0);
                        torso.add(sq);
                    });
                });
                const centerSpine = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.52, 0.352), whiteCoreMat);
                centerSpine.position.set(0, 0.42, 0);
                torso.add(centerSpine);
            } else if (isRinzler) {
                [-1, 1].forEach(side => {
                    const chev = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.355), neonMat);
                    chev.position.set(side * 0.11, 0.56, 0);
                    chev.rotation.z = -side * 0.45;
                    torso.add(chev);

                    const chev2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.355), neonMat);
                    chev2.position.set(side * 0.10, 0.43, 0);
                    chev2.rotation.z = -side * 0.45;
                    torso.add(chev2);
                });
            } else if (isClu) {
                const collar = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.07, 0.36), neonMat);
                collar.position.set(0, 0.72, 0);
                torso.add(collar);
                [-0.35, 0.35].forEach(px => {
                    const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.38), armorMat);
                    pauldron.position.set(px, 0.68, 0);
                    torso.add(pauldron);
                    const pTrim = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.39), neonMat);
                    pTrim.position.set(px, 0.75, 0);
                    torso.add(pTrim);
                });
            } else {
                [-0.18, 0.18].forEach(fx => {
                    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.56, 0.355), neonMat);
                    strip.position.set(fx, 0.45, 0);
                    torso.add(strip);
                });
            }

            const discMount = new THREE.Group();
            discMount.position.set(0, 0.52, 0.20);
            torso.add(discMount);

            const outerDiscRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.23, 0.038, 12, 28),
                armorMat
            );
            discMount.add(outerDiscRing);

            const glowingDiscBlade = new THREE.Mesh(
                new THREE.TorusGeometry(0.24, 0.022, 12, 28),
                neonMat
            );
            discMount.add(glowingDiscBlade);

            const innerDiscCore = new THREE.Mesh(
                new THREE.TorusGeometry(0.16, 0.016, 10, 24),
                whiteCoreMat
            );
            discMount.add(innerDiscCore);

            if (isRinzler) {
                const notchBar = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.04), neonMat);
                discMount.add(notchBar);
            }

            const head = new THREE.Group();
            head.position.set(0, 0.80, 0);
            torso.add(head);

            const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 16), armorMat);
            cranium.scale.set(0.92, 1.08, 1.12);
            cranium.position.set(0, 0.14, 0);
            head.add(cranium);

            if (isSam) {
                const face = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.20, 0.22), skinMat);
                face.position.set(0, 0.09, -0.08);
                head.add(face);

                const browVisor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.28), visorMat);
                browVisor.position.set(0, 0.18, -0.06);
                head.add(browVisor);

                const browRim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.30), neonMat);
                browRim.position.set(0, 0.22, -0.06);
                head.add(browRim);
            } else {
                const visorDome = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 16), visorMat);
                visorDome.scale.set(0.90, 1.02, 1.14);
                visorDome.position.set(0, 0.13, -0.03);
                head.add(visorDome);

                const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.42), neonMat);
                crest.position.set(0, 0.24, 0);
                head.add(crest);

                [-0.16, 0.16].forEach(jx => {
                    const jawLine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.34), neonMat);
                    jawLine.position.set(jx, 0.06, -0.02);
                    jawLine.rotation.x = 0.25;
                    head.add(jawLine);
                });
            }

            const buildArm = (sideSign) => {
                const shoulder = new THREE.Group();
                shoulder.position.set(sideSign * (chestWidth * 0.5 + 0.09), 0.66, 0);
                torso.add(shoulder);

                const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), armorMat);
                shoulder.add(deltoid);

                const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.072, 0.38, 12), suitMat);
                upperArm.position.set(0, -0.19, 0);
                shoulder.add(upperArm);

                const armStripe = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.16), neonMat);
                armStripe.position.set(sideSign * 0.07, -0.19, 0);
                shoulder.add(armStripe);

                const elbow = new THREE.Group();
                elbow.position.set(0, -0.38, 0);
                shoulder.add(elbow);

                const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.058, 0.36, 12), armorMat);
                foreArm.position.set(0, -0.18, 0);
                elbow.add(foreArm);

                const foreArmGlow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.30, 0.13), neonMat);
                foreArmGlow.position.set(sideSign * 0.06, -0.18, 0);
                elbow.add(foreArmGlow);

                const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), suitMat);
                hand.position.set(0, -0.36, 0);
                elbow.add(hand);

                return { shoulder, elbow, hand };
            };

            const leftArm = buildArm(-1);
            const rightArm = buildArm(1);

            const batonGroup = new THREE.Group();
            batonGroup.position.set(0.34, 0.02, -0.18);
            torso.add(batonGroup);

            const batonLeftHalf = new THREE.Group();
            batonGroup.add(batonLeftHalf);

            const leftGripBody = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.28, 14), armorMat);
            leftGripBody.rotation.z = Math.PI / 2;
            leftGripBody.position.set(-0.14, 0, 0);
            batonLeftHalf.add(leftGripBody);

            const leftEmitterTip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.11, 14), neonMat);
            leftEmitterTip.rotation.z = Math.PI / 2;
            leftEmitterTip.position.set(-0.29, 0, 0);
            batonLeftHalf.add(leftEmitterTip);

            const leftCoreTip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 12), whiteCoreMat);
            leftCoreTip.rotation.z = Math.PI / 2;
            leftCoreTip.position.set(-0.29, 0, 0);
            batonLeftHalf.add(leftCoreTip);

            const leftWingGuard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.028, 0.07), neonMat);
            leftWingGuard.position.set(-0.16, 0.045, -0.04);
            batonLeftHalf.add(leftWingGuard);

            const batonRightHalf = new THREE.Group();
            batonGroup.add(batonRightHalf);

            const rightGripBody = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.28, 14), armorMat);
            rightGripBody.rotation.z = Math.PI / 2;
            rightGripBody.position.set(0.14, 0, 0);
            batonRightHalf.add(rightGripBody);

            const rightEmitterTip = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.048, 0.11, 14), neonMat);
            rightEmitterTip.rotation.z = Math.PI / 2;
            rightEmitterTip.position.set(0.29, 0, 0);
            batonRightHalf.add(rightEmitterTip);

            const rightCoreTip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.13, 12), whiteCoreMat);
            rightCoreTip.rotation.z = Math.PI / 2;
            rightCoreTip.position.set(0.29, 0, 0);
            batonRightHalf.add(rightCoreTip);

            const rightWingGuard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.028, 0.07), neonMat);
            rightWingGuard.position.set(0.16, 0.045, -0.04);
            batonRightHalf.add(rightWingGuard);

            const batonEnergyBridge = new THREE.Group();
            batonGroup.add(batonEnergyBridge);

            const plasmaCoreBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.64, 12), whiteCoreMat);
            plasmaCoreBeam.rotation.z = Math.PI / 2;
            batonEnergyBridge.add(plasmaCoreBeam);

            const plasmaAuraBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 12), neonMat);
            plasmaAuraBeam.rotation.z = Math.PI / 2;
            batonEnergyBridge.add(plasmaAuraBeam);

            const holoRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 10, 24), neonMat);
            holoRing1.rotation.y = Math.PI / 2;
            batonEnergyBridge.add(holoRing1);

            const holoRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.012, 10, 24), whiteCoreMat);
            holoRing2.rotation.y = Math.PI / 2;
            batonEnergyBridge.add(holoRing2);

            batonEnergyBridge.scale.set(0.01, 0.01, 0.01);
            batonEnergyBridge.visible = false;

            const buildLeg = (sideSign) => {
                const hipJoint = new THREE.Group();
                hipJoint.position.set(sideSign * 0.16, -0.06, 0);
                hips.add(hipJoint);

                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.092, 0.56, 14), suitMat);
                thigh.position.set(0, -0.28, 0);
                hipJoint.add(thigh);

                const thighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.20), neonMat);
                thighStripe.position.set(sideSign * 0.095, -0.28, 0);
                hipJoint.add(thighStripe);

                const kneeJoint = new THREE.Group();
                kneeJoint.position.set(0, -0.56, 0);
                hipJoint.add(kneeJoint);

                const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), armorMat);
                kneeJoint.add(kneePad);

                const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.068, 0.56, 14), armorMat);
                calf.position.set(0, -0.28, 0);
                kneeJoint.add(calf);

                const shinGlow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.16), neonMat);
                shinGlow.position.set(0, -0.28, -0.02);
                kneeJoint.add(shinGlow);

                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.32), armorMat);
                boot.position.set(0, -0.60, -0.06);
                kneeJoint.add(boot);

                const bootSoleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.34), neonMat);
                bootSoleGlow.position.set(0, -0.64, -0.06);
                kneeJoint.add(bootSoleGlow);

                return { hipJoint, kneeJoint, boot };
            };

            const leftLeg = buildLeg(-1);
            const rightLeg = buildLeg(1);

            const rezzShell = new THREE.Mesh(
                new THREE.BoxGeometry(1.15, 2.1, 4.2),
                holoGridMat
            );
            rezzShell.position.set(0, 1.15, 0);
            rezzShell.visible = false;
            root.add(rezzShell);

            return {
                root,
                hips,
                torso,
                head,
                leftArm,
                rightArm,
                leftLeg,
                rightLeg,
                batonGroup,
                batonLeftHalf,
                batonRightHalf,
                batonEnergyBridge,
                holoRing1,
                holoRing2,
                discMount,
                rezzShell,
                holoGridMat
            };
        }

        function createVolumetricRibbonGeometry(halfWidth, height, includeInternalCross = true) {
            const positions = [];
            const uvs = [];
            const indices = [];
            let vertOffset = 0;

            const addQuad = (x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4) => {
                positions.push(
                    x1, y1, z1,
                    x2, y2, z2,
                    x3, y3, z3,
                    x4, y4, z4
                );
                uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
                indices.push(
                    vertOffset, vertOffset + 1, vertOffset + 2,
                    vertOffset, vertOffset + 2, vertOffset + 3
                );
                vertOffset += 4;
            };

            const hy = height * 0.5;
            addQuad(-halfWidth, -hy, -0.5, -halfWidth, -hy, 0.5, -halfWidth, hy, 0.5, -halfWidth, hy, -0.5);
            addQuad(halfWidth, -hy, -0.5, halfWidth, -hy, 0.5, halfWidth, hy, 0.5, halfWidth, hy, -0.5);

            if (includeInternalCross) {
                addQuad(0, -hy, -0.5, 0, -hy, 0.5, 0, hy, 0.5, 0, hy, -0.5);
                addQuad(-halfWidth, -hy, -0.5, halfWidth, -hy, 0.5, halfWidth, hy, 0.5, -halfWidth, hy, -0.5);
                addQuad(halfWidth, -hy, -0.5, -halfWidth, -hy, 0.5, -halfWidth, hy, 0.5, halfWidth, hy, -0.5);
            }

            addQuad(-halfWidth, 0, -0.5, halfWidth, 0, -0.5, halfWidth, 0, 0.5, -halfWidth, 0, 0.5);

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            return geo;
        }

        const SHARED_RIBBON_CORE_GEO = createVolumetricRibbonGeometry(0.15, WALL_HEIGHT, true);
        const SHARED_RIBBON_GLOW_GEO = createVolumetricRibbonGeometry(0.28, WALL_HEIGHT + 0.12, false);
        const SHARED_TOP_EDGE_GEO = new THREE.BoxGeometry(0.32, 0.22, 1);
        const SHARED_MID_EDGE_GEO = new THREE.BoxGeometry(0.26, 0.10, 1);
        const SHARED_BOTTOM_EDGE_GEO = new THREE.BoxGeometry(0.34, 0.20, 1);