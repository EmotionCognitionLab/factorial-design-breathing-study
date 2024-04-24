'use strict';

/** 
 * Usage: node tag-deploy.js
 * 
 * Reads the current version from version.json, commits the version.json
 * file to git, creates a git tag with that version and optionally
 * pushes the version file (and new tag) to the remote repository.
*/
const path = require('path');
const { spawnSync } = require('child_process');
const { gitTagVersion, getCurVersionFromFile } = require('deploytools');
const versionFile = path.join(__dirname, '../version.json');

const prompt = require('prompt');
// Turn off some defaults in the prompt framework
prompt.message = '';
prompt.delimiter = '';

function requestYesNo(msg) {
    const schema = {
        properties: {
            continue: {
                pattern: /[yYnN]/,
                message: 'Please answer Y (yes) or N (no):',
                description: msg,
                required: true
            }
        }
    };
    return new Promise((resolve, reject) => {
        prompt.get(schema, function(err, result) {
            if (err) {
                reject(err);
            } else {
                resolve(result.continue);
            }
        });
    });
}

const curVer = getCurVersionFromFile(versionFile);
console.log(`Current version is ${curVer}`);
gitTagVersion(versionFile, '', `Updating site version to ${curVer}`);

requestYesNo('Push new version (and version tag) to remote repository? (Y/N):')
.then(answer => {
    if (answer.toUpperCase() === 'Y') {
        const gitPush = spawnSync('git', ['push', '--tags'], {stdio: 'inherit'}); // TODO decide what to do about branches
        if (gitPush.status !== 0 || gitPush.error) {
            const gitPushErr = `git push exited with status ${gitPush.status}`;
            console.log(gitPush.stderr);
            if (gitPush.error) {
                throw gitPush.error;
            } else {
                throw new Error(gitPushErr);
            }
        }
    }
})
.catch(err => {
    console.log(err);
    process.exit(1);
});
