'use strict';
const path = require('path');
/** 
 * Usage: version-deploy.js
 * 
 * Asks what the next version number should be and writes it to version.json.
*/

const { getCurGitVersion, incrementVersion, requestVersion, writeVersionFile } = require('deploytools');
const prompt = require('prompt');
// Turn off some defaults in the prompt framework
prompt.message = '';
prompt.delimiter = '';

const versionFile = path.join(__dirname, '../version.json');

const curGitVersion = getCurGitVersion('[0-9]*');
const patch = incrementVersion(curGitVersion, 'patch');
console.log(`Current git version is ${curGitVersion}`);
requestVersion(curGitVersion, patch)
.then(newGitVersion => writeVersionFile({v: newGitVersion}, versionFile))
.catch(err => {
    console.log(err);
    process.exit(1);
});
