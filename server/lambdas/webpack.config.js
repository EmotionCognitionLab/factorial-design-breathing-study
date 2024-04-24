module.exports = {
    target: 'node',
    externals: [
      'better-sqlite3',
      '@aws-sdk/client-cognito-identity-provider',
      '@aws-sdk/client-dynamodb',
      '@aws-sdk/client-s3',
      '@aws-sdk/client-ses',
      '@aws-sdk/client-sqs',
      '@aws-sdk/credential-providers',
      '@aws-sdk/lib-dynamodb',
      '@aws-sdk/types'
    ],
    module: {
        rules: [
            {
                test: /docusign-esign\/.*\.js$/,
                use: {
                  loader: 'imports-loader',
                  options: {
                    additionalCode: 'var define = false; /* Disable AMD for misbehaving libraries */',
                  },
                },
            }
        ]
    },
    mode: 'production'
};