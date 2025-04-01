//@ts-nocheck
import React, { useEffect, useState, useRef } from "react";
import * as THREE from "three";

// Game interfaces
interface Cloud {
  left: number;
  top: number;
  size: number;
  opacity: number;
}

interface Player {
  id: string;
  position: string;
  amount: number;
}

interface RaceResult {
  winningPosition?: string;
  isTie?: boolean;
  userWon?: boolean;
  userProfit?: number;
  failureOccurred?: boolean;
  failureReason?: string;
}

const BirdRaceBetting = () => {
  // State management
  const [balance, setBalance] = useState(1000);
  const [betAmount, setBetAmount] = useState(1);
  const [isRacing, setIsRacing] = useState(false); // Bird starts perched, not flying
  const [bettingOpen, setBettingOpen] = useState(true);
  const [countdown, setCountdown] = useState(10);
  const [birdPosition, setBirdPosition] = useState(80); // Start higher (on branch)
  const [birdXPosition, setBirdXPosition] = useState(15); // Start from left (15% across)
  const [birdDirection, setBirdDirection] = useState(0);
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [betImbalance, setBetImbalance] = useState("equal");
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [upBets, setUpBets] = useState(0);
  const [downBets, setDownBets] = useState(0);
  const [userId] = useState(
    `user-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [trajectoryPath, setTrajectoryPath] = useState<number[]>([]);
  const [flightProgress, setFlightProgress] = useState(0); // 0-100%
  const [flightFailed, setFlightFailed] = useState(false);
  const [failureChance, setFailureChance] = useState(15); // 15% base chance
  const [windStrength, setWindStrength] = useState(0); // Wind effect

  // Refs
  const raceTrackRef = useRef<HTMLDivElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const birdModelRef = useRef<THREE.Mesh | null>(null);

  // Generate clouds in background
  const [clouds, setClouds] = useState<Cloud[]>([]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!threeContainerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x87ceeb); // Sky blue

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      threeContainerRef.current.clientWidth /
        threeContainerRef.current.clientHeight,
      0.1,
      1000,
    );
    cameraRef.current = camera;
    camera.position.z = 5;
    camera.position.y = 1;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(
      threeContainerRef.current.clientWidth,
      threeContainerRef.current.clientHeight,
    );
    threeContainerRef.current.appendChild(renderer.domElement);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Create water surface
    const waterGeometry = new THREE.PlaneGeometry(20, 10);
    const waterMaterial = new THREE.MeshPhongMaterial({
      color: 0x4682b4,
      transparent: true,
      opacity: 0.8,
      shininess: 100,
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1;
    scene.add(water);

    // Create tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(-7, 0, 0);
    scene.add(trunk);

    // Create tree foliage
    const foliageGeometry = new THREE.ConeGeometry(1.5, 3, 8);
    const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(-7, 2, 0);
    scene.add(foliage);

    // Create branch
    const branchGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 6);
    const branchMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const branch = new THREE.Mesh(branchGeometry, branchMaterial);
    branch.rotation.z = Math.PI / 4;
    branch.position.set(-6, 0.5, 0);
    scene.add(branch);

    // Create the bird (simple for now)
    const birdGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const birdMaterial = new THREE.MeshLambertMaterial({ color: 0x1e90ff });
    const bird = new THREE.Mesh(birdGeometry, birdMaterial);
    bird.position.set(-6, 0.8, 0); // Start on branch
    scene.add(bird);
    birdModelRef.current = bird;

    // Create shore on the right side
    const shoreGeometry = new THREE.BoxGeometry(3, 0.5, 10);
    const shoreMaterial = new THREE.MeshLambertMaterial({ color: 0xc2b280 });
    const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);
    shore.position.set(8, -0.75, 0);
    scene.add(shore);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Water animation
      if (waterMaterial.userData.time === undefined) {
        waterMaterial.userData.time = 0;
      }
      waterMaterial.userData.time += 0.01;
      waterMaterial.needsUpdate = true;
      waterMaterial.opacity = 0.6 + Math.sin(waterMaterial.userData.time) * 0.1;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup on unmount
    return () => {
      if (rendererRef.current && threeContainerRef.current) {
        threeContainerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (
        !threeContainerRef.current ||
        !rendererRef.current ||
        !cameraRef.current
      )
        return;

      const width = threeContainerRef.current.clientWidth;
      const height = threeContainerRef.current.clientHeight;

      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Generate random clouds
    const newClouds = [];
    for (let i = 0; i < 5; i++) {
      newClouds.push({
        left: Math.random() * 80 + 10,
        top: Math.random() * 40 + 5,
        size: Math.random() * 30 + 30,
        opacity: Math.random() * 0.4 + 0.1,
      });
    }
    setClouds(newClouds);

    // Random wind strength
    setWindStrength((Math.random() * 2 - 1) * 0.5);
  }, []);

  // Start flight function
  const startFlight = () => {
    setIsRacing(true);
    setFlightProgress(0);
    setFlightFailed(false);
    setBirdPosition(60); // Branch height
    setBirdXPosition(15); // Branch position
    setTrajectoryPath([]);

    // Adjust failure chance based on bet imbalance
    let adjustedFailureChance = failureChance;

    if (betImbalance === "up") {
      // If more bets on UP, increase chance of failing downward
      adjustedFailureChance += 10;
    } else if (betImbalance === "down") {
      // If more bets on DOWN, decrease chance of failing downward
      adjustedFailureChance -= 5;
    }

    // Clamp between 5% and 30%
    adjustedFailureChance = Math.max(5, Math.min(30, adjustedFailureChance));
    setFailureChance(adjustedFailureChance);

    // Update 3D bird position
    if (birdModelRef.current) {
      birdModelRef.current.position.set(-6, 0.8, 0);
    }
  };

  // Update bird movement with sine wave pattern and progress
  useEffect(() => {
    if (!isRacing) return;

    const moveInterval = setInterval(() => {
      // Update flight progress
      setFlightProgress((prev) => {
        const newProgress = prev + 0.5;
        return Math.min(100, newProgress);
      });

      // Check for random failure if not already failed
      if (!flightFailed && Math.random() * 100 < failureChance / 5) {
        setFlightFailed(true);

        // Generate failure reason
        const reasons = [
          "Strong wind gust!",
          "Bird got tired!",
          "Distracted by fish!",
          "Lost orientation!",
        ];
        const failureReason =
          reasons[Math.floor(Math.random() * reasons.length)];

        setRaceResult({
          failureOccurred: true,
          failureReason,
          winningPosition: betImbalance === "up" ? "down" : "up", // Failure favors opposite of the bet imbalance
        });
      }

      // Sine wave movement + influence from bet imbalance + wind effect
      setBirdPosition((prev) => {
        const progressFactor = flightProgress / 100;

        // Base sine wave motion (higher amplitude at the middle of flight)
        const sineAmplitude = 20 * Math.sin(progressFactor * Math.PI);

        // Calculate vertical drift based on bet imbalance
        let verticalDrift = 0;
        if (betImbalance === "up") {
          verticalDrift = 5; // Tend to go down (higher value = lower on screen)
        } else if (betImbalance === "down") {
          verticalDrift = -5; // Tend to go up (lower value = higher on screen)
        }

        // Wind effect
        const windEffect =
          windStrength * 10 * Math.sin(progressFactor * Math.PI * 4);

        // Failed bird drops faster
        let failureEffect = 0;
        if (flightFailed) {
          failureEffect = progressFactor * 40; // Increasing downward pull
        }

        // Combine all effects
        // Start around 60 (branch height), then move based on sine wave + drift + wind + failure
        const baseHeight = 60 - progressFactor * 10; // Slight drop as bird moves forward
        const newPos =
          baseHeight +
          sineAmplitude +
          verticalDrift +
          windEffect +
          failureEffect;

        // Ensure bird stays within bounds (5-95)
        const boundedPos = Math.max(5, Math.min(95, newPos));

        // Record position for trajectory
        setTrajectoryPath((path) => {
          const newPath = [...path, boundedPos];
          if (newPath.length > 30) return newPath.slice(newPath.length - 30);
          return newPath;
        });

        return boundedPos;
      });

      // Horizontal movement (from left tree to right shore)
      setBirdXPosition((prev) => {
        const newX = prev + 0.8; // Move rightward
        return Math.min(85, newX); // Cap at 85% (right shore)
      });

      // Update bird direction for animation
      setBirdDirection((prev) => {
        // Calculate direction based on last two positions of trajectory
        if (trajectoryPath.length < 2) return 0;

        const lastPos = trajectoryPath[trajectoryPath.length - 1];
        const prevPos = trajectoryPath[trajectoryPath.length - 2];

        if (lastPos < prevPos) return -1; // Going up
        if (lastPos > prevPos) return 1; // Going down
        return 0; // Neutral
      });

      // Update 3D bird model position
      if (birdModelRef.current) {
        // Map 2D positions to 3D coordinates
        // X: 15% to 85% maps to -6 to 6
        const x = -6 + (birdXPosition - 15) * (12 / 70);

        // Y: 5% to 95% maps to 2 to -1 (inverted, higher values are lower)
        const y = 2 - (birdPosition / 95) * 3;

        // Apply to 3D model
        birdModelRef.current.position.x = x;
        birdModelRef.current.position.y = y;

        // Rotate bird based on direction
        birdModelRef.current.rotation.z = birdDirection * 0.3;
      }

      // End race when progress is complete
      if (flightProgress >= 100) {
        clearInterval(moveInterval);
        endRace();
      }
    }, 100); // Update every 100ms for smoother movement

    return () => clearInterval(moveInterval);
  }, [
    isRacing,
    betImbalance,
    birdDirection,
    flightProgress,
    flightFailed,
    failureChance,
    windStrength,
    trajectoryPath,
  ]);

  // Betting round timer
  useEffect(() => {
    if (bettingOpen) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            startBettingRound();
            return 10; // Reset to 10 seconds for next round
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      // If betting is closed, count down to the result
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            if (!isRacing) {
              startFlight(); // Start the flight
            }
            return 10; // Reset to 10 seconds for next round
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [bettingOpen, isRacing]);

  // Start a new betting round
  const startBettingRound = () => {
    setBettingOpen(false);
    setCountdown(10);
  };

  // Update bet imbalance when players change
  useEffect(() => {
    if (sessionPlayers.length === 0) {
      setBetImbalance("equal");
      setPlayerCount(0);
      setUpBets(0);
      setDownBets(0);
      return;
    }

    const upTotal = sessionPlayers
      .filter((p) => p.position === "up")
      .reduce((sum, p) => sum + p.amount, 0);

    const downTotal = sessionPlayers
      .filter((p) => p.position === "down")
      .reduce((sum, p) => sum + p.amount, 0);

    setUpBets(upTotal);
    setDownBets(downTotal);
    setPlayerCount(sessionPlayers.length);

    if (upTotal > downTotal) {
      setBetImbalance("up");
    } else if (downTotal > upTotal) {
      setBetImbalance("down");
    } else {
      setBetImbalance("equal");
    }
  }, [sessionPlayers]);

  // Place a bet function
  const placeBet = (position: string) => {
    if (!bettingOpen || balance < betAmount) return;

    // Remove any existing bets by this player
    const filteredPlayers = sessionPlayers.filter((p) => p.id !== userId);

    // Add the new bet
    const userBet = {
      id: userId,
      position,
      amount: betAmount,
    };

    // Generate random AI players (0-5)
    const aiPlayers = generateRandomAIPlayers(0, 5, position);
    setSessionPlayers([...filteredPlayers, ...aiPlayers, userBet]);

    // Deduct bet from balance
    setBalance((prev) => prev - betAmount);
  };

  // Helper function to generate AI players
  const generateRandomAIPlayers = (
    min: number,
    max: number,
    userPosition: string,
  ) => {
    const playerCount = min + Math.floor(Math.random() * (max - min + 1));
    const aiPlayers = [];

    for (let i = 0; i < playerCount; i++) {
      // Generate position with slight bias against user (more interesting)
      const position =
        Math.random() < 0.55
          ? userPosition === "up"
            ? "down"
            : "up"
          : userPosition === "up"
            ? "up"
            : "down";

      // Generate random bet amount
      const amount = Math.random() < 0.7 ? 1 : 2;

      aiPlayers.push({
        id: `ai-${i}-${Math.random().toString(36).substring(2, 9)}`,
        position,
        amount,
      });
    }

    return aiPlayers;
  };

  // End the race and determine winners
  const endRace = () => {
    // Already have result from failure
    if (raceResult && raceResult.failureOccurred) {
      finalizeResult(raceResult);
      return;
    }

    // Determine winner based on bird's trajectory
    const pathLength = trajectoryPath.length;

    if (pathLength < 2) {
      // Not enough data to determine movement
      const result = {
        isTie: true,
        userWon: false,
        userProfit: 0,
      };
      finalizeResult(result);
    } else {
      // Look at the latter half of the trajectory for final direction
      const startIndex = Math.floor(pathLength / 2);
      const startPosition = trajectoryPath[startIndex];
      const endPosition = trajectoryPath[pathLength - 1];
      const birdWentUp = endPosition < startPosition; // Lower position = higher on screen
      const winningPosition = birdWentUp ? "up" : "down";

      // Calculate prize distribution
      const result = calculatePrizeDistribution(
        sessionPlayers,
        winningPosition,
      );

      // Find user's result
      const userResult = result.players.find((player) => player.id === userId);

      const finalResult = {
        winningPosition,
        isTie: result.isTie,
        userWon: userResult?.hasWon || false,
        userProfit: userResult ? userResult.payout - userResult.betAmount : 0,
        failureOccurred: flightFailed,
      };

      finalizeResult(finalResult);
    }
  };

  // Helper function to finalize the race result
  const finalizeResult = (result: RaceResult) => {
    setRaceResult(result);

    // Update user balance if they won
    if (result.userWon && result.userProfit) {
      setBalance((prev) => prev + result.userProfit + betAmount);
    }

    // Reset after a delay
    setTimeout(() => {
      setRaceResult(null);
      setSessionPlayers([]);
      setBettingOpen(true);
      setCountdown(10);
      setIsRacing(false);
      setFlightFailed(false);
      setWindStrength((Math.random() * 2 - 1) * 0.5); // New random wind for next round
    }, 4000);
  };

  // Calculate prize distribution
  const calculatePrizeDistribution = (
    players: Player[],
    winningPosition: string,
  ) => {
    // Calculate total bets for each side
    const upTotal = players
      .filter((p) => p.position === "up")
      .reduce((sum, p) => sum + p.amount, 0);

    const downTotal = players
      .filter((p) => p.position === "down")
      .reduce((sum, p) => sum + p.amount, 0);

    // If equal bets on both sides, it's a tie
    if (upTotal === downTotal) {
      return {
        isTie: true,
        winningPosition: null,
        players: players.map((p) => ({
          id: p.id,
          hasWon: false,
          betAmount: p.amount,
          payout: p.amount, // return original bet
        })),
        houseFee: 0,
      };
    }

    // Calculate winning and losing pools
    const winningPlayers = players.filter(
      (p) => p.position === winningPosition,
    );
    const losingPlayers = players.filter((p) => p.position !== winningPosition);

    const winningPool = winningPlayers.reduce((sum, p) => sum + p.amount, 0);
    const losingPool = losingPlayers.reduce((sum, p) => sum + p.amount, 0);

    // House fee (8% of losing pool)
    const houseFee = losingPool * 0.08;

    // Prize pool (92% of losing pool)
    const prizePool = losingPool * 0.92;

    // Calculate results for all players
    const playerResults = players.map((player) => {
      if (player.position === winningPosition) {
        // Winners get bet back plus share of prize pool
        const share = player.amount / winningPool;
        const prize = prizePool * share;
        return {
          id: player.id,
          hasWon: true,
          betAmount: player.amount,
          payout: player.amount + prize,
        };
      } else {
        // Losers get nothing
        return {
          id: player.id,
          hasWon: false,
          betAmount: player.amount,
          payout: 0,
        };
      }
    });

    return {
      isTie: false,
      winningPosition,
      players: playerResults,
      houseFee,
    };
  };

  return (
    <div className="bg-sky-100 dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-blue-900 overflow-hidden h-full flex flex-col">
      {/* Game header */}
      <div className="bg-blue-500 dark:bg-blue-800 p-3 flex justify-between items-center">
        <div>
          <div className="text-sm font-medium text-blue-100">Your Balance</div>
          <div className="text-2xl font-bold text-white">
            ${balance.toFixed(2)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-white">Bird Race</div>
          <div className="text-sm text-blue-100">
            {bettingOpen
              ? "Place your bet! Will the bird fly UP or DOWN?"
              : isRacing
                ? "Flight in progress!"
                : "Preparing for takeoff..."}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-white text-xl font-bold px-4 py-2 rounded-full ${
              bettingOpen
                ? "bg-green-500"
                : isRacing
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-orange-500"
            }`}
          >
            {countdown}s
          </div>
        </div>
      </div>

      {/* 3D Race Track */}
      <div
        ref={threeContainerRef}
        className="relative overflow-hidden"
        style={{ height: "300px" }}
      >
        {/* Flight progress overlay */}
        {isRacing && (
          <div className="absolute bottom-2 left-2 right-2 bg-slate-800/50 rounded-full h-4 overflow-hidden z-10">
            <div
              className={`h-full ${flightFailed ? "bg-red-500" : "bg-green-500"}`}
              style={{ width: `${flightProgress}%` }}
            ></div>
          </div>
        )}

        {/* Failure chance indicator */}
        <div className="absolute top-2 right-2 bg-slate-800/80 text-white px-3 py-2 rounded text-xs z-10">
          <div className="font-bold mb-1">Flight Conditions</div>
          <div className="flex items-center">
            <span>Failure Chance: </span>
            <span
              className={`ml-1 font-bold ${
                failureChance > 20
                  ? "text-red-400"
                  : failureChance > 10
                    ? "text-yellow-400"
                    : "text-green-400"
              }`}
            >
              {failureChance}%
            </span>
          </div>
          <div>Wind: {windStrength > 0 ? "Southerly" : "Northerly"}</div>
        </div>

        {/* Current bets overlay */}
        <div className="absolute top-2 left-2 bg-slate-800/80 text-white px-3 py-2 rounded text-xs z-10">
          <div className="font-bold mb-1">Current Round</div>
          <div>UP Bets: ${upBets}</div>
          <div>DOWN Bets: ${downBets}</div>
          <div>Players: {playerCount}</div>
          <div className="mt-1 text-xs">
            {bettingOpen ? (
              <span className="text-green-400">Betting Open</span>
            ) : isRacing ? (
              <span className="text-yellow-400">Flight in Progress</span>
            ) : (
              <span className="text-orange-400">Preparing Takeoff</span>
            )}
          </div>
        </div>

        {/* Phase indicator */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded-full text-sm font-bold z-10">
          {bettingOpen ? (
            <span className="text-green-600 dark:text-green-400">
              Betting Phase
            </span>
          ) : isRacing ? (
            <span className="text-yellow-600 dark:text-yellow-400">
              Flight Phase
            </span>
          ) : (
            <span className="text-orange-600 dark:text-orange-400">
              Takeoff Preparation
            </span>
          )}
        </div>

        {/* Race result overlay */}
        {raceResult && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-20">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg max-w-xs text-center">
              {raceResult.failureOccurred ? (
                <div>
                  <div className="text-3xl mb-2 text-red-500">
                    Flight Failed!
                  </div>
                  <div className="text-xl mb-4">{raceResult.failureReason}</div>
                  <div className="text-lg">
                    The bird{" "}
                    {raceResult.winningPosition === "up"
                      ? "went UP"
                      : "went DOWN"}
                  </div>
                </div>
              ) : raceResult.isTie ? (
                <div className="text-3xl mb-2">It's a TIE!</div>
              ) : (
                <div className="text-3xl mb-2">
                  Bird{" "}
                  {raceResult.winningPosition === "up"
                    ? "went UP! ⬆️"
                    : "went DOWN! ⬇️"}
                </div>
              )}

              {!raceResult.isTie && (
                <div className="mb-4">
                  {raceResult.userWon ? (
                    <div className="mt-4 text-green-500 font-bold text-2xl">
                      You WON ${raceResult.userProfit?.toFixed(2)}!
                    </div>
                  ) : (
                    <div className="mt-4 text-red-500 font-bold text-xl">
                      You lost your bet.
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm mt-4">
                Winners share 92% of losing bets.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Betting controls section */}
      <div className="p-4 bg-white dark:bg-slate-800">
        {/* Bet amount selector */}
        <div className="mb-4">
          <label className="text-slate-600 dark:text-slate-300 mb-2 block font-medium">
            Bet Amount:
          </label>
          <div className="flex space-x-3">
            {[1, 2, 5, 10].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  betAmount === amount
                    ? "bg-indigo-600 text-white dark:bg-indigo-700"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                } ${!bettingOpen ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!bettingOpen}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>

        {/* UP/DOWN betting buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            className={`bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-4 rounded-lg flex items-center justify-center ${
              !bettingOpen || balance < betAmount
                ? "opacity-50 cursor-not-allowed"
                : "hover:shadow-lg transform hover:-translate-y-1 transition-all"
            }`}
            onClick={() => placeBet("up")}
            disabled={!bettingOpen || balance < betAmount}
          >
            <span className="text-2xl mr-2">⬆️</span> Bird Goes UP!
          </button>
          <button
            className={`bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 px-4 rounded-lg flex items-center justify-center ${
              !bettingOpen || balance < betAmount
                ? "opacity-50 cursor-not-allowed"
                : "hover:shadow-lg transform hover:-translate-y-1 transition-all"
            }`}
            onClick={() => placeBet("down")}
            disabled={!bettingOpen || balance < betAmount}
          >
            <span className="text-2xl mr-2">⬇️</span> Bird Goes DOWN!
          </button>
        </div>
      </div>

      {/* Game rules footer */}
      <div className="p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-slate-900">
        <div className="text-center text-sm text-slate-500 dark:text-slate-400">
          <div className="font-medium">🎮 Game Rules</div>
          <div className="text-xs mt-1">
            The bird is always flying! Bet whether it will go UP or DOWN in the
            next 10 seconds. The bird&apos;s movement is influenced by betting -
            it tends to fly opposite to the majority bet! Watch the trajectory
            path to predict its next move. Winners share 92% of losing bets.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BirdRaceBetting;
