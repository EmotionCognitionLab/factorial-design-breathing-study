const path = require("path")
const webpack = require("webpack")

module.exports = {
    entry: path.resolve(__dirname, "index.js"),
    output: {
      filename: 'logger.bundle.js',
      path: path.resolve(__dirname, 'dist'),
      library: {
        name: 'Logger',
        type: 'umd'
      },
      globalObject: 'this'
    },
  mode: "production",
  plugins: [
    // fix "process is not defined" error:
    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
  ]
}
