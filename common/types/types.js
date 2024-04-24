export const earningsTypes = Object.freeze({
    STREAK_BONUS1: 'streak_bonus1',
    STREAK_BONUS2: 'streak_bonus2',
    BREATH1: 'breath1',
    BREATH2: 'breath2'
});

export const earningsAmounts = Object.freeze({
    [earningsTypes.STREAK_BONUS1]: 3,
    [earningsTypes.STREAK_BONUS2]: 5,
    [earningsTypes.BREATH1]: 7,
    [earningsTypes.BREATH2]: 7
});

export const totalStage2Segments = 12;
export const totalStage3Segments = 48;