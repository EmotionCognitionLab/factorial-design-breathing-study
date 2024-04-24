const path = require("path")

module.exports = {
    entry: path.resolve(__dirname, "logger.js"),
    output: {
      filename: 'logger.bundle.js',
      path: path.resolve(__dirname, 'dist'),
      library: {
        name: 'Logger',
        type: 'umd',
      }
    },
  mode: "production",
}
