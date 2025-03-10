/**
 * @title Aurum Trading Platform Simulation Logic
 * @author Bruce Wayne
 * @notice This file contains the core mathematical models and business logic
 * that power the Aurum trading demo, including bet processing,
 * winner determination, and profit distribution according to
 * the Inverted Price Action Strategy (IPAS).
 * @dev Implementation of the core trading mechanics for the Aurum platform
 */

/**
 * @notice MATHEMATICAL PROOF
 *
 * The Aurum trading platform operates based on the following mathematical model:
 *
 * 1. BET TOTALS
 *    - Buy Total: BT = Σ(buy_bet_amounts)
 *    - Sell Total: ST = Σ(sell_bet_amounts)
 *
 * 2. WINNER DETERMINATION
 *    - If price rises:   Winners = Buy bettors
 *    - If price falls:   Winners = Sell bettors
 *    - If BT = ST:       No winners (neutral)
 *    - If BT = 0 or ST = 0: No winners (foul)
 *
 * 3. PROFIT POOL
 *    - Losing Amount: LA = BT or ST (whichever side lost)
 *    - Platform Fee: F = 0.08 × LA (8% of losing amount)
 *    - Winning Pool: WP = LA - F (92% of losing amount)
 *
 * 4. DISTRIBUTION BY BET SIZE
 *    - $1 Bet Pool: P₁ = 0.35 × WP (35% of winning pool)
 *    - $2 Bet Pool: P₂ = 0.65 × WP (65% of winning pool)
 *
 *    Special cases:
 *    - If no $1 bets: P₂ = WP (100% to $2 bettors)
 *    - If no $2 bets: P₁ = WP (100% to $1 bettors)
 *
 * 5. INDIVIDUAL PAYOUTS
 *    - For $1 bettor: Profit = P₁ ÷ N₁
 *      where N₁ = number of winning $1 bets
 *
 *    - For $2 bettor: Profit = (P₂ ÷ N₂) × 2
 *      where N₂ = number of winning $2 bets (counted as double weight)
 *
 * 6. TOTAL RETURN CALCULATION
 *    - Total Return = Initial Bet + Profit
 *
 * 7. ROI CALCULATION
 *    - ROI = (Profit ÷ Initial Bet) × 100%
 */

// Types
export type BetPosition = "buy" | "sell";
export type BetAmount = 1 | 2;

export interface Player {
  id: string;
  position: BetPosition;
  amount: BetAmount;
}

export interface SessionResult {
  winningPosition: BetPosition | null;
  players: Player[];
  buyTotal: number;
  sellTotal: number;
  winners: PlayerResult[];
  losers: PlayerResult[];
  isFoul: boolean;
  isNeutral: boolean;
  timestamp: number;
}

export interface PlayerResult {
  playerId: string;
  initialBet: BetAmount;
  position: BetPosition;
  profit: number;
  totalReturn: number;
  roi: number;
}

/**
 * @notice Calculates the results of a trading session using Aurum's IPAS model
 * @dev Implements the mathematical equations defined in the documentation
 * @param players Array of Player objects representing all participants in the session
 * @param finalPosition The winning position (buy/sell) based on final price movement
 * @return SessionResult object containing complete session outcome data
 */
export function calculateSessionResults(
  players: Player[],
  finalPosition: BetPosition | null,
): SessionResult {
  // Count total bets for each position (Equation 1: BT and ST)
  const buyPlayers = players.filter((p) => p.position === "buy");
  const sellPlayers = players.filter((p) => p.position === "sell");

  const buyTotal = buyPlayers.reduce((sum, p) => sum + p.amount, 0);
  const sellTotal = sellPlayers.reduce((sum, p) => sum + p.amount, 0);

  // Handle special cases (Equation 2: Winner Determination special cases)
  const isFoul = (buyTotal === 0 || sellTotal === 0) && players.length > 0;
  const isNeutral = buyTotal === sellTotal && buyTotal > 0;

  let winners: PlayerResult[] = [];
  let losers: PlayerResult[] = [];
  let winningPosition: BetPosition | null = null;

  // Return early for special cases
  if (isFoul || isNeutral || finalPosition === null) {
    return {
      winningPosition: null,
      players,
      buyTotal,
      sellTotal,
      winners,
      losers,
      isFoul,
      isNeutral,
      timestamp: Date.now(),
    };
  }

  // Determine winners and losers (Equation 2: Winner Determination)
  winningPosition = finalPosition;
  const winningPlayers = players.filter((p) => p.position === winningPosition);
  const losingPlayers = players.filter((p) => p.position !== winningPosition);

  // Calculate the pot and apply platform fee (Equation 3: Profit Pool)
  const loserTotal = losingPlayers.reduce((sum, p) => sum + p.amount, 0);
  const platformFee = loserTotal * 0.08; // 8% fee
  const winningPot = loserTotal - platformFee;

  // Separate winners by bet amount
  const winners1Dollar = winningPlayers.filter((p) => p.amount === 1);
  const winners2Dollar = winningPlayers.filter((p) => p.amount === 2);

  // Distribution parameters for equation 4
  const total1DollarBets = winners1Dollar.length;
  const total2DollarBets = winners2Dollar.length * 2; // Count as double
  const totalWeightedBets = total1DollarBets + total2DollarBets;

  // Calculate distribution according to 65-35 rule (Equation 4: Distribution)
  let pot1Dollar = 0;
  let pot2Dollar = 0;

  if (totalWeightedBets > 0) {
    if (total1DollarBets === 0) {
      // Special case: all winnings to $2 bettors
      pot2Dollar = winningPot;
    } else if (total2DollarBets === 0) {
      // Special case: all winnings to $1 bettors
      pot1Dollar = winningPot;
    } else {
      // Normal case: split according to 35-65 rule
      pot1Dollar = winningPot * 0.35; // 35% to $1 bettors
      pot2Dollar = winningPot * 0.65; // 65% to $2 bettors
    }
  }

  // Calculate individual winnings (Equation 5: Individual Payouts)
  winners = winningPlayers.map((player) => {
    let profit = 0;

    if (player.amount === 1 && total1DollarBets > 0) {
      // Equation 5 for $1 bettors
      profit = pot1Dollar / total1DollarBets;
    } else if (player.amount === 2 && total2DollarBets > 0) {
      // Equation 5 for $2 bettors
      profit = (pot2Dollar / total2DollarBets) * 2; // Proportional to bet size
    }

    // Equation 6: Total Return
    const totalReturn = player.amount + profit;

    // Equation 7: ROI
    const roi = (profit / player.amount) * 100;

    return {
      playerId: player.id,
      initialBet: player.amount,
      position: player.position,
      profit,
      totalReturn,
      roi,
    };
  });

  // Calculate losses (always 100% of bet)
  losers = losingPlayers.map((player) => {
    return {
      playerId: player.id,
      initialBet: player.amount,
      position: player.position,
      profit: -player.amount,
      totalReturn: 0,
      roi: -100, // Equation 7: ROI for losers is -100%
    };
  });

  return {
    winningPosition,
    players,
    buyTotal,
    sellTotal,
    winners,
    losers,
    isFoul,
    isNeutral,
    timestamp: Date.now(),
  };
}

