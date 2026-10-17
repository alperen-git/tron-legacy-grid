const GridConfig = (() => {
            const ARENA_HALF_X = 720;
            const ARENA_HALF_Z = 1180;
            const WHEEL_RADIUS = 1.10;

            const STADIUM_POLYGON = [
                { x: -340, z: -1180 }, // North-West Command Bay Corner
                { x:  340, z: -1180 }, // North-East Command Bay Corner
                { x:  520, z: -1000 }, // North-East Bevel
                { x:  720, z:  -680 }, // East-North Chamfer
                { x:  720, z:   680 }, // East-South Chamfer
                { x:  520, z:  1000 }, // South-East Bevel
                { x:  360, z:  1180 }, // South-East Launch Bay Corner
                { x: -360, z:  1180 }, // South-West Launch Bay Corner
                { x: -540, z:  1000 }, // South-West Bevel
                { x: -720, z:   520 }, // West-South Prow Base
                { x: -720, z:  -520 }, // West-North Prow Base
                { x: -540, z: -1000 }  // North-West Bevel
            ];

            // Precompute inward normal vectors & edge lengths for fast stadium boundary math
            const STADIUM_EDGES = STADIUM_POLYGON.map((p1, idx) => {
                const p2 = STADIUM_POLYGON[(idx + 1) % STADIUM_POLYGON.length];
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const len = Math.hypot(dx, dz);
                let nx = -dz / len;
                let nz = dx / len;
                const midX = (p1.x + p2.x) * 0.5;
                const midZ = (p1.z + p2.z) * 0.5;
                if (nx * (-midX) + nz * (-midZ) < 0) {
                    nx = -nx;
                    nz = -nz;
                }
                return { x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z, len, nx, nz };
            });

            return Object.freeze({
                ARENA_HALF_X,
                ARENA_HALF_Z,
                ARENA_WIDTH: ARENA_HALF_X * 2,
                ARENA_LENGTH: ARENA_HALF_Z * 2,
                MIN_ARENA_SCALE: 0.25,
                SHRINK_START_TIME: 10.0,
                WHEEL_RADIUS,
                WALL_HEIGHT: WHEEL_RADIUS * 2.0,
                MAX_RIBBON_LENGTH: 220,
                BASE_SPEED: 76,
                BOOST_SPEED: 112,
                BRAKE_SPEED: 42,
                TURN_RATE: 1.48,
                COLLISION_RADIUS: 1.75,
                START_HEADINGS: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
                STADIUM_POLYGON,
                STADIUM_EDGES,
                AI_RAY_ANGLES: [
                    0, -0.16, 0.16, -0.35, 0.35, -0.62, 0.62,
                    -0.92, 0.92, -1.32, 1.32, -1.57, 1.57, -1.95, 1.95
                ]
            });
        })();

        // Legacy top-level aliases for seamless compatibility across modules
        const {
            ARENA_HALF_X, ARENA_HALF_Z, ARENA_WIDTH, ARENA_LENGTH,
            MIN_ARENA_SCALE, SHRINK_START_TIME, WHEEL_RADIUS, WALL_HEIGHT,
            MAX_RIBBON_LENGTH, BASE_SPEED, BOOST_SPEED, BRAKE_SPEED,
            TURN_RATE, COLLISION_RADIUS, START_HEADINGS,
            STADIUM_POLYGON, STADIUM_EDGES
        } = GridConfig;

        /**
         * ============================================================================
         * MODULE 2: SPATIAL HASH GRID ACCELERATOR (SpatialHashGrid)
         * Partitions the Coliseum floor into uniform 2D cells to accelerate segment
         * collision checks and multi-ray AI queries without brute-forcing all segments.
         * ============================================================================
         */
        class SpatialHashGrid {
            constructor(cellSize = 140) {
                this.cellSize = cellSize;
                this.invCellSize = 1.0 / cellSize;
                this.cells = new Map();
                this.queryId = 0;
            }

            clear() {
                this.cells.clear();
            }

            _key(cx, cz) {
                return (cx << 16) ^ (cz & 0xffff);
            }

            insertSegment(seg, ownerCycle, segIndex, isLethalToSelf) {
                const minX = Math.min(seg.start.x, seg.end.x) - 3.0;
                const maxX = Math.max(seg.start.x, seg.end.x) + 3.0;
                const minZ = Math.min(seg.start.z, seg.end.z) - 3.0;
                const maxZ = Math.max(seg.start.z, seg.end.z) + 3.0;

                const cx0 = Math.floor(minX * this.invCellSize);
                const cx1 = Math.floor(maxX * this.invCellSize);
                const cz0 = Math.floor(minZ * this.invCellSize);
                const cz1 = Math.floor(maxZ * this.invCellSize);

                const entry = {
                    seg,
                    owner: ownerCycle,
                    segIndex,
                    isLethalToSelf,
                    lastQueryId: -1
                };

                for (let cx = cx0; cx <= cx1; cx++) {
                    for (let cz = cz0; cz <= cz1; cz++) {
                        const key = this._key(cx, cz);
                        let bucket = this.cells.get(key);
                        if (!bucket) {
                            bucket = [];
                            this.cells.set(key, bucket);
                        }
                        bucket.push(entry);
                    }
                }
            }

            rebuild(allCycles) {
                this.clear();
                for (let cIdx = 0; cIdx < allCycles.length; cIdx++) {
                    const cycle = allCycles[cIdx];
                    const segs = cycle.segments;
                    const len = segs.length;
                    for (let i = 0; i < len; i++) {
                        this.insertSegment(segs[i], cycle, i, i < len - 6);
                    }
                }
            }

            queryBox(minX, minZ, maxX, maxZ, callback) {
                this.queryId++;
                const qId = this.queryId;
                const cx0 = Math.floor(minX * this.invCellSize);
                const cx1 = Math.floor(maxX * this.invCellSize);
                const cz0 = Math.floor(minZ * this.invCellSize);
                const cz1 = Math.floor(maxZ * this.invCellSize);

                for (let cx = cx0; cx <= cx1; cx++) {
                    for (let cz = cz0; cz <= cz1; cz++) {
                        const bucket = this.cells.get(this._key(cx, cz));
                        if (!bucket) continue;
                        for (let i = 0; i < bucket.length; i++) {
                            const entry = bucket[i];
                            if (entry.lastQueryId !== qId) {
                                entry.lastQueryId = qId;
                                if (callback(entry) === true) return true;
                            }
                        }
                    }
                }
                return false;
            }
        }

        const spatialGrid = new SpatialHashGrid(140);

        /**
         * ============================================================================
         * MODULE 3: PROCEDURAL SYNTH AUDIO ENGINE (TronSoundEngine)
         * Self-contained Web Audio synthesizer for turbine pitch, bassline, and FX.
         * ============================================================================
         */
        class TronSoundEngine {
            constructor() {
                this.ctx = null;
                this.enabled = true;
                this.isPlaying = false;
                this.engineOsc = null;
                this.engineGain = null;
                this.arpInterval = null;
                this.arpStep = 0;
                this.arpNotes = [73.42, 110.00, 146.83, 174.61, 146.83, 110.00, 87.31, 130.81];
            }

            init() {
                if (this.ctx) return;
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AudioContext();
                } catch (e) {
                    console.warn('Web Audio API not supported:', e);
                }
            }

            startEngine() {
                if (!this.enabled) return;
                this.init();
                if (!this.ctx) return;
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
                if (this.isPlaying) return;
                this.isPlaying = true;

                this.engineOsc = this.ctx.createOscillator();
                this.engineGain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                this.engineOsc.type = 'sawtooth';
                this.engineOsc.frequency.setValueAtTime(95, this.ctx.currentTime);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(340, this.ctx.currentTime);

                this.engineGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

                this.engineOsc.connect(filter);
                filter.connect(this.engineGain);
                this.engineGain.connect(this.ctx.destination);
                this.engineOsc.start();

                this.arpInterval = setInterval(() => {
                    if (!this.enabled || !this.isPlaying || !this.ctx) return;
                    const freq = this.arpNotes[this.arpStep % this.arpNotes.length];
                    this.arpStep++;
                    this.playBassPulse(freq);
                }, 210);
            }

            playBassPulse(freq) {
                try {
                    const now = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    const filter = this.ctx.createBiquadFilter();

                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now);

                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(520, now);
                    filter.frequency.exponentialRampToValueAtTime(90, now + 0.18);

                    gain.gain.setValueAtTime(0.065, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(this.ctx.destination);

                    osc.start(now);
                    osc.stop(now + 0.2);
                } catch (e) {}
            }

            updateEnginePitch(speedRatio, isBoosting) {
                if (!this.engineOsc || !this.ctx || !this.enabled) return;
                const now = this.ctx.currentTime;
                const targetFreq = 85 + speedRatio * 95 + (isBoosting ? 55 : 0);
                this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
            }

            playTurnSound() {
                if (!this.enabled || !this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(520, now);
                    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

                    gain.gain.setValueAtTime(0.14, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(now);
                    osc.stop(now + 0.15);
                } catch (e) {}
            }

            playDerezzSound() {
                if (!this.enabled || !this.ctx) return;
                try {
                    const now = this.ctx.currentTime;
                    [180, 270, 405, 640].forEach((freq, idx) => {
                        const osc = this.ctx.createOscillator();
                        const gain = this.ctx.createGain();
                        osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
                        osc.frequency.setValueAtTime(freq, now);
                        osc.frequency.exponentialRampToValueAtTime(35, now + 0.55);

                        gain.gain.setValueAtTime(0.09, now);
                        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

                        osc.connect(gain);
                        gain.connect(this.ctx.destination);
                        osc.start(now);
                        osc.stop(now + 0.56);
                    });
                } catch (e) {}
            }

            stopEngine() {
                this.isPlaying = false;
                if (this.arpInterval) {
                    clearInterval(this.arpInterval);
                    this.arpInterval = null;
                }
                if (this.engineOsc) {
                    try { this.engineOsc.stop(); } catch (e) {}
                    this.engineOsc = null;
                }
            }

            toggle() {
                this.enabled = !this.enabled;
                if (!this.enabled) {
                    this.stopEngine();
                } else if (gameState.status === 'PLAYING') {
                    this.startEngine();
                }
                return this.enabled;
            }
        }

        const soundEngine = new TronSoundEngine();

        /**
         * ============================================================================
         * MODULE 4: RUNTIME STATE & PHYSICS ENGINE (PhysicsEngine)
         * Pure geometric queries, Shrinking Grid boundaries, and segment intersections.
         * ============================================================================
         */
        let matchElapsedTime = 0;
        let gridRezzWaveTime = 0;
        let gridRezzRingMesh = null;
        let mainFloorMesh = null;
        let shrinkBarrierGroup = null;
        let shrinkTopRailMat = null;
        let shrinkWallMat = null;

        let scene, camera, renderer, clock;
        let cycles = [];
        let playerCycle = null;
        let derezzParticles = [];
        let recognizers = [];
        let flareColumns = [];

        const gameState = {
            status: 'MENU',
            mode: 'TEAM',
            cameraMode: 0,
            cameraNames: ['CHASE', 'CANOPY', 'GRID TOP'],
            score: 0,
            wins: 0,
            mouseOrbitYaw: 0,
            mouseOrbitPitch: 0.22,
            isDragging: false,
            lastMouseX: 0,
            lastMouseY: 0,
            arenaScale: 1.0,
            isShrinking: false,
            shrinkMilestoneAnnounced: 100,
            shrinkSparkTimer: 0,
            spectating: false,
            spectateTarget: null,
            spectateAutoDirector: true,
            spectateAutoTimer: 0,
            simSpeedMultiplier: 1.0,
            timeSinceLastKill: 0,
            directorTimer: 0,
            rosterDirty: false,
            directorDirty: false,
            blueDoctrine: 'LAUNCH SPREAD',
            orangeDoctrine: 'LAUNCH SPREAD'
        };

        const PhysicsEngine = {
            normalizeAngle(angle) {
                while (angle > Math.PI) angle -= Math.PI * 2;
                while (angle < -Math.PI) angle += Math.PI * 2;
                return angle;
            },

            isInsideStadiumPolygon(x, z, margin = 0, customScale = null) {
                const s = customScale !== null ? customScale : gameState.arenaScale;
                for (let i = 0; i < STADIUM_EDGES.length; i++) {
                    const e = STADIUM_EDGES[i];
                    const signedDist = (x - e.x1 * s) * e.nx + (z - e.z1 * s) * e.nz;
                    if (signedDist < margin) return false;
                }
                return true;
            },

            getDistanceToActiveBorder(x, z) {
                const s = gameState.arenaScale;
                let minDist = Infinity;
                for (let i = 0; i < STADIUM_EDGES.length; i++) {
                    const e = STADIUM_EDGES[i];
                    const signedDist = (x - e.x1 * s) * e.nx + (z - e.z1 * s) * e.nz;
                    if (signedDist < minDist) minDist = signedDist;
                }
                return minDist;
            },

            pointToSegmentDistanceSq(px, pz, x1, z1, x2, z2) {
                const l2 = (x2 - x1) ** 2 + (z2 - z1) ** 2;
                if (l2 === 0) return (px - x1) ** 2 + (pz - z1) ** 2;
                let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = x1 + t * (x2 - x1);
                const projZ = z1 + t * (z2 - z1);
                return (px - projX) ** 2 + (pz - projZ) ** 2;
            },

            sweptSegmentIntersection(p1, p2, q1, q2, radius = COLLISION_RADIUS) {
                const qLenSq = (q2.x - q1.x) ** 2 + (q2.z - q1.z) ** 2;
                if (qLenSq < 0.05) return false;

                const distSq = this.pointToSegmentDistanceSq(p2.x, p2.z, q1.x, q1.z, q2.x, q2.z);
                if (distSq < radius * radius) {
                    return true;
                }

                const r_x = p2.x - p1.x;
                const r_z = p2.z - p1.z;
                const s_x = q2.x - q1.x;
                const s_z = q2.z - q1.z;

                const denom = r_x * s_z - r_z * s_x;
                if (Math.abs(denom) < 1e-6) return false;

                const u = ((q1.x - p1.x) * r_z - (q1.z - p1.z) * r_x) / denom;
                const t = ((q1.x - p1.x) * s_z - (q1.z - p1.z) * s_x) / denom;

                return (t >= 0 && t <= 1 && u >= 0 && u <= 1);
            },

            checkCycleCollision(cycle, prevPos, newPos) {
                // 1. Active Shrinking Grid Perimeter Containment Walls
                if (!this.isInsideStadiumPolygon(newPos.x, newPos.z, 1.8)) {
                    return true;
                }

                // 2. Spatial Hash Grid Accelerated Light Ribbon Check
                const minX = Math.min(prevPos.x, newPos.x) - COLLISION_RADIUS - 2;
                const maxX = Math.max(prevPos.x, newPos.x) + COLLISION_RADIUS + 2;
                const minZ = Math.min(prevPos.z, newPos.z) - COLLISION_RADIUS - 2;
                const maxZ = Math.max(prevPos.z, newPos.z) + COLLISION_RADIUS + 2;

                const hitRibbon = spatialGrid.queryBox(minX, minZ, maxX, maxZ, (entry) => {
                    if (entry.owner === cycle && !entry.isLethalToSelf) return false;
                    return this.sweptSegmentIntersection(prevPos, newPos, entry.seg.start, entry.seg.end, COLLISION_RADIUS);
                });
                if (hitRibbon) return true;

                // 3. Cycle-to-Cycle Collision Physics
                for (let i = 0; i < cycles.length; i++) {
                    const other = cycles[i];
                    if (other === cycle || !other.alive) continue;
                    if (newPos.distanceTo(other.position) < 2.8) {
                        other.derezz();
                        return true;
                    }
                }

                return false;
            },

            senseRayDistance(cycle, testHeading, includePredictedPaths = true) {
                const dx = Math.sin(testHeading);
                const dz = -Math.cos(testHeading);
                const px = cycle.position.x;
                const pz = cycle.position.z;
                let closest = 420;

                const testSegment = (x1, z1, x2, z2) => {
                    const sx = x2 - x1;
                    const sz = z2 - z1;
                    const rxs = dx * sz - dz * sx;
                    if (Math.abs(rxs) < 1e-5) return;

                    const qpx = x1 - px;
                    const qpz = z1 - pz;
                    const t = (qpx * sz - qpz * sx) / rxs;
                    const u = (qpx * dz - qpz * dx) / rxs;

                    if (t > 0 && t < closest && u >= 0 && u <= 1) {
                        closest = t;
                    }
                };

                // 1. Active Shrinking Grid Polygon Walls
                const s = gameState.arenaScale;
                for (let i = 0; i < STADIUM_EDGES.length; i++) {
                    const e = STADIUM_EDGES[i];
                    testSegment(e.x1 * s, e.z1 * s, e.x2 * s, e.z2 * s);
                }

                // 2. Spatial Hash Grid Query along the ray's bounding box
                const rayEndX = px + dx * closest;
                const rayEndZ = pz + dz * closest;
                const minX = Math.min(px, rayEndX) - 2;
                const maxX = Math.max(px, rayEndX) + 2;
                const minZ = Math.min(pz, rayEndZ) - 2;
                const maxZ = Math.max(pz, rayEndZ) + 2;

                spatialGrid.queryBox(minX, minZ, maxX, maxZ, (entry) => {
                    if (entry.owner === cycle && entry.segIndex >= entry.owner.segments.length - 4) {
                        return false;
                    }
                    testSegment(entry.seg.start.x, entry.seg.start.z, entry.seg.end.x, entry.seg.end.z);
                    return false;
                });

                // 3. Predictive Ribbon Sensing for moving opponents/allies
                if (includePredictedPaths) {
                    for (let i = 0; i < cycles.length; i++) {
                        const other = cycles[i];
                        if (other !== cycle && other.alive) {
                            const cDir = other.getDirectionVector();
                            const lookAheadDist = other.speed * 0.85;
                            const predX = other.position.x + cDir.x * lookAheadDist;
                            const predZ = other.position.z + cDir.z * lookAheadDist;
                            testSegment(other.position.x, other.position.z, predX, predZ);
                        }
                    }
                }

                return Math.max(0, closest);
            }
        };

        function isInsideStadiumPolygon(x, z, margin = 0, customScale = null) {
            return PhysicsEngine.isInsideStadiumPolygon(x, z, margin, customScale);
        }

        function getDistanceToActiveBorder(x, z) {
            return PhysicsEngine.getDistanceToActiveBorder(x, z);
        }

        class Lightcycle {
            constructor(config) {
                this.id = config.id;
                this.name = config.name;
                this.team = config.team;
                this.colorHex = config.colorHex;
                this.colorCss = config.colorCss;
                this.isPlayer = config.isPlayer || false;

                this.position = config.startPos.clone();
                this.heading = START_HEADINGS[config.startDir] || 0;
                this.alive = true;

                this.speed = BASE_SPEED;
                this.energy = 100;
                this.isBoosting = false;
                this.isBraking = false;
                this.moveForward = false;
                this.moveBackward = false;
                this.sprintHeld = false;
                this.trailActive = true;

                this.form = 'CYCLE';
                this.verticalVel = 0;
                this.pitchAngle = 0;

                this.steerInput = 0;
                this.smoothSteer = 0;
                this.bankAngle = 0;
                this.bankVel = 0;
                this.steerFlipCooldown = 0;
                this.avoidanceLockTimer = 0;
                this.lastSteerSign = 0;
                this.lastSegmentHeading = this.heading;
                this.lastSegmentPitch = 0;

                this.aiRole = 'FORMATION';
                this.aiDoctrine = 'LAUNCH SPREAD';
                this.aiTarget = null;
                this.lastTargetId = null;
                this.formationSlot = config.formationSlot || 0;
                this.jetwallSafetyCooldown = 0;
                this.cordonTightness = 1.0;
                this.avgTurnRate = 0;
                this.cumulativeTurn = 0;
                this.spinBreakoutTimer = 0;
                this.lockedFlankSign = this.formationSlot >= 0 ? 1 : -1;
                this.committedTurnDir = 0;
                this.committedTurnTimer = 0;

                this.joustPhase = 'CHARGE';
                this.joustTimer = 0;
                this.slashCutDir = 1;
                this.extendHeading = this.heading;

                this.mesh = new THREE.Group();
                this.mesh.position.copy(this.position);

                this.cycleBody = createLightcycleMesh(this.colorHex);
                this.mesh.add(this.cycleBody);

                this.charRig = createCharacterMesh(config);
                this.mesh.add(this.charRig.root);

                this.updateRotationImmediate();
                this.updateCharacterPose(0);
                scene.add(this.mesh);

                this.ribbonGroup = new THREE.Group();
                scene.add(this.ribbonGroup);
                this.segmentPool = [];
                this.segments = [];
                this.currentSegment = null;

                const ribbonMats = createMovieRibbonMaterials(this.colorHex);
                this.wallMat = ribbonMats.wallMat;
                this.floorReflMat = ribbonMats.floorReflMat;

                this.startNewRibbonSegment();
            }

            updateRotationImmediate() {
                this.mesh.rotation.order = 'YXZ';
                this.mesh.rotation.y = -this.heading;
                this.mesh.rotation.x = 0;
                this.mesh.rotation.z = 0;
            }

            getDirectionVector() {
                return new THREE.Vector3(Math.sin(this.heading), 0, -Math.cos(this.heading));
            }

            getRearEmitterPosition() {
                const dir = this.getDirectionVector();
                return new THREE.Vector3(
                    this.position.x - dir.x * 2.55,
                    this.position.y,
                    this.position.z - dir.z * 2.55
                );
            }

            syncPlayerFormHUD() {
                if (!this.isPlayer) return;
                const badge = document.getElementById('hud-trail-status');
                if (badge) {
                    badge.textContent = this.trailActive ? 'LIGHT RIBBON: ON' : 'LIGHT RIBBON: OFF';
                    badge.className = this.trailActive
                        ? 'text-[9px] font-orbitron px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 whitespace-nowrap shrink-0'
                        : 'text-[9px] font-orbitron px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-400/40 whitespace-nowrap shrink-0';
                }
            }

            updateCharacterPose() {
                if (!this.charRig) return;
                const rig = this.charRig;
                const steerLean = THREE.MathUtils.clamp(-this.bankAngle / 0.44, -1.2, 1.2);

                // Low-slung horizontal prone movie posture (Frames 1, 2 & 3)
                rig.hips.position.set(steerLean * 0.06, 1.18, 0.58);
                rig.hips.rotation.set(0.18, 0, -steerLean * 0.10);

                // Torso lies nearly horizontal along the sculpted upper tank spine
                rig.torso.rotation.set(-1.34, -steerLean * 0.12, -steerLean * 0.16);
                // Head tucked right behind the front wheel cowl, angled up to look forward
                rig.head.rotation.set(1.16, -steerLean * 0.24, steerLean * 0.14);

                // Arms reaching forward into the hollow front wheel hub handlebar grips
                rig.leftArm.shoulder.rotation.set(1.52, 0.14, -0.10);
                rig.leftArm.elbow.rotation.set(0.24, 0, 0);
                rig.rightArm.shoulder.rotation.set(1.52, -0.14, 0.10);
                rig.rightArm.elbow.rotation.set(0.24, 0, 0);

                // Legs stretched back with boots tucked into the rear wheel peg recesses
                rig.leftLeg.hipJoint.rotation.set(-1.12, 0.14, 0.06);
                rig.leftLeg.kneeJoint.rotation.set(-1.38, 0, 0);
                rig.rightLeg.hipJoint.rotation.set(-1.12, -0.14, -0.06);
                rig.rightLeg.kneeJoint.rotation.set(-1.38, 0, 0);

                if (rig.batonGroup) rig.batonGroup.visible = false;
            }

            startNewRibbonSegment(anchorPos = null) {
                if (!this.trailActive || !this.alive || this.form !== 'CYCLE') {
                    this.currentSegment = null;
                    return;
                }
                const rearPos = anchorPos ? anchorPos.clone() : this.getRearEmitterPosition();
                let seg = this.segmentPool.pop();

                if (seg) {
                    seg.start.copy(rearPos);
                    seg.end.copy(rearPos);
                    seg.wallMesh.visible = true;
                    seg.midEdgeMesh.visible = true;
                } else {
                    // 1. Unified translucent glassy energy curtain + baked white-hot laser rails
                    const wallMesh = new THREE.Mesh(MOVIE_RIBBON_SHEET_GEO, this.wallMat);
                    wallMesh.renderOrder = 14;

                    // 2. Specular floor reflection strip on the obsidian court
                    const midEdgeMesh = new THREE.Mesh(MOVIE_FLOOR_REFL_GEO, this.floorReflMat);
                    midEdgeMesh.renderOrder = 3;

                    this.ribbonGroup.add(wallMesh, midEdgeMesh);
                    seg = { start: rearPos.clone(), end: rearPos.clone(), wallMesh, midEdgeMesh };
                }

                this.segments.push(seg);
                this.currentSegment = seg;
                this.lastSegmentHeading = this.heading;
                this.lastSegmentPitch = this.pitchAngle;
                this.updateSegmentGeometry(seg);
            }

            updateSegmentGeometry(seg) {
                const dx = seg.end.x - seg.start.x;
                const dy = seg.end.y - seg.start.y;
                const dz = seg.end.z - seg.start.z;
                const horizLen = Math.max(0.05, Math.hypot(dx, dz));
                const fullLen = Math.max(0.05, Math.hypot(horizLen, dy));
                const sheetLen = fullLen + 0.06;
                const midX = (seg.start.x + seg.end.x) * 0.5;
                const midY = (seg.start.y + seg.end.y) * 0.5;
                const midZ = (seg.start.z + seg.end.z) * 0.5;
                const yawAngle = Math.atan2(dx, dz);
                const slopeAngle = Math.atan2(dy, horizLen);

                seg.wallMesh.scale.set(1, 1, sheetLen);
                seg.wallMesh.position.set(midX, midY + WALL_HEIGHT * 0.5, midZ);
                seg.wallMesh.rotation.order = 'YXZ';
                seg.wallMesh.rotation.y = yawAngle;
                seg.wallMesh.rotation.x = -slopeAngle;

                seg.midEdgeMesh.scale.set(1, 1, sheetLen);
                seg.midEdgeMesh.position.set(midX, 0.03, midZ);
                seg.midEdgeMesh.rotation.set(0, yawAngle, 0);
            }

            removeSegment(seg) {
                seg.wallMesh.visible = false;
                seg.midEdgeMesh.visible = false;
                this.segmentPool.push(seg);
            }

            trimRibbonLength(maxLen) {
                let totalLen = 0;
                for (let i = 0; i < this.segments.length; i++) {
                    const s = this.segments[i];
                    s.len = s.start.distanceTo(s.end);
                    totalLen += s.len;
                }
                let excess = totalLen - maxLen;
                while (excess > 0 && this.segments.length > 0) {
                    const oldest = this.segments[0];
                    if (oldest.len <= excess && (this.segments.length > 1 || !this.trailActive)) {
                        excess -= oldest.len;
                        this.removeSegment(oldest);
                        this.segments.shift();
                        if (oldest === this.currentSegment) this.currentSegment = null;
                    } else {
                        const ratio = Math.min(0.99, excess / Math.max(0.001, oldest.len));
                        oldest.start.lerp(oldest.end, ratio);
                        oldest.len = oldest.start.distanceTo(oldest.end);
                        this.updateSegmentGeometry(oldest);
                        excess = 0;
                    }
                }
            }

            update(dt) {
                if (!this.alive) return;
                if (!this.isPlayer) {
                    if (matchElapsedTime < 3.6 && gameState.mode === 'TEAM') {
                        this.aiRole = 'FORMATION';
                        const baseLaunchHeading = this.team === 1 ? 0 : Math.PI;
                        const fanOutAngle = (this.team === 1 ? 1 : -1) * (this.formationSlot * 0.14);
                        const desiredHeading = baseLaunchHeading + fanOutAngle;
                        const angleErr = PhysicsEngine.normalizeAngle(desiredHeading - this.heading);
                        this.steerInput = Math.abs(angleErr) < 0.03 ? 0 : THREE.MathUtils.clamp(angleErr * 1.8, -0.65, 0.65);
                        this.isBoosting = matchElapsedTime > 0.35;
                        this.isBraking = false;
                    } else {
                        AIBrain.updateCycleAI(this, dt);
                    }
                }

                if (this.isBoosting && this.energy > 2) {
                    this.speed = THREE.MathUtils.lerp(this.speed, BOOST_SPEED, dt * 2.1);
                    this.energy = Math.max(0, this.energy - dt * 18);
                } else {
                    const target = this.isBraking ? BRAKE_SPEED : BASE_SPEED;
                    this.speed = THREE.MathUtils.lerp(this.speed, target, dt * (this.isBraking ? 3.2 : 1.9));
                    this.energy = Math.min(100, this.energy + dt * 13);
                }

                const isHighAgility = !this.isPlayer && (
                    this.aiRole === 'SLASH!' || this.aiRole === 'WHIP-180' ||
                    this.aiRole === 'EVADE' || this.aiRole === 'EVADE_PINCH' ||
                    this.aiRole === 'PINCH_CHOKE' || this.aiRole === 'GUILLOTINE' ||
                    this.aiRole === 'SPEARHEAD'
                );

                const isCentering = Math.abs(this.steerInput) < 0.05 || (this.steerInput * this.smoothSteer < 0);
                const maxSteerRate = this.isBraking ? 2.65 : (isCentering ? 2.85 : (isHighAgility ? 2.35 : 1.95));
                const steerDelta = this.steerInput - this.smoothSteer;
                const maxStep = maxSteerRate * dt;
                this.smoothSteer = Math.abs(steerDelta) <= maxStep ? this.steerInput : this.smoothSteer + Math.sign(steerDelta) * maxStep;

                const maxLean = this.isBraking ? 0.50 : 0.42;
                const targetBank = -this.smoothSteer * maxLean;
                const bankAccel = (targetBank - this.bankAngle) * 26.0 - this.bankVel * 10.2;
                this.bankVel += bankAccel * dt;
                this.bankAngle += this.bankVel * dt;

                const effectiveLeanRatio = THREE.MathUtils.clamp(-this.bankAngle / maxLean, -1.15, 1.15);
                const blendedSteer = this.smoothSteer * 0.35 + effectiveLeanRatio * 0.65;
                const speedRatio = THREE.MathUtils.clamp((this.speed - BRAKE_SPEED) / (BOOST_SPEED - BRAKE_SPEED), 0, 1);
                const turnMultiplier = this.isBraking ? 1.42 : THREE.MathUtils.lerp(1.08, 0.76, speedRatio);
                const actualTurnRate = blendedSteer * TURN_RATE * turnMultiplier;
                this.heading += actualTurnRate * dt;

                if (Math.abs(effectiveLeanRatio) > 0.35) {
                    const scrubLoss = this.isBraking ? 0.16 : 0.08;
                    const scrubTarget = this.speed * (1.0 - Math.abs(effectiveLeanRatio) * scrubLoss);
                    this.speed = THREE.MathUtils.lerp(this.speed, Math.max(BRAKE_SPEED * 0.88, scrubTarget), dt * 2.8);
                }

                this.avgTurnRate = THREE.MathUtils.lerp(this.avgTurnRate, actualTurnRate, dt * 2.0);
                this.cumulativeTurn += actualTurnRate * dt;
                if (Math.abs(actualTurnRate) < 0.20) {
                    this.cumulativeTurn = THREE.MathUtils.lerp(this.cumulativeTurn, 0, dt * 1.4);
                }

                const prevPos = this.position.clone();
                const dir = this.getDirectionVector();
                this.position.addScaledVector(dir, this.speed * dt);
                this.position.y = 0;

                this.mesh.position.copy(this.position);
                this.mesh.rotation.order = 'YXZ';
                this.mesh.rotation.y = -this.heading;
                this.mesh.rotation.x = 0;
                this.mesh.rotation.z = this.bankAngle;

                if (this.cycleBody?.userData?.frontWheelGroup) {
                    this.cycleBody.userData.frontWheelGroup.rotation.y = -this.smoothSteer * 0.16;
                }
                if (this.cycleBody?.userData?.floorReflectionGroup) {
                    this.cycleBody.userData.floorReflectionGroup.rotation.z = -this.bankAngle;
                }
                this.updateCharacterPose(dt);

                if (this.trailActive && this.currentSegment) {
                    const emitterPos = this.getRearEmitterPosition();
                    this.currentSegment.end.copy(emitterPos);
                    this.updateSegmentGeometry(this.currentSegment);

                    const segLen = this.currentSegment.start.distanceTo(emitterPos);
                    const headingDelta = Math.abs(this.heading - this.lastSegmentHeading);
                    // Balanced subdivision keeps curves smooth while cutting segment count & AI raycast load by ~65%
                    if ((headingDelta > 0.052 && segLen > 2.6) || segLen > 16.0) {
                        this.startNewRibbonSegment(emitterPos);
                    }
                    this.trimRibbonLength(MAX_RIBBON_LENGTH);
                } else if (!this.trailActive && this.segments.length > 0) {
                    let currentTotal = 0;
                    for (let i = 0; i < this.segments.length; i++) {
                        currentTotal += this.segments[i].start.distanceTo(this.segments[i].end);
                    }
                    const retractRate = Math.max(this.speed, BASE_SPEED * 0.95) * (this.isPlayer ? 1.0 : 2.15);
                    this.trimRibbonLength(Math.max(0, currentTotal - retractRate * dt));
                }

                if (PhysicsEngine.checkCycleCollision(this, prevPos, this.position)) {
                    this.derezz();
                }
            }

            toggleTrail() {
                this.trailActive = !this.trailActive;
                if (this.trailActive) this.startNewRibbonSegment();
                else this.currentSegment = null;
                this.syncPlayerFormHUD();
            }

            derezz() {
                if (!this.alive) return;
                this.alive = false;
                this.mesh.visible = false;
                this.ribbonGroup.visible = false;

                gameState.timeSinceLastKill = 0;
                soundEngine.playDerezzSound();
                triggerCrowdCheer(this.position, this.colorHex, this);
                spawnDerezzExplosion(this.position, this.colorHex);
                this.clearSegments();

                if (!this.isPlayer && playerCycle && playerCycle.alive) {
                    gameState.score += 250;
                    showCombatFeed(`${this.name.toUpperCase()} // DE-RESOLUTION (+250)`);
                } else if (this.isPlayer) {
                    showCombatFeed(`${this.name.toUpperCase()} // DE-RESOLUTION`, true);
                } else {
                    showCombatFeed(`${this.name.toUpperCase()} // DE-RESOLUTION`);
                }

                gameState.directorDirty = true;
                gameState.rosterDirty = true;
                checkMatchOutcome();
            }

            clearSegments() {
                for (let i = 0; i < this.segments.length; i++) {
                    this.removeSegment(this.segments[i]);
                }
                this.segments.length = 0;
                this.currentSegment = null;
            }

            dispose() {
                this.clearSegments();
                scene.remove(this.ribbonGroup);
                scene.remove(this.mesh);
                if (this.wallMat) this.wallMat.dispose();
                if (this.floorReflMat) this.floorReflMat.dispose();
            }
        }

        function getCameraFocusCycle() {
            if (playerCycle && playerCycle.alive && !gameState.spectating) return playerCycle;
            if (gameState.spectateTarget && gameState.spectateTarget.alive) return gameState.spectateTarget;
            const survivors = cycles.filter(c => c.alive);
            if (survivors.length === 0) return playerCycle;

            if (gameState.spectateAutoDirector) {
                const teamCounts = {};
                survivors.forEach(s => { teamCounts[s.team] = (teamCounts[s.team] || 0) + 1; });
                let bestCandidate = survivors[0];
                let minTeamSize = Infinity;
                survivors.forEach(s => {
                    if (teamCounts[s.team] < minTeamSize) {
                        minTeamSize = teamCounts[s.team];
                        bestCandidate = s;
                    }
                });
                gameState.spectateTarget = bestCandidate;
            } else {
                gameState.spectateTarget = survivors[0];
            }
            updateDeathcamHUD();
            return gameState.spectateTarget;
        }

        function cycleSpectateTarget(step = 1) {
            const survivors = cycles.filter(c => c.alive);
            if (survivors.length === 0) return;

            gameState.spectateAutoDirector = false;
            const autoBtn = document.getElementById('btn-spec-auto');
            if (autoBtn) {
                autoBtn.textContent = 'AUTO';
                autoBtn.classList.remove('tron-btn-active');
            }

            const currentIdx = survivors.indexOf(gameState.spectateTarget);
            const nextIdx = (currentIdx + step + survivors.length) % survivors.length;
            gameState.spectateTarget = survivors[nextIdx];
            gameState.mouseOrbitYaw = 0;
            updateDeathcamHUD();
            updateTelemetryHUD();
            updateRosterHUD();
        }

        function updateDeathcamHUD() {
            const bar = document.getElementById('deathcam-bar');
            const card = document.getElementById('hud-telemetry-card');
            const specDot = document.getElementById('hud-spec-dot');
            if (!bar) return;

            if (gameState.spectating && gameState.status === 'PLAYING') {
                bar.classList.remove('hidden');
                if (specDot) specDot.classList.remove('hidden');
                if (card) card.classList.add('tron-panel-orange');
            } else {
                bar.classList.add('hidden');
                if (specDot) specDot.classList.add('hidden');
                if (card) card.classList.remove('tron-panel-orange');
            }
        }

        function updateCamera(dt) {
            const focusCycle = getCameraFocusCycle();
            if (!focusCycle) {
                const t = performance.now() * 0.0002;
                camera.position.set(Math.cos(t) * 520, 185, Math.sin(t) * 780);
                camera.lookAt(0, 15, 0);
                return;
            }

            const pos = focusCycle.position;
            const heading = focusCycle.heading + gameState.mouseOrbitYaw;
            const dirX = Math.sin(heading);
            const dirZ = -Math.cos(heading);

            if (gameState.cameraMode === 0) {
                const isSpec = gameState.spectating;
                const speedNorm = THREE.MathUtils.clamp((focusCycle.speed - BRAKE_SPEED) / (BOOST_SPEED - BRAKE_SPEED), 0, 1);
                const dist = (15.5 + speedNorm * 4.2) + (isSpec ? 4.5 : 0);
                const height = pos.y + (isSpec ? 8.8 : 6.2) + gameState.mouseOrbitPitch * 16;
                camera.position.lerp(new THREE.Vector3(pos.x - dirX * dist, height, pos.z - dirZ * dist), Math.min(1, dt * 6.2));
                camera.lookAt(new THREE.Vector3(pos.x + dirX * 26, pos.y + 2.1, pos.z + dirZ * 26));
            } else if (gameState.cameraMode === 1) {
                const forwardX = Math.sin(focusCycle.heading);
                const forwardZ = -Math.cos(focusCycle.heading);
                camera.position.set(pos.x + forwardX * 2.65, pos.y + 2.05, pos.z + forwardZ * 2.65);
                camera.lookAt(pos.x + forwardX * 60, pos.y + 1.45, pos.z + forwardZ * 60);
            } else {
                camera.position.lerp(new THREE.Vector3(pos.x * 0.5, 620, pos.z * 0.5 + 110), Math.min(1, dt * 6));
                camera.lookAt(pos.x * 0.35, pos.y, pos.z * 0.35);
            }
        }

        function cycleCameraMode() {
            gameState.cameraMode = (gameState.cameraMode + 1) % gameState.cameraNames.length;
            gameState.mouseOrbitYaw = 0;
            const camLabel = document.getElementById('cam-label');
            if (camLabel) camLabel.textContent = gameState.cameraNames[gameState.cameraMode];
        }

        function setupControls() {
            const keyState = { left: false, right: false };
            const syncPlayerSteering = () => {
                if (playerCycle) playerCycle.steerInput = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
            };
            const syncPlayerThrottle = () => {
                if (!playerCycle) return;
                playerCycle.isBoosting = playerCycle.moveForward || playerCycle.sprintHeld;
                playerCycle.isBraking = playerCycle.moveBackward;
            };

            window.addEventListener('keydown', (e) => {
                if (gameState.status !== 'PLAYING') {
                    if (e.code === 'Enter') startGame();
                    return;
                }
                if (e.code === 'KeyC') { e.preventDefault(); cycleCameraMode(); return; }

                if (gameState.spectating) {
                    if (e.code === 'KeyQ' || e.code === 'ArrowLeft') { e.preventDefault(); cycleSpectateTarget(-1); }
                    else if (e.code === 'KeyE' || e.code === 'ArrowRight' || e.code === 'Tab') { e.preventDefault(); cycleSpectateTarget(1); }
                    else if (e.code === 'KeyR') { e.preventDefault(); startGame(); }
                    return;
                }
                if (!playerCycle || !playerCycle.alive) return;

                switch (e.code) {
                    case 'KeyA': case 'ArrowLeft': e.preventDefault(); keyState.left = true; syncPlayerSteering(); break;
                    case 'KeyD': case 'ArrowRight': e.preventDefault(); keyState.right = true; syncPlayerSteering(); break;
                    case 'KeyW': case 'ArrowUp': e.preventDefault(); playerCycle.moveForward = true; syncPlayerThrottle(); break;
                    case 'ShiftLeft': case 'ShiftRight': e.preventDefault(); playerCycle.sprintHeld = true; syncPlayerThrottle(); break;
                    case 'KeyS': case 'ArrowDown': e.preventDefault(); playerCycle.moveBackward = true; syncPlayerThrottle(); break;
                    case 'Space': e.preventDefault(); playerCycle.toggleTrail(); break;
                }
            });

            window.addEventListener('keyup', (e) => {
                if (['KeyA', 'ArrowLeft'].includes(e.code)) { keyState.left = false; syncPlayerSteering(); }
                if (['KeyD', 'ArrowRight'].includes(e.code)) { keyState.right = false; syncPlayerSteering(); }
                if (!playerCycle) return;
                if (['KeyW', 'ArrowUp'].includes(e.code)) { playerCycle.moveForward = false; syncPlayerThrottle(); }
                if (['ShiftLeft', 'ShiftRight'].includes(e.code)) { playerCycle.sprintHeld = false; syncPlayerThrottle(); }
                if (['KeyS', 'ArrowDown'].includes(e.code)) { playerCycle.moveBackward = false; syncPlayerThrottle(); }
            });

            const canvas = document.getElementById('game-canvas');
            canvas.addEventListener('mousedown', (e) => {
                gameState.isDragging = true;
                gameState.lastMouseX = e.clientX;
                gameState.lastMouseY = e.clientY;
            });
            window.addEventListener('mousemove', (e) => {
                if (!gameState.isDragging) return;
                gameState.mouseOrbitYaw -= (e.clientX - gameState.lastMouseX) * 0.007;
                gameState.mouseOrbitPitch = THREE.MathUtils.clamp(gameState.mouseOrbitPitch + (e.clientY - gameState.lastMouseY) * 0.004, 0.05, 0.85);
                gameState.lastMouseX = e.clientX;
                gameState.lastMouseY = e.clientY;
            });
            window.addEventListener('mouseup', () => { gameState.isDragging = false; });

            let touchStartX = 0;
            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length > 0) touchStartX = e.touches[0].clientX;
            }, { passive: true });
            canvas.addEventListener('touchmove', (e) => {
                if (!playerCycle || !playerCycle.alive || gameState.status !== 'PLAYING') return;
                if (e.touches.length > 0) {
                    const dx = e.touches[0].clientX - touchStartX;
                    playerCycle.steerInput = THREE.MathUtils.clamp(dx / 45, -1, 1);
                }
            }, { passive: true });
            canvas.addEventListener('touchend', () => {
                if (playerCycle) playerCycle.steerInput = 0;
            }, { passive: true });

            const bindHoldSteer = (btnId, dirVal) => {
                const btn = document.getElementById(btnId);
                if (!btn) return;
                const startSteer = (e) => { e.preventDefault(); if (playerCycle && gameState.status === 'PLAYING') playerCycle.steerInput = dirVal; };
                const stopSteer = (e) => { e.preventDefault(); if (playerCycle && playerCycle.steerInput === dirVal) playerCycle.steerInput = 0; };
                btn.addEventListener('mousedown', startSteer);
                btn.addEventListener('mouseup', stopSteer);
                btn.addEventListener('mouseleave', stopSteer);
                btn.addEventListener('touchstart', startSteer, { passive: false });
                btn.addEventListener('touchend', stopSteer, { passive: false });
            };
            bindHoldSteer('ctrl-left', -1);
            bindHoldSteer('ctrl-right', 1);

            const boostBtn = document.getElementById('ctrl-boost');
            const setBoost = (state) => {
                if (playerCycle && gameState.status === 'PLAYING') {
                    playerCycle.moveForward = state;
                    playerCycle.sprintHeld = state;
                    playerCycle.isBoosting = state;
                }
            };
            if (boostBtn) {
                boostBtn.addEventListener('mousedown', () => setBoost(true));
                boostBtn.addEventListener('mouseup', () => setBoost(false));
                boostBtn.addEventListener('mouseleave', () => setBoost(false));
                boostBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setBoost(true); }, { passive: false });
                boostBtn.addEventListener('touchend', (e) => { e.preventDefault(); setBoost(false); }, { passive: false });
            }

            document.getElementById('ctrl-trail').addEventListener('click', () => { if (playerCycle && gameState.status === 'PLAYING') playerCycle.toggleTrail(); });
            document.getElementById('btn-camera').addEventListener('click', cycleCameraMode);
            document.getElementById('btn-audio').addEventListener('click', () => {
                document.getElementById('audio-label').textContent = soundEngine.toggle() ? 'AUDIO: ON' : 'AUDIO: OFF';
            });
            document.getElementById('btn-restart-top').addEventListener('click', startGame);
            document.getElementById('btn-launch-grid').addEventListener('click', startGame);
            document.getElementById('btn-mode-duel').addEventListener('click', () => setGameMode('DUEL', true));
            document.getElementById('btn-mode-ffa').addEventListener('click', () => setGameMode('FFA', true));
            document.getElementById('btn-mode-team').addEventListener('click', () => setGameMode('TEAM', true));

            document.querySelectorAll('.mode-pick').forEach(btn => {
                btn.addEventListener('click', () => {
                    setGameMode(btn.getAttribute('data-mode'), false);
                });
            });

            document.querySelectorAll('.combatant-pick').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectPlayableCombatant(btn.getAttribute('data-combatant'), false);
                });
            });
            const pilotBtn = document.getElementById('btn-pilot-select');
            if (pilotBtn) {
                pilotBtn.addEventListener('click', () => {
                    const order = ['flynn', 'quorra', 'tron', 'clu', 'rinzler'];
                    const curr = gameState.selectedPlayerId || 'flynn';
                    const next = order[(order.indexOf(curr) + 1) % order.length];
                    selectPlayableCombatant(next, true);
                });
            }

            document.getElementById('btn-spec-prev').addEventListener('click', () => cycleSpectateTarget(-1));
            document.getElementById('btn-spec-next').addEventListener('click', () => cycleSpectateTarget(1));
            document.getElementById('btn-spec-auto').addEventListener('click', () => {
                gameState.spectateAutoDirector = !gameState.spectateAutoDirector;
                const autoBtn = document.getElementById('btn-spec-auto');
                autoBtn.textContent = 'AUTO';
                autoBtn.classList.toggle('tron-btn-active', gameState.spectateAutoDirector);
            });
            document.getElementById('btn-spec-speed').addEventListener('click', () => {
                gameState.simSpeedMultiplier = gameState.simSpeedMultiplier === 1.0 ? 2.0 : 1.0;
                document.getElementById('btn-spec-speed').textContent = `${gameState.simSpeedMultiplier}X`;
            });
            document.getElementById('btn-spec-redeploy').addEventListener('click', startGame);
            window.addEventListener('resize', () => {
                const container = document.getElementById('canvas-container');
                if (!container || !renderer || !camera) return;
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            });
        }

        function setGameMode(mode, launchImmediately = true) {
            gameState.mode = mode;
            const modes = { DUEL: 'btn-mode-duel', FFA: 'btn-mode-ffa', TEAM: 'btn-mode-team' };
            Object.entries(modes).forEach(([key, btnId]) => {
                const el = document.getElementById(btnId);
                if (el) el.classList.toggle('tron-btn-active', key === mode);
            });

            document.querySelectorAll('.mode-pick').forEach(btn => {
                btn.classList.toggle('tron-btn-active', btn.getAttribute('data-mode') === mode);
            });

            if (launchImmediately) {
                startGame();
            } else {
                spawnCyclesForMode();
                if (playerCycle) playerCycle.syncPlayerFormHUD();
                updateTelemetryHUD();
            }
        }

        function clearGrid() {
            cycles.forEach(c => c.dispose());
            cycles = [];
            playerCycle = null;
            derezzParticles.forEach(p => { p.mesh.visible = false; p.active = false; });
            derezzParticles.length = 0;
            flareColumns.forEach(f => { f.mesh.visible = false; f.active = false; });
            flareColumns.length = 0;
        }

        const PLAYABLE_COMBATANTS = {
            flynn:   { id: 'flynn',   name: 'Sam Flynn', roleTag: 'USER',     team: 1, colorHex: 0x00f3ff, colorCss: '#00f3ff' },
            quorra:  { id: 'quorra',  name: 'Quorra',    roleTag: 'ISO',      team: 1, colorHex: 0x66f7ff, colorCss: '#66f7ff' },
            tron:    { id: 'tron',    name: 'Tron',      roleTag: 'PROGRAM',  team: 1, colorHex: 0x00aaff, colorCss: '#00aaff' },
            clu:     { id: 'clu',     name: 'Clu',       roleTag: 'SYSTEM',   team: 2, colorHex: 0xffbb00, colorCss: '#ffbb00' },
            rinzler: { id: 'rinzler', name: 'Rinzler',   roleTag: 'ENFORCER', team: 2, colorHex: 0xff4400, colorCss: '#ff4400' }
        };

        function selectPlayableCombatant(combatantId, restartImmediately = false) {
            if (!PLAYABLE_COMBATANTS[combatantId]) return;
            gameState.selectedPlayerId = combatantId;
            const profile = PLAYABLE_COMBATANTS[combatantId];

            document.querySelectorAll('.combatant-pick').forEach(btn => {
                btn.classList.toggle('tron-btn-active', btn.getAttribute('data-combatant') === combatantId);
            });

            const labelEl = document.getElementById('pilot-btn-label');
            const dotEl = document.getElementById('pilot-dot');
            if (labelEl) labelEl.textContent = profile.name.toUpperCase();
            if (dotEl) {
                dotEl.style.backgroundColor = profile.colorCss;
                dotEl.style.boxShadow = `0 0 8px ${profile.colorCss}`;
            }

            if (restartImmediately) {
                startGame();
            } else {
                spawnCyclesForMode();
                if (playerCycle) playerCycle.syncPlayerFormHUD();
                updateTelemetryHUD();
            }
        }

        function spawnCyclesForMode() {
            clearGrid();
            const selectedId = gameState.selectedPlayerId || 'flynn';
            const selectedProfile = PLAYABLE_COMBATANTS[selectedId] || PLAYABLE_COMBATANTS.flynn;
            let spawnConfigs = [];

            if (gameState.mode === 'DUEL') {
                if (selectedProfile.team === 1) {
                    spawnConfigs.push(
                        { ...selectedProfile, isPlayer: true, startPos: new THREE.Vector3(0, 0, -42), startDir: 0 },
                        { ...PLAYABLE_COMBATANTS.rinzler, isPlayer: false, startPos: new THREE.Vector3(0, 0, 42), startDir: 2 }
                    );
                } else {
                    spawnConfigs.push(
                        { ...PLAYABLE_COMBATANTS.flynn, isPlayer: false, startPos: new THREE.Vector3(0, 0, -42), startDir: 0 },
                        { ...selectedProfile, isPlayer: true, startPos: new THREE.Vector3(0, 0, 42), startDir: 2 }
                    );
                }
            } else if (gameState.mode === 'FFA') {
                const ffaRoster = [
                    { ...(selectedId === 'tron' ? PLAYABLE_COMBATANTS.tron : PLAYABLE_COMBATANTS.flynn), team: 1, startPos: new THREE.Vector3(0, 0, -48), startDir: 0 },
                    { ...PLAYABLE_COMBATANTS.rinzler, team: 2, startPos: new THREE.Vector3(0, 0, 48), startDir: 2 },
                    { ...PLAYABLE_COMBATANTS.clu, team: 3, startPos: new THREE.Vector3(48, 0, 0), startDir: 1 },
                    { ...PLAYABLE_COMBATANTS.quorra, team: 4, startPos: new THREE.Vector3(-48, 0, 0), startDir: 3 }
                ];
                spawnConfigs = ffaRoster.map(c => ({
                    ...c,
                    isPlayer: c.id === selectedId
                }));
            } else if (gameState.mode === 'TEAM') {
                const blueTeamConfigs = [
                    { id: 'flynn', name: 'Sam Flynn', slot: 0, offset: 0, z: -42, colorHex: 0x00f3ff, colorCss: '#00f3ff' },
                    { id: 'quorra', name: 'Quorra', slot: -1, offset: -48, z: -52, colorHex: 0x66f7ff, colorCss: '#66f7ff' },
                    { id: 'tron', name: 'Tron', slot: 1, offset: 48, z: -52, colorHex: 0x00aaff, colorCss: '#00aaff' },
                    { id: 'combatant4', name: 'Combatant 4', slot: -2, offset: -96, z: -64, colorHex: 0x00d8ff, colorCss: '#00d8ff' },
                    { id: 'combatant5', name: 'Combatant 5', slot: 2, offset: 96, z: -64, colorHex: 0x3388ff, colorCss: '#3388ff' }
                ];
                blueTeamConfigs.forEach(a => spawnConfigs.push({
                    id: a.id, name: a.name, team: 1, formationSlot: a.slot,
                    colorHex: a.colorHex, colorCss: a.colorCss,
                    isPlayer: a.id === selectedId,
                    startPos: new THREE.Vector3(a.offset, 0, a.z), startDir: 0
                }));

                const cluTeamConfigs = [
                    { id: 'clu', name: 'Clu', slot: 0, offset: 0, z: 42, colorHex: 0xffbb00, colorCss: '#ffbb00' },
                    { id: 'rinzler', name: 'Rinzler', slot: -1, offset: -48, z: 52, colorHex: 0xff4400, colorCss: '#ff4400' },
                    { id: 'sentry1', name: 'Sentry 1', slot: 1, offset: 48, z: 52, colorHex: 0xff8800, colorCss: '#ff8800' },
                    { id: 'sentry2', name: 'Sentry 2', slot: -2, offset: -96, z: 64, colorHex: 0xff5500, colorCss: '#ff5500' },
                    { id: 'sentry3', name: 'Sentry 3', slot: 2, offset: 96, z: 64, colorHex: 0xffaa00, colorCss: '#ffaa00' }
                ];
                cluTeamConfigs.forEach(e => spawnConfigs.push({
                    id: e.id, name: e.name, team: 2, formationSlot: e.slot,
                    colorHex: e.colorHex, colorCss: e.colorCss,
                    isPlayer: e.id === selectedId,
                    startPos: new THREE.Vector3(e.offset, 0, e.z), startDir: 2
                }));
            }

            spawnConfigs.forEach(cfg => {
                const c = new Lightcycle(cfg);
                cycles.push(c);
                if (cfg.isPlayer) playerCycle = c;
            });

            updateRosterHUD();
        }

        function startGame() {
            document.getElementById('overlay-screen').classList.add('opacity-0', 'pointer-events-none');
            gameState.status = 'PLAYING';
            gameState.mouseOrbitYaw = 0;
            gameState.spectating = false;
            gameState.spectateTarget = null;
            gameState.simSpeedMultiplier = 1.0;
            gameState.timeSinceLastKill = 0;
            gameState.directorTimer = 0;
            gameState.arenaScale = 1.0;
            gameState.isShrinking = false;
            gameState.shrinkMilestoneAnnounced = 100;

            if (mainFloorMesh) mainFloorMesh.scale.set(1, 1, 1);
            if (shrinkBarrierGroup) shrinkBarrierGroup.scale.set(1, 1, 1);

            const speedBtn = document.getElementById('btn-spec-speed');
            if (speedBtn) speedBtn.textContent = '1X';
            updateDeathcamHUD();

            matchElapsedTime = 0;
            spawnCyclesForMode();
            if (playerCycle) playerCycle.syncPlayerFormHUD();
            soundEngine.startEngine();
            showCombatFeed('GRID IS LIVE // INITIATE LIGHT CYCLE BATTLE');
        }

        function checkMatchOutcome() {
            if (gameState.status !== 'PLAYING') return;
            const playerAlive = playerCycle && playerCycle.alive;
            const playerTeam = playerCycle ? playerCycle.team : 1;
            const playerName = playerCycle ? playerCycle.name.toUpperCase() : 'COMBATANT 3';
            const aliveEnemies = cycles.filter(c => c.alive && c.team !== playerTeam);
            const aliveAllies = cycles.filter(c => c.alive && c.team === playerTeam);
            const survivingTeams = new Set(cycles.filter(c => c.alive).map(c => c.team));

            if (!playerAlive && survivingTeams.size >= 2) {
                if (!gameState.spectating) {
                    gameState.spectating = true;
                    getCameraFocusCycle();
                    updateDeathcamHUD();
                    updateTelemetryHUD();
                }
                return;
            }
            if (aliveEnemies.length === 0 && aliveAllies.length > 0) {
                gameState.wins += 1;
                gameState.score += 500;
                if (gameState.mode === 'FFA') {
                    endMatch(
                        true,
                        `${playerName} // VICTORY`,
                        'All rival combatants have undergone de-resolution. You are the last survivor on the Light Cycle Grid.'
                    );
                } else {
                    const enemyFactionLabel = playerTeam === 1 ? "Clu's forces" : 'The opposing Programs';
                    endMatch(
                        true,
                        `${playerName} // VICTORY`,
                        playerAlive
                            ? `${enemyFactionLabel} have undergone de-resolution. You survived the Light Cycle Grid.`
                            : `You underwent de-resolution, but your team survived the Light Cycle Grid.`
                    );
                }
            } else if (survivingTeams.size <= 1) {
                const winner = cycles.find(c => c.alive);
                endMatch(
                    false,
                    'DE-RESOLUTION',
                    `${winner ? winner.name.toUpperCase() : "OPPOSING FORCES"} claimed victory on the Light Cycle Grid.`
                );
            }
        }

        function endMatch(victory, title, subtitle) {
            gameState.status = 'GAMEOVER';
            gameState.spectating = false;
            updateDeathcamHUD();
            soundEngine.stopEngine();

            const modalTitle = document.getElementById('modal-title');
            modalTitle.textContent = title;
            modalTitle.className = victory
                ? 'font-orbitron text-3xl sm:text-4xl font-black tracking-[0.18em] text-cyan-300 glow-text-cyan mb-2'
                : 'font-orbitron text-3xl sm:text-4xl font-black tracking-[0.18em] text-orange-400 glow-text-orange mb-2';
            document.getElementById('modal-subtitle').textContent = subtitle;
            document.getElementById('btn-launch-grid').textContent = 'INITIATE LIGHT CYCLE BATTLE';
            document.getElementById('overlay-screen').classList.remove('opacity-0', 'pointer-events-none');
            updateTelemetryHUD();
        }

        let feedTimeout = null;
        function showCombatFeed(text, isWarning = false) {
            const feed = document.getElementById('hud-feed');
            const feedText = document.getElementById('hud-feed-text');
            if (!feed || !feedText) return;

            const normalizedText = text
                .replace('OUTER GRID SECTORS DEREZZING', 'OUTER GRID SECTORS DE-REZZING')
                .replace('ACTIVE GRID SHRUNK TO', 'LIGHT CYCLE GRID PERIMETER AT');

            feedText.textContent = normalizedText;
            feedText.className = isWarning
                ? 'font-orbitron text-[11px] sm:text-xs tracking-[0.18em] text-orange-300 glow-text-orange whitespace-nowrap'
                : 'font-orbitron text-[11px] sm:text-xs tracking-[0.18em] text-cyan-200 glow-text-cyan whitespace-nowrap';
            feed.classList.remove('opacity-0');
            if (feedTimeout) clearTimeout(feedTimeout);
            feedTimeout = setTimeout(() => feed.classList.add('opacity-0'), 2400);
        }

        function updateRosterHUD() {
            const aliveCountEl = document.getElementById('hud-alive-count');
            if (aliveCountEl) {
                aliveCountEl.textContent = `${cycles.filter(c => c.alive).length} LIVE`;
            }

            const teamsContainer = document.getElementById('hud-roster-teams');
            const ffaContainer = document.getElementById('hud-roster-ffa');
            const ffaBody = document.getElementById('hud-roster-ffa-body');
            const ffaCountEl = document.getElementById('hud-ffa-count');

            const blueBody = document.getElementById('hud-roster-blue');
            const orangeBody = document.getElementById('hud-roster-orange');
            const blueCountEl = document.getElementById('hud-blue-count');
            const orangeCountEl = document.getElementById('hud-orange-count');
            if (!blueBody || !orangeBody) return;

            const focusCycle = getCameraFocusCycle();


            const renderTeamRows = (teamList) => teamList.map(c => {
                const isFocus = c.alive && focusCycle === c;
                const rowClass = c.alive
                    ? (isFocus ? 'bg-cyan-500/25' : 'hover:bg-cyan-500/10 cursor-pointer')
                    : 'opacity-45';
                const nameClass = c.alive
                    ? (isFocus ? 'text-white font-bold' : 'text-cyan-50')
                    : 'line-through text-slate-400';
                const statusBadge = c.alive
                    ? `<span class="text-[8px] px-1 py-0.2 rounded ${isFocus ? 'bg-cyan-400/30 text-white border border-cyan-300/60' : 'text-emerald-300'}">LIVE</span>`
                    : `<span class="text-[8px] text-red-400 font-semibold">DE-REZ</span>`;
                const dotStyle = c.alive
                    ? `background:${c.colorCss}; box-shadow: 0 0 6px ${c.colorCss};`
                    : 'background:#ef4444; opacity:0.5;';

                return `
                    <tr onclick="window.selectSpectateCycle('${c.id}')" class="${rowClass} transition-colors">
                        <td class="py-0.5 pr-1.5 whitespace-nowrap">
                            <div class="flex items-center gap-1.5">
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="${dotStyle}"></span>
                                <span class="${nameClass} tracking-wide">${c.name}</span>
                            </div>
                        </td>
                        <td class="py-0.5 pl-1 text-right whitespace-nowrap">${statusBadge}</td>
                    </tr>
                `;
            }).join('');

            if (gameState.mode === 'FFA') {
                if (teamsContainer) teamsContainer.classList.add('hidden');
                if (ffaContainer) {
                    ffaContainer.classList.remove('hidden');
                    ffaContainer.classList.add('flex');
                }
                if (ffaCountEl) {
                    ffaCountEl.textContent = `${cycles.filter(c => c.alive).length}/${cycles.length}`;
                }
                if (ffaBody) {
                    ffaBody.innerHTML = renderTeamRows(cycles);
                }
            } else {
                if (teamsContainer) teamsContainer.classList.remove('hidden');
                if (ffaContainer) {
                    ffaContainer.classList.add('hidden');
                    ffaContainer.classList.remove('flex');
                }

                const blueTeam = cycles.filter(c => c.team === 1);
                const hostileTeam = cycles.filter(c => c.team !== 1);

                if (blueCountEl) {
                    blueCountEl.textContent = `${blueTeam.filter(c => c.alive).length}/${blueTeam.length}`;
                }
                if (orangeCountEl) {
                    orangeCountEl.textContent = `${hostileTeam.filter(c => c.alive).length}/${hostileTeam.length}`;
                }

                blueBody.innerHTML = renderTeamRows(blueTeam);
                orangeBody.innerHTML = renderTeamRows(hostileTeam);
            }

            updateTowerHologramBoards();
        }

        window.selectSpectateCycle = function(cycleId) {
            if (!gameState.spectating) return;
            const found = cycles.find(c => c.id === cycleId && c.alive);
            if (found) {
                gameState.spectateAutoDirector = false;
                const autoBtn = document.getElementById('btn-spec-auto');
                if (autoBtn) autoBtn.classList.remove('tron-btn-active');
                gameState.spectateTarget = found;
                gameState.mouseOrbitYaw = 0;
                updateDeathcamHUD();
                updateTelemetryHUD();
                updateRosterHUD();
            }
        };

        function updateTelemetryHUD() {
            const focusCycle = getCameraFocusCycle();
            if (focusCycle) {
                const pilotEl = document.getElementById('hud-pilot-name');
                if (pilotEl) {
                    const profile = PLAYABLE_COMBATANTS[focusCycle.id];
                    const rolePrefix = focusCycle.isPlayer
                        ? (profile ? profile.roleTag : 'USER')
                        : 'COMBATANT';
                    pilotEl.textContent = `${rolePrefix} // ${focusCycle.name.toUpperCase()}`;
                    pilotEl.style.color = focusCycle.colorCss;
                }
                document.getElementById('hud-speed').textContent = focusCycle.alive ? Math.round((Math.abs(focusCycle.speed) / BASE_SPEED) * 240) : 0;

                const pct = Math.round(focusCycle.energy);
                document.getElementById('hud-energy-pct').textContent = `${pct}%`;
                const energyBar = document.getElementById('hud-energy-bar');
                energyBar.style.width = `${pct}%`;
                energyBar.style.background = `linear-gradient(90deg, ${focusCycle.colorCss}, #ffffff)`;
                energyBar.style.boxShadow = `0 0 8px ${focusCycle.colorCss}`;

                const badge = document.getElementById('hud-trail-status');
                if (badge) {
                    badge.textContent = focusCycle.trailActive ? 'LIGHT RIBBON: ON' : 'LIGHT RIBBON: OFF';
                    badge.className = focusCycle.trailActive
                        ? 'text-[9px] font-orbitron px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 whitespace-nowrap shrink-0'
                        : 'text-[9px] font-orbitron px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-400/40 whitespace-nowrap shrink-0';
                }

                const gridPct = Math.round(gameState.arenaScale * 100);
                const deckEl = document.getElementById('hud-deck');
                deckEl.textContent = `GRID: ${gridPct}%`;

                const speedRatio = (focusCycle.speed - BRAKE_SPEED) / (BOOST_SPEED - BRAKE_SPEED);
                soundEngine.updateEnginePitch(speedRatio, focusCycle.isBoosting);
            }
            document.getElementById('hud-score').textContent = gameState.score;
            document.getElementById('hud-wins').textContent = gameState.wins;
        }

        function drawRadar() {
            const radar = document.getElementById('radar-canvas');
            if (!radar) return;
            const ctx = radar.getContext('2d');
            const w = radar.width, h = radar.height;
            ctx.fillStyle = '#01050b';
            ctx.fillRect(0, 0, w, h);

            const mapX = (val) => ((val + ARENA_HALF_X) / ARENA_WIDTH) * (w - 10) + 5;
            const mapZ = (val) => ((val + ARENA_HALF_Z) / ARENA_LENGTH) * (h - 10) + 5;

            const s = gameState.arenaScale;
            ctx.strokeStyle = gameState.isShrinking ? '#ff5500' : 'rgba(0, 243, 255, 0.82)';
            ctx.fillStyle = 'rgba(2, 12, 24, 0.95)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            STADIUM_POLYGON.forEach((pt, idx) => {
                if (idx === 0) ctx.moveTo(mapX(pt.x * s), mapZ(pt.z * s));
                else ctx.lineTo(mapX(pt.x * s), mapZ(pt.z * s));
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            cycles.forEach(c => {
                ctx.strokeStyle = c.colorCss;
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                c.segments.forEach(seg => {
                    ctx.moveTo(mapX(seg.start.x), mapZ(seg.start.z));
                    ctx.lineTo(mapX(seg.end.x), mapZ(seg.end.z));
                });
                ctx.stroke();
                if (!c.alive) return;
                ctx.fillStyle = (c === getCameraFocusCycle()) ? '#ffffff' : c.colorCss;
                ctx.beginPath();
                ctx.arc(mapX(c.position.x), mapZ(c.position.z), (c === getCameraFocusCycle()) ? 3.4 : 2.3, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Disable arena shrinking permanently so the Grid remains at 100% full scale
        function updateShrinkingGrid() {
            gameState.arenaScale = 1.0;
            gameState.isShrinking = false;
        }

        let hudRadarAccumulator = 0;

        function animate() {
            requestAnimationFrame(animate);
            const rawDt = Math.min(clock.getDelta(), 0.05);
            const dt = rawDt * (gameState.spectating ? gameState.simSpeedMultiplier : 1.0);
            ribbonSharedTime.value += dt;
            hudRadarAccumulator += rawDt;

            if (gameState.status === 'PLAYING') {
                matchElapsedTime += dt;
                gameState.timeSinceLastKill += dt;
                spatialGrid.rebuild(cycles);

                gameState.directorTimer -= dt;
                if (gameState.directorTimer <= 0) {
                    gameState.directorTimer = 0.22;
                    updateTacticalDirector();
                    if (gameState.spectating) updateDeathcamHUD();
                }

                cycles.forEach(c => c.update(dt));

                if (hudRadarAccumulator >= 0.05) {
                    updateTelemetryHUD();
                }
                if (gameState.rosterDirty || Math.floor(matchElapsedTime * 2) !== Math.floor((matchElapsedTime - dt) * 2)) {
                    gameState.rosterDirty = false;
                    updateRosterHUD();
                }
            }

            updateGridStormClouds(rawDt);
            updateParticles(dt);
            updateCamera(rawDt);

            if (hudRadarAccumulator >= 0.05) {
                hudRadarAccumulator = 0;
                drawRadar();
            }

            renderer.render(scene, camera);
        }

        window.addEventListener('load', () => {
            initThreeScene();
            rebuildMovieAuthenticArena();
            buildGridStormClouds();
            setupControls();
            spawnCyclesForMode();
            animate();
        });
