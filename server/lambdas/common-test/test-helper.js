'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
import { S3Client, 
    PutObjectCommand, 
    DeleteObjectCommand, 
    CreateBucketCommand, 
    HeadBucketCommand,
    DeleteBucketCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand } from '@aws-sdk/client-s3'
const s3Client = new S3Client({endpoint: process.env.S3_ENDPOINT, apiVersion: '2006-03-01', forcePathStyle: true, region: process.env.REGION});
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb'

const dynamoClient = new DynamoDBClient({endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: '2012-08-10', region: process.env.REGION})

module.exports = {
    s3: {
        addFile: async (bucket, key, data) => {
            let bucketExists = false;
            try {
                await s3Client.send(new HeadBucketCommand({Bucket: bucket}));
                bucketExists = true;
            } catch (err) {
                if (err.statusCode == 403) {
                    throw new Error(`Bucket ${bucket} already exists and you don't have permission to access it.`)
                }
            }
            try {
                if (!bucketExists) {
                    await s3Client.send(new CreateBucketCommand({Bucket: bucket}));
                }
                await s3Client.send(new PutObjectCommand({Bucket: bucket, Key: key, Body:  Buffer.from(data)}));
            } catch (err) {
                throw new Error(err);
            }
            
            
        },

        removeFile: async (bucket, key) => {
            try {
                await s3Client.send(new DeleteObjectCommand({Bucket: bucket, Key: key}));
            } catch (err) {
                if (err.code !== 'NoSuchBucket') {
                    throw new Error(err);
                }
            }
        },

        removeBucket: async (bucket) => {
            try {
                const items = await s3Client.send(new ListObjectsV2Command({Bucket: bucket}));
                if (items.Contents.length !== 0) {
                    const keys = items.Contents.map(i => ({ Key: i.Key}));
                    await s3Client.send(new DeleteObjectsCommand({Bucket: bucket, Delete: { Objects: keys }}));
                }
                await s3Client.send(new DeleteBucketCommand({Bucket: bucket}));
            } catch (err) {
                if (err.Code !== 'NoSuchBucket') { // ignore NoSuchBucket err - bucket should be gone and it is
                    throw new Error(err);
                }
            }
        }
    },
    
    dynamo: {
        createTable: async(tableName, keySchema, attributeDefinitions) => {
            await dynamoClient.send(new CreateTableCommand ({
                TableName: tableName,
                KeySchema: keySchema,
                AttributeDefinitions: attributeDefinitions,
                ProvisionedThroughput: {
                    ReadCapacityUnits: 1,
                    WriteCapacityUnits: 1
                }
            }));
            const waitMs = 1000;
            var retries = 3;
            var isActive = false;
            while (retries-- > 0 && !isActive) {
                try {
                    const tableStatus = await dynamoClient.send(new DescribeTableCommand({TableName: tableName}));
                    isActive = tableStatus.Table.TableStatus === 'ACTIVE';
                } catch (err) {
                    if (err.code !== 'ResourceNotFoundException') {
                        // ignore ResourceNotFound, but nothing else
                        throw(err);
                    }
                } finally {
                    if (!isActive) {
                        await new Promise(r => setTimeout(r, waitMs));
                    }
                }
            }
            if (!isActive) {
                throw new Error(`Timed out trying to create table ${tableName}. Unable to confirm it is active.`);
            }
        },

        deleteTable: async(tableName) => {
            await dynamoClient.send(new DeleteTableCommand({TableName: tableName}));
        }
    }
};

