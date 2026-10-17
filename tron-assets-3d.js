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

function createMovieObsidianFloorTexture(isVoid = false) {
            const canvas = document.createElement('canvas');
            canvas.width = 2048;
            canvas.height = 2048;
            const ctx = canvas.getContext('2d');

            // Deep matte-obsidian base
            ctx.fillStyle = '#04080e';
            ctx.fillRect(0, 0, 2048, 2048);

            if (isVoid) {
                const voidTex = new THREE.CanvasTexture(canvas);
                voidTex.wrapS = THREE.RepeatWrapping;
                voidTex.wrapT = THREE.RepeatWrapping;
                return voidTex;
            }

            // Helper to draw a single clean, non-glowing oval square (rounded-corner squircle)
            const strokeOvalSquare = (x, y, w, h, r) => {
                const radius = Math.min(r, w * 0.5, h * 0.5);
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + w - radius, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
                ctx.lineTo(x + w, y + h - radius);
                ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
                ctx.lineTo(x + radius, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.stroke();
            };

            // Muted cool slate-silver color (distinct from cyan/blue light ribbons, zero glow)
            ctx.strokeStyle = 'rgba(116, 134, 152, 0.56)';
            ctx.lineWidth = 4.5;
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            // Uniform 4x4 grid of oval squares keeping the 512px longer edge size
            const cols = 4;
            const rows = 4;
            const cellW = canvas.width / cols;   // 512px
            const cellH = canvas.height / rows;  // 512px
            const pad = 34;

            for (let col = 0; col < cols; col++) {
                for (let row = 0; row < rows; row++) {
                    const rx = col * cellW + pad;
                    const ry = row * cellH + pad;
                    const size = cellW - pad * 2;
                    // Smooth oval-cornered square profile
                    strokeOvalSquare(rx, ry, size, size, size * 0.28);
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            if (renderer && renderer.capabilities) {
                texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            }
            return texture;
        }

        // Creates the soft vertical blurred reflection texture for stadium floodlights on the glossy floor (Frame 2)
        function createFloorReflectionStreakTexture() {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 512;
            const ctx = c.getContext('2d');

            const g = ctx.createRadialGradient(64, 256, 4, 64, 256, 220);
            g.addColorStop(0.0, 'rgba(200, 248, 255, 0.42)');
            g.addColorStop(0.25, 'rgba(80, 210, 240, 0.20)');
            g.addColorStop(0.65, 'rgba(20, 95, 130, 0.06)');
            g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 512);

            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        }

        // Creates the louvred stadium floodlight pod texture (||||||| fin pattern from Frame 1)
        function createFloodlightLouvreTexture() {
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 64;
            const ctx = c.getContext('2d');

            ctx.fillStyle = '#dffaff';
            ctx.fillRect(0, 0, 256, 64);

            // Dark vertical louvre fins across the center of the floodlight pod
            ctx.fillStyle = '#081c29';
            for (let i = 0; i < 9; i++) {
                const x = 68 + i * 14;
                ctx.fillRect(x, 8, 5, 48);
            }

            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        }

        // Creates a holographic combatant status board texture for the Monolith Tower (Frame 1)
        function createTowerHologramBoardTexture(name, isGoldHeader, isAlive = true) {
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 128;
            const ctx = c.getContext('2d');

            ctx.clearRect(0, 0, 512, 128);

            // Angled chamfered hologram frame
            ctx.fillStyle = isAlive ? 'rgba(6, 24, 38, 0.72)' : 'rgba(18, 8, 12, 0.45)';
            ctx.strokeStyle = isAlive
                ? (isGoldHeader ? 'rgba(255, 220, 135, 0.92)' : 'rgba(145, 238, 255, 0.92)')
                : 'rgba(120, 50, 60, 0.45)';
            ctx.lineWidth = 4;

            ctx.beginPath();
            ctx.moveTo(16, 14);
            ctx.lineTo(476, 14);
            ctx.lineTo(498, 42);
            ctx.lineTo(498, 112);
            ctx.lineTo(34, 112);
            ctx.lineTo(16, 88);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Left bright status block (Gold for top 5, Ice-Cyan for bottom 5, just like Frame 1)
            ctx.fillStyle = isAlive
                ? (isGoldHeader ? '#ffefc2' : '#d4f9ff')
                : 'rgba(180, 60, 70, 0.4)';
            ctx.fillRect(28, 26, 56, 74);

            // Inner telemetry bars & Program label
            ctx.fillStyle = isAlive ? '#e6fbff' : 'rgba(160, 175, 185, 0.4)';
            ctx.font = 'bold 28px Orbitron, sans-serif';
            ctx.fillText(name.toUpperCase(), 104, 58);

            // Sub-grid data lines matching the movie hologram boards
            ctx.fillStyle = isAlive
                ? (isGoldHeader ? 'rgba(255, 210, 110, 0.75)' : 'rgba(90, 220, 250, 0.75)')
                : 'rgba(180, 60, 70, 0.35)';
            ctx.fillRect(104, 74, isAlive ? 260 : 110, 8);
            ctx.fillRect(104, 90, isAlive ? 185 : 65, 6);

            const tex = new THREE.CanvasTexture(c);
            tex.needsUpdate = true;
            return tex;
        }

        function updateTowerHologramBoards() {
            if (!towerHologramBoards || towerHologramBoards.length === 0) return;
            const hostileTeam = cycles.filter(c => c.team !== 1);
            const blueTeam = cycles.filter(c => c.team === 1);

            for (let i = 0; i < 10; i++) {
                const board = towerHologramBoards[i];
                if (!board) continue;
                const isTopGroup = i < 5;
                const rider = isTopGroup ? hostileTeam[i] : blueTeam[i - 5];
                const label = rider ? rider.name : (isTopGroup ? `SENTRY 0${i + 1}` : `PROGRAM 0${i - 4}`);
                const alive = rider ? rider.alive : false;

                if (board.lastLabel !== label || board.lastAlive !== alive) {
                    board.lastLabel = label;
                    board.lastAlive = alive;
                    if (board.mesh.material.map) board.mesh.material.map.dispose();
                    board.mesh.material.map = createTowerHologramBoardTexture(label, isTopGroup, alive);
                    board.mesh.material.opacity = alive ? 0.92 : 0.38;
                    board.mesh.material.needsUpdate = true;
                }
            }
        }

        function rebuildMovieAuthenticArena() {
            if (!scene) return;

            if (renderer) {
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            }

            // 1. Remove old arena meshes while preserving lights and particle pools
            const toRemove = [];
            scene.traverse(obj => {
                if (obj.parent === scene && !(obj instanceof THREE.Light)) {
                    toRemove.push(obj);
                }
            });
            toRemove.forEach(obj => scene.remove(obj));

            recognizers.length = 0;
            derezzParticles.length = 0;
            flareColumns.length = 0;
            voxelPool.length = 0;
            flarePool.length = 0;
            towerHologramBoards = [];

            // 2. Movie-Accurate Deep Slate-Teal Atmosphere & Lighting (Frames 1 & 2)
            scene.background = new THREE.Color(0x02080e);
            scene.fog = new THREE.FogExp2(0x030c14, 0.00022);

            scene.children.forEach(obj => {
                if (obj instanceof THREE.AmbientLight) {
                    obj.color.setHex(0x162d3d);
                    obj.intensity = 1.35;
                } else if (obj instanceof THREE.DirectionalLight) {
                    if (obj.position.y > 600) {
                        obj.color.setHex(0xc8f4ff);
                        obj.intensity = 0.85;
                    } else {
                        obj.color.setHex(0x1e6b8c);
                        obj.intensity = 0.45;
                    }
                }
            });

            // 3. Sub-Floor De-Rezzed Abyss & Primary Glossy Obsidian Court Floor
            const voidTex = createMovieObsidianFloorTexture(true);
            const voidFloorGeo = createStadiumFloorGeometry(STADIUM_POLYGON, [], 340);
            const voidFloorMesh = new THREE.Mesh(
                voidFloorGeo,
                new THREE.MeshBasicMaterial({ map: voidTex })
            );
            voidFloorMesh.position.y = -0.35;
            voidFloorMesh.renderOrder = 0;
            voidFloorMesh.matrixAutoUpdate = false;
            voidFloorMesh.updateMatrix();
            scene.add(voidFloorMesh);

            const mainGridTex = createMovieObsidianFloorTexture(false);
            const mainFloorGeo = createStadiumFloorGeometry(STADIUM_POLYGON, [], 320);
            const mainFloorMat = new THREE.MeshStandardMaterial({
                map: mainGridTex,
                roughness: 0.32,
                metalness: 0.45,
                emissive: new THREE.Color(0xffffff),
                emissiveMap: mainGridTex,
                emissiveIntensity: 0.40
            });
            mainFloorMesh = new THREE.Mesh(mainFloorGeo, mainFloorMat);
            mainFloorMesh.position.y = 0;
            mainFloorMesh.renderOrder = 1;
            mainFloorMesh.matrixAutoUpdate = false;
            mainFloorMesh.updateMatrix();
            scene.add(mainFloorMesh);

            // 4. Outer Grid Perimeter Containment Barrier (Fixed at 100% Full Size)
            shrinkBarrierGroup = new THREE.Group();
            const shrinkWallHeight = 12;
            shrinkWallMat = new THREE.MeshBasicMaterial({
                color: 0x38d6f5,
                transparent: true,
                opacity: 0.11,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            shrinkTopRailMat = new THREE.MeshBasicMaterial({ color: 0xdffaff });
            const shrinkBaseRailMat = new THREE.MeshBasicMaterial({ color: 0x26b8e6 });

            STADIUM_EDGES.forEach(edge => {
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const edgeYaw = Math.atan2(edge.x2 - edge.x1, edge.z2 - edge.z1);

                const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(edge.len, shrinkWallHeight), shrinkWallMat);
                wMesh.position.set(midX, shrinkWallHeight * 0.5, midZ);
                wMesh.rotation.y = edgeYaw + Math.PI * 0.5;
                wMesh.renderOrder = 4;
                wMesh.matrixAutoUpdate = false;
                wMesh.updateMatrix();
                shrinkBarrierGroup.add(wMesh);

                [shrinkWallHeight, 0.45].forEach((h, idx) => {
                    const rail = new THREE.Mesh(
                        new THREE.BoxGeometry(idx === 0 ? 0.65 : 0.4, idx === 0 ? 0.65 : 0.4, edge.len),
                        idx === 0 ? shrinkTopRailMat : shrinkBaseRailMat
                    );
                    rail.position.set(midX, h, midZ);
                    rail.rotation.y = edgeYaw;
                    rail.matrixAutoUpdate = false;
                    rail.updateMatrix();
                    shrinkBarrierGroup.add(rail);
                });
            });
            shrinkBarrierGroup.matrixAutoUpdate = false;
            shrinkBarrierGroup.updateMatrix();
            scene.add(shrinkBarrierGroup);

            // 6. Build Movie Tribunes, Floodlight Ring, Cantilevered Prow & Monolith Scoreboard Tower
            buildMovieTribunesAndLightRing();
            buildMovieMonolithTower();
            initParticlePools();
        }

        function freezeStaticHierarchy(rootObj) {
            rootObj.traverse(child => {
                if (!(child instanceof THREE.Points)) {
                    child.matrixAutoUpdate = false;
                    child.updateMatrix();
                }
            });
        }

        function buildMovieTribunesAndLightRing() {
            const stadiumGroup = new THREE.Group();

            const obsidianStructMat = new THREE.MeshStandardMaterial({
                color: 0x03080e,
                roughness: 0.32,
                metalness: 0.85
            });
            const darkBowlMat = new THREE.MeshStandardMaterial({
                color: 0x040b12,
                roughness: 0.55,
                metalness: 0.65
            });
            const iceWhiteNeonMat = new THREE.MeshBasicMaterial({ color: 0xe6fbff });
            const softCyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x4ddbff });
            const mutedTealLineMat = new THREE.MeshBasicMaterial({
                color: 0x1e8ca8,
                transparent: true,
                opacity: 0.72
            });
            const warmAmberBoxMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
            const floodlightLouvreMat = new THREE.MeshBasicMaterial({
                map: createFloodlightLouvreTexture()
            });

            STADIUM_EDGES.forEach((edge, edgeIdx) => {
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const edgeYaw = Math.atan2(edge.x2 - edge.x1, edge.z2 - edge.z1);
                const outX = -edge.nx;
                const outZ = -edge.nz;
                const dirX = (edge.x2 - edge.x1) / edge.len;
                const dirZ = (edge.z2 - edge.z1) / edge.len;

                // A. Field-Level Trapezoidal Chamfered Dasher Barriers (Seen in both Frame 1 & Frame 2)
                const barrierCount = Math.max(3, Math.floor(edge.len / 135));
                const segSpan = edge.len / barrierCount;
                const barrierLen = segSpan * 0.68;

                for (let b = 0; b < barrierCount; b++) {
                    const centerDist = (b + 0.5) * segSpan - edge.len * 0.5;
                    const bx = midX + dirX * centerDist + outX * 14;
                    const bz = midZ + dirZ * centerDist + outZ * 14;

                    const dasherGroup = new THREE.Group();
                    dasherGroup.position.set(bx, 0, bz);
                    dasherGroup.rotation.y = edgeYaw;

                    // Dark glass backing panel
                    const panel = new THREE.Mesh(
                        new THREE.BoxGeometry(1.2, 6.2, barrierLen),
                        obsidianStructMat
                    );
                    panel.position.y = 3.1;
                    dasherGroup.add(panel);

                    // Top glowing horizontal bar of the trapezoid `/‾‾‾‾\`
                    const topBar = new THREE.Mesh(
                        new THREE.BoxGeometry(1.45, 0.45, barrierLen * 0.84),
                        iceWhiteNeonMat
                    );
                    topBar.position.y = 6.2;
                    dasherGroup.add(topBar);

                    // Left & Right angled chamfer legs `/` and `\`
                    [-1, 1].forEach(side => {
                        const leg = new THREE.Mesh(
                            new THREE.BoxGeometry(1.4, 0.42, 7.2),
                            softCyanNeonMat
                        );
                        leg.position.set(0, 3.1, side * (barrierLen * 0.45));
                        leg.rotation.x = side * 0.68;
                        dasherGroup.add(leg);
                    });

                    stadiumGroup.add(dasherGroup);
                }

                // B. Continuous Sloped Seating Bowl (No blocky vertical teeth)
                const bowlSteps = 6;
                for (let s = 0; s < bowlSteps; s++) {
                    const outDist = 42 + s * 24;
                    const stepHeight = 8 + s * 9.5;
                    const stepLen = edge.len + outDist * 0.72;

                    const bench = new THREE.Mesh(
                        new THREE.BoxGeometry(26, 10, stepLen),
                        darkBowlMat
                    );
                    bench.position.set(midX + outX * outDist, stepHeight, midZ + outZ * outDist);
                    bench.rotation.y = edgeYaw;
                    stadiumGroup.add(bench);
                }

                // C. Illuminated Stepped Aisle Stairs & Angled Support Struts (Frame 1 & Frame 2)
                const aisleCount = Math.max(3, Math.round(edge.len / 190));
                for (let a = 0; a <= aisleCount; a++) {
                    const frac = (a / aisleCount) - 0.5;
                    const ax = midX + dirX * (frac * edge.len);
                    const az = midZ + dirZ * (frac * edge.len);

                    // Glowing stepped stair treads up the seating bowl
                    for (let st = 0; st < 6; st++) {
                        const stOut = 32 + st * 24;
                        const stY = 12 + st * 9.5;
                        const tread = new THREE.Mesh(
                            new THREE.BoxGeometry(3.2, 0.45, 5.5),
                            st % 2 === 0 ? iceWhiteNeonMat : softCyanNeonMat
                        );
                        tread.position.set(ax + outX * stOut, stY, az + outZ * stOut);
                        tread.rotation.y = edgeYaw;
                        stadiumGroup.add(tread);
                    }

                    // Sleek angled canopy support strut at top of aisle (Frame 1)
                    const strut = new THREE.Mesh(
                        new THREE.BoxGeometry(18, 1.2, 1.8),
                        softCyanNeonMat
                    );
                    strut.position.set(ax + outX * 156, 72, az + outZ * 156);
                    strut.rotation.y = edgeYaw;
                    strut.rotation.z = 0.55;
                    stadiumGroup.add(strut);

                    // Warm amber/gold concourse portal lights under the upper deck (Frame 2)
                    if (a < aisleCount) {
                        const midAisleX = ax + dirX * (edge.len / aisleCount) * 0.5;
                        const midAisleZ = az + dirZ * (edge.len / aisleCount) * 0.5;
                        [-9, 9].forEach(offsetZ => {
                            const warmLight = new THREE.Mesh(
                                new THREE.BoxGeometry(1.5, 2.6, 3.4),
                                warmAmberBoxMat
                            );
                            warmLight.position.set(
                                midAisleX + outX * 168 + dirX * offsetZ,
                                68,
                                midAisleZ + outZ * 168 + dirZ * offsetZ
                            );
                            warmLight.rotation.y = edgeYaw;
                            stadiumGroup.add(warmLight);
                        });
                    }
                }

                // D. Flat Cantilevered Tribune Canopy Roof & Thin Cyan Fascia Line (Frame 1)
                const canopyOut = 148;
                const canopyLen = edge.len + canopyOut * 0.78;
                const canopyRoof = new THREE.Mesh(
                    new THREE.BoxGeometry(95, 6, canopyLen),
                    obsidianStructMat
                );
                canopyRoof.position.set(midX + outX * canopyOut, 78, midZ + outZ * canopyOut);
                canopyRoof.rotation.y = edgeYaw;
                stadiumGroup.add(canopyRoof);

                const canopyRimLine = new THREE.Mesh(
                    new THREE.BoxGeometry(1.2, 0.7, canopyLen),
                    mutedTealLineMat
                );
                canopyRimLine.position.set(midX + outX * (canopyOut - 47.5), 76, midZ + outZ * (canopyOut - 47.5));
                canopyRimLine.rotation.y = edgeYaw;
                stadiumGroup.add(canopyRimLine);

                // E. Continuous Upper Stadium Light Ribbon & Louvred Floodlight Pods (Frame 1 & Frame 2)
                const ringOut = 132;
                const ringY = 126;
                const ringLen = edge.len + ringOut * 0.72;

                // Dark housing beam behind the upper light ring
                const ringBacking = new THREE.Mesh(
                    new THREE.BoxGeometry(14, 9.5, ringLen),
                    obsidianStructMat
                );
                ringBacking.position.set(midX + outX * (ringOut + 6), ringY, midZ + outZ * (ringOut + 6));
                ringBacking.rotation.y = edgeYaw;
                stadiumGroup.add(ringBacking);

                // Continuous glowing ice-white upper light band
                const lightRibbonBand = new THREE.Mesh(
                    new THREE.BoxGeometry(2.2, 6.2, ringLen),
                    iceWhiteNeonMat
                );
                lightRibbonBand.position.set(midX + outX * ringOut, ringY, midZ + outZ * ringOut);
                lightRibbonBand.rotation.y = edgeYaw;
                stadiumGroup.add(lightRibbonBand);

                // Soft cyan aura band around the upper light ring
                const lightRibbonHalo = new THREE.Mesh(
                    new THREE.BoxGeometry(3.2, 10.5, ringLen),
                    new THREE.MeshBasicMaterial({
                        color: 0x38d6f5,
                        transparent: true,
                        opacity: 0.24,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    })
                );
                lightRibbonHalo.position.set(midX + outX * (ringOut - 0.5), ringY, midZ + outZ * (ringOut - 0.5));
                lightRibbonHalo.rotation.y = edgeYaw;
                stadiumGroup.add(lightRibbonHalo);

                // Spaced Louvred Floodlight Pods along the upper light band (Frame 1 & Frame 2)
                const podCount = Math.max(2, Math.round(edge.len / 210));
                for (let p = 1; p < podCount; p++) {
                    const frac = (p / podCount) - 0.5;
                    const px = midX + dirX * (frac * ringLen);
                    const pz = midZ + dirZ * (frac * ringLen);

                    const podMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(3.6, 8.2, 34),
                        floodlightLouvreMat
                    );
                    podMesh.position.set(px + outX * (ringOut - 1.2), ringY, pz + outZ * (ringOut - 1.2));
                    podMesh.rotation.y = edgeYaw;
                    stadiumGroup.add(podMesh);
                }

                // F. Cantilevered Curved Upper-Tier Balcony Prow on the West Side (Frame 2 Left)
                if (edgeIdx === 9 || edgeIdx === 10) {
                    const prowOut = 64;
                    const prowLen = edge.len * 0.72;
                    const prowDeck = new THREE.Mesh(
                        new THREE.BoxGeometry(58, 4.5, prowLen),
                        obsidianStructMat
                    );
                    prowDeck.position.set(midX + outX * prowOut, 104, midZ + outZ * prowOut);
                    prowDeck.rotation.y = edgeYaw;
                    stadiumGroup.add(prowDeck);

                    const prowNeonRim = new THREE.Mesh(
                        new THREE.BoxGeometry(1.8, 1.4, prowLen),
                        iceWhiteNeonMat
                    );
                    prowNeonRim.position.set(midX + outX * (prowOut - 29), 105, midZ + outZ * (prowOut - 29));
                    prowNeonRim.rotation.y = edgeYaw;
                    stadiumGroup.add(prowNeonRim);
                }
            });

            // G. Packed Wall-to-Wall Tiered Spectator Crowd (Optimized to 22,000 points for smooth FPS)
            const crowdCount = 22000;
            const crowdPositions = new Float32Array(crowdCount * 3);
            const crowdColors = new Float32Array(crowdCount * 3);
            const crowdPhases = new Float32Array(crowdCount);

            const colIceWhite = new THREE.Color(0xe6fcff);
            const colBrightCyan = new THREE.Color(0x66f2ff);
            const colMidTeal = new THREE.Color(0x22c2e8);
            const colDeepTeal = new THREE.Color(0x0e7694);
            const colWarmGold = new THREE.Color(0xffbe55);

            // Weight spectator distribution by each grandstand's actual length so long tribunes are packed
            const totalPerimeterLen = STADIUM_EDGES.reduce((acc, e) => acc + e.len, 0);
            const edgeCumulativeWeights = [];
            let runningWeight = 0;
            STADIUM_EDGES.forEach(e => {
                runningWeight += e.len / totalPerimeterLen;
                edgeCumulativeWeights.push(runningWeight);
            });

            const pickWeightedEdgeIndex = () => {
                const r = Math.random();
                for (let idx = 0; idx < edgeCumulativeWeights.length; idx++) {
                    if (r <= edgeCumulativeWeights[idx]) return idx;
                }
                return STADIUM_EDGES.length - 1;
            };

            const totalRows = 24; // 4 terraced seating rows per each of the 6 bowl steps
            for (let i = 0; i < crowdCount; i++) {
                const edgeIdx = pickWeightedEdgeIndex();
                const edge = STADIUM_EDGES[edgeIdx];
                const midX = (edge.x1 + edge.x2) * 0.5;
                const midZ = (edge.z1 + edge.z2) * 0.5;
                const dirX = (edge.x2 - edge.x1) / edge.len;
                const dirZ = (edge.z2 - edge.z1) / edge.len;
                const outX = -edge.nx;
                const outZ = -edge.nz;

                let outward, y, spanLen;

                // 88% in the main 24-row sloped seating bowl, 8% on upper concourse rim, 4% on West balcony prow
                const zoneRoll = Math.random();
                if (zoneRoll < 0.88) {
                    const rowIdx = Math.floor(Math.random() * totalRows);
                    const stepIdx = Math.floor(rowIdx / 4);
                    const subRow = rowIdx % 4;

                    // Place spectators cleanly on top of each bench step so none clip inside geometry
                    outward = 31.5 + stepIdx * 24 + subRow * 5.2 + (Math.random() - 0.5) * 2.2;
                    y = 13.8 + stepIdx * 9.5 + subRow * 2.1 + Math.random() * 1.1;
                    spanLen = edge.len + outward * 0.70;
                } else if (zoneRoll < 0.96) {
                    // Upper concourse standing gallery right below the canopy fascia
                    outward = 158 + (Math.random() - 0.5) * 10;
                    y = 67.5 + Math.random() * 2.2;
                    spanLen = edge.len + outward * 0.72;
                } else {
                    // Cantilevered West Balcony VIP Prow spectators
                    const prowEdge = STADIUM_EDGES[Math.random() < 0.5 ? 9 : 10];
                    const pMidX = (prowEdge.x1 + prowEdge.x2) * 0.5;
                    const pMidZ = (prowEdge.z1 + prowEdge.z2) * 0.5;
                    const pDirX = (prowEdge.x2 - prowEdge.x1) / prowEdge.len;
                    const pDirZ = (prowEdge.z2 - prowEdge.z1) / prowEdge.len;
                    const pOutX = -prowEdge.nx;
                    const pOutZ = -prowEdge.nz;

                    const pOutward = 40 + Math.random() * 44;
                    const pSpan = (Math.random() - 0.5) * (prowEdge.len * 0.70);
                    crowdPositions[i * 3] = pMidX + pDirX * pSpan + pOutX * pOutward;
                    crowdPositions[i * 3 + 1] = 107.2 + (pOutward - 40) * 0.12 + Math.random() * 1.2;
                    crowdPositions[i * 3 + 2] = pMidZ + pDirZ * pSpan + pOutZ * pOutward;

                    const c = Math.random() < 0.35 ? colIceWhite : colBrightCyan;
                    crowdColors[i * 3] = c.r;
                    crowdColors[i * 3 + 1] = c.g;
                    crowdColors[i * 3 + 2] = c.b;
                    crowdPhases[i] = Math.random() * Math.PI * 2;
                    continue;
                }

                const alongDist = (Math.random() - 0.5) * spanLen;
                crowdPositions[i * 3] = midX + dirX * alongDist + outX * outward;
                crowdPositions[i * 3 + 1] = y;
                crowdPositions[i * 3 + 2] = midZ + dirZ * alongDist + outZ * outward;

                const colorRoll = Math.random();
                let col;
                if (colorRoll < 0.16) col = colIceWhite;
                else if (colorRoll < 0.48) col = colBrightCyan;
                else if (colorRoll < 0.82) col = colMidTeal;
                else if (colorRoll < 0.97) col = colDeepTeal;
                else col = colWarmGold;

                crowdColors[i * 3] = col.r;
                crowdColors[i * 3 + 1] = col.g;
                crowdColors[i * 3 + 2] = col.b;
                crowdPhases[i] = Math.random() * Math.PI * 2;
            }

            const crowdGeo = new THREE.BufferGeometry();
            crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPositions, 3));
            crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdColors, 3));
            crowdGeo.setAttribute('aPhase', new THREE.BufferAttribute(crowdPhases, 1));

            crowdUniforms = {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
                uCheerIntensity: { value: 0.0 },
                uCheerWaveTime: { value: 0.0 },
                uKillPos: { value: new THREE.Vector3(0, 0, 0) },
                uKillColor: { value: new THREE.Color(0x00f3ff) }
            };

            const crowdMat = new THREE.ShaderMaterial({
                uniforms: crowdUniforms,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                vertexShader: `
                    attribute float aPhase;
                    uniform float uTime;
                    uniform float uPixelRatio;
                    uniform float uCheerIntensity;
                    uniform float uCheerWaveTime;
                    uniform vec3 uKillPos;
                    varying vec3 vColor;
                    varying float vPulse;
                    varying float vCheerSparkle;

                    void main() {
                        vColor = color;
                        float idleWave = sin(uTime * 2.8 + aPhase + position.x * 0.008 + position.z * 0.008);
                        float distToKill = length(position.xz - uKillPos.xz);
                        float exciteWave = sin(uTime * 15.5 + aPhase * 4.3 - distToKill * 0.012);
                        float stadiumWave = sin(uCheerWaveTime * 7.5 - distToKill * 0.009 + aPhase * 0.5);

                        vPulse = (0.72 + 0.28 * idleWave) + uCheerIntensity * (0.65 + 0.50 * exciteWave);
                        vCheerSparkle = uCheerIntensity * smoothstep(0.62, 0.98, sin(uTime * 24.0 + aPhase * 19.7));

                        vec3 pos = position;
                        float idleJump = max(0.0, idleWave) * 0.55;
                        float cheerJump = (max(0.0, exciteWave) * 2.8 + max(0.0, stadiumWave) * 1.8) * uCheerIntensity;
                        pos.y += idleJump + cheerJump;

                        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                        gl_Position = projectionMatrix * mvPosition;

                        float dist = max(120.0, -mvPosition.z);
                        float sizeBoost = 1.0 + uCheerIntensity * (0.38 + 0.28 * max(0.0, exciteWave));
                        gl_PointSize = clamp((4400.0 / dist) * uPixelRatio * sizeBoost, 2.6 * uPixelRatio, 9.2 * uPixelRatio);
                    }
                `,
                fragmentShader: `
                    uniform float uCheerIntensity;
                    uniform vec3 uKillColor;
                    varying vec3 vColor;
                    varying float vPulse;
                    varying float vCheerSparkle;

                    void main() {
                        vec2 uv = gl_PointCoord - vec2(0.5);
                        float d = length(uv);
                        if (d > 0.5) discard;

                        float core = smoothstep(0.5, 0.08, d);
                        vec3 tintedCol = mix(vColor, uKillColor, uCheerIntensity * 0.30);
                        vec3 finalCol = mix(tintedCol, vec3(1.0), clamp(smoothstep(0.24, 0.0, d) * 0.55 + vCheerSparkle * 0.78, 0.0, 1.0));
                        gl_FragColor = vec4(finalCol * vPulse, clamp(core * (0.92 + uCheerIntensity * 0.08), 0.0, 1.0));
                    }
                `
            });

            const crowdPoints = new THREE.Points(crowdGeo, crowdMat);
            crowdPoints.renderOrder = 3;
            stadiumGroup.add(crowdPoints);

            freezeStaticHierarchy(stadiumGroup);
            scene.add(stadiumGroup);
        }

        // Builds the towering obsidian Monolith Scoreboard Tower & 2x5 Holographic Boards from Frame 1
        function buildMovieMonolithTower() {
            const towerGroup = new THREE.Group();

            const monolithMat = new THREE.MeshStandardMaterial({
                color: 0x02060b,
                roughness: 0.24,
                metalness: 0.88
            });
            const iceWhiteMat = new THREE.MeshBasicMaterial({ color: 0xeafcff });
            const cyanHoloFrameMat = new THREE.MeshBasicMaterial({
                color: 0x38d6f5,
                transparent: true,
                opacity: 0.82
            });

            // 1. Main Vertical Obsidian Monolith Shaft (Height ~480 units)
            const mainShaft = new THREE.Mesh(new THREE.BoxGeometry(135, 440, 95), monolithMat);
            mainShaft.position.set(0, 260, 0);
            towerGroup.add(mainShaft);

            // 2. Sloped Right Buttress Base (Characteristic angled base on the right of Frame 1)
            const buttressShape = new THREE.Shape();
            buttressShape.moveTo(45, 65);
            buttressShape.lineTo(205, 65);
            buttressShape.lineTo(67.5, 255);
            buttressShape.lineTo(45, 255);
            buttressShape.closePath();

            const buttressGeo = new THREE.ExtrudeGeometry(buttressShape, {
                depth: 86,
                bevelEnabled: false
            });
            buttressGeo.translate(0, 0, -43);
            const buttressMesh = new THREE.Mesh(buttressGeo, monolithMat);
            towerGroup.add(buttressMesh);

            // 3. Iconic Inverted-L / Hook Glowing White Neon Conduit on the Tower Face (Frame 1)
            // Lower vertical conduit rising from the stadium light ring
            const lowerConduit = new THREE.Mesh(new THREE.BoxGeometry(5.2, 118, 4.0), iceWhiteMat);
            lowerConduit.position.set(-22, 132, 48.5);
            towerGroup.add(lowerConduit);

            // Mid-tower short break segment (exact detail from Frame 1)
            const midBreakConduit = new THREE.Mesh(new THREE.BoxGeometry(5.2, 24, 4.0), iceWhiteMat);
            midBreakConduit.position.set(-22, 224, 48.5);
            towerGroup.add(midBreakConduit);

            // Upper vertical conduit rising to the crown
            const upperConduit = new THREE.Mesh(new THREE.BoxGeometry(5.2, 172, 4.0), iceWhiteMat);
            upperConduit.position.set(-22, 344, 48.5);
            towerGroup.add(upperConduit);

            // Top chamfered hook wrapping left across the upper face
            const topHookBar = new THREE.Mesh(new THREE.BoxGeometry(52, 5.2, 4.0), iceWhiteMat);
            topHookBar.position.set(-46, 430, 48.5);
            towerGroup.add(topHookBar);

            const topLeftDrop = new THREE.Mesh(new THREE.BoxGeometry(4.5, 18, 4.0), iceWhiteMat);
            topLeftDrop.position.set(-70, 422, 48.5);
            towerGroup.add(topLeftDrop);

            // 4. Left Cantilevered Holographic Spine & 10 Floating Combatant Boards (2 groups of 5)
            const spineRod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 310, 2.2), cyanHoloFrameMat);
            spineRod.position.set(-72, 275, 52);
            towerGroup.add(spineRod);

            // Top & bottom angled wireframe bracket struts connecting spine to tower
            const topBracket = new THREE.Mesh(new THREE.BoxGeometry(46, 1.8, 1.8), cyanHoloFrameMat);
            topBracket.position.set(-92, 422, 52);
            topBracket.rotation.z = 0.25;
            towerGroup.add(topBracket);

            const bottomBracket = new THREE.Mesh(new THREE.BoxGeometry(52, 1.8, 1.8), cyanHoloFrameMat);
            bottomBracket.position.set(-92, 136, 52);
            bottomBracket.rotation.z = -0.52;
            towerGroup.add(bottomBracket);

            const outerLeftWire = new THREE.Mesh(new THREE.BoxGeometry(1.6, 275, 1.6), cyanHoloFrameMat);
            outerLeftWire.position.set(-114, 282, 52);
            towerGroup.add(outerLeftWire);

            // Create the 10 Floating Holographic Scoreboard Banners (5 top for Clu's Forces, 5 bottom for Programs)
            towerHologramBoards = [];
            for (let i = 0; i < 10; i++) {
                const isTopGroup = i < 5;
                const idxInGroup = i % 5;
                const boardY = isTopGroup
                    ? (405 - idxInGroup * 24)
                    : (258 - idxInGroup * 24);

                const defaultName = isTopGroup ? `CLU FORCE 0${idxInGroup + 1}` : `PROGRAM 0${idxInGroup + 1}`;
                const tex = createTowerHologramBoardTexture(defaultName, isTopGroup, true);
                const mat = new THREE.MeshBasicMaterial({
                    map: tex,
                    transparent: true,
                    opacity: 0.92,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });

                const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(66, 16.5), mat);
                boardMesh.position.set(-96, boardY, 55);
                boardMesh.rotation.y = 0.16; // Slight perspective cant toward the arena floor
                boardMesh.renderOrder = 8;
                towerGroup.add(boardMesh);

                towerHologramBoards.push({
                    mesh: boardMesh,
                    lastLabel: defaultName,
                    lastAlive: true
                });
            }

            // Position the Monolith Scoreboard Tower at the North-Northwest Coliseum Rim
            towerGroup.position.set(-165, 0, -ARENA_HALF_Z - 165);
            towerGroup.rotation.y = 0.12;
            freezeStaticHierarchy(towerGroup);
            scene.add(towerGroup);
        }

        // Soft blurred floor reflection texture for the Light Cycle's headlights & neon wheel rims (Frame 2)
        let cycleFloorGlowTex = null;
        function getCycleFloorGlowTexture() {
            if (cycleFloorGlowTex) return cycleFloorGlowTex;
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext('2d');

            const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 120);
            g.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
            g.addColorStop(0.28, 'rgba(255, 255, 255, 0.48)');
            g.addColorStop(0.68, 'rgba(255, 255, 255, 0.12)');
            g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 256, 256);

            cycleFloorGlowTex = new THREE.CanvasTexture(c);
            cycleFloorGlowTex.needsUpdate = true;
            return cycleFloorGlowTex;
        }

        // Movie-Accurate 5th-Generation Light Cycle Mesh (Built from Reference Frames 1, 2 & 3)
        function createLightcycleMesh(neonColorHex) {
            const group = new THREE.Group();

            const baseColor = new THREE.Color(neonColorHex);
            const hotCoreColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.58);

            // Mirror-gloss pitch-black obsidian cowling material
            const obsidianCowlMat = new THREE.MeshStandardMaterial({
                color: 0x03060a,
                roughness: 0.07,
                metalness: 0.94
            });

            // Satin dark metallic inner hub & stator material
            const darkAlloyMat = new THREE.MeshStandardMaterial({
                color: 0x0a1018,
                roughness: 0.28,
                metalness: 0.86
            });

            // Smoked glass cover for the side turbine core window
            const turbineGlassMat = new THREE.MeshStandardMaterial({
                color: 0x091624,
                roughness: 0.06,
                metalness: 0.92,
                transparent: true,
                opacity: 0.36,
                depthWrite: false
            });

            // Primary neon material & hot inner core material
            const neonMat = new THREE.MeshBasicMaterial({ color: neonColorHex });
            const hotCoreMat = new THREE.MeshBasicMaterial({ color: hotCoreColor });
            const headlightWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf0fcff });

            const neonHaloMat = new THREE.MeshBasicMaterial({
                color: neonColorHex,
                transparent: true,
                opacity: 0.34,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const wheelRadius = WHEEL_RADIUS; // 1.10
            const innerHubRadius = 0.72;
            const tireWidth = 0.92; // Wide, sculpted movie-proportion tires (Frame 2)

            // Helper: Builds the sculpted hubless wheel with optimized vertex counts
            const buildMovieHublessWheel = (isRear = false) => {
                const wGroup = new THREE.Group();

                // 1. Wide Glossy Black Outer Tire Barrel
                const outerTireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, tireWidth, 24, 1, true);
                outerTireGeo.rotateZ(Math.PI / 2);
                wGroup.add(new THREE.Mesh(outerTireGeo, obsidianCowlMat));

                // Crowned tire shoulder bevels
                [-1, 1].forEach(side => {
                    const shoulderTorus = new THREE.Mesh(
                        new THREE.TorusGeometry(wheelRadius - 0.11, 0.12, 10, 24),
                        obsidianCowlMat
                    );
                    shoulderTorus.rotation.y = Math.PI / 2;
                    shoulderTorus.position.x = side * (tireWidth * 0.5 - 0.09);
                    wGroup.add(shoulderTorus);
                });

                // 2. Deep Recessed Hubless Inner Tunnel & Mechanical Stator Rings
                const innerHubGeo = new THREE.CylinderGeometry(innerHubRadius, innerHubRadius, tireWidth * 0.96, 24, 1, true);
                innerHubGeo.rotateZ(Math.PI / 2);
                const innerBarrelMat = darkAlloyMat.clone();
                innerBarrelMat.side = THREE.BackSide;
                wGroup.add(new THREE.Mesh(innerHubGeo, innerBarrelMat));

                [-0.18, 0.0, 0.18].forEach((rx, idx) => {
                    const statorRing = new THREE.Mesh(
                        new THREE.TorusGeometry(innerHubRadius - 0.02, idx === 1 ? 0.035 : 0.02, 8, 20),
                        obsidianCowlMat
                    );
                    statorRing.rotation.y = Math.PI / 2;
                    statorRing.position.x = rx;
                    wGroup.add(statorRing);
                });

                const sideWallGeo = new THREE.RingGeometry(innerHubRadius, wheelRadius - 0.04, 24);
                sideWallGeo.rotateY(Math.PI / 2);
                const sideWallMat = darkAlloyMat.clone();
                sideWallMat.side = THREE.DoubleSide;
                [-tireWidth * 0.49, tireWidth * 0.49].forEach(ox => {
                    const sw = new THREE.Mesh(sideWallGeo, sideWallMat);
                    sw.position.x = ox;
                    wGroup.add(sw);
                });

                // 3. Iconic Thick Glowing Hubless Wheel Rims
                const mainRimTorusGeo = new THREE.TorusGeometry(0.86, 0.082, 10, 24);
                mainRimTorusGeo.rotateY(Math.PI / 2);
                const hotRimCoreGeo = new THREE.TorusGeometry(0.86, 0.042, 8, 24);
                hotRimCoreGeo.rotateY(Math.PI / 2);
                const rimHaloRingGeo = new THREE.RingGeometry(0.71, 1.01, 24);
                rimHaloRingGeo.rotateY(Math.PI / 2);

                [-1, 1].forEach(side => {
                    const rimX = side * (tireWidth * 0.5 + 0.01);
                    const mainRim = new THREE.Mesh(mainRimTorusGeo, neonMat);
                    mainRim.position.x = rimX;
                    wGroup.add(mainRim);

                    const coreRim = new THREE.Mesh(hotRimCoreGeo, hotCoreMat);
                    coreRim.position.x = rimX + side * 0.015;
                    wGroup.add(coreRim);

                    const halo = new THREE.Mesh(rimHaloRingGeo, neonHaloMat);
                    halo.position.x = rimX + side * 0.02;
                    wGroup.add(halo);
                });

                // 4. Sculpted Bulbous Aerodynamic Wheel Cowling Shroud & Twin Headlight Blades
                if (!isRear) {
                    const frontCowlGeo = new THREE.SphereGeometry(wheelRadius + 0.045, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
                    const frontCowl = new THREE.Mesh(frontCowlGeo, obsidianCowlMat);
                    frontCowl.scale.set(0.54, 1.02, 1.06);
                    frontCowl.rotation.x = -Math.PI * 0.38;
                    wGroup.add(frontCowl);

                    const headlightArcGeo = new THREE.TorusGeometry(wheelRadius + 0.058, 0.026, 8, 18, Math.PI * 0.44);
                    headlightArcGeo.rotateY(Math.PI / 2);
                    const headlightHaloGeo = new THREE.TorusGeometry(wheelRadius + 0.055, 0.052, 8, 18, Math.PI * 0.46);
                    headlightHaloGeo.rotateY(Math.PI / 2);
                    const headlightHaloMat = new THREE.MeshBasicMaterial({
                        color: 0x88f0ff,
                        transparent: true,
                        opacity: 0.42,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false
                    });

                    [-0.23, 0.23].forEach(lx => {
                        const blade = new THREE.Mesh(headlightArcGeo, headlightWhiteMat);
                        blade.position.x = lx;
                        blade.rotation.x = Math.PI * 0.78;
                        wGroup.add(blade);

                        const bladeHalo = new THREE.Mesh(headlightHaloGeo, headlightHaloMat);
                        bladeHalo.position.x = lx;
                        bladeHalo.rotation.x = Math.PI * 0.78;
                        wGroup.add(bladeHalo);
                    });

                    [-0.28, 0.28].forEach(gx => {
                        const gripMount = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), darkAlloyMat);
                        gripMount.position.set(gx, 0.22, 0.56);
                        wGroup.add(gripMount);

                        const gripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 8), obsidianCowlMat);
                        gripBar.rotation.z = Math.PI / 2;
                        gripBar.position.set(gx * 0.85, 0.26, 0.54);
                        wGroup.add(gripBar);

                        [-0.08, 0.0, 0.08].forEach((dy, dIdx) => {
                            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), dIdx === 1 ? hotCoreMat : neonMat);
                            dot.position.set(gx * 0.92, 0.10 + dy * 1.3, 0.60 - Math.abs(dy) * 0.3);
                            wGroup.add(dot);
                        });
                    });
                } else {
                    const rearCowlGeo = new THREE.SphereGeometry(wheelRadius + 0.04, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
                    const rearCowl = new THREE.Mesh(rearCowlGeo, obsidianCowlMat);
                    rearCowl.scale.set(0.52, 1.02, 1.05);
                    rearCowl.rotation.x = Math.PI * 0.34;
                    wGroup.add(rearCowl);

                    const emitterHousing = new THREE.Mesh(
                        new THREE.BoxGeometry(0.22, WALL_HEIGHT * 0.86, 0.28),
                        obsidianCowlMat
                    );
                    emitterHousing.position.set(0, 0.04, wheelRadius * 0.92);
                    wGroup.add(emitterHousing);

                    const emitterCore = new THREE.Mesh(
                        new THREE.BoxGeometry(0.06, WALL_HEIGHT * 0.94, 0.34),
                        headlightWhiteMat
                    );
                    emitterCore.position.set(0, 0.04, wheelRadius * 0.96);
                    wGroup.add(emitterCore);

                    const emitterGlow = new THREE.Mesh(
                        new THREE.BoxGeometry(0.16, WALL_HEIGHT * 0.98, 0.30),
                        neonHaloMat
                    );
                    emitterGlow.position.set(0, 0.04, wheelRadius * 0.94);
                    wGroup.add(emitterGlow);
                }

                // 5. Lower-Belly Specular Double-Oval Reflection Rings on the Tire Underside
                [0.44, 0.34].forEach((rad, rIdx) => {
                    const underRing = new THREE.Mesh(
                        new THREE.TorusGeometry(rad, rIdx === 0 ? 0.018 : 0.012, 8, 20),
                        rIdx === 0 ? neonMat : hotCoreMat
                    );
                    underRing.rotation.x = Math.PI / 2;
                    underRing.scale.set(0.75, 1.38, 1.0);
                    underRing.position.set(0, -wheelRadius + 0.09 + rIdx * 0.02, isRear ? 0.10 : -0.10);
                    wGroup.add(underRing);
                });

                return wGroup;
            };

            const frontWheelGroup = buildMovieHublessWheel(false);
            frontWheelGroup.position.set(0, wheelRadius, -1.90);
            group.add(frontWheelGroup);

            const rearWheelGroup = buildMovieHublessWheel(true);
            rearWheelGroup.position.set(0, wheelRadius, 1.90);
            group.add(rearWheelGroup);

            // 6. Sculpted Hourglass Monocoque Chassis & Recessed Side Turbine Core (Frames 1 & 3)
            const chassisGroup = new THREE.Group();
            group.add(chassisGroup);

            // Upper contoured sternum / tank spine that bridges the front and rear wheel cowls
            const upperTankGeo = new THREE.CylinderGeometry(0.36, 0.42, 2.55, 24);
            upperTankGeo.rotateX(Math.PI / 2);
            const upperTank = new THREE.Mesh(upperTankGeo, obsidianCowlMat);
            upperTank.scale.set(1.08, 0.68, 1.0);
            upperTank.position.set(0, 1.18, 0.0);
            chassisGroup.add(upperTank);

            // Lower sculpted belly fairing with arched ground clearance between the wheels (Frames 1 & 3)
            const lowerBellyGeo = new THREE.CylinderGeometry(0.34, 0.30, 2.35, 24);
            lowerBellyGeo.rotateX(Math.PI / 2);
            const lowerBelly = new THREE.Mesh(lowerBellyGeo, obsidianCowlMat);
            lowerBelly.scale.set(1.12, 0.72, 1.0);
            lowerBelly.position.set(0, 0.76, -0.04);
            chassisGroup.add(lowerBelly);

            // Front chin spoiler wedging into the lower front wheel shroud (Frame 1)
            const chinProw = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.85), obsidianCowlMat);
            chinProw.position.set(0, 0.48, -1.08);
            chinProw.rotation.x = 0.24;
            chassisGroup.add(chinProw);

            // Rear seat tail-hump fairing cradling the rider's hips (Frame 1)
            const tailHumpGeo = new THREE.SphereGeometry(0.42, 24, 18);
            const tailHump = new THREE.Mesh(tailHumpGeo, obsidianCowlMat);
            tailHump.scale.set(0.95, 0.58, 1.55);
            tailHump.position.set(0, 1.18, 0.88);
            tailHump.rotation.x = -0.18;
            chassisGroup.add(tailHump);

            // 7. Exposed Oval Side Turbine / Ribbed Energy Core Window (Frames 1 & 3)
            [-1, 1].forEach(side => {
                const turbinePod = new THREE.Group();
                turbinePod.position.set(side * 0.35, 0.96, -0.18);
                chassisGroup.add(turbinePod);

                // Dark metallic oval window bezel
                const bezelRing = new THREE.Mesh(
                    new THREE.TorusGeometry(0.21, 0.028, 14, 32),
                    darkAlloyMat
                );
                bezelRing.rotation.y = Math.PI / 2;
                bezelRing.scale.set(1.85, 0.82, 1.0);
                turbinePod.add(bezelRing);

                // Inner horizontal cylindrical power core
                const coreBarrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.13, 0.13, 0.68, 20),
                    obsidianCowlMat
                );
                coreBarrel.rotation.x = Math.PI / 2;
                coreBarrel.position.x = -side * 0.04;
                turbinePod.add(coreBarrel);

                // 3 Glowing vertical/radial energy bands inside the turbine window (Frame 1 & Frame 3)
                [-0.18, 0.0, 0.18].forEach((tz, idx) => {
                    const energyBand = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.142, 0.142, 0.075, 20),
                        idx === 1 ? hotCoreMat : neonMat
                    );
                    energyBand.rotation.x = Math.PI / 2;
                    energyBand.position.set(-side * 0.03, 0, tz);
                    turbinePod.add(energyBand);

                    // Dark curved rib cage bar separating the glowing bands
                    const ribArch = new THREE.Mesh(
                        new THREE.TorusGeometry(0.15, 0.016, 10, 20, Math.PI),
                        darkAlloyMat
                    );
                    ribArch.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                    ribArch.position.set(0, 0, tz + 0.09);
                    turbinePod.add(ribArch);
                });

                // Curved smoked glass cover over the turbine recess
                const lens = new THREE.Mesh(
                    new THREE.SphereGeometry(0.20, 18, 14),
                    turbineGlassMat
                );
                lens.scale.set(0.22, 0.78, 1.78);
                lens.position.x = side * 0.02;
                turbinePod.add(lens);

                // Small glowing circular node badge just behind/above the turbine window (Frame 1)
                const nodeRing = new THREE.Mesh(
                    new THREE.RingGeometry(0.032, 0.052, 20),
                    neonMat
                );
                nodeRing.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
                nodeRing.position.set(side * 0.045, 0.19, 0.44);
                turbinePod.add(nodeRing);
            });

            // 8. Signature Sweeping S-Curve Neon Body Contour Lines & Tail Cowl Loop (Frames 1 & 3)
            const buildNeonTubeCurve = (pts, radius = 0.022, mat = neonMat) => {
                const curve = new THREE.CatmullRomCurve3(pts);
                const tubeGeo = new THREE.TubeGeometry(curve, 32, radius, 10, false);
                return new THREE.Mesh(tubeGeo, mat);
            };

            [-1, 1].forEach(side => {
                // Upper S-curve neon line: rises from lower front chin, arches over turbine window, flows to seat
                const upperCurvePts = [
                    new THREE.Vector3(side * 0.33, 0.38, -1.24),
                    new THREE.Vector3(side * 0.39, 0.78, -0.82),
                    new THREE.Vector3(side * 0.41, 1.21, -0.42),
                    new THREE.Vector3(side * 0.38, 1.24,  0.12),
                    new THREE.Vector3(side * 0.34, 1.18,  0.56)
                ];
                chassisGroup.add(buildNeonTubeCurve(upperCurvePts, 0.024, neonMat));
                chassisGroup.add(buildNeonTubeCurve(upperCurvePts, 0.012, hotCoreMat));

                // Lower belly arch neon line: traces the underside arch between front and rear wheels
                const lowerBellyPts = [
                    new THREE.Vector3(side * 0.30, 0.36, -1.16),
                    new THREE.Vector3(side * 0.35, 0.56, -0.45),
                    new THREE.Vector3(side * 0.34, 0.60,  0.22),
                    new THREE.Vector3(side * 0.29, 0.44,  0.88),
                    new THREE.Vector3(side * 0.25, 0.28,  1.28)
                ];
                chassisGroup.add(buildNeonTubeCurve(lowerBellyPts, 0.016, neonMat));

                // Rear footpeg housing right beside the rear wheel hub
                const pegStrut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.34), darkAlloyMat);
                pegStrut.position.set(side * 0.44, 0.62, 1.18);
                chassisGroup.add(pegStrut);
            });

            // Glowing U-shaped crescent loop wrapping the rear saddle cowl behind the rider's hips (Frame 1)
            const saddleLoopPts = [
                new THREE.Vector3(-0.34, 1.18, 0.56),
                new THREE.Vector3(-0.30, 1.21, 0.92),
                new THREE.Vector3( 0.00, 1.23, 1.08),
                new THREE.Vector3( 0.30, 1.21, 0.92),
                new THREE.Vector3( 0.34, 1.18, 0.56)
            ];
            chassisGroup.add(buildNeonTubeCurve(saddleLoopPts, 0.026, neonMat));
            chassisGroup.add(buildNeonTubeCurve(saddleLoopPts, 0.013, hotCoreMat));

            // 9. Floor-Hugging Specular Reflection Group (Mirrors the wheel rims & twin white headlights on the floor - Frame 2)
            const floorReflectionGroup = new THREE.Group();
            floorReflectionGroup.position.y = 0.03;
            group.add(floorReflectionGroup);

            const glowTex = getCycleFloorGlowTexture();
            const neonFloorReflMat = new THREE.MeshBasicMaterial({
                map: glowTex,
                color: neonColorHex,
                transparent: true,
                opacity: 0.52,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const whiteHeadlightReflMat = new THREE.MeshBasicMaterial({
                map: glowTex,
                color: 0xe8fcff,
                transparent: true,
                opacity: 0.62,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            // Left & right wheel rim reflection streaks under front and rear tires
            [-1.90, 1.90].forEach(wz => {
                [-0.46, 0.46].forEach(wx => {
                    const rimReflGeo = new THREE.PlaneGeometry(0.65, 2.35);
                    rimReflGeo.rotateX(-Math.PI / 2);
                    const rimRefl = new THREE.Mesh(rimReflGeo, neonFloorReflMat);
                    rimRefl.position.set(wx, 0, wz);
                    rimRefl.renderOrder = 2;
                    floorReflectionGroup.add(rimRefl);
                });
            });

            // Twin vertical white headlight reflections on the floor ahead of the front tire (Frame 2)
            [-0.23, 0.23].forEach(lx => {
                const hlReflGeo = new THREE.PlaneGeometry(0.36, 1.85);
                hlReflGeo.rotateX(-Math.PI / 2);
                const hlRefl = new THREE.Mesh(hlReflGeo, whiteHeadlightReflMat);
                hlRefl.position.set(lx, 0.005, -2.55);
                hlRefl.renderOrder = 3;
                floorReflectionGroup.add(hlRefl);
            });

            // Removed per-cycle real-time PointLight (10 dynamic point lights caused severe PBR shader lag;
            // floorReflectionGroup already provides crisp neon ground illumination at zero GPU light cost)

            group.userData = {
                frontWheelGroup,
                rearWheelGroup,
                saddleGroup: chassisGroup,
                floorReflectionGroup,
                wheelRadius
            };

            return group;
        }

        // Movie-Accurate Rider Suit, Swept Aerodynamic Helmet & Neon Circuitry (Frames 1, 2 & 3)
        function createCharacterMesh(config) {
            const id = (config.id || '').toLowerCase();
            const neonColorHex = config.colorHex;

            const isRinzler = id.includes('rinzler');
            const isClu = id.includes('clu');
            const isQuorra = id.includes('quorra');
            const isTron = id.includes('tron');

            const root = new THREE.Group();

            const suitMat = new THREE.MeshStandardMaterial({
                color: 0x04070d,
                roughness: 0.34,
                metalness: 0.78
            });
            const armorMat = new THREE.MeshStandardMaterial({
                color: 0x050911,
                roughness: 0.14,
                metalness: 0.92
            });
            const visorMat = new THREE.MeshStandardMaterial({
                color: 0x020408,
                roughness: 0.03,
                metalness: 0.98
            });
            const neonMat = new THREE.MeshBasicMaterial({ color: neonColorHex });
            const whiteCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

            const scale = isQuorra ? 0.94 : 1.0;
            root.scale.set(scale, scale, scale);

            const hips = new THREE.Group();
            hips.position.set(0, 1.24, 0.56);
            root.add(hips);

            const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.32), armorMat);
            hips.add(pelvisMesh);

            const torso = new THREE.Group();
            torso.position.set(0, 0.10, 0);
            hips.add(torso);

            const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.26), suitMat);
            abdomen.position.set(0, 0.18, 0);
            torso.add(abdomen);

            const chestWidth = isQuorra ? 0.50 : 0.56;
            const chest = new THREE.Mesh(new THREE.BoxGeometry(chestWidth, 0.44, 0.32), armorMat);
            chest.position.set(0, 0.50, 0);
            torso.add(chest);

            // Upper Back & Shoulder Blade Neon Circuitry (Visible from front/high angles in Frames 2 & 3)
            [-1, 1].forEach(side => {
                // Swept V-chevron shoulder blade lines (Frame 3)
                const backBlade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.03), neonMat);
                backBlade.position.set(side * 0.16, 0.44, 0.165);
                backBlade.rotation.z = side * 0.24;
                torso.add(backBlade);

                // Collarbone / upper shoulder circuit line (Frame 2)
                const collarLine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.032, 0.33), neonMat);
                collarLine.position.set(side * 0.17, 0.70, 0);
                collarLine.rotation.z = -side * 0.18;
                torso.add(collarLine);
            });

            if (isTron) {
                [-0.10, 0.10].forEach(cx => {
                    [0.44, 0.58].forEach(cy => {
                        const sq = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.33), neonMat);
                        sq.position.set(cx, cy, 0);
                        torso.add(sq);
                    });
                });
            }

            // Identity Disc mounted flat on the upper back (Frame 3)
            const discMount = new THREE.Group();
            discMount.position.set(0, 0.52, 0.18);
            torso.add(discMount);

            const outerDiscRing = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.036, 12, 28), armorMat);
            discMount.add(outerDiscRing);

            const glowingDiscBlade = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.020, 12, 28), neonMat);
            discMount.add(glowingDiscBlade);

            const innerDiscCore = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 10, 24), whiteCoreMat);
            discMount.add(innerDiscCore);

            // Swept-Back Aerodynamic Full-Face Movie Helmet (Frames 1, 2 & 3)
            const head = new THREE.Group();
            head.position.set(0, 0.78, 0);
            torso.add(head);

            // Elongated swept-back helmet shell (Frame 1 shows the sleek rear aero tail of the helmet)
            const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.215, 24, 20), armorMat);
            cranium.scale.set(0.92, 1.02, 1.28);
            cranium.position.set(0, 0.14, 0.04);
            head.add(cranium);

            const visorDome = new THREE.Mesh(new THREE.SphereGeometry(0.208, 22, 18), visorMat);
            visorDome.scale.set(0.90, 0.96, 1.18);
            visorDome.position.set(0, 0.12, -0.04);
            head.add(visorDome);

            // Forehead / Crown Neon Helmet Emblem (Frame 2 shows U-chevron on Clu/Rinzler & angled brow lines on Sam)
            if (isClu || isRinzler || config.team !== 1) {
                [-0.065, 0.065].forEach(fx => {
                    const uSide = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.14, 0.18), neonMat);
                    uSide.position.set(fx, 0.25, -0.08);
                    uSide.rotation.x = 0.42;
                    head.add(uSide);
                });
                const uBottom = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.06), neonMat);
                uBottom.position.set(0, 0.20, -0.17);
                head.add(uBottom);
            } else {
                [-1, 1].forEach(side => {
                    const browChevron = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.18), neonMat);
                    browChevron.position.set(side * 0.07, 0.25, -0.06);
                    browChevron.rotation.z = -side * 0.35;
                    head.add(browChevron);
                });
            }

            // Jawline & temple neon circuit accents (Frames 1 & 3)
            [-0.165, 0.165].forEach(jx => {
                const jawLine = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.028, 0.32), neonMat);
                jawLine.position.set(jx, 0.06, -0.02);
                jawLine.rotation.x = 0.22;
                head.add(jawLine);
            });

            // Arms with polygonal shoulder & forearm circuit outlines (Frame 1)
            const buildArm = (sideSign) => {
                const shoulder = new THREE.Group();
                shoulder.position.set(sideSign * (chestWidth * 0.5 + 0.07), 0.64, 0);
                torso.add(shoulder);

                const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 14), armorMat);
                shoulder.add(deltoid);

                // Hexagonal/circuit shoulder pad outline (Frame 1)
                const shoulderCircuit = new THREE.Mesh(
                    new THREE.TorusGeometry(0.085, 0.012, 8, 6),
                    neonMat
                );
                shoulderCircuit.rotation.y = Math.PI / 2;
                shoulderCircuit.position.set(sideSign * 0.06, -0.04, 0);
                shoulder.add(shoulderCircuit);

                const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.38, 12), suitMat);
                upperArm.position.set(0, -0.19, 0);
                shoulder.add(upperArm);

                const armStripe = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.34, 0.04), neonMat);
                armStripe.position.set(sideSign * 0.07, -0.19, 0);
                shoulder.add(armStripe);

                const elbow = new THREE.Group();
                elbow.position.set(0, -0.38, 0);
                shoulder.add(elbow);

                const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.054, 0.36, 12), armorMat);
                foreArm.position.set(0, -0.18, 0);
                elbow.add(foreArm);

                const foreArmGlow = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.30, 0.045), neonMat);
                foreArmGlow.position.set(sideSign * 0.058, -0.18, 0);
                elbow.add(foreArmGlow);

                const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), suitMat);
                hand.position.set(0, -0.36, 0);
                elbow.add(hand);

                return { shoulder, elbow, hand };
            };

            const leftArm = buildArm(-1);
            const rightArm = buildArm(1);

            // Legs with trapezoidal calf/boot neon circuit outline (Frame 1)
            const buildLeg = (sideSign) => {
                const hipJoint = new THREE.Group();
                hipJoint.position.set(sideSign * 0.16, -0.05, 0);
                hips.add(hipJoint);

                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.088, 0.56, 14), suitMat);
                thigh.position.set(0, -0.28, 0);
                hipJoint.add(thigh);

                const thighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.46, 0.04), neonMat);
                thighStripe.position.set(sideSign * 0.09, -0.28, 0);
                hipJoint.add(thighStripe);

                const kneeJoint = new THREE.Group();
                kneeJoint.position.set(0, -0.56, 0);
                hipJoint.add(kneeJoint);

                const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), armorMat);
                kneeJoint.add(kneePad);

                const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.064, 0.56, 14), armorMat);
                calf.position.set(0, -0.28, 0);
                kneeJoint.add(calf);

                // Trapezoidal outer calf/boot neon circuit badge (seen clearly on Rinzler's boot in Frame 1)
                const calfTrapTop = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.28, 0.025), neonMat);
                calfTrapTop.position.set(sideSign * 0.075, -0.32, 0.03);
                kneeJoint.add(calfTrapTop);

                const calfTrapBox = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.12, 0.11), neonMat);
                calfTrapBox.position.set(sideSign * 0.076, -0.44, -0.02);
                kneeJoint.add(calfTrapBox);

                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.30), armorMat);
                boot.position.set(0, -0.58, -0.05);
                kneeJoint.add(boot);

                return { hipJoint, kneeJoint, boot };
            };

            const leftLeg = buildLeg(-1);
            const rightLeg = buildLeg(1);

            const batonGroup = new THREE.Group();
            batonGroup.visible = false;
            torso.add(batonGroup);

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
                discMount
            };
        }

        function createMovieCloudTexture(variant = 'NORMAL') {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            ctx.clearRect(0, 0, 512, 512);

            const puffs = [
                { x: 256, y: 268, r: 195, a: 0.58 },
                { x: 165, y: 278, r: 145, a: 0.46 },
                { x: 348, y: 282, r: 148, a: 0.46 },
                { x: 215, y: 215, r: 138, a: 0.40 },
                { x: 305, y: 220, r: 132, a: 0.38 },
                { x: 118, y: 308, r: 105, a: 0.32 },
                { x: 392, y: 308, r: 105, a: 0.32 }
            ];

            // Subtle, dark slate-petrol cloud mass matching Frame 1 & Frame 2
            puffs.forEach(p => {
                const g = ctx.createRadialGradient(p.x, p.y - 12, p.r * 0.08, p.x, p.y, p.r);
                g.addColorStop(0.0, `rgba(9, 24, 36, ${p.a})`);
                g.addColorStop(0.5, `rgba(12, 31, 46, ${p.a * 0.78})`);
                g.addColorStop(0.8, `rgba(6, 17, 27, ${p.a * 0.36})`);
                g.addColorStop(1.0, 'rgba(2, 8, 14, 0.0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });

            // Soft, understated cool cyan-teal stadium bounce light on cloud undersides (No orange blotches)
            const underGlow = ctx.createRadialGradient(256, 335, 18, 256, 325, 195);
            if (variant === 'LIGHTNING') {
                underGlow.addColorStop(0.0, 'rgba(185, 242, 255, 0.55)');
                underGlow.addColorStop(0.4, 'rgba(55, 190, 225, 0.25)');
                underGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
            } else {
                underGlow.addColorStop(0.0, 'rgba(32, 115, 148, 0.22)');
                underGlow.addColorStop(0.5, 'rgba(16, 68, 92, 0.10)');
                underGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
            }
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = underGlow;
            ctx.beginPath();
            ctx.arc(256, 320, 195, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            const tex = new THREE.CanvasTexture(canvas);
            tex.needsUpdate = true;
            return tex;
        }

        function buildGridStormClouds() {
            if (!scene) return;
            stormCloudGroup = new THREE.Group();
            stormCloudSprites = [];
            scene.add(stormCloudGroup);

            // 1. Lightweight Storm Sky Dome (Single-pass procedural wave instead of 10-octave per-pixel FBM)
            stormCeilingUniforms = {
                uTime: { value: 0 },
                uFlash: { value: 0 },
                uFlashPos: { value: new THREE.Vector2(0.0, 0.0) },
                uOpacityScale: { value: 1.0 }
            };

            const ceilingGeo = new THREE.PlaneGeometry(4800, 5800, 16, 16);
            ceilingGeo.rotateX(Math.PI / 2);

            const posAttr = ceilingGeo.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const vx = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                const distNorm = Math.min(1.0, Math.hypot(vx / 2400, vz / 2900));
                posAttr.setY(i, -Math.pow(distNorm, 1.75) * 240);
            }
            posAttr.needsUpdate = true;

            const ceilingMat = new THREE.ShaderMaterial({
                uniforms: stormCeilingUniforms,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                vertexShader: `
                    varying vec3 vWorldPos;
                    void main() {
                        vec4 wp = modelMatrix * vec4(position, 1.0);
                        vWorldPos = wp.xyz;
                        gl_Position = projectionMatrix * viewMatrix * wp;
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uFlash;
                    uniform vec2 uFlashPos;
                    uniform float uOpacityScale;
                    varying vec3 vWorldPos;

                    void main() {
                        vec2 p = vWorldPos.xz * 0.0014;
                        float w1 = sin(p.x * 2.3 + uTime * 0.08) * cos(p.y * 1.9 - uTime * 0.06);
                        float w2 = sin((p.x - p.y) * 3.7 - uTime * 0.11) * 0.5;
                        float cloudMass = smoothstep(-0.4, 0.7, (w1 + w2) * 0.5 + 0.25);

                        vec3 nightSky = vec3(0.008, 0.028, 0.048);
                        vec3 slateCloud = vec3(0.036, 0.095, 0.145);
                        vec3 col = mix(nightSky, slateCloud, cloudMass);

                        float flashDist = length(vWorldPos.xz - uFlashPos);
                        float localFlash = uFlash * exp(-flashDist * 0.0016);
                        col += vec3(0.42, 0.78, 0.92) * localFlash * 0.75;

                        float edgeDist = length(vWorldPos.xz * vec2(1.0 / 2200.0, 1.0 / 2700.0));
                        float radialMask = 1.0 - smoothstep(0.58, 0.98, edgeDist);

                        float alpha = clamp(cloudMass * 0.85 * radialMask * uOpacityScale, 0.0, 0.88);
                        gl_FragColor = vec4(col, alpha);
                    }
                `
            });

            stormCeilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
            stormCeilingMesh.position.set(0, 420, 0);
            stormCeilingMesh.renderOrder = 1;
            stormCeilingMesh.matrixAutoUpdate = false;
            stormCeilingMesh.updateMatrix();
            stormCloudGroup.add(stormCeilingMesh);

            // 2. Soft Dark-Slate Cloud Billows Drifting Behind the Monolith Tower & Rim (22 sprites)
            const baseCloudTex = createMovieCloudTexture('NORMAL');
            const flashCloudTex = createMovieCloudTexture('LIGHTNING');

            const cloudCount = 22;
            for (let i = 0; i < cloudCount; i++) {
                const isRimPerimeter = i < 16;
                let cx, cy, cz, scaleW, scaleH;

                if (isRimPerimeter) {
                    const angle = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
                    const radX = (ARENA_HALF_X + 220) + Math.random() * 440;
                    const radZ = (ARENA_HALF_Z + 220) + Math.random() * 480;
                    cx = Math.cos(angle) * radX;
                    cz = Math.sin(angle) * radZ;
                    cy = 185 + Math.random() * 145;
                    scaleW = 640 + Math.random() * 420;
                    scaleH = 230 + Math.random() * 130;
                } else {
                    cx = (Math.random() - 0.5) * (ARENA_WIDTH * 1.45);
                    cz = (Math.random() - 0.5) * (ARENA_LENGTH * 1.45);
                    cy = 275 + Math.random() * 135;
                    scaleW = 680 + Math.random() * 440;
                    scaleH = 240 + Math.random() * 140;
                }

                const mat = new THREE.SpriteMaterial({
                    map: baseCloudTex,
                    color: 0xb8e6f5,
                    transparent: true,
                    opacity: isRimPerimeter ? 0.62 : 0.52,
                    depthWrite: false,
                    fog: false
                });

                const sprite = new THREE.Sprite(mat);
                sprite.position.set(cx, cy, cz);
                sprite.scale.set(scaleW, scaleH, 1);
                sprite.renderOrder = 2;
                stormCloudGroup.add(sprite);

                stormCloudSprites.push({
                    sprite,
                    baseTex: baseCloudTex,
                    flashTex: flashCloudTex,
                    baseX: cx,
                    baseY: cy,
                    baseZ: cz,
                    baseOpacity: mat.opacity,
                    driftSpeedX: (Math.random() - 0.5) * 6.5,
                    driftSpeedZ: 3.8 + Math.random() * 5.5,
                    bobPhase: Math.random() * Math.PI * 2
                });
            }
        }

        function triggerCloudLightningStrike() {
            if (!stormCeilingUniforms || stormCloudSprites.length === 0) return;

            const hostCloud = stormCloudSprites[Math.floor(Math.random() * stormCloudSprites.length)];
            const fx = hostCloud.sprite.position.x;
            const fz = hostCloud.sprite.position.z;

            stormCeilingUniforms.uFlashPos.value.set(fx, fz);
            stormFlashIntensity = 0.75;

            stormCloudSprites.forEach(c => {
                const dist = Math.hypot(c.sprite.position.x - fx, c.sprite.position.z - fz);
                if (dist < 560) {
                    c.sprite.material.map = c.flashTex;
                    c.sprite.material.color.setHex(0xeafbff);
                }
            });
        }

        let crowdCheerAudioCtx = null;
        let sharedCrowdNoiseBuffer = null;
        let lastCheerArchetype = -1;
        let lastCheerTriggerTime = 0;

        function getSharedCrowdNoiseBuffer(ctx) {
            if (sharedCrowdNoiseBuffer && sharedCrowdNoiseBuffer.sampleRate === ctx.sampleRate) {
                return sharedCrowdNoiseBuffer;
            }
            // Pre-build a 5.5-second stereo pink-noise + applause buffer ONCE so kills never freeze the CPU
            const duration = 5.5;
            const sampleRate = ctx.sampleRate;
            const bufferSize = Math.floor(sampleRate * duration);
            sharedCrowdNoiseBuffer = ctx.createBuffer(2, bufferSize, sampleRate);

            for (let ch = 0; ch < 2; ch++) {
                const data = sharedCrowdNoiseBuffer.getChannelData(ch);
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                let slowWalk = 1.0;
                let clapEnv = 0.0;

                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;
                    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.042;
                    b6 = white * 0.115926;

                    slowWalk += (Math.random() - 0.5) * 0.008;
                    slowWalk = Math.max(0.65, Math.min(1.35, slowWalk * 0.9995 + 0.0005));

                    if (Math.random() < 0.018) {
                        clapEnv = Math.min(1.0, clapEnv + 0.25 + Math.random() * 0.5);
                    }
                    clapEnv *= 0.986;
                    data[i] = pink * slowWalk + white * clapEnv * 0.065;
                }
            }
            return sharedCrowdNoiseBuffer;
        }

        function playCrowdCheerSound(victimCycle = null) {
            const audioLabel = document.getElementById('audio-label');
            if (audioLabel && audioLabel.textContent.includes('OFF')) return;
            if (typeof soundEngine !== 'undefined' && soundEngine && soundEngine.enabled === false) return;

            // Coalesce simultaneous multi-kills within 250ms so we don't stack redundant filter graphs
            const perfNow = performance.now();
            if (perfNow - lastCheerTriggerTime < 250) return;
            lastCheerTriggerTime = perfNow;

            try {
                const ctx = (typeof soundEngine !== 'undefined' && soundEngine && soundEngine.ctx)
                    ? soundEngine.ctx
                    : (crowdCheerAudioCtx || (crowdCheerAudioCtx = new (window.AudioContext || window.webkitAudioContext)()));

                if (ctx.state === 'suspended') {
                    ctx.resume();
                }

                const crowdBuffer = getSharedCrowdNoiseBuffer(ctx);
                const now = ctx.currentTime;
                const rand = (min, max) => min + Math.random() * (max - min);

                let archetype = Math.floor(Math.random() * 4);
                if (archetype === lastCheerArchetype) {
                    archetype = (archetype + 1 + Math.floor(Math.random() * 3)) % 4;
                }
                lastCheerArchetype = archetype;

                const isPlayerDeath = victimCycle && victimCycle.isPlayer;
                const duration = rand(3.4, 4.6);

                const masterGain = ctx.createGain();
                masterGain.gain.setValueAtTime(rand(0.42, 0.56), now);
                masterGain.connect(ctx.destination);

                const echoDelayL = ctx.createDelay(0.5);
                echoDelayL.delayTime.setValueAtTime(rand(0.12, 0.18), now);
                const echoFilter = ctx.createBiquadFilter();
                echoFilter.type = 'lowpass';
                echoFilter.frequency.setValueAtTime(1650, now);
                const echoGain = ctx.createGain();
                echoGain.gain.setValueAtTime(0.22, now);

                echoDelayL.connect(echoFilter);
                echoFilter.connect(echoGain);
                echoGain.connect(masterGain);

                const vowelPalettes = [
                    { f1Start: 390, f1Peak: 680, f1End: 460, f2Start: 820,  f2Peak: 1240, f2End: 920 },
                    { f1Start: 520, f1Peak: 760, f1End: 540, f2Start: 1050, f2Peak: 1620, f2End: 1180 },
                    { f1Start: 350, f1Peak: 590, f1End: 410, f2Start: 740,  f2Peak: 1120, f2End: 800 },
                    { f1Start: 460, f1Peak: 720, f1End: 490, f2Start: 940,  f2Peak: 1480, f2End: 1020 }
                ];

                const sectionPans = [-0.65, 0.0, 0.65];
                sectionPans.forEach((basePan, secIdx) => {
                    const src = ctx.createBufferSource();
                    src.buffer = crowdBuffer;
                    src.loop = true;
                    src.playbackRate.setValueAtTime(rand(0.88, 1.14), now);

                    const secDelay = secIdx * rand(0.03, 0.08);
                    const t0 = now + secDelay;
                    const vowel = vowelPalettes[(archetype + secIdx) % vowelPalettes.length];
                    const pitchScale = isPlayerDeath ? rand(0.86, 0.96) : rand(0.94, 1.12);

                    const f1 = ctx.createBiquadFilter();
                    f1.type = 'bandpass';
                    f1.Q.setValueAtTime(rand(1.4, 2.2), t0);
                    f1.frequency.setValueAtTime(vowel.f1Start * pitchScale, t0);
                    f1.frequency.exponentialRampToValueAtTime(vowel.f1Peak * pitchScale, t0 + rand(0.22, 0.45));
                    f1.frequency.exponentialRampToValueAtTime(vowel.f1End * pitchScale, now + duration);

                    const f2 = ctx.createBiquadFilter();
                    f2.type = 'bandpass';
                    f2.Q.setValueAtTime(rand(1.8, 2.6), t0);
                    f2.frequency.setValueAtTime(vowel.f2Start * pitchScale, t0);
                    f2.frequency.exponentialRampToValueAtTime(vowel.f2Peak * pitchScale, t0 + rand(0.20, 0.42));
                    f2.frequency.exponentialRampToValueAtTime(vowel.f2End * pitchScale, now + duration);

                    const rumble = ctx.createBiquadFilter();
                    rumble.type = 'lowpass';
                    rumble.frequency.setValueAtTime(rand(220, 300), t0);

                    const env = ctx.createGain();
                    const peakLevel = rand(0.32, 0.45);
                    env.gain.setValueAtTime(0.0001, now);
                    env.gain.setValueAtTime(0.001, t0);

                    if (archetype === 0) {
                        env.gain.linearRampToValueAtTime(peakLevel, t0 + rand(0.10, 0.18));
                        env.gain.exponentialRampToValueAtTime(peakLevel * 0.72, t0 + rand(0.9, 1.3));
                        env.gain.exponentialRampToValueAtTime(0.0008, now + duration);
                    } else if (archetype === 1) {
                        env.gain.linearRampToValueAtTime(peakLevel * 0.78, t0 + 0.16);
                        env.gain.exponentialRampToValueAtTime(peakLevel * 0.42, t0 + 0.75);
                        env.gain.linearRampToValueAtTime(peakLevel * 1.05, t0 + 1.45);
                        env.gain.exponentialRampToValueAtTime(0.0008, now + duration);
                    } else if (archetype === 2) {
                        env.gain.linearRampToValueAtTime(peakLevel * 0.92, t0 + 0.09);
                        env.gain.exponentialRampToValueAtTime(peakLevel * 0.55, t0 + 0.32);
                        env.gain.linearRampToValueAtTime(peakLevel * 0.96, t0 + 0.68);
                        env.gain.exponentialRampToValueAtTime(0.0008, now + duration);
                    } else {
                        env.gain.linearRampToValueAtTime(peakLevel * 0.65, t0 + 0.24);
                        env.gain.linearRampToValueAtTime(peakLevel, t0 + rand(0.75, 1.15));
                        env.gain.exponentialRampToValueAtTime(0.0008, now + duration);
                    }

                    src.connect(f1);
                    src.connect(f2);
                    src.connect(rumble);
                    f1.connect(env);
                    f2.connect(env);
                    rumble.connect(env);

                    if (ctx.createStereoPanner) {
                        const panner = ctx.createStereoPanner();
                        panner.pan.setValueAtTime(Math.max(-0.95, Math.min(0.95, basePan + rand(-0.15, 0.15))), now);
                        env.connect(panner);
                        panner.connect(masterGain);
                        panner.connect(echoDelayL);
                    } else {
                        env.connect(masterGain);
                        env.connect(echoDelayL);
                    }

                    // Offset into the pre-cached noise buffer randomly so every section sounds unique
                    const randomOffset = rand(0, 1.2);
                    src.start(now, randomOffset);
                    src.stop(now + duration);

                    if (secIdx === 2) {
                        src.onended = () => {
                            try { masterGain.disconnect(); } catch (e) {}
                        };
                    }
                });
            } catch (err) {
                // Ignore Web Audio context errors if blocked by browser autoplay policy
            }
        }

        function triggerCrowdCheer(crashPosition, colorHex, victimCycle = null) {
            if (crowdUniforms) {
                crowdUniforms.uCheerIntensity.value = 0.88 + Math.random() * 0.28;
                crowdUniforms.uCheerWaveTime.value = Math.random() * 1.5;
                if (crashPosition) {
                    crowdUniforms.uKillPos.value.copy(crashPosition);
                }
                if (colorHex !== undefined) {
                    crowdUniforms.uKillColor.value.setHex(colorHex);
                }
            }
            playCrowdCheerSound(victimCycle);
        }

        function updateGridStormClouds(dt) {
            if (crowdUniforms) {
                crowdUniforms.uTime.value += dt;
                if (crowdUniforms.uCheerIntensity.value > 0.001) {
                    crowdUniforms.uCheerWaveTime.value += dt;
                    crowdUniforms.uCheerIntensity.value = Math.max(
                        0.0,
                        crowdUniforms.uCheerIntensity.value - dt * 0.32
                    );
                }
            }
            if (!stormCloudGroup) return;

            const isTopCam = gameState.cameraMode === 2;
            const targetOpacityScale = isTopCam ? 0.12 : 1.0;

            if (stormCeilingUniforms) {
                stormCeilingUniforms.uTime.value += dt;
                stormCeilingUniforms.uOpacityScale.value = THREE.MathUtils.lerp(
                    stormCeilingUniforms.uOpacityScale.value,
                    targetOpacityScale,
                    dt * 5.0
                );
            }

            const timeNow = performance.now() * 0.001;
            for (let i = 0; i < stormCloudSprites.length; i++) {
                const c = stormCloudSprites[i];
                c.sprite.position.x += c.driftSpeedX * dt;
                c.sprite.position.z += c.driftSpeedZ * dt;
                c.sprite.position.y = c.baseY + Math.sin(timeNow * 0.45 + c.bobPhase) * 5.0;

                if (c.sprite.position.z > ARENA_HALF_Z + 780) {
                    c.sprite.position.z = -ARENA_HALF_Z - 720;
                }
                if (c.sprite.position.x > ARENA_HALF_X + 780) {
                    c.sprite.position.x = -ARENA_HALF_X - 720;
                } else if (c.sprite.position.x < -ARENA_HALF_X - 780) {
                    c.sprite.position.x = ARENA_HALF_X + 720;
                }

                c.sprite.material.opacity = c.baseOpacity * targetOpacityScale;
            }

            stormLightningTimer -= dt;
            if (stormLightningTimer <= 0) {
                stormLightningTimer = 3.6 + Math.random() * 5.2;
                triggerCloudLightningStrike();
            }

            if (stormFlashIntensity > 0) {
                stormFlashIntensity = Math.max(0, stormFlashIntensity - dt * 2.8);
                const flicker = stormFlashIntensity * (0.65 + 0.35 * Math.sin(timeNow * 48));

                if (stormCeilingUniforms) {
                    stormCeilingUniforms.uFlash.value = flicker;
                }
                if (stormLightningLight) {
                    stormLightningLight.intensity = flicker * 1.5;
                }

                if (stormFlashIntensity <= 0.02) {
                    stormCloudSprites.forEach(c => {
                        if (c.sprite.material.map !== c.baseTex) {
                            c.sprite.material.map = c.baseTex;
                            c.sprite.material.color.setHex(0xb8e6f5);
                        }
                    });
                }
            }
        }

        /**
         * ============================================================================
         * MOVIE-ACCURATE TRANSLUCENT LIGHT RIBBON SYSTEM (FRAMES 1, 2 & 3)
         * - Sheer, glassy see-through energy curtain with flowing horizontal plasma wisps
         * - Intense white-hot top & bottom laser rails with vertical neon bloom falloff
         * - Wide, soft specular floor reflection strip on the glossy obsidian court
         * ============================================================================
         */
        const ribbonSharedTime = { value: 0 };

        // Clean single-sheet ribbon geometry (eliminates the old internal opaque X-cross planes)
        const MOVIE_RIBBON_SHEET_GEO = (() => {
            const geo = new THREE.PlaneGeometry(1, WALL_HEIGHT, 1, 1);
            geo.rotateY(Math.PI / 2);
            return geo;
        })();

        // Slightly taller outer bloom plane for the soft neon aura around top/bottom rails
        const MOVIE_RIBBON_AURA_GEO = (() => {
            const geo = new THREE.PlaneGeometry(1, WALL_HEIGHT + 0.36, 1, 1);
            geo.rotateY(Math.PI / 2);
            return geo;
        })();

        // Razor-sharp white-hot top & bottom laser core rails (Frame 1 & Frame 2)
        const MOVIE_TOP_LASER_GEO = new THREE.BoxGeometry(0.075, 0.085, 1);
        const MOVIE_BOTTOM_LASER_GEO = new THREE.BoxGeometry(0.065, 0.065, 1);

        // Specular floor reflection strip geometry lying flat on the obsidian floor (Frame 2)
        const MOVIE_FLOOR_REFL_GEO = (() => {
            const geo = new THREE.PlaneGeometry(2.6, 1, 1, 1);
            geo.rotateX(-Math.PI / 2);
            return geo;
        })();

        let ribbonFloorReflTex = null;
        function getRibbonFloorReflectionTexture() {
            if (ribbonFloorReflTex) return ribbonFloorReflTex;
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 64;
            const ctx = c.getContext('2d');

            const grad = ctx.createLinearGradient(0, 0, 256, 0);
            grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.0)');
            grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.08)');
            grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.42)');
            grad.addColorStop(0.50, 'rgba(255, 255, 255, 0.85)');
            grad.addColorStop(0.58, 'rgba(255, 255, 255, 0.42)');
            grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.08)');
            grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 256, 64);

            ribbonFloorReflTex = new THREE.CanvasTexture(c);
            ribbonFloorReflTex.needsUpdate = true;
            return ribbonFloorReflTex;
        }

        function createMovieRibbonMaterials(neonColorHex) {
            const baseCol = new THREE.Color(neonColorHex);
            const hotEdgeCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.78);
            const railCoreCol = baseCol.clone().lerp(new THREE.Color(0xffffff), 0.92);

            // Unified Translucent Curtain Shader with Baked Top/Bottom White-Hot Laser Rails
            // (Replaces 4 separate meshes + expensive per-pixel hash noise with 1 fast shader pass)
            const wallMat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: baseCol },
                    uHotColor: { value: hotEdgeCol },
                    uRailColor: { value: railCoreCol },
                    uTime: ribbonSharedTime
                },
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.NormalBlending,
                vertexShader: `
                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        vUv = uv;
                        vec4 wp = modelMatrix * vec4(position, 1.0);
                        vWorldPos = wp.xyz;
                        gl_Position = projectionMatrix * viewMatrix * wp;
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform vec3 uHotColor;
                    uniform vec3 uRailColor;
                    uniform float uTime;
                    varying vec2 vUv;
                    varying vec3 vWorldPos;

                    void main() {
                        float y = clamp(vUv.y, 0.0, 1.0);

                        // Baked razor-sharp white-hot top & bottom laser rails
                        float topRailCore = smoothstep(0.955, 0.985, y);
                        float botRailCore = smoothstep(0.040, 0.012, y);
                        float railCoreMask = max(topRailCore, botRailCore);

                        // Vertical neon bloom falloff from the top & bottom rails
                        float topGlow = exp(-pow((1.0 - y) * 6.5, 2.0));
                        float botGlow = exp(-pow(y * 7.5, 2.0));
                        float softGrad = pow(y, 2.4) * 0.22 + pow(1.0 - y, 2.8) * 0.18;

                        // Fast trigonometric energy wisps (Zero texture/hash noise overhead)
                        float axial = (vWorldPos.x + vWorldPos.z) * 0.09;
                        float wisp = sin(axial - uTime * 3.8 + y * 4.5) * cos(axial * 0.6 + uTime * 2.2 - y * 7.0);
                        float plasmaWisps = smoothstep(-0.2, 0.75, wisp) * 0.12;

                        float edgeHighlight = clamp(topGlow * 0.95 + botGlow * 0.85, 0.0, 1.0);
                        vec3 col = mix(uColor, uHotColor, clamp(edgeHighlight + plasmaWisps * 1.6, 0.0, 1.0));
                        col = mix(col, uRailColor, railCoreMask);

                        float alpha = clamp(0.14 + plasmaWisps + softGrad + topGlow * 0.72 + botGlow * 0.62 + railCoreMask * 0.85, 0.12, 0.98);
                        gl_FragColor = vec4(col, alpha);
                    }
                `
            });

            // Specular Floor Reflection Strip Material (Mirrors the ribbon onto the glossy black floor)
            const floorReflMat = new THREE.MeshBasicMaterial({
                map: getRibbonFloorReflectionTexture(),
                color: neonColorHex,
                transparent: true,
                opacity: 0.34,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            return { wallMat, floorReflMat };
        }
