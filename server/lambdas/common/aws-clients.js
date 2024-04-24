import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import { SES } from '@aws-sdk/client-ses'
import { S3Client } from '@aws-sdk/client-s3'
import { SQS } from '@aws-sdk/client-sqs'

const region = process.env.REGION;
const dynClient = new DynamoDBClient({region: region, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const dynamoDocClient = DynamoDBDocumentClient.from(dynClient);
const sesClient = new SES({endpoint: process.env.SES_ENDPOINT, region: region});

const cognitoClient = new CognitoIdentityProvider({ region: region });

const s3Client = new S3Client({
    apiVersion: '2006-03-01',
    region: region,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true
  });

const sqsClient = new SQS({region: region});

export { dynamoDocClient, sesClient, cognitoClient, s3Client, sqsClient }