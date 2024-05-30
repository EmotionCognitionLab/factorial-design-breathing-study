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

function parseSessionData(sessions) {
    const results = [];
    for (let s of sessions) {
        if (s.LiveIBI) {
            const liveIBI = [];
            for (let i = 0; i<s.LiveIBI.length; i+=2) {
                const b = new ArrayBuffer(2);
                const bytes = new Uint8Array(b);
                bytes[0] = s.LiveIBI[i];
                bytes[1] = s.LiveIBI[i+1];
                const intView = new Int16Array(b);
                liveIBI.push(intView[0]);
            }
            s['liveIBI'] = liveIBI;
            delete s.LiveIBI; 
        }

        results.push(s);
    }

    return results;
}

/**
 * Returns the emWave SessionUuid and (optionally) LiveIBI values for all sessions
 * since sinceDateTime. Excludes deleted sessions.
 * @param {Number} sinceDateTime date/time (in sec since the epoch) value for the earliest session to extract or -1 to get only most recent session.
 */
 function extractSessionData(sinceDateTime, includeLiveIBI=false) {
    let results;
    const db = new Database(emWaveDbPath(), {fileMustExist: true })
    let columnsToFetch = 'SessionUuid as sessionUuid, PulseStartTime as pulseStartTime, AvgCoherence as avgCoherence, ValidStatus as validStatus, PulseEndTime-PulseStartTime as durationSec';
    if (includeLiveIBI) columnsToFetch += ', LiveIBI'
    try {
        const stmt = sinceDateTime == -1 ?
            db.prepare(`select ${columnsToFetch} from Session s where s.DeleteFlag is null order by s.IBIStartTime desc limit 1`) :
            db.prepare(`select ${columnsToFetch} from Session s where s.IBIStartTime >= ? and s.DeleteFlag is null`);

        let sessions;
        if (sinceDateTime == -1) {
            sessions = stmt.all();
        } else {
            sessions = stmt.all(sinceDateTime);
        }

        results = parseSessionData(sessions);
    } finally {
        db.close();
    }
    return results;
}

/**
 * Given an array of emWave session uuid's, returns the data associated with those sessions.
 * Will not return the data for sessions where the DeleteFlag is not null or the
 * ValidStatus is not 1.
 * Note that the array of uuid's is not escaped or bound - do not pass user input to this function.
 * @param {[string]} sessions 
 * @returns {[object]}
 */
function getDataForSessions(sessions) {
    let results;
    const db = new Database(emWaveDbPath(), {fileMustExist: true });
    const sessionIds = sessions.map(s => `'${s}'`).join(",");
    try {
        const stmt = db.prepare(`select SessionUuid as sessionUuid, PulseStartTime as pulseStartTime, AvgCoherence as avgCoherence, ValidStatus as validStatus, PulseEndTime-PulseStartTime as durationSec, LiveIBI from Session s where s.DeleteFlag is null and s.ValidStatus = 1 and SessionUuid in (${sessionIds})`);
        const sessions = stmt.all();
        results = parseSessionData(sessions);
    } finally {
        db.close()
    }
    return results;
}

export { deleteShortSessions, emWaveDbPath, extractSessionData, getDataForSessions }