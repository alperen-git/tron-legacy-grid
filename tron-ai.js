const AIBrain = {
            getSelfRibbonAheadDist(bot) {
                const segs = bot.segments;
                const limit = Math.max(0, segs.length - 8);
                if (limit === 0) return Infinity;

                const px = bot.position.x;
                const pz = bot.position.z;
                const myDir = bot.getDirectionVector();
                let minForwardDist = Infinity;

                for (let i = 0; i < limit; i++) {
                    const seg = segs[i];
                    const mx = (seg.start.x + seg.end.x) * 0.5 - px;
                    const mz = (seg.start.z + seg.end.z) * 0.5 - pz;
                    const dist = Math.hypot(mx, mz);
                    if (dist < 105 && dist > 1.0) {
                        const forwardDot = (mx * myDir.x + mz * myDir.z) / dist;
                        if (forwardDot > 0.22 && dist < minForwardDist) {
                            minForwardDist = dist;
                        }
                    }
                }
                return minForwardDist;
            },

            acquireNearestTarget(bot) {
                let bestEnemy = null;
                let bestScore = Infinity;
                for (const c of cycles) {
                    if (c === bot || !c.alive || c.team === bot.team) continue;
                    const d = bot.position.distanceTo(c.position);
                    if (d < bestScore) {
                        bestScore = d;
                        bestEnemy = c;
                    }
                }
                bot.aiTarget = bestEnemy;
                return bestEnemy;
            },

            findBestOpenCorridorHeading(bot, rayDists) {
                const candidateOffsets = [0, -0.35, 0.35, -0.62, 0.62, -0.92, 0.92];
                let bestOffset = 0;
                let maxClearance = -1;
                for (const off of candidateOffsets) {
                    const d = rayDists[off] || 0;
                    if (d > maxClearance) {
                        maxClearance = d;
                        bestOffset = off;
                    }
                }
                return bot.heading + bestOffset;
            },

            executeJoustAndSlash(bot, dt, rayDists, forwardDist) {
                const target = bot.aiTarget;
                if (!target || !target.alive) return false;

                const tPos = target.position;
                const tDir = target.getDirectionVector();
                const tRight = new THREE.Vector3(-tDir.z, 0, tDir.x);

                const toMe = bot.position.clone().sub(tPos);
                const distToTarget = toMe.length();
                const forwardProgress = toMe.dot(tDir);
                const lateralOffset = toMe.dot(tRight);
                const absLat = Math.abs(lateralOffset);

                if (bot.joustTimer > 0) {
                    bot.joustTimer = Math.max(0, bot.joustTimer - dt);
                }

                const borderDist = PhysicsEngine.getDistanceToActiveBorder(bot.position.x, bot.position.z);

                // PHASE 1: SLASH!
                if (bot.joustPhase === 'SLASH') {
                    bot.aiRole = 'SLASH!';
                    const sideRayClear = bot.slashCutDir < 0
                        ? Math.min(rayDists[-0.35], rayDists[-0.62])
                        : Math.min(rayDists[0.35], rayDists[0.62]);

                    if (bot.joustTimer <= 0 || forwardDist < 54 || sideRayClear < 32) {
                        bot.joustPhase = 'EXTEND';
                        bot.joustTimer = 1.65;
                        bot.extendHeading = this.findBestOpenCorridorHeading(bot, rayDists);
                    } else {
                        bot.steerInput = bot.slashCutDir * 1.0;
                        bot.isBraking = bot.joustTimer > 0.45 && forwardDist > 58;
                        bot.isBoosting = !bot.isBraking;
                        return true;
                    }
                }

                // PHASE 2: EXTEND
                if (bot.joustPhase === 'EXTEND') {
                    bot.aiRole = 'EXTEND';
                    if (bot.joustTimer <= 0 || distToTarget > 175 || (borderDist < 125 && forwardDist < 135)) {
                        bot.joustPhase = 'WHIP';
                        bot.joustTimer = 1.15;
                    } else {
                        const headingErr = PhysicsEngine.normalizeAngle(bot.extendHeading - bot.heading);
                        bot.steerInput = Math.abs(headingErr) < 0.05
                            ? 0
                            : THREE.MathUtils.clamp(headingErr * 1.15, -0.45, 0.45);
                        bot.isBraking = false;
                        bot.isBoosting = forwardDist > 85 && bot.energy > 8;
                        return true;
                    }
                }

                // PHASE 3: WHIP-180
                if (bot.joustPhase === 'WHIP') {
                    bot.aiRole = 'WHIP-180';
                    const interceptHeading = Math.atan2(
                        (tPos.x + tDir.x * 36) - bot.position.x,
                        -((tPos.z + tDir.z * 36) - bot.position.z)
                    );
                    const angleDiff = PhysicsEngine.normalizeAngle(interceptHeading - bot.heading);

                    if (Math.abs(angleDiff) < 0.34 || bot.joustTimer <= 0) {
                        bot.joustPhase = 'CHARGE';
                        bot.joustTimer = 0;
                        bot.cumulativeTurn = 0;
                    } else {
                        bot.steerInput = Math.sign(angleDiff) * 1.0;
                        bot.isBraking = forwardDist > 42;
                        bot.isBoosting = false;
                        return true;
                    }
                }

                // PHASE 4: CHARGE
                bot.joustPhase = 'CHARGE';
                bot.aiRole = 'CHARGE';

                if (
                    distToTarget < 96 &&
                    forwardProgress > 8 &&
                    forwardProgress < 64 &&
                    absLat > 8 &&
                    absLat < 58
                ) {
                    const inwardSign = lateralOffset >= 0 ? -1 : 1;
                    const inwardClear = inwardSign < 0
                        ? Math.min(rayDists[-0.35], rayDists[-0.62], rayDists[-0.92])
                        : Math.min(rayDists[0.35], rayDists[0.62], rayDists[0.92]);

                    if (inwardClear > 46) {
                        bot.joustPhase = 'SLASH';
                        bot.joustTimer = 0.92;
                        bot.slashCutDir = inwardSign;
                        bot.steerInput = inwardSign * 1.0;
                        bot.isBraking = true;
                        bot.isBoosting = false;
                        return true;
                    }
                }

                const toTargetHeading = Math.atan2(tPos.x - bot.position.x, -(tPos.z - bot.position.z));
                const angleToTarget = Math.abs(PhysicsEngine.normalizeAngle(toTargetHeading - bot.heading));
                if (distToTarget < 78 && angleToTarget > 1.15) {
                    bot.joustPhase = 'EXTEND';
                    bot.joustTimer = 1.45;
                    bot.extendHeading = this.findBestOpenCorridorHeading(bot, rayDists);
                    bot.steerInput = 0;
                    bot.isBraking = false;
                    bot.isBoosting = true;
                    return true;
                }

                return false;
            },

            evaluatePinchDefense(bot, rayDists, forwardDist) {
                const myDir = bot.getDirectionVector();
                const myRight = new THREE.Vector3(-myDir.z, 0, myDir.x);

                let worstPincher = null;
                let highestThreatScore = 0;
                let pinchRelFwd = 0;
                let pinchRelLat = 0;

                for (const enemy of cycles) {
                    if (enemy === bot || !enemy.alive || enemy.team === bot.team) continue;

                    const toEnemy = enemy.position.clone().sub(bot.position);
                    const dist = toEnemy.length();
                    if (dist > 64) continue;

                    const relFwd = toEnemy.dot(myDir);
                    const relLat = toEnemy.dot(myRight);
                    const absLat = Math.abs(relLat);

                    if (relFwd < -7 || relFwd > 38 || absLat > 26) continue;

                    const enemyDir = enemy.getDirectionVector();
                    const headingAlign = myDir.dot(enemyDir);
                    if (headingAlign < 0.35) continue;

                    const relVelX = enemyDir.x * enemy.speed - myDir.x * bot.speed;
                    const relVelZ = enemyDir.z * enemy.speed - myDir.z * bot.speed;
                    const lateralClosingVel = -Math.sign(relLat || 1) * (relVelX * myRight.x + relVelZ * myRight.z);

                    const isEnemyBrakingOrChoking =
                        enemy.isBraking ||
                        enemy.aiRole === 'PINCH_CHOKE' ||
                        (enemy.speed < bot.speed - 7 && relFwd > 1.5);

                    const oppositeSideSpace = relLat > 0
                        ? Math.min(rayDists[-0.62], rayDists[-0.92], rayDists[-1.32], rayDists[-1.57])
                        : Math.min(rayDists[0.62], rayDists[0.92], rayDists[1.32], rayDists[1.57]);

                    const isSandwiched = oppositeSideSpace < 38;
                    const isTightSqueeze = absLat < 15.5 || lateralClosingVel > 9;

                    if (isEnemyBrakingOrChoking || isTightSqueeze || isSandwiched) {
                        const score =
                            (30 - absLat) * 2.2 +
                            (isEnemyBrakingOrChoking ? 35 : 0) +
                            (isSandwiched ? 28 : 0) +
                            Math.max(0, lateralClosingVel * 0.8);

                        if (score > highestThreatScore) {
                            highestThreatScore = score;
                            worstPincher = enemy;
                            pinchRelFwd = relFwd;
                            pinchRelLat = relLat;
                        }
                    }
                }

                if (!worstPincher) return false;

                const pinchSideSign = Math.sign(pinchRelLat || 1);
                const awaySign = -pinchSideSign;

                const awayClearance = awaySign < 0
                    ? Math.min(rayDists[-0.35], rayDists[-0.62], rayDists[-0.92], rayDists[-1.32])
                    : Math.min(rayDists[0.35], rayDists[0.62], rayDists[0.92], rayDists[1.32]);

                const awayWideClearance = awaySign < 0
                    ? Math.min(rayDists[-0.92], rayDists[-1.32], rayDists[-1.57])
                    : Math.min(rayDists[0.92], rayDists[1.32], rayDists[1.57]);

                const pinchSideClearance = pinchSideSign < 0
                    ? Math.min(rayDists[-0.16], rayDists[-0.35], rayDists[-0.62])
                    : Math.min(rayDists[0.16], rayDists[0.35], rayDists[0.62]);

                const enemySlowedEarly = worstPincher.isBraking || worstPincher.speed <= bot.speed + 4;
                if (
                    pinchRelFwd < 6.0 &&
                    enemySlowedEarly &&
                    forwardDist > 92 &&
                    bot.energy > 16 &&
                    Math.abs(pinchRelLat) > 4.2
                ) {
                    bot.aiRole = 'EVADE_OUTRUN';
                    bot.isBoosting = true;
                    bot.isBraking = false;
                    bot.steerInput = awayClearance > 22 ? awaySign * 0.35 : 0;
                    return true;
                }

                bot.aiRole = 'EVADE_PINCH';
                bot.isBoosting = false;
                bot.isBraking = true;

                if (awayClearance > 24 && awayWideClearance > 22 && forwardDist > 18) {
                    bot.committedTurnDir = awaySign;
                    bot.committedTurnTimer = 0.45;
                    bot.steerInput = awaySign * 1.0;
                } else if (pinchRelFwd > 14 && Math.abs(pinchRelLat) > 8.5 && pinchSideClearance > 24) {
                    bot.committedTurnDir = pinchSideSign;
                    bot.committedTurnTimer = 0.38;
                    bot.steerInput = pinchSideSign * 0.95;
                } else {
                    const safeAwayDist = Math.min(awayClearance, awayWideClearance);
                    const targetBuffer = Math.min(9.5, (Math.abs(pinchRelLat) + safeAwayDist) * 0.48);
                    const bufferError = safeAwayDist - targetBuffer;
                    bot.steerInput = THREE.MathUtils.clamp(awaySign * (bufferError * 0.08), -0.35, 0.35);
                }

                return true;
            },

            evaluateOffensivePinch(bot, rayDists, forwardDist) {
                const target = bot.aiTarget;
                if (!target || !target.alive) return false;
                if (bot.aiRole === 'BAIT_EVADE' || bot.aiRole === 'ESCORT') return false;

                const tPos = target.position;
                const tDir = target.getDirectionVector();
                const tRight = new THREE.Vector3(-tDir.z, 0, tDir.x);

                const toMe = bot.position.clone().sub(tPos);
                const dist = toMe.length();
                if (dist > 56) return false;

                const forwardProgress = toMe.dot(tDir);
                const lateralOffset = toMe.dot(tRight);
                const absLat = Math.abs(lateralOffset);
                const pinchSide = Math.sign(lateralOffset || 1);

                const myDir = bot.getDirectionVector();
                const headingAlign = myDir.dot(tDir);

                if (headingAlign < 0.52 || forwardProgress < 3.5 || forwardProgress > 32 || absLat > 30 || absLat < 3.2) {
                    return false;
                }

                const inwardRay = pinchSide > 0
                    ? Math.min(rayDists[-0.16], rayDists[-0.35])
                    : Math.min(rayDists[0.16], rayDists[0.35]);

                if (forwardDist < 48 || inwardRay < 14) {
                    return false;
                }

                bot.aiRole = 'PINCH_CHOKE';

                const squeezeFactor = THREE.MathUtils.clamp((forwardProgress - 5.0) / 16.0, 0, 1);
                const desiredLatGap = THREE.MathUtils.lerp(7.2, 2.2, squeezeFactor);
                const aimAhead = THREE.MathUtils.clamp(14.0 - squeezeFactor * 4.0, 8.5, 16.0);

                const pinchGoalX = tPos.x + tDir.x * aimAhead + tRight.x * pinchSide * desiredLatGap;
                const pinchGoalZ = tPos.z + tDir.z * aimAhead + tRight.z * pinchSide * desiredLatGap;

                const desiredHeading = Math.atan2(pinchGoalX - bot.position.x, -(pinchGoalZ - bot.position.z));
                const angleDiff = PhysicsEngine.normalizeAngle(desiredHeading - bot.heading);
                bot.steerInput = Math.abs(angleDiff) < 0.045
                    ? 0
                    : THREE.MathUtils.clamp(angleDiff * 1.9, -0.85, 0.85);

                if (absLat < 16.5 && forwardProgress >= 6.5) {
                    const targetIsBrakingHard = target.isBraking && target.speed < bot.speed - 5;
                    if (forwardProgress > 18 && targetIsBrakingHard) {
                        bot.steerInput = -pinchSide * 1.0;
                        bot.isBraking = true;
                        bot.isBoosting = false;
                        bot.joustPhase = 'EXTEND';
                        bot.joustTimer = 1.1;
                        bot.extendHeading = bot.heading - pinchSide * 1.3;
                    } else {
                        bot.isBraking = bot.speed > target.speed * 0.86 || forwardProgress > 11.0;
                        bot.isBoosting = false;
                    }
                } else {
                    bot.isBraking = false;
                    bot.isBoosting = forwardProgress < 8.0 && bot.speed < target.speed + 12 && bot.energy > 15;
                }

                return true;
            },

            updateFriendlyJetwallSafety(bot, dt, isSelfCoiling = false) {
                if (bot.jetwallSafetyCooldown > 0) {
                    bot.jetwallSafetyCooldown -= dt;
                }

                let allyDirectlyBehind = false;
                const myDir = bot.getDirectionVector();

                for (const other of cycles) {
                    if (other === bot || !other.alive || other.team !== bot.team) continue;

                    const toAlly = other.position.clone().sub(bot.position);
                    const dist = toAlly.length();
                    if (dist < 42) {
                        toAlly.normalize();
                        const dot = myDir.dot(toAlly);
                        const allyDir = other.getDirectionVector();
                        const headingAlignment = myDir.dot(allyDir);
                        if (dot < -0.72 && headingAlignment > 0.65) {
                            allyDirectlyBehind = true;
                            break;
                        }
                    }
                }

                const shouldDisableJetwall = allyDirectlyBehind || isSelfCoiling;

                if (shouldDisableJetwall && bot.trailActive) {
                    bot.toggleTrail();
                    bot.jetwallSafetyCooldown = isSelfCoiling ? 0.85 : 0.45;
                } else if (!shouldDisableJetwall && !bot.trailActive && bot.jetwallSafetyCooldown <= 0) {
                    bot.toggleTrail();
                }
            },

            computeTacticalGoalPoint(bot) {
                let target = bot.aiTarget;
                if (!target || !target.alive) {
                    target = this.acquireNearestTarget(bot);
                }
                const s = gameState.arenaScale;
                const clampX = (ARENA_HALF_X * s) - 45;
                const clampZ = (ARENA_HALF_Z * s) - 45;

                if (!target || !target.alive) {
                    const dir = bot.getDirectionVector();
                    return new THREE.Vector3(bot.position.x + dir.x * 120, 0, bot.position.z + dir.z * 120);
                }

                const tPos = target.position;
                const tDir = target.getDirectionVector();
                const tRight = new THREE.Vector3(-tDir.z, 0, tDir.x);
                const toMe = bot.position.clone().sub(tPos);
                const distToTarget = toMe.length();
                const forwardProgress = toMe.dot(tDir);
                const lateralOffset = toMe.dot(tRight);

                if (Math.abs(lateralOffset) > 10) {
                    bot.lockedFlankSign = lateralOffset >= 0 ? 1 : -1;
                }
                const approachSide = bot.lockedFlankSign;

                const clampGoal = (vec) => {
                    vec.x = THREE.MathUtils.clamp(vec.x, -clampX, clampX);
                    vec.z = THREE.MathUtils.clamp(vec.z, -clampZ, clampZ);
                    return vec;
                };

                const finalizeInterceptGoal = (rawGoal) => {
                    const distToGoal = Math.hypot(rawGoal.x - bot.position.x, rawGoal.z - bot.position.z);
                    if (distToGoal < 58 && distToTarget > 48) {
                        const interceptTime = THREE.MathUtils.clamp(distToTarget / (bot.speed + target.speed * 0.8), 0.12, 0.55);
                        return clampGoal(new THREE.Vector3(
                            tPos.x + tDir.x * (target.speed * interceptTime),
                            0,
                            tPos.z + tDir.z * (target.speed * interceptTime)
                        ));
                    }
                    return clampGoal(rawGoal);
                };

                if (distToTarget > 130 || (forwardProgress > 42 && distToTarget > 72)) {
                    const interceptTime = THREE.MathUtils.clamp(distToTarget / (bot.speed + target.speed * 0.75), 0.15, 0.75);
                    const flankSpread = distToTarget > 200 ? bot.formationSlot * 14 : approachSide * 16;
                    return clampGoal(new THREE.Vector3(
                        tPos.x + tDir.x * (target.speed * interceptTime) + tRight.x * flankSpread,
                        0,
                        tPos.z + tDir.z * (target.speed * interceptTime) + tRight.z * flankSpread
                    ));
                }

                const tight = bot.cordonTightness;

                if (bot.aiRole === 'LOOP_BREAKER') {
                    const turnSign = Math.sign(target.avgTurnRate) || 1;
                    return finalizeInterceptGoal(new THREE.Vector3(
                        tPos.x + tDir.x * 22 + tRight.x * turnSign * 14,
                        0,
                        tPos.z + tDir.z * 22 + tRight.z * turnSign * 14
                    ));
                }

                if (bot.aiRole === 'SPEARHEAD' || bot.aiRole === 'GUILLOTINE') {
                    const corridorWidth = 22 * tight;
                    if (forwardProgress > 9 && distToTarget < 95) {
                        const cutAhead = (bot.aiRole === 'GUILLOTINE' ? 15 : 22) * Math.max(0.65, tight);
                        return clampGoal(new THREE.Vector3(
                            tPos.x + tDir.x * cutAhead - tRight.x * approachSide * 55,
                            0,
                            tPos.z + tDir.z * cutAhead - tRight.z * approachSide * 55
                        ));
                    } else {
                        const leadDist = THREE.MathUtils.clamp(distToTarget * 0.48 + 34, 28, 88);
                        return finalizeInterceptGoal(new THREE.Vector3(
                            tPos.x + tDir.x * leadDist + tRight.x * approachSide * corridorWidth,
                            0,
                            tPos.z + tDir.z * leadDist + tRight.z * approachSide * corridorWidth
                        ));
                    }
                }

                if (bot.aiRole === 'WING_SEAL_L' || bot.aiRole === 'WING_SEAL_R') {
                    const flankSign = bot.aiRole === 'WING_SEAL_L' ? -1 : 1;
                    const sealWidth = Math.max(12, 23 * tight);
                    if (forwardProgress > 14 && distToTarget < 75) {
                        return clampGoal(new THREE.Vector3(
                            tPos.x + tDir.x * 15 - tRight.x * flankSign * 30,
                            0,
                            tPos.z + tDir.z * 15 - tRight.z * flankSign * 30
                        ));
                    }
                    const wingLead = THREE.MathUtils.clamp(24 + (forwardProgress < 0 ? 18 : 6), 18, 52);
                    return finalizeInterceptGoal(new THREE.Vector3(
                        tPos.x + tDir.x * wingLead + tRight.x * flankSign * sealWidth,
                        0,
                        tPos.z + tDir.z * wingLead + tRight.z * flankSign * sealWidth
                    ));
                }

                if (bot.aiRole === 'WALL_CAGE') {
                    const nearEastWest = (ARENA_HALF_X * s - Math.abs(tPos.x)) < (ARENA_HALF_Z * s - Math.abs(tPos.z));
                    const cageOffset = Math.max(15, 28 * tight);
                    let gx = tPos.x + tDir.x * 32;
                    let gz = tPos.z + tDir.z * 32;

                    if (nearEastWest) {
                        const inwardX = -Math.sign(tPos.x || 1);
                        gx = tPos.x + inwardX * cageOffset;
                    } else {
                        const inwardZ = -Math.sign(tPos.z || 1);
                        gz = tPos.z + inwardZ * cageOffset;
                    }

                    return finalizeInterceptGoal(new THREE.Vector3(gx, 0, gz));
                }

                const interceptLead = THREE.MathUtils.clamp(distToTarget * 0.48 + 32, 26, 86);
                return finalizeInterceptGoal(new THREE.Vector3(
                    tPos.x + tDir.x * interceptLead + tRight.x * approachSide * (18 * tight),
                    0,
                    tPos.z + tDir.z * interceptLead + tRight.z * approachSide * (18 * tight)
                ));
            },

            updateCycleAI(bot, dt) {
                if (bot.committedTurnTimer > 0) {
                    bot.committedTurnTimer = Math.max(0, bot.committedTurnTimer - dt);
                    if (bot.committedTurnTimer <= 0) {
                        bot.committedTurnDir = 0;
                    }
                }
                if (bot.steerFlipCooldown > 0) {
                    bot.steerFlipCooldown = Math.max(0, bot.steerFlipCooldown - dt);
                }
                if (bot.avoidanceLockTimer > 0) {
                    bot.avoidanceLockTimer = Math.max(0, bot.avoidanceLockTimer - dt);
                }

                // Helper to prevent frame-by-frame left/right direction sign flipping
                const applyCommittedSteer = (rawSteer, isEmergency = false) => {
                    if (Math.abs(rawSteer) < 0.06) {
                        bot.steerInput = 0;
                        return;
                    }
                    const newSign = Math.sign(rawSteer);
                    if (!isEmergency && bot.lastSteerSign !== 0 && newSign !== bot.lastSteerSign && bot.steerFlipCooldown > 0) {
                        // Hold straight neutral briefly instead of snapping to opposite bank
                        bot.steerInput = 0;
                        return;
                    }
                    if (newSign !== bot.lastSteerSign) {
                        bot.lastSteerSign = newSign;
                        bot.steerFlipCooldown = isEmergency ? 0.16 : 0.30;
                    }
                    bot.steerInput = rawSteer;
                };

                if (!bot.aiTarget || !bot.aiTarget.alive) {
                    this.acquireNearestTarget(bot);
                }
                const currentTargetId = bot.aiTarget ? bot.aiTarget.id : null;
                if (currentTargetId !== bot.lastTargetId) {
                    bot.lastTargetId = currentTargetId;
                    bot.isBraking = false;
                    bot.isBoosting = true;
                    bot.cumulativeTurn = 0;
                    bot.spinBreakoutTimer = 0.55;
                    bot.committedTurnDir = 0;
                    bot.committedTurnTimer = 0;
                    bot.joustPhase = 'CHARGE';
                    bot.joustTimer = 0;
                }

                const selfRibbonDist = this.getSelfRibbonAheadDist(bot);
                const isSelfCoiling = Math.abs(bot.cumulativeTurn) > 2.15 || selfRibbonDist < 85;
                const spiralSign = Math.sign(bot.cumulativeTurn);

                if (Math.abs(bot.cumulativeTurn) > 2.55) {
                    bot.spinBreakoutTimer = 0.85;
                    bot.joustPhase = 'EXTEND';
                    bot.joustTimer = 1.1;
                    if (bot.committedTurnDir === spiralSign) {
                        bot.committedTurnDir = -spiralSign;
                        bot.committedTurnTimer = 0.35;
                    }
                }
                if (bot.spinBreakoutTimer > 0) {
                    bot.spinBreakoutTimer = Math.max(0, bot.spinBreakoutTimer - dt);
                }

                this.updateFriendlyJetwallSafety(bot, dt, isSelfCoiling);

                const rayAngles = GridConfig.AI_RAY_ANGLES;
                const rayDists = {};
                for (let i = 0; i < rayAngles.length; i++) {
                    const a = rayAngles[i];
                    rayDists[a] = PhysicsEngine.senseRayDistance(bot, bot.heading + a, true);
                }

                const forwardDist = Math.min(rayDists[0], rayDists[-0.16] * 1.04, rayDists[0.16] * 1.04);
                const leftNear = Math.min(rayDists[-0.16], rayDists[-0.35]);
                const rightNear = Math.min(rayDists[0.16], rayDists[0.35]);
                const leftFlank = Math.min(rayDists[-0.62], rayDists[-0.92], rayDists[-1.32]);
                const rightFlank = Math.min(rayDists[0.62], rayDists[0.92], rayDists[1.32]);

                const speedFactor = Math.max(0.55, bot.speed / BASE_SPEED);
                const isExecutingCut = (
                    bot.aiRole === 'SLASH!' ||
                    bot.aiRole === 'PINCH_CHOKE' ||
                    bot.aiRole === 'GUILLOTINE' ||
                    bot.aiRole === 'SPEARHEAD' ||
                    bot.aiRole === 'WING_SEAL_L' ||
                    bot.aiRole === 'WING_SEAL_R' ||
                    bot.aiRole === 'LOOP_BREAKER' ||
                    bot.aiRole === 'WALL_CAGE'
                );
                const urgentDist = (bot.aiRole === 'PINCH_CHOKE' ? 52 : (isExecutingCut ? 64 : 92)) * speedFactor;
                const criticalDist = (bot.aiRole === 'PINCH_CHOKE' ? 34 : (isExecutingCut ? 42 : 56)) * speedFactor;
                const sideClearanceMin = bot.aiRole === 'PINCH_CHOKE' ? 18 : (isExecutingCut ? 24 : 32);

                if (!isSelfCoiling && this.evaluatePinchDefense(bot, rayDists, forwardDist)) {
                    return;
                }

                // 1. URGENT OBSTACLE AVOIDANCE WITH HYSTERESIS LOCK
                const needsAvoidance =
                    forwardDist < urgentDist ||
                    leftNear < sideClearanceMin ||
                    rightNear < sideClearanceMin;

                if (needsAvoidance) {
                    bot.avoidanceLockTimer = 0.24;
                }

                if (needsAvoidance || bot.avoidanceLockTimer > 0) {
                    if (
                        forwardDist > criticalDist * 1.25 &&
                        leftNear < sideClearanceMin + 8 &&
                        rightNear < sideClearanceMin + 8
                    ) {
                        const diff = rightNear - leftNear;
                        const corridorCenterSteer = Math.abs(diff) < 2.2
                            ? 0
                            : THREE.MathUtils.clamp(diff * 0.04, -0.42, 0.42);
                        applyCommittedSteer(corridorCenterSteer, false);
                        bot.isBraking = leftNear < 16 || rightNear < 16;
                        bot.isBoosting = !bot.isBraking && forwardDist > 110;
                        return;
                    }

                    let leftSpace =
                        rayDists[-0.16] * 0.5 +
                        rayDists[-0.35] * 1.1 +
                        rayDists[-0.62] * 1.5 +
                        rayDists[-0.92] * 1.5 +
                        rayDists[-1.32] * 1.2 +
                        rayDists[-1.57] * 0.9;

                    let rightSpace =
                        rayDists[0.16] * 0.5 +
                        rayDists[0.35] * 1.1 +
                        rayDists[0.62] * 1.5 +
                        rayDists[0.92] * 1.5 +
                        rayDists[1.32] * 1.2 +
                        rayDists[1.57] * 0.9;

                    if (Math.abs(bot.cumulativeTurn) > 1.85) {
                        const spiralPenalty = Math.min(420, (Math.abs(bot.cumulativeTurn) - 1.5) * 185);
                        if (spiralSign > 0) {
                            rightSpace -= spiralPenalty;
                        } else if (spiralSign < 0) {
                            leftSpace -= spiralPenalty;
                        }
                    }

                    let chosenDir = leftSpace > rightSpace ? -1.0 : 1.0;
                    if (bot.committedTurnDir !== 0 && bot.committedTurnTimer > 0 && !(isSelfCoiling && bot.committedTurnDir === spiralSign)) {
                        const committedFlankClear = bot.committedTurnDir < 0 ? leftFlank : rightFlank;
                        const oppositeFlankClear = bot.committedTurnDir < 0 ? rightFlank : leftFlank;
                        if (committedFlankClear > 13 || oppositeFlankClear < committedFlankClear * 2.2) {
                            chosenDir = bot.committedTurnDir;
                        } else {
                            bot.committedTurnDir = chosenDir;
                            bot.committedTurnTimer = 0.52;
                        }
                    } else {
                        bot.committedTurnDir = chosenDir;
                        bot.committedTurnTimer = 0.52;
                    }

                    applyCommittedSteer(chosenDir, true);
                    const turningFurtherIntoLoop = isSelfCoiling && Math.sign(chosenDir) === spiralSign;
                    if (turningFurtherIntoLoop) {
                        bot.isBraking = forwardDist < 22;
                        bot.isBoosting = !bot.isBraking && forwardDist > 38;
                    } else {
                        bot.isBraking = forwardDist < urgentDist * 0.92 || Math.min(leftFlank, rightFlank) < 38;
                        bot.isBoosting = false;
                    }
                    return;
                }

                if (forwardDist > urgentDist * 1.35 && bot.committedTurnTimer <= 0.15) {
                    bot.committedTurnDir = 0;
                }

                // Launch Runway Discipline
                if (matchElapsedTime < 2.2) {
                    bot.aiRole = 'FORMATION';
                    const desiredHeading = (bot.team === 1 ? 0 : Math.PI) + bot.formationSlot * 0.085;
                    const angleErr = PhysicsEngine.normalizeAngle(desiredHeading - bot.heading);
                    const launchSteer = Math.abs(angleErr) < 0.04 ? 0 : THREE.MathUtils.clamp(angleErr * 1.8, -0.65, 0.65);
                    applyCommittedSteer(launchSteer, false);
                    bot.isBoosting = matchElapsedTime > 0.5 && forwardDist > 220;
                    bot.isBraking = false;
                    return;
                }

                if ((bot.spinBreakoutTimer > 0 || isSelfCoiling) && forwardDist > 60) {
                    const candidateAngles = [-0.62, -0.35, -0.16, 0, 0.16, 0.35, 0.62];
                    let bestAngle = 0;
                    let bestScore = -Infinity;
                    const targetHeading = (bot.aiTarget && bot.aiTarget.alive)
                        ? Math.atan2(bot.aiTarget.position.x - bot.position.x, -(bot.aiTarget.position.z - bot.position.z))
                        : bot.heading;
                    const diffToTarget = PhysicsEngine.normalizeAngle(targetHeading - bot.heading);

                    for (const ca of candidateAngles) {
                        if (Math.abs(bot.cumulativeTurn) > 1.8 && Math.sign(ca) === spiralSign) continue;
                        const clearance = rayDists[ca] || 100;
                        if (clearance > 70) {
                            const alignScore = clearance * 0.65 - Math.abs(diffToTarget - ca) * 35 - Math.abs(ca) * 25;
                            if (alignScore > bestScore) {
                                bestScore = alignScore;
                                bestAngle = ca;
                            }
                        }
                    }
                    applyCommittedSteer(THREE.MathUtils.clamp(bestAngle * 1.5, -0.65, 0.65), false);
                    bot.isBraking = false;
                    bot.isBoosting = bot.energy > 15;
                    bot.cumulativeTurn = THREE.MathUtils.lerp(bot.cumulativeTurn, 0, dt * 3.5);
                    return;
                }

                if (this.evaluateOffensivePinch(bot, rayDists, forwardDist)) {
                    return;
                }

                if (this.executeJoustAndSlash(bot, dt, rayDists, forwardDist)) {
                    return;
                }

                const goal = this.computeTacticalGoalPoint(bot);
                let desiredSteer = 0;

                if (goal) {
                    const desiredHeading = Math.atan2(goal.x - bot.position.x, -(goal.z - bot.position.z));
                    const angleDiff = PhysicsEngine.normalizeAngle(desiredHeading - bot.heading);
                    const distToGoal = Math.hypot(goal.x - bot.position.x, goal.z - bot.position.z);

                    if (distToGoal < 62 && Math.abs(angleDiff) > 1.15) {
                        bot.joustPhase = 'EXTEND';
                        bot.joustTimer = 1.4;
                        bot.extendHeading = this.findBestOpenCorridorHeading(bot, rayDists);
                        desiredSteer = 0;
                    } else if (Math.abs(angleDiff) < 0.055) {
                        // Straight-line deadband: lock heading straight instead of micro-hunting
                        desiredSteer = 0;
                    } else {
                        desiredSteer = THREE.MathUtils.clamp(angleDiff * 1.25, -1.0, 1.0);
                    }

                    if (Math.abs(bot.cumulativeTurn) > 1.85 && Math.sign(desiredSteer) === spiralSign) {
                        desiredSteer = 0;
                    }

                    // Smoothly attenuate steering near side walls instead of binary frame-by-frame toggling
                    const bankCheckDist = isExecutingCut ? 44 : 66;
                    if (desiredSteer < -0.05) {
                        const leftClear = Math.min(rayDists[-0.35], rayDists[-0.62]);
                        const scale = THREE.MathUtils.smoothstep(leftClear, 22, bankCheckDist);
                        desiredSteer *= scale;
                    } else if (desiredSteer > 0.05) {
                        const rightClear = Math.min(rayDists[0.35], rayDists[0.62]);
                        const scale = THREE.MathUtils.smoothstep(rightClear, 22, bankCheckDist);
                        desiredSteer *= scale;
                    }
                }

                const repelRadius = isExecutingCut ? 16 : 30;
                for (const ally of cycles) {
                    if (ally === bot || !ally.alive || ally.team !== bot.team) continue;
                    const d = bot.position.distanceTo(ally.position);
                    if (d < repelRadius) {
                        const toAllyX = ally.position.x - bot.position.x;
                        const toAllyZ = ally.position.z - bot.position.z;
                        const rightX = Math.cos(bot.heading);
                        const rightZ = Math.sin(bot.heading);
                        const sideDot = toAllyX * rightX + toAllyZ * rightZ;
                        const repelStrength = ((repelRadius - d) / repelRadius) * 0.55;
                        desiredSteer += sideDot > 0 ? -repelStrength : repelStrength;
                    }
                }

                applyCommittedSteer(THREE.MathUtils.clamp(desiredSteer, -1.0, 1.0), false);

                const distToTarget = bot.aiTarget ? bot.position.distanceTo(bot.aiTarget.position) : 999;
                const needsSharpSnapCut =
                    (bot.aiRole === 'GUILLOTINE' || bot.aiRole === 'SPEARHEAD' || bot.aiRole === 'CUT_OFF') &&
                    Math.abs(bot.steerInput) > 0.78 &&
                    distToTarget < 65 &&
                    forwardDist > 60;

                bot.isBraking = needsSharpSnapCut;
                bot.isBoosting =
                    !bot.isBraking &&
                    forwardDist > 105 &&
                    bot.energy > 15;
            }
        };

        function spawnDerezzExplosion(origin, colorHex) {
            for (let i = 0; i < 36; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 14 + Math.random() * 44;
                acquirePooledVoxel(
                    origin.x,
                    origin.y + 0.5 + Math.random() * 1.8,
                    origin.z,
                    Math.cos(angle) * speed,
                    10 + Math.random() * 28,
                    Math.sin(angle) * speed,
                    i % 3 === 0 ? 0xffffff : colorHex,
                    1.0,
                    1.0
                );
            }
            acquirePooledFlare(origin.x, origin.y, origin.z, colorHex);
        }

        function updateParticles(dt) {
            for (let i = derezzParticles.length - 1; i >= 0; i--) {
                const p = derezzParticles[i];
                p.life -= dt * 1.15;
                if (p.life <= 0) {
                    p.mesh.visible = false;
                    p.active = false;
                    derezzParticles.splice(i, 1);
                    continue;
                }
                p.vel.y -= 36 * dt;
                p.mesh.position.addScaledVector(p.vel, dt);
                const groundY = (p.floorY || 0) + 0.3;
                if (p.mesh.position.y < groundY) {
                    p.mesh.position.y = groundY;
                    p.vel.y *= -0.45;
                }
                p.mesh.rotation.x += 5 * dt;
                p.mesh.rotation.y += 6 * dt;
                p.mesh.scale.setScalar(Math.max(0.01, p.life));
                p.mesh.material.opacity = p.life;
            }

            for (let i = flareColumns.length - 1; i >= 0; i--) {
                const f = flareColumns[i];
                f.life -= dt * 0.95;
                if (f.life <= 0) {
                    f.mesh.visible = false;
                    f.active = false;
                    flareColumns.splice(i, 1);
                    continue;
                }
                f.mesh.scale.set(f.life, 1, f.life);
                f.mesh.material.opacity = f.life * 0.75;
            }

            recognizers.forEach((r, idx) => {
                r.angle += dt * (idx === 0 ? 0.08 : -0.065);
                const rx = Math.cos(r.angle) * r.radiusX;
                const rz = Math.sin(r.angle) * r.radiusZ;
                r.mesh.position.set(rx, r.height + Math.sin(r.angle * 3) * 8, rz);
                r.mesh.lookAt(0, 60, 0);
            });
        }

        function updateTacticalDirector() {
            if (gameState.status !== 'PLAYING') return;

            if (matchElapsedTime < 2.2) {
                gameState.blueDoctrine = 'LAUNCH FORMATION';
                gameState.orangeDoctrine = 'LAUNCH FORMATION';
                return;
            }

            const staleness = Math.min(1.0, gameState.timeSinceLastKill / 12.0);
            const globalTightness = 1.0 - staleness * 0.55;
            const s = gameState.arenaScale;

            const activeTeams = new Set();
            cycles.forEach(c => {
                if (c.alive) activeTeams.add(c.team);
            });

            activeTeams.forEach(teamId => {
                const teamMembers = cycles.filter(c => c.alive && c.team === teamId);
                const aiMembers = teamMembers.filter(c => !c.isPlayer);
                const enemies = cycles.filter(c => c.alive && c.team !== teamId);

                if (enemies.length === 0 || aiMembers.length === 0) return;

                let doctrineName = 'JOUST & SLASH';

                if (gameState.mode === 'TEAM' && teamMembers.length === 1 && enemies.length >= 2) {
                    const survivor = aiMembers[0];
                    survivor.aiDoctrine = 'JOUST SLASHER';
                    survivor.cordonTightness = 1.0;

                    let closestEnemy = enemies[0];
                    let minDist = Infinity;
                    for (const e of enemies) {
                        const d = survivor.position.distanceTo(e.position);
                        if (d < minDist) {
                            minDist = d;
                            closestEnemy = e;
                        }
                    }
                    survivor.aiTarget = closestEnemy;
                    doctrineName = 'LONE JOUSTER (1V' + enemies.length + ')';
                } else if (enemies.length === 1 && aiMembers.length >= 2) {
                    const prey = enemies[0];
                    const tPos = prey.position;
                    const tDir = prey.getDirectionVector();
                    const tRight = new THREE.Vector3(-tDir.z, 0, tDir.x);

                    const nearPerimeter = getDistanceToActiveBorder(tPos.x, tPos.z) < 165;
                    const isPreyLooping = Math.abs(prey.avgTurnRate) > 0.95;

                    const rankedHunters = [...aiMembers].sort((a, b) => {
                        const aFwd = a.position.clone().sub(tPos).dot(tDir) - a.position.distanceTo(tPos) * 0.35;
                        const bFwd = b.position.clone().sub(tPos).dot(tDir) - b.position.distanceTo(tPos) * 0.35;
                        return bFwd - aFwd;
                    });

                    const spearhead = rankedHunters[0];
                    spearhead.aiTarget = prey;
                    spearhead.cordonTightness = globalTightness;
                    if (isPreyLooping) {
                        spearhead.aiRole = 'LOOP_BREAKER';
                    } else if (nearPerimeter) {
                        spearhead.aiRole = 'GUILLOTINE';
                    } else {
                        spearhead.aiRole = 'SPEARHEAD';
                    }

                    const remaining = rankedHunters.slice(1);
                    remaining.sort((a, b) => {
                        const aLat = a.position.clone().sub(tPos).dot(tRight);
                        const bLat = b.position.clone().sub(tPos).dot(tRight);
                        return aLat - bLat;
                    });

                    if (remaining.length === 1) {
                        const wing = remaining[0];
                        wing.aiTarget = prey;
                        wing.cordonTightness = globalTightness;
                        wing.aiRole = nearPerimeter ? 'WALL_CAGE' : 'WING_SEAL_L';
                        doctrineName = '2V1 JOUST ANVIL';
                    } else if (remaining.length >= 2) {
                        const leftWing = remaining[0];
                        const rightWing = remaining[remaining.length - 1];

                        leftWing.aiTarget = prey;
                        leftWing.cordonTightness = globalTightness;
                        leftWing.aiRole = 'WING_SEAL_L';

                        rightWing.aiTarget = prey;
                        rightWing.cordonTightness = globalTightness;
                        rightWing.aiRole = 'WING_SEAL_R';

                        for (let k = 1; k < remaining.length - 1; k++) {
                            const extra = remaining[k];
                            extra.aiTarget = prey;
                            extra.cordonTightness = globalTightness;
                            extra.aiRole = 'GUILLOTINE';
                        }

                        doctrineName = `${teamMembers.length}V1 JOUST TRIDENT`;
                    }
                } else {
                    aiMembers.forEach((bot) => {
                        bot.cordonTightness = globalTightness;
                        let bestEnemy = enemies[0];
                        let bestScore = Infinity;
                        const botDir = bot.getDirectionVector();
                        for (const e of enemies) {
                            const toE = e.position.clone().sub(bot.position);
                            const d = toE.length();
                            const alignBonus = d > 1 ? (toE.normalize().dot(botDir) * -35) : 0;
                            const score = d + alignBonus;
                            if (score < bestScore) {
                                bestScore = score;
                                bestEnemy = e;
                            }
                        }
                        bot.aiTarget = bestEnemy;
                    });

                    doctrineName = `JOUST & SLASH (${teamMembers.length}V${enemies.length})`;
                }

                aiMembers.forEach(b => { b.aiDoctrine = doctrineName; });
                if (teamId === 1) {
                    gameState.blueDoctrine = doctrineName;
                } else if (teamId === 2) {
                    gameState.orangeDoctrine = doctrineName;
                }
            });

            const bannerText = document.getElementById('hud-tactical-text');
            if (bannerText) {
                const gridPct = Math.round(s * 100);
                const blueAlive = cycles.filter(c => c.alive && c.team === 1).length;
                const orangeAlive = cycles.filter(c => c.alive && c.team !== 1).length;
                bannerText.textContent = `GRID ${gridPct}% // BLUE [${blueAlive}] ${gameState.blueDoctrine} vs HOSTILE [${orangeAlive}]`;
            }
        }