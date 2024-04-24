import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } from "@aws-sdk/client-cognito-identity"
import { createReadStream, createWriteStream } from 'fs'
import { parse } from 'path'
import awsSettings from '../../common/aws-settings.json'

let session;

function getDefaultS3Target(subId, identityId, fileName) {
    const userDataBucket = awsSettings.UserDataBucket;
    return { bucket: userDataBucket, key: `${subId}/${identityId}/${fileName}`}
}

function getIdToken() {
    return session.getIdToken().getJwtToken();
}

async function getIdentityId(idToken) {
    const logins =  { [`cognito-idp.${awsSettings.AWSRegion}.amazonaws.com/${awsSettings.UserPoolId}`]: idToken };
    const getIdInput = {
        IdentityPoolId: awsSettings.IdentityPoolId,
        Logins: logins
    };
    const cognitoClient = new CognitoIdentityClient({region: awsSettings.AWSRegion });
    const getIdCmd = new GetIdCommand(getIdInput);
    let identityId;
    try {
        identityId = (await cognitoClient.send(getIdCmd)).IdentityId;
    } catch (err) {
        console.error(err);
        throw(err);
    }

    return identityId;
}

async function getUserId() {
    const idToken = getIdToken();
    const identityId = await getIdentityId(idToken);

    return identityId;
}

async function getCredentials() {
    const cognitoClient = new CognitoIdentityClient({region: awsSettings.AWSRegion });
    let credentials;
    try {
        const idToken = getIdToken();
        const identityId = await getIdentityId(idToken);
        const logins =  { [`cognito-idp.${awsSettings.AWSRegion}.amazonaws.com/${awsSettings.UserPoolId}`]: idToken };
        const getCredsInput = {
            IdentityId: identityId,
            Logins: logins
        }
        const getCredsCmd = new GetCredentialsForIdentityCommand(getCredsInput);
        const cognitoCreds = await cognitoClient.send(getCredsCmd);
        credentials = cognitoCreds.Credentials;
    } catch (err) {
        console.error(err);
        throw(err);
    }

    return credentials;
}

async function getS3Client() {
    let s3Client = null;
    try {
        const credentials = await getCredentials();
        s3Client = new S3Client({region: awsSettings.AWSRegion, credentials: {
            accessKeyId: credentials.AccessKeyId,
            secretAccessKey: credentials.SecretKey,
            expiration: credentials.Expiration,
            sessionToken: credentials.SessionToken
        }});
    } catch (err) {
        console.error(err);
        throw(err);
    }

    return s3Client;
}

// returns the last modified date (in ms since start of epoch) of the object at the given bucket/ket
// returns 0 if the object isn't found
// async function getLastUploadDate(s3Client, bucket, key) {
//     const cmd = new HeadObjectCommand({Bucket: bucket, Key: key});
//     const resp = await s3Client.send(cmd);
//     if (resp.$metadata.httpStatusCode !== 200) {
//         if (resp.$metadata.httpStatusCode === 404) {
//             return 0;
//         }
//         throw new Error(`Getting last upload date failed with status code ${resp.$metadata.httpStatusCode}`);
//     }
//     const d = new Date(resp.LastModified);
//     return d.getTime();
// }

export default {
    /**
     * Uploads a file from the local file system to s3.
     * @param {Object} authSession CognitoAuthSession
     * @param {string} localFileSrc path on local file system to file to upload 
     * @param {Object} s3Dest Object with bucket and key members. If not provided will default to the UserDataBucket for the application and the key will be the user's own S3 path combined with the name of the local file.
     */
    async uploadFile(authSession, localFileSrc, s3Dest) {
        session = authSession;
        const identityId = await getUserId();
        const subId = (session.getIdToken().decodePayload())['sub']
        let bucket, key;
        if (!s3Dest || !s3Dest.hasOwn('bucket') || !s3Dest.hasOwn('key')) {
            const pathParts = parse(localFileSrc);
            ({bucket, key} = getDefaultS3Target(subId, identityId, pathParts.base));
        } else {
            bucket = s3Dest.bucket;
            key = s3Dest.key;
        }
        const s3Client = await getS3Client();
        const readStream = createReadStream(localFileSrc);
        const cmd = new PutObjectCommand({Bucket: bucket, Key: key, Body: readStream });
        const resp = await s3Client.send(cmd);
        if (resp.$metadata.httpStatusCode !== 200) {
            throw new Error(`Upload failed with status code ${resp.$metadata.httpStatusCode}`);
        }
    },

    /**
     * Downloads a file from s3 to the local file system. Returns an object with status and msg fields describing the download result.
     * @param {Object} authSession CognitoAuthSession
     * @param {string} localFileDest path on the local file system where the downloaded file should be saved
     * @param {Object} s3Src Object with bucket and key members. If not provided will default to the UserDataBucket for the application and the key will be the user's own S3 path combined with the name of the local file.
     */
    async downloadFile(authSession, localFileDest, s3Src) {
        session = authSession;
        try {
            const identityId = await getUserId();
            const subId = (session.getIdToken().decodePayload())['sub']
            let bucket, key;
            if (!s3Src || !s3Src.hasOwn('bucket') || !s3Src.hasOwn('key')) {
                const pathParts = parse(localFileDest);
                ({bucket, key} = getDefaultS3Target(subId, identityId, pathParts.base));
            } else {
                bucket = s3Src.bucket;
                key = s3Src.key;
            }
            const s3Client = await getS3Client();
            const cmd = new GetObjectCommand({Bucket: bucket, Key: key});
            const resp = await s3Client.send(cmd);
            if (resp.$metadata.httpStatusCode === 404 || resp.$metadata.httpStatusCode === 403) {
                // because we don't grant ListBucket perms we can expect to get 403 instead of 404
                return {status: 'Not found', msg: null };
            }
            if (resp.$metadata.httpStatusCode !== 200) {
                return {status: 'Error', msg: `Download attempt failed with http status code ${resp.$metadata.httpStatusCode}.`};
            }
            resp.Body.on('error', (err) => {
                console.error(`Error trying to download ${bucket}://${key}`, err);
                writeStream.close();
                throw err;
            });
            const writeStream = createWriteStream(localFileDest);
            resp.Body.pipe(writeStream);
            return await new Promise(resolve => {
                writeStream.on('end', () => {
                    resolve({ status: 'Complete', msg: 'Download successful'});
                });
            });
        } catch (err) {
            if (err.name === 'AccessDenied' && Object.prototype.hasOwnProperty.call(err, '$metadata') && err.$metadata.httpStatusCode && err.$metadata.httpStatusCode === 403) {
                // Since we don't grant ListBucket perms we get a 403 instead of a 404 
                // when the file doesn't exist
                return {status: 'Not found', msg: null };
            } else {
                throw(err);
            }
        }
        
    }
}


