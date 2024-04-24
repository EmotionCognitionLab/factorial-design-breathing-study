import Database from 'better-sqlite3'
import { ipcMain, app } from 'electron'
import { Logger } from 'logger'

let logger

ipcMain.on('current-user', async (_event, user) => {
    logger = new Logger(false, user);
    await logger.init()
});

function emWaveDbPath() {
    let emWaveDbPath;
    const userHome = app.getPath('home')
    if (process.platform === 'darwin') {
        emWaveDbPath = userHome +  '/Documents/emWave/emWave.emdb';
    } else if (process.platform === 'win32') {
        emWaveDbPath = userHome + '\\Documents\\emWave\\emWave.emdb';
    } else {
        throw `The '${process.platform}' operating system is not supported. Please use either Macintosh OS X or Windows.`;
    }

    return emWaveDbPath;
}

function deleteShortSessions() {
    const db = new Database(emWaveDbPath(), {fileMustExist: true }) //nativeBinding: '../client/node_modules/better-sqlite3/build/Release/better_sqlite3.node'});
    try {
        const shortSessionLength = 3 * 60; // we delete all sessions less than or equal to 4 minutes long
        const deleteStmt = db.prepare(`select FirstName, datetime(IBIStartTime, 'unixepoch', 'localtime') as start, datetime(IBIEndTime, 'unixepoch', 'localtime') as end from Session join User on Session.UserUuid = User.UserUuid where IBIEndTime - IBIStartTime <= ${shortSessionLength}`);
        const toDelete = deleteStmt.all();
        for (let shortSession of toDelete) {
            logger.log(`Deleting short session for user ${shortSession.FirstName} that runs from ${shortSession.start} to ${shortSession.end}.`);
        }
        const stmt = db.prepare(`delete from Session where IBIEndTime - IBIStartTime <= ${shortSessionLength}`);
        stmt.run();
    } finally {
        db.close();
    }
}

/**
 * Returns the emWave SessionUuid, LiveIBI and EntrainmentParameter values for all sessions
 * since sinceDateTime. Excludes deleted and invalid sessions.
 * TODO: Break the data into five minute segements.
 * @param {Number} sinceDateTime date/time (in ms since the epoch) value for the earliest session to extract
 */
 function extractSessionData(sinceDateTime) {
    const db = new Database(emWaveDbPath(), {fileMustExist: true })
    const results = [];
    try {
        const stmt = db.prepare(`select SessionUuid, LiveIBI, EntrainmentParameter from Session s where s.IBIStartTime >= ? and s.ValidStatus = 1 and s.DeleteFlag is null`);
        const sessions = stmt.all(sinceDateTime);
        for (let s of sessions) {
            const r = {sessionId: s.SessionUuid};

            const coherence = [];
            for (let i = 0; i<s.EntrainmentParameter.length; i+=4) {
                const b = new ArrayBuffer(4);
                const bytes = new Uint8Array(b);
                for (let j = 0; j<4; j++) {
                    bytes[j] = s.EntrainmentParameter[i+j];
                }
                const floatView = new Float32Array(b);
                coherence.push(Math.log(1 + floatView[0])); // coherence is ln(1 + entrainment param)
            }
            r['coherence'] = coherence;

            const liveIBI = [];
            for (let i = 0; i<s.LiveIBI.length; i+=2) {
                const b = new ArrayBuffer(2);
                const bytes = new Uint8Array(b);
                bytes[0] = s.LiveIBI[i];
                bytes[1] = s.LiveIBI[i+1];
                const intView = new Int16Array(b);
                liveIBI.push(intView[0]);
            }
            r['liveIBI'] = liveIBI;

            results.push(r);
        }
    } finally {
        db.close();
    }
    return results;
}

export { deleteShortSessions, emWaveDbPath, extractSessionData }