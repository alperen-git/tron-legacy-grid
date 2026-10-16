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