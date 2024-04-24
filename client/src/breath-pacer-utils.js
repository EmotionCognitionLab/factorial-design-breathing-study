function makeRange(low, high, increment) {
    const res = [];
    for (let i=low; i<=high; i+=increment) {
        res.push(i);
    }
    return res;
}

function validateRegime(regime) {
    if (regime.breathsPerMinute < 1) {
        throw new Error('The minimum breaths per minute is 1.');
    }
    if (regime.breathsPerMinute > 60) {
        throw new Error('The maximum breaths per minute is 60.');
    }
    if (regime.durationMs < 10000) {
        throw new Error('The minimum duration is 10000 (10 seconds).');
    }
    const msPerBreath = ( 60 / regime.breathsPerMinute) * 1000;
    if (regime.durationMs < msPerBreath) {
        throw new Error('The minmimum number of breaths during the total duration is 1.');
    }
}

export default {
     /**
     * Given a regime that defines how long someone is supposed to breathe, the pace they should breathe at,
     * where they should hold their breath (if at all) and whether the inhalation/exhalation durations
     * should be randomized, returns an array of breath part objects. Each breath object will have the fields
     * durationMs (the number of milliseconds the breath should last) and breathType ('inhale', 'exhale' or 'hold').
     * 
     * If the regime is not randomized, each inhalation, exhalation, and (optionally) hold will be 
     * same length for a given regime. That length will be either 1/2 (if there is no hold) or 1/3
     * (if there is a hold) of the time that a total breath should last, based on the number of breaths
     * per minute and the total duration of the regime. 
     * 
     * If the regime is randomized, each inhalation, exhalation, and (optionally) hold will be a random
     * duration within a given range. The range is +/- 1 second (if no hold) or +/- 0.66 seconds (if 
     * there is a hold) around the length that the inhalation/exhalation/hold would be in the non-random case.
     * 
     * It is possible to describe a regime that results in a non-integral number of breaths. In this case
     * the number of breaths will be increased to the next whole number, resulting in a slightly longer
     * regime than requested. (And, of course, a slightly different number of breaths per minute than
     * requested.)
     * 
     * Randomization can also result in a regime that is slightly longer or slightly shorter than requested,
     * as well as a number of breaths per minute that is higher or lower than requested, though if the regime duration
     * is long enough the average number of breaths per minute over the course of the whole duration should
     * work out to be close the requested number.
     * 
     * @param {{durationMs: number, breathsPerMinute: number, holdPos: null|'postInhale'|'postExhale', randomize: boolean}} regime 
     */
    regimeToBreaths(regime) {
        validateRegime(regime);
        const segmentsPerBreath = regime.holdPos ? 3 : 2;
        const msPerBreath = (60 / regime.breathsPerMinute) * 1000;
        const baseSegmentDur = msPerBreath / segmentsPerBreath;
        const totalBreaths = Math.ceil(regime.durationMs / msPerBreath);
        // per spec, range should be +/- 2 seconds of total breath length and the minimum difference between any 
        // two lengths should be 100ms
        const randomSegRange = makeRange(baseSegmentDur - (2000 / segmentsPerBreath), baseSegmentDur + (2000 / segmentsPerBreath), (100 / segmentsPerBreath));
        const segmentDuration = () => {
            if (!regime.randomize) return baseSegmentDur;

            const rand = Math.floor(Math.random() * randomSegRange.length);
            return randomSegRange[rand];        
        }
        const breaths = [];
        
        for (let i=0; i<totalBreaths; i++) {
            // always start with inhalation
            breaths.push({durationMs: segmentDuration(), breathType: 'inhale'});
            if (regime.holdPos === 'postInhale') breaths.push({durationMs: segmentDuration(), breathType: 'hold'});
            breaths.push({durationMs: segmentDuration(), breathType: 'exhale'});
            if (regime.holdPos === 'postExhale') breaths.push({durationMs: segmentDuration(), breathType: 'hold'});
        }

        return breaths;
    }

}

