export const earningsTypes = Object.freeze({
    STREAK_BONUS: 'streak_bonus',
    BREATH1: 'breath1',
    COMPLETION_BREATH2: 'c_breath2',
    PERFORMANCE_BREATH2: 'p_breath2',
    TOP_66: 'top_66',
    TOP_25: 'top_25'
});

export const earningsAmounts = Object.freeze({
    [earningsTypes.STREAK_BONUS]: 5,
    [earningsTypes.BREATH1]: 3,
    [earningsTypes.COMPLETION_BREATH2]: 7,
    [earningsTypes.PERFORMANCE_BREATH2]: 3,
    [earningsTypes.TOP_66]: 3,
    [earningsTypes.TOP_25]: 4
});

export const maxSessionMinutes = 18;

export const totalStage3Segments = 48;