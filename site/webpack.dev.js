const path = require("path");
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    devServer: {
        static: path.join(__dirname, "dist"),
        compress: true,
        port: 9000,
    },
    mode: "development",
    output: {
        filename: '[name].bundle.js',
        path: path.join(__dirname, "dist"),
        clean: true
    },
});

