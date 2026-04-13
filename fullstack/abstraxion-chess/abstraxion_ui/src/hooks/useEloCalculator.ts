interface EloCalculation {
  winnerNewElo: number;
  loserNewElo: number;
  winnerChange: number;
  loserChange: number;
}

export function useEloCalculator() {
  const K_FACTOR = 32; // Standard K-factor for chess

  const calculateExpectedScore = (playerElo: number, opponentElo: number): number => {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  };

  const calculateEloChange = (
    winnerElo: number,
    loserElo: number,
    isDraw: boolean = false
  ): EloCalculation => {
    const winnerExpected = calculateExpectedScore(winnerElo, loserElo);
    const loserExpected = calculateExpectedScore(loserElo, winnerElo);

    let winnerActual: number;
    let loserActual: number;

    if (isDraw) {
      winnerActual = 0.5;
      loserActual = 0.5;
    } else {
      winnerActual = 1;
      loserActual = 0;
    }

    const winnerChange = Math.round(K_FACTOR * (winnerActual - winnerExpected));
    const loserChange = Math.round(K_FACTOR * (loserActual - loserExpected));

    return {
      winnerNewElo: Math.max(100, winnerElo + winnerChange), // Minimum ELO of 100
      loserNewElo: Math.max(100, loserElo + loserChange),
      winnerChange,
      loserChange,
    };
  };

  return {
    calculateEloChange,
  };
}