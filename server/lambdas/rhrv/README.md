## RHRV in AWS Lambda

This code runs [RHRV](https://github.com/cran/RHRV/tree/master) in a custom Lambda image that contains the R-core runtime as well as RHRV itself and the libraries it depends on. The code that actually runs our desired RHRV analysis is in functions.R. The code that handles accepting the Lambda event, parsing it, handing the relevant parameters off to our R code, formatting the response and giving it back to Lambda is in runtime.R and mostly comes from https://mdneuzerling.com/post/r-on-aws-lambda-with-containers/ .

The expected input is a JSON array of IBI values (in ms). The expected output is:

`[{"slowerX":0.0633,"slowerY":11.7126,"slowX":0.0782,"slowY":4.1221}]`

...representing the X,Y values of the peaks for the "slower" (0.059-0.069 Hz) and "slow" (0.075 - 0.093 Hz) frequency ranges. If no peak for a particular range can be found the values will be "n/a".