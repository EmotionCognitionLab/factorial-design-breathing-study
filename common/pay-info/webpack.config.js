const path = require("path")

module.exports = {
  entry: path.resolve(__dirname, "pay-info.js"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "payinfo.bundle.js",
    library: {
        type: "umd"
    },
    libraryTarget: "module",
  },
  module: {
    rules: [
        {
            test: /\.(js)$/,
            exclude: [/node_modules/, /types\.js/],
            use: "babel-loader",
        },
        {
            test: /\.html$/i,
            loader: "html-loader",
        },
        { 
          test: /\.handlebars$/, 
          loader: "handlebars-loader" 
        }
    ],
  },
  mode: "production",
  experiments: {
    outputModule: true
  }
}