/**
 * @notice Generates random players for simulation purposes
 * @dev Creates a set of players with randomized positions and bet amounts
 * @param playerCount Number of players to generate (default: 20)
 * @param buyBias Probability factor for "buy" positions (0.5 = equal probability, >0.5 = more buys)
 * @return Array of randomly generated Player objects
 */
export function generateSimulatedSession(
  playerCount: number = 20,
  buyBias: number = 0.5,
): Player[] {
  const players: Player[] = [];

  for (let i = 0; i < playerCount; i++) {
    const position: BetPosition = Math.random() < buyBias ? "buy" : "sell";
    const amount: BetAmount = Math.random() < 0.5 ? 1 : 2;

    players.push({
      id: `player-${i + 1}`,
      position,
      amount,
    });
  }

  return players;
}

/**
 * @notice Generates a human-readable summary of session results
 * @dev Formats the session outcome data into a user-friendly string
 * @param result The SessionResult object to summarize
 * @return String containing formatted summary of the session results
 */
export function getSessionSummary(result: SessionResult): string {
  if (result.isFoul) {
    return "Session resulted in a foul (all bets on same side). No money lost.";
  }

  if (result.isNeutral) {
    return "Session ended in neutral position. Waiting for next session.";
  }

  if (!result.winningPosition) {
    return "No result determined yet.";
  }

  const totalPlayers = result.players.length;
  const totalWinners = result.winners.length;
  const totalLosers = result.losers.length;

  const winnersByAmount = {
    1: result.winners.filter((w) => w.initialBet === 1),
    2: result.winners.filter((w) => w.initialBet === 2),
  };

  const avgRoi =
    result.winners.length > 0
      ? result.winners.reduce((sum, w) => sum + w.roi, 0) /
        result.winners.length
      : 0;

  return `
    Session complete with ${totalPlayers} players.
    ${result.winningPosition.toUpperCase()} position won.
    ${totalWinners} winners, ${totalLosers} losers.
    Average ROI for winners: ${avgRoi.toFixed(2)}%.
    $1 bettors return: ${winnersByAmount[1].length > 0 ? `$${winnersByAmount[1][0].totalReturn.toFixed(2)}` : "N/A"}
    $2 bettors return: ${winnersByAmount[2].length > 0 ? `$${winnersByAmount[2][0].totalReturn.toFixed(2)}` : "N/A"}
  `;
}

/**
 * @notice Simulates the example scenario provided in the specification
 * @dev Runs a simulation with pre-defined player distribution:
 *      - 6 players with $1 buy, 5 players with $2 buy
 *      - 5 players with $1 sell, 4 players with $2 sell
 * @return SessionResult object containing the simulation results with "sell" as winner
 */
export function runSpecExample(): SessionResult {
  const players: Player[] = [];

  // Add buy players
  for (let i = 0; i < 6; i++) {
    players.push({ id: `buy-1-${i}`, position: "buy", amount: 1 });
  }
  for (let i = 0; i < 5; i++) {
    players.push({ id: `buy-2-${i}`, position: "buy", amount: 2 });
  }

  // Add sell players
  for (let i = 0; i < 5; i++) {
    players.push({ id: `sell-1-${i}`, position: "sell", amount: 1 });
  }
  for (let i = 0; i < 4; i++) {
    players.push({ id: `sell-2-${i}`, position: "sell", amount: 2 });
  }

  // Example shows sell wins
  return calculateSessionResults(players, "sell");
}
