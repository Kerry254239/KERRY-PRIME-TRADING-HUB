const WINDOW_SIZE = 100;

function analyzeDigits(digits = []) {
    const validDigits = digits
        .map(Number)
        .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9)
        .slice(-WINDOW_SIZE);

    const total = validDigits.length;

    function calculateStats(name, isMatch) {
        const matches = validDigits.filter(isMatch).length;

        return {
            name,
            matches,
            total,
            percentage: total ? Number(((matches / total) * 100).toFixed(2)) : 0
        };
    }

    const strategies = {
        over2: calculateStats("OVER 2", digit => digit > 2),
        under7: calculateStats("UNDER 7", digit => digit < 7),
        even: calculateStats("EVEN", digit => digit % 2 === 0),
        odd: calculateStats("ODD", digit => digit % 2 !== 0)
    };

    let strongest = null;

    for (const strategy of Object.values(strategies)) {
        if (!strongest || strategy.percentage > strongest.percentage) {
            strongest = strategy;
        }
    }

    return {
        status: total < WINDOW_SIZE ? "COLLECTING TICKS" : "ANALYSIS READY",
        ticks: total,
        requiredTicks: WINDOW_SIZE,
        strategies,
        strongestHistoricalFrequency: strongest
    };
}

module.exports = { analyzeDigits };
