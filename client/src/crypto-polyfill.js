// from https://github.com/aws/aws-sdk-js-v3/discussions/3950#discussioncomment-4337769

import crypto from 'crypto' // should have webcrypto.getRandomValues defined

if (typeof global.crypto !== 'object') {
  global.crypto = crypto
}

if (typeof global.crypto.getRandomValues !== 'function') {
  global.crypto.getRandomValues = getRandomValues
}

function getRandomValues(array) {
  return crypto.webcrypto.getRandomValues(array)
}