const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const prompt = require('prompt');
const { version } = require('os');
// Turn off some defaults in the prompt framework
prompt.message = '';
prompt.delimiter = '';

function getUncommittedFiles() {
    const git = spawnSync('git', ['ls-files', '--modified', '--other', '--exclude-standard']);
    return git.stdout.toString().split('\n');
}

function getUnpushedFiles(branch) {
    const git = spawnSync('git', ['rev-list', 'HEAD', `^origin/${branch}`]);
    return git.stdout.toString();
}

function getBranch() {
    const git = spawnSync('git', ['branch', '--show-current']);
    return git.stdout.toString().trimEnd();
}

function branchOk(deployableBranches) {
    const branch = getBranch();
    return deployableBranches.includes(branch);
}

/**
 * 
 * @param {string} env The target you're deploying to - dev, qa, prod, etc.
 * @param {Object} envConfigFileMap An object that maps target to config file. Must contain the key "deploy"/value config file used in deployment.
 * @returns 
 */
function envSettingsOk(env, envConfigFileMap) {
    const envFile = envConfigFileMap[env];
    if (!envFile) {
        throw new Error(`No settings file found for ${env}.`);
    }
    const diff = spawnSync('diff', [envFile, envConfigFileMap['deploy']]);
    return diff.stdout.toString().length === 0 && diff.stderr.toString().length === 0;
}

/**
 * Checks git for the latest tag starting with prefix.
 * @param {string} prefix The prefix for the type of version tag you're interested in, e.g. "base-app-". Can use limited regex patterns, and will always get '*' appended to it.
 * @returns 
 */
function getCurGitVersion(prefix) {
    const prefixPat = prefix + '*';
    const git = spawnSync('git', ['tag', '-l', '--sort=v:refname', prefixPat]);
    if (git.stdout.toString() === '') return '0.0.0';
    let tag = git.stdout.toString().split('\n').filter(f => f !== '').pop();
    if (prefix) tag = tag.replace(prefix, '');
    return tag;
}

function getCurVersionFromFile(versionFile) {
    const version = require(versionFile);
    return version.v;
}

function incrementVersion(curVersion, whichPart) {
    if (whichPart !== 'major' && whichPart !== 'minor' && whichPart !== 'patch') throw new Error(`Expected one of 'major', 'minor' or 'patch', but got ${whichPart}.`);

    const parts = curVersion.split('.');
    if (parts.length !== 3) throw new Error(`Expected current version to be in the form X.Y.Z, but got ${curVersion}`);

    if (whichPart === 'major') {
        return `${+parts[0] + 1}.0.0`;
    }
    if (whichPart === 'minor') {
        return `${parts[0]}.${+parts[1] + 1}.0`;
    }
    if (whichPart === 'patch') {
        return `${parts[0]}.${parts[1]}.${+parts[2] + 1}`;
    }
}

function requestVersion(curVersion, suggestedVersion) {
    const schema = {
        properties: {
            version: {
                conform: function(v) {
                    // TODO check that it's not lower than the current version
                    if (v === curVersion) return false;
                    if (!/[0-9]+\.[0-9]+\.[0-9]+/.test(v)) return false;
                    return true;
                },
                message: 'You must provide a valid version of the form X.Y.Z (different from the current version)',
                description: `Next version [${suggestedVersion}]:`,
                required: false
            }
        }
    };
    return new Promise((resolve, reject) => {
        prompt.get(schema, function(err, result) {
            if (err) {
                reject(err);
            } else {
                if (result.version === '') {
                    resolve(suggestedVersion);
                } else {
                    resolve(result.version);
                }
            }
        });
    });       
}

function writeVersionFile(version, targetFile) {
    return new Promise((resolve, reject) => {
        fs.writeFile(targetFile, JSON.stringify(version), err => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}


function runWithErrorHandling(cmd, cmdArgs) {
    const result = spawnSync(cmd, cmdArgs);
    if (result.status !== 0 || result.error) {
        const errMsg = `${cmd} ${cmdArgs.join(' ')} exited with status ${result.status}`;
        console.log(result.stderr.toString());
        if (result.error) {
            throw result.error;
        } else {
            throw new Error(errMsg);
        }
    }
}

/**
 * Commits versionFile to git, reads version from it and creates git tag with that version.
 * @param {string} versionFile 
 */
function gitTagVersion(versionFile, prefix, commitMsg) {
    let curVersion = getCurVersionFromFile(versionFile);
    if (prefix) curVersion = prefix + curVersion;
    runWithErrorHandling('git', ['commit', '-m', commitMsg, versionFile]);
    runWithErrorHandling('git', ['tag', '-a', curVersion, '-m', `Bumping to version ${curVersion}`]);
}

/**
 * Checks to make sure that the following are true. Throw an error if any are false:
 * 
 *  * There are no untracked files in the current directory hierarchy
 *  * There are no uncommitted files in the current directory hierarchy
 *  * There are no staged but unpushed commits
 *  * All of the values in aws-settings are approprite for the target deployment environment.
 * @param {string} targetEnv The environment you're trying to deploy to, e.g. 'dev', 'prod', 'qa', etc.
 * @param {Object} settingsFiles Map of environment -> config file for environment. Must include 
 * @param {Array<string} deployableBranches 
 * @returns 
 */
function preDeployCheckOK(targetEnv, settingsFiles, deployableBranches) {
    const uncommitted = getUncommittedFiles();
    if (uncommitted.length !== 0 && uncommitted[0] !== '') {
        throw new Error(`Found uncommitted files. Please remove or commit before deploying:\n ${uncommitted.join(", ")}`);
    }

    const curBranch = getBranch();
    const unpushed = getUnpushedFiles(curBranch);
    if (unpushed.length !== 0) {
        throw new Error(`Unpushed commits exist. Please push before deploying.`);
    }

    if (!envSettingsOk(targetEnv, settingsFiles)) {
        throw new Error(`The settings in ${settingsFiles['deploy']} are not as expected for deploying to ${targetEnv}. Deployment halted.`);
    }

    if (!branchOk(deployableBranches)) {
        throw new Error(`You are on branch ${curBranch}, which is not a permitted deployment branch.\nPlease make sure that what you want to deploy is on a deployment branch and switch to it.`);
    }

    return true;
}

module.exports = { 
    getBranch,
    getUncommittedFiles,
    getUnpushedFiles,
    branchOk,
    envSettingsOk,
    getCurGitVersion,
    getCurVersionFromFile,
    incrementVersion,
    requestVersion,
    writeVersionFile,
    gitTagVersion,
    preDeployCheckOK
}