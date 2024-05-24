export function yyyymmddNumber(date) {
    return Number.parseInt(yyyymmddString(date));
}

export function yyyymmddString(date) {
    return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2,0)}${date.getDate().toString().padStart(2, 0)}`;
}

export async function getCondition(apiClient) {
    const data = await apiClient.getSelf()
    return data.condition
}

export async function getConditionFactors(apiClient) {
    const condition = await getCondition(apiClient)
    return conditionToFactors(condition)
}

/**
Conditions are numbers from 0 to 63. Factors are things like
do we show the heart rate chart, is their pace selection personalized
or standardized, etc.
We convert a condition to a set of factors as follows:
1. Convert the condition to binary (zero padding it if necessary so that it's six digits)
2. From left to right, convert each digit in the result to a factor as follows:

1st digit is breathing frequency range: 0 = slower, 1 = slow
2nd is pace selection: 0 = standard, 1 = personalized
3rd is display heart rate chart: 0 = no, 1 = yes
4th is display positive emotion instructions: 0 = no, 1 = yes
5th is audio pacing present: 0 = no, 1 = yes
6th is rewards: 0 = rewards for completion, 1 = rewards for performance
 */

export function conditionToFactors(condition) {
    if (condition < 0 || condition > 63) {
        throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`)
    }

    const factorValues = condition.toString(2).padStart(6, '0').split('').map(i => Number.parseInt(i))
    const breathingFrequency = factorValues[0] == 0 ? 'slower' : 'slow'
    const paceSelection = factorValues[1] == 0 ? 'standard' : 'personalized'
    const rewards = factorValues[5] == 0 ? 'completion' : 'performance'

    return {
        breathingFrequency: breathingFrequency,
        paceSelection: paceSelection,
        showHeartRate: Boolean(factorValues[2]),
        showPosEmoInstructions: Boolean(factorValues[3]),
        playAudioPacer: Boolean(factorValues[4]),
        rewards: rewards
    }
}

export const emoPics = ['1', '2', '3', '4', '5', '6', '7', '8']
export const emoPicExt = '.jpeg'

export const slowBreathsPerMinute = 5.4
export const slowerBreathsPerMinute = 4.02

/**
 * Calculates a personalized breathing pace for a participant.
 * First checks to see if a given frequency showed peak power more than others. If so, 
 * use it. If not, return the frequency with the highest Y value. If all four peak values are 'n/a'
 * then return the standard slow (or slower) breathing pace instead of a personalized one.
 * @param {string} slowOrSlower 'slow' or 'slower' - the range we should be targeting
 * @param {[object]} peakFreqs the frequencies that showed peak power during setup breathing exercises. Must be an array with four entries. Each entry should be an object with 'slowX', 'slowY', 'slowerX', and 'slowerY' keys. All values should be floats or 'n/a'.
 * @returns {number} breathing frequency in breaths per minute 
*/
export function calculatePersonalizedPace(slowOrSlower, peakFreqs) {
    if (slowOrSlower !== 'slow' && slowOrSlower !== 'slower') {
        throw new Error(`Expected 'slow' or 'slower' but received ${slowOrSlower}.`);
    }

    if (peakFreqs.length != 4) {
        throw new Error(`Expected four frequencies but received ${peakFreqs.length}`);
    }

    const validFreqs = peakFreqs.map(p => {
        if (slowOrSlower === 'slower') return {x: p.slowerX, y: p.slowerY};
        return {x: p.slowX, y: p.slowY}
    }).filter(p => p.x !== 'n/a');
    
    if (validFreqs.length == 0) {
        if (slowOrSlower === 'slow') return slowBreathsPerMinute;
        return slowerBreathsPerMinute;
    }

    if (validFreqs.length == 1) {
        return hzToBreathsPerMinute(validFreqs[0].preakFreq);
    }

    // check for a frequency that appears most often
    const freqCounts = {}
    validFreqs.forEach(({x, _y}) => {
        const count = freqCounts[x] || 0;
        freqCounts[x] = count + 1;
    });
    let maxCount = 1;
    let modalFreq = null;
    Object.entries(freqCounts).forEach(([freq, count]) => {
        if (count > maxCount) {
            maxCount = count;
            modalFreq = freq;
        }
    });
    if (maxCount > 1) {
        return hzToBreathsPerMinute(modalFreq);
    }

    // no frequency appeared more than once; just return the 
    // one with the highest Y value
    let maxY = -Infinity
    let targetX = null
    validFreqs.forEach(({x, y}) => {
        if (y > maxY) {
            maxY = y;
            targetX = x;
        }
    });
    if (!targetX) throw new Error(`No peak with a highest Y value found.`);
    return hzToBreathsPerMinute(targetX);


}

// convert Hz to breaths per minute and round to 1 decimal place
// exported for testing
export function hzToBreathsPerMinute(hz) {
    return Math.round(((hz * 60) * 10) * (1 + Number.EPSILON)) / 10;
}