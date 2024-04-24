import { std, sqrt } from 'mathjs';
import { earningsTypes } from '../../common/types/types.js';
import * as bd from "../src/breath-data";

jest.mock('fs/promises', () => ({
    mkdir: jest.fn(() => {})
}));

jest.mock('electron', () => {
    return { ipcMain: { on: jest.fn(), handle: jest.fn() }}
});

import { mkdir } from 'fs/promises';

let db;
const tableNames = ['segments', 'rest_segments', 'regimes']; // order is important to avoid foreign key constraint errors on delete

function cleanDb() {
    tableNames.forEach(t => db.exec(`DELETE from ${t}`));
}

function rowCount(tableName) {
    const stmt = db.prepare(`select count(*) from ${tableName}`);
    return stmt.get()["count(*)"];
}

describe("Breathing data functions", () => {
    
    beforeAll(async () => {
        jest.spyOn(bd, "breathDbPath").mockImplementation(() => ":memory:");
        jest.spyOn(bd, "breathDbDir").mockImplementation(() => "/dev/null");
        const downloadSpy = jest.spyOn(bd.forTesting, "downloadDatabase");
        downloadSpy.mockImplementation(() => {});
        db = await bd.forTesting.initBreathDb({
            tokenScopes: {

            },
            idToken: {
                jwtToken: ""
            },
            accessToken: {
                jwtToken: ""
            },
            refreshToken: {
                jwtToken: ""
            },
        });
        expect(downloadSpy).toHaveBeenCalled();
    });

    afterAll(() => {
        bd.closeBreathDb();
    });

    beforeEach(() => {
        cleanDb();
        tableNames.forEach(t => {
            expect(rowCount(t)).toBe(0);
        });
    });

    it("should use an in-memory database in test", () => {
        const path = bd.breathDbPath();
        expect(path).toBe(":memory:");
    });

    it("should set the bonus_date to 1970-01-01 for the lumosity and breath bonuses", () => {
        const stmt = db.prepare('select bonus_type, bonus_date from bonus_msg_display_dates');
        const res = stmt.all();
        expect(res).toContainEqual({ bonus_type: earningsTypes.LUMOS_BONUS, bonus_date: '1970-01-01' });
        expect(res).toContainEqual({ bonus_type: earningsTypes.BREATH_BONUS, bonus_date: '1970-01-01' });
    });

    it("should insert a row for a regime that doesn't exist when getRegimeId is called", () => {
        const id = bd.getRegimeId({durationMs: 300000, breathsPerMinute: 12, randomize: false});
        const stmt = db.prepare('select id from regimes');
        const res = stmt.all();
        expect(res.length).toBe(1);
        expect(res[0]["id"]).toBe(id);
    });

    it("should set the end_date_time to the current time when createSegment is called", () => {
        const date = new Date(2020, 1, 22, 3, 4, 5);
        const dateSpy = jest.spyOn(global, "Date").mockImplementation(() => date);
        const regime = {
            regime: { durationMs: 300000, breathsPerMinute: 12, randomize: false },
            sessionStartTime: 0,
            avgCoherence: 2.3
        };
        const stage = 1;
        const segId = bd.forTesting.createSegment(regime, stage);
        expect(dateSpy).toHaveBeenCalled();
        dateSpy.mockRestore();
        const segStmt = db.prepare("select * from segments where id = ?");
        const seg = segStmt.get(segId);
        const expectedEndDateTime = date.getTime() / 1000;
        expect(seg["end_date_time"]).toBe(expectedEndDateTime);
    });

    it("should insert the regime associated with a segment when createSegment is called", () => {
        const regime = {
            regime: { durationMs: 300000, breathsPerMinute: 12, randomize: false },
            sessionStartTime: 0,
            avgCoherence: 2.3
        };
        const stage = 3;
        bd.forTesting.createSegment(regime, stage);
        const stmt = db.prepare('select * from regimes');
        const res = stmt.all();
        expect(res.length).toBe(1);
        const savedReg = res[0];
        expect(savedReg["duration_ms"]).toBe(regime.regime.durationMs);
        expect(savedReg["breaths_per_minute"]).toBe(regime.regime.breathsPerMinute);
        expect(savedReg["randomize"]).toBe(regime.regime.randomize ? 1 : 0);
        expect(savedReg["hold_pos"]).toBe(null);
    });

    it("should not insert the regime associated with a segment when createSegment is called if the regime already exists", () => {
        const regime = {
            regime: { durationMs: 300000, breathsPerMinute: 12, randomize: false },
            sessionStartTime: 0,
            avgCoherence: 2.3
        };
        bd.getRegimeId(regime.regime);
        bd.forTesting.createSegment(regime, 2);
        const stmt = db.prepare('select * from regimes');
        const res = stmt.all();
        expect(res.length).toBe(1);
    });

    it("should return the average of all of the rest segment avg_coherence values when getAvgRestCoherence is called", () => {
        const cohValues = [3.2, 2.9, 7, 3.3, 4.7, 5, 2.2];
        const stmt = db.prepare("INSERT INTO rest_segments(end_date_time, avg_coherence, stage) VALUES(?, ?, ?)");
        const stage = 2;
        cohValues.forEach(coh => {stmt.run(0, coh, stage)});
        const expectedMean = cohValues.reduce((prev, cur) => prev + cur, 0) / cohValues.length;
        const avgRestCoherence = bd.getAvgRestCoherence(stage);
        expect(avgRestCoherence).toBeCloseTo(expectedMean);
    });

    it.only("should return the ids of all regimes EXCEPT for non-random 15bpm (which is only in stage 1) when getAllRegimeIds is called", () => {
        const insertRegimeStmt = db.prepare('INSERT INTO regimes(duration_ms, breaths_per_minute, hold_pos, randomize) VALUES(?, ?, ?, ?)');
        const regimes = [
            {durationMs: 300000, breathsPerMinute: 4, holdPos: null, randomize: 0},
            {durationMs: 300000, breathsPerMinute: 5, holdPos: null, randomize: 0},
            {durationMs: 300000, breathsPerMinute: 6, holdPos: null, randomize: 1},
            {durationMs: 300000, breathsPerMinute: 15, holdPos: null, randomize: 0},
            {durationMs: 300000, breathsPerMinute: 15, holdPos: null, randomize: 1}
        ];
        const regimeIds = regimes.map(r => insertRegimeStmt.run(r.durationMs, r.breathsPerMinute, r.holdPos, r.randomize).lastInsertRowid);
        expect(regimeIds.length).toBe(regimes.length);
        const regimesWithIds = regimeIds.map((id, idx) => ({id: id, ...regimes[idx]}));
        const expectedRegimeIds = regimesWithIds.filter(r => r.breathsPerMinute != 15 || r.randomize != 0).map(r => r.id);
        const allRegimeIds = bd.getAllRegimeIds(3);
        expect(allRegimeIds).toEqual(expectedRegimeIds);
    });

    it("should return the right statistics when getRegimeStats is called", () => {
        const regime = {
            durationMs: 300000,
            breathsPerMinute: 12,
            holdPos: "postExhale",
            randomize: false
        };
        const cohValues = [1.1, 2., 7.5, 3.9, 3.34, 5, 4.2];
        const stage = 3;
        cohValues.forEach(coh => bd.forTesting.createSegment({regime: regime, avgCoherence: coh, sessionStartTime: 0}, stage));
        const regimeId = bd.getRegimeId(regime);
        const stats = bd.getRegimeStats(regimeId, stage);
        const expectedAvg = cohValues.reduce((prev, cur) => prev+cur, 0) / cohValues.length;
        expect(stats.mean).toBeCloseTo(expectedAvg);
        const stdDev = std(cohValues);
        const interval = (1.645*stdDev) / sqrt(cohValues.length - 1);
        expect(stats.low90CI).toBeCloseTo(expectedAvg - interval);
        expect(stats.high90CI).toBeCloseTo(expectedAvg + interval);
    });

    it("getTrainingDayCount should return 0 when the user has done no training", () => {
        expect(bd.getTrainingDayCount(3)).toBe(0);
    });

    it("getTrainingDayCount should return 0 when the only training the user has done is today", () => {
        const segment = {
            regime: { durationMs: 300000, breathsPerMinute: 12, randomize: false },
            sessionStartTime: 0,
            avgCoherence: 2.3
        };
        const stage = 3;
        bd.forTesting.createSegment(segment, stage);
        expect(rowCount('segments')).toBe(1);
        expect(bd.getTrainingDayCount(stage)).toBe(0);
    });

    it("getTrainingDayCount should coalesce multiple sessions in one day so that that day is counted only once", () => {
        const regime = { durationMs: 300000, breathsPerMinute: 12, randomize: false };
        const coherences = [1.2, 2.7, 2.2, 1.9];
        const stage = 3;
        coherences.forEach(avgCoh => {
            const seg = {regime: regime, avgCoherence: avgCoh, sessionStartTime: Math.floor(Math.random() * 1000)};
            bd.forTesting.createSegment(seg, stage);
        });
        
        const stmt = db.prepare('SELECT id from segments');
        const segIds = stmt.all().map(s => s['id']);
        expect(segIds.length).toBe(coherences.length);

        const updateStmt = db.prepare('UPDATE segments set end_date_time = ? where id = ?');
        const d1 = new Date(2022, 3, 2, 19, 27, 2);
        const d2 = new Date(d1); d2.setSeconds(54);
        const d3 = new Date(2022, 4, 17, 8, 13, 43);
        const d4 = new Date(d3); d3.setMinutes(34);
        const dates = [d1, d2, d3, d4];
        dates.forEach((d, idx) => updateStmt.run(d.getTime() / 1000, segIds[idx]));
        const datesAsDays = dates.map(theDate => `${theDate.getFullYear()}${(theDate.getMonth() + 1).toString().padStart(2,0)}${theDate.getDate().toString().padStart(2, 0)}`);
        const expectedDays = new Set(datesAsDays).size;

        expect(bd.getTrainingDayCount(stage)).toBe(expectedDays);
    });

    it("getSegmentsAfterDate should return segments for the given stage", () => {
        const regime = { durationMs: 300000, breathsPerMinute: 12, randomize: false };
        const segs = [
            { seg: {avgCoherence: 1, sessionStartTime: 1000}, stage: 1 },
            { seg: {avgCoherence: 2, sessionStartTime: 2000}, stage: 2 },
            { seg: {regime: regime, avgCoherence: 3, sessionStartTime: 3000}, stage: 3 },
        ];
        
        segs.forEach(s => bd.forTesting.createSegment(s.seg, s.stage));
        const startDate = new Date(0);
        const stages = [1,2,3];
        stages.forEach(stage => {
            const segResults = bd.getSegmentsAfterDate(startDate, stage);
            expect(segResults.length).toBe(1);
            const curSeg = segResults[0];
            expect(curSeg.avgCoherence).toBe(segs[stage - 1].seg.avgCoherence);
            expect(curSeg.stage).toBe(segs[stage - 1].stage);
            if (stage == 3) {
                expect(curSeg.regimeId).toBeDefined();
                expect(curSeg.regimeId).not.toBeNull();
                expect(curSeg.sessionStartTime).toBe(segs[stage - 1].seg.sessionStartTime);
            }
        });
    });
});