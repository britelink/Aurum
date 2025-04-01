import React, { useEffect, useState, useRef } from "react";

const BirdRaceBetting = () => {
  // State management
  const [balance, setBalance] = useState(1000);
  const [betAmount, setBetAmount] = useState(1);
  const [isRacing, setIsRacing] = useState(true); // Bird is always flying
  const [bettingOpen, setBettingOpen] = useState(true); // Whether betting is allowed
  const [countdown, setCountdown] = useState(10); // 10 second betting rounds
  const [birdPosition, setBirdPosition] = useState(50); // Middle of track (0-100)
  const [birdDirection, setBirdDirection] = useState(0); // -1: down, 0: neutral, 1: up
  const [sessionPlayers, setSessionPlayers] = useState([]);
  const [betImbalance, setBetImbalance] = useState("equal");
  const [raceResult, setRaceResult] = useState(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [upBets, setUpBets] = useState(0);
  const [downBets, setDownBets] = useState(0);
  const [userId] = useState(
    `user-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [trajectoryPath, setTrajectoryPath] = useState([]);
  const raceTrackRef = useRef(null);

  // Generate clouds in background
  const [clouds, setClouds] = useState([]);

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

    // Start the bird flying immediately
    startContinuousFlight();
  }, []);

  // Continuous flight function
  const startContinuousFlight = () => {
    setIsRacing(true);

    // Reset bird to middle position for initial flight
    setBirdPosition(50);
    setTrajectoryPath([]);
  };

  // Bird is always racing/flying with more natural movement
  useEffect(() => {
    if (!isRacing) return;

    const moveInterval = setInterval(() => {
      // Default autonomous flight with natural randomness
      let moveDirection = (Math.random() - 0.5) * 3;

      // If there's an active betting round, factor in bet imbalance
      if (!bettingOpen) {
        if (betImbalance === "up") {
          moveDirection = -1.5 + (Math.random() - 0.5);
        } else if (betImbalance === "down") {
          moveDirection = 1.5 + (Math.random() - 0.5);
        }
      }

      // Add slight tendency to return to center for very extreme positions
      if (birdPosition < 10) {
        moveDirection += 0.5;
      } else if (birdPosition > 90) {
        moveDirection -= 0.5;
      }

      // Update bird direction for animation
      setBirdDirection(moveDirection > 0 ? 1 : moveDirection < 0 ? -1 : 0);

      // Update position with boundaries
      setBirdPosition((prev) => {
        const newPos = prev + moveDirection;
        const boundedPos = Math.max(5, Math.min(95, newPos));

        // Record position for trajectory
        setTrajectoryPath((path) => {
          // Keep only the most recent 30 positions (approx 3 seconds)
          const newPath = [...path, boundedPos];
          if (newPath.length > 30) {
            return newPath.slice(newPath.length - 30);
          }
          return newPath;
        });

        return boundedPos;
      });
    }, 100);

    return () => clearInterval(moveInterval);
  }, [isRacing, betImbalance, bettingOpen, birdPosition]);

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
            endRace();
            return 10; // Reset to 10 seconds for next round
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [bettingOpen]);

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
  const placeBet = (position) => {
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
  const generateRandomAIPlayers = (min, max, userPosition) => {
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
    // Determine winner based on bird's movement over last 10 seconds
    const pathLength = trajectoryPath.length;

    if (pathLength < 2) {
      // Not enough data to determine movement
      setRaceResult({
        isTie: true,
        userWon: false,
        userProfit: 0,
      });
    } else {
      const startPosition = trajectoryPath[0];
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

      if (userResult) {
        // Update user's balance
        setBalance((prev) => prev + userResult.payout);
      }

      // Set the result for display
      setRaceResult({
        winningPosition,
        isTie: result.isTie,
        userWon: userResult?.hasWon || false,
        userProfit: userResult ? userResult.payout - userResult.betAmount : 0,
      });
    }

    // Reset after a delay
    setTimeout(() => {
      setRaceResult(null);
      setSessionPlayers([]);
      setBettingOpen(true);
      setCountdown(10);
    }, 3000);
  };

  // Calculate prize distribution
  const calculatePrizeDistribution = (players, winningPosition) => {
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
              ? "Place your bet! Will the bird go UP or DOWN?"
              : "Flight in progress..."}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-white text-xl font-bold px-4 py-2 rounded-full ${
              bettingOpen ? "bg-green-500" : "bg-yellow-500 animate-pulse"
            }`}
          >
            {countdown}s
          </div>
        </div>
      </div>

      {/* Race track */}
      <div
        ref={raceTrackRef}
        className="relative overflow-hidden bg-gradient-to-b from-sky-300 to-sky-500 dark:from-slate-800 dark:to-slate-950"
        style={{ height: "300px" }}
      >
        {/* Clouds in background */}
        {clouds.map((cloud, index) => (
          <div
            key={`cloud-${index}`}
            className="absolute bg-white rounded-full"
            style={{
              left: `${cloud.left}%`,
              top: `${cloud.top}%`,
              width: `${cloud.size}px`,
              height: `${cloud.size / 2}px`,
              opacity: cloud.opacity,
              filter: "blur(3px)",
            }}
          />
        ))}

        {/* Race boundaries */}
        <div className="absolute left-0 w-full h-1 bg-red-500 top-0" />
        <div className="absolute left-0 w-full h-1 bg-red-500 bottom-0" />

        {/* Trajectory Path */}
        {trajectoryPath.length > 1 &&
          trajectoryPath.map((pos, index) => {
            if (index === 0) return null; // Skip the first point
            const prevPos = trajectoryPath[index - 1];
            const opacity = 0.3 + (index / trajectoryPath.length) * 0.7;
            return (
              <div
                key={`path-${index}`}
                className="absolute bg-white"
                style={{
                  left: "50%",
                  top: `${pos}%`,
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  opacity: opacity,
                  transform: "translateX(-50%) translateY(-50%)",
                }}
              />
            );
          })}

        {/* Bird character */}
        <div
          className="absolute transition-all duration-100"
          style={{
            left: "50%",
            top: `${birdPosition}%`,
            transform: "translateX(-50%) translateY(-50%)",
            zIndex: 10,
          }}
        >
          <div
            className={`transition-transform duration-200 ${
              birdDirection === 1
                ? "rotate-12"
                : birdDirection === -1
                  ? "-rotate-12"
                  : ""
            }`}
          >
            <div className="text-4xl">🐦</div>
          </div>
        </div>

        {/* UP indicator */}
        <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-sm">
          <span className="font-bold text-indigo-700">⬆️ UP</span>
        </div>

        {/* DOWN indicator */}
        <div className="absolute bottom-2 left-2 bg-white/80 px-2 py-1 rounded text-sm">
          <span className="font-bold text-rose-700">⬇️ DOWN</span>
        </div>

        {/* Current bets overlay */}
        <div className="absolute top-2 right-2 bg-slate-800/80 text-white px-3 py-2 rounded text-xs">
          <div className="font-bold mb-1">Current Round</div>
          <div>UP Bets: ${upBets}</div>
          <div>DOWN Bets: ${downBets}</div>
          <div>Players: {playerCount}</div>
          <div className="mt-1 text-xs">
            {bettingOpen ? (
              <span className="text-green-400">Betting Open</span>
            ) : (
              <span className="text-yellow-400">Flight in Progress</span>
            )}
          </div>
        </div>

        {/* Phase indicator */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white/80 dark:bg-slate-800/80 px-3 py-1 rounded-full text-sm font-bold">
          {bettingOpen ? (
            <span className="text-green-600 dark:text-green-400">
              Betting Phase
            </span>
          ) : (
            <span className="text-yellow-600 dark:text-yellow-400">
              Flight Phase
            </span>
          )}
        </div>

        {/* Race result overlay */}
        {raceResult && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg max-w-xs text-center">
              <div className="text-3xl mb-2">
                {raceResult.isTie
                  ? "It's a TIE!"
                  : raceResult.winningPosition === "up"
                    ? "Bird went UP! ⬆️"
                    : "Bird went DOWN! ⬇️"}
              </div>

              {!raceResult.isTie && (
                <div className="mb-4">
                  {raceResult.userWon ? (
                    <div className="mt-4 text-green-500 font-bold text-2xl">
                      You WON ${raceResult.userProfit.toFixed(2)}!
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
            next 10 seconds. The bird's movement is influenced by betting - it
            tends to fly opposite to the majority bet! Watch the trajectory path
            to predict its next move. Winners share 92% of losing bets.
          </div>
        </div>
      </div>
    </div>
  );
};

export default BirdRaceBetting;
