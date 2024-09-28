import { calculatePersonalizedPace, slowBreathsPerMinute, slowerBreathsPerMinute, hzToBreathsPerMinute } from "../src/utils";

describe("calculatePersonalizedPaces", () => {
    it("should throw an error if the slowOrSlower parameter is not 'slow' or 'slower'", () => {
        expect(() => {
            calculatePersonalizedPace('fastest!',  [
                {slowX: 0.012, slowY: 1.0, slowerX: 2.012, slowerY: 3.0}, 
                {slowX: 0.112, slowY: 1.1, slowerX: 2.112, slowerY: 3.1},
                {slowX: 0.212, slowY: 1.2, slowerX: 2.212, slowerY: 3.2},
                {slowX: 0.312, slowY: 1.3, slowerX: 2.312, slowerY: 3.3},
            ]);
        }).toThrow()
    });

    it("should throw an error if the peakFreqs parameter has a length other than four", () => {
        expect(() => {
            calculatePersonalizedPace('slow', [{slowX: 0.0, slowY: 1.0, slowerX: 2.0, slowerY: 3.0}]);
        }).toThrow();
    });

    it("should return the default slow pace if all of the slow peak frequencies have x values of n/a and the slowOrSlower parameter is 'slow'", () => {
        const pace = calculatePersonalizedPace('slow',  [
            {slowX: 'n/a', slowY: 1.0, slowerX: 2.0, slowerY: 3.0}, 
            {slowX: 'n/a', slowY: 1.1, slowerX: 2.1, slowerY: 3.1},
            {slowX: 'n/a', slowY: 1.2, slowerX: 2.2, slowerY: 3.2},
            {slowX: 'n/a', slowY: 1.3, slowerX: 2.3, slowerY: 3.3},
        ]);
        expect(pace).toBe(slowBreathsPerMinute);
    });

    it("should return the default slower pace if all of the slower peak frequencies have x values of n/a and the slowOrSlower parameter is 'slower'", () => {
        const pace = calculatePersonalizedPace('slower',  [
            {slowX: 0.0, slowY: 1.0, slowerX: 'n/a', slowerY: 3.0}, 
            {slowX: 0.1, slowY: 1.1, slowerX: 'n/a', slowerY: 3.1},
            {slowX: 0.2, slowY: 1.2, slowerX: 'n/a', slowerY: 3.2},
            {slowX: 0.3, slowY: 1.3, slowerX: 'n/a', slowerY: 3.3},
        ]);
        expect(pace).toBe(slowerBreathsPerMinute);
    });

    it("should return the only available frequency if three values are n/a", () => {
        const testPeaks = [
            {slowX: 0.0, slowY: 1.0, slowerX: 'n/a', slowerY: 3.0}, 
            {slowX: 0.1, slowY: 1.1, slowerX: 'n/a', slowerY: 3.1},
            {slowX: 0.2, slowY: 1.2, slowerX: 'n/a', slowerY: 3.2},
            {slowX: 0.3, slowY: 1.3, slowerX: 0.068, slowerY: 3.3},
        ];
        const validPaces = testPeaks.filter(p => p.slowerX !== 'n/a');
        expect (validPaces.length).toBe(1);
        const validPace = validPaces[0];
        const pace = calculatePersonalizedPace('slower',  testPeaks);
        expect(pace).toBe(hzToBreathsPerMinute(validPace.slowerX));
    });

    it("should return the frequency that appears most often", () => {
        const testPeaks = [
            {slowX: 0.012, slowY: 1.0, slowerX: 2.012, slowerY: 3.0}, 
            {slowX: 0.212, slowY: 1.1, slowerX: 2.112, slowerY: 3.1},
            {slowX: 0.212, slowY: 1.2, slowerX: 2.212, slowerY: 3.2},
            {slowX: 0.312, slowY: 1.3, slowerX: 2.312, slowerY: 3.3},
        ];
        const freqCounts = {};
        testPeaks.forEach(p => {
            const count = freqCounts[p.slowX] || 0;
            freqCounts[p.slowX] = count + 1;
        });
        let maxCount = 1;
        let modalFreq = null;
        Object.entries(freqCounts).forEach(([freq, count]) => {
            if (count > maxCount) {
                maxCount = count;
                modalFreq = freq;
            }
        });
        expect(modalFreq).not.toBe(null);
        const pace = calculatePersonalizedPace('slow', testPeaks);
        expect(pace).toBe(hzToBreathsPerMinute(modalFreq));
    });

    it("should return the frequency with the highest Y value if no frequency appears more than once", () => {
        const testPeaks = [
            {slowX: 0.012, slowY: 1.0, slowerX: 2.012, slowerY: 3.0}, 
            {slowX: 0.112, slowY: 1.1, slowerX: 'n/a', slowerY: 3.1},
            {slowX: 0.212, slowY: 1.2, slowerX: 2.212, slowerY: 3.2},
            {slowX: 0.312, slowY: 1.3, slowerX: 2.312, slowerY: 3.3},
        ];
        let maxY = -Infinity;
        let targetX = null;
        testPeaks.forEach(p => {
            if (p.slowerY > maxY) {
                maxY = p.slowerY;
                targetX = p.slowerX;
            }
        });
        expect(targetX).not.toBe(null);
        const pace = calculatePersonalizedPace('slower', testPeaks);
        expect(pace).toBe(hzToBreathsPerMinute(targetX));
    });

    it("should throw an error if there are no valid Y values and no frequency appears more than once", () => {
        const testPeaks = [
            {slowX: 0.012, slowY: 1.0, slowerX: 2.012, slowerY: 'n/a'}, 
            {slowX: 0.112, slowY: 1.1, slowerX: 'n/a', slowerY: 'n/a'},
            {slowX: 0.212, slowY: 1.2, slowerX: 2.212, slowerY: 'n/a'},
            {slowX: 0.312, slowY: 1.3, slowerX: 2.312, slowerY: 'n/a'},
        ];
        expect(() => {
            calculatePersonalizedPace('slower', testPeaks)
        }).toThrow();
    });

});

