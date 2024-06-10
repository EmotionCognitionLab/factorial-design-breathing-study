import { emoPics } from '../src/utils.js';
import * as bd from "../src/breath-data";

jest.mock('fs/promises', () => ({
    mkdir: jest.fn(() => {})
}));

jest.mock('electron', () => {
    return { ipcMain: { on: jest.fn(), handle: jest.fn() }}
});


let db;
const tableNames = ['key_value_store', 'emwave_sessions'];

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

    it("getNextEmoPic should return the emotional picture with the fewest views", () => {
        for (let i=1; i<emoPics.length; i++) {
            bd.saveEmWaveSessionData(`a${i}`, 1.19, 17136543, 1, 900, 2, emoPics[i]);
        }
        const nextPic = bd.getNextEmoPic();
        expect(nextPic).toBe(emoPics[0]);
    });

    it("getNextEmoPic should handle the case where multiple pictures have the fewest views", () => {
        const startIdx = 3;
        expect(startIdx).toBeLessThan(emoPics.length);
        for (let i=startIdx; i<emoPics.length; i++) {
            bd.saveEmWaveSessionData(`a${i}`, 1.19, 17136543, 1, 900, 2, emoPics[i]);
        }
        const nextPic = bd.getNextEmoPic();
        const expectedPossiblePics = emoPics.slice(0, startIdx);
        expect(expectedPossiblePics).toContain(nextPic);
    });

});