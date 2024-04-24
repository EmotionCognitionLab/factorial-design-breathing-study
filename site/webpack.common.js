const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
    entry: {
        'admin/dashboard': 'admin/dashboard/index.js',
        'register': 'register/index.js',
        'login': 'login/login.js',
        // 'logout': 'logout/logout.js',
        // 'pay-info': 'pay-info-page/index.js',
    },
    plugins: [
        // here to quiet complaint about process.env not existing when util lib is loaded
        // by logger
        new webpack.DefinePlugin({
            'process.env': JSON.stringify({'NODE_DEBUG': false}),
        }),
        new HtmlWebpackPlugin({
            title: 'Admin - Dashboard',
            filename: 'admin/dashboard/index.html',
            template: 'admin/dashboard/index.ejs',
            chunks: ['admin/dashboard'],
        }),
        new HtmlWebpackPlugin({
            title: 'Register',
            filename: 'register/index.html',
            template: 'register/index.ejs',
            chunks: ['register'],
        }),
        new HtmlWebpackPlugin({
            title: 'USC Mind-Body Study Login',
            filename: 'login/index.html',
            template: 'login/index.ejs',
            chunks: ['login'],
        }),
        // new HtmlWebpackPlugin({
        //     title: 'HeartBEAM Logout',
        //     filename: 'logout/index.html',
        //     chunks: ['logout'],
        // }),
        // new HtmlWebpackPlugin({
        //     title: 'HeartBEAM Logout',
        //     filename: 'logout/success/index.html',
        //     chunks: ['logout'],
        // }),
        // new HtmlWebpackPlugin({
        //     title: 'HeartBEAM Logout',
        //     filename: 'logout/error/index.html',
        //     chunks: ['logout'],
        // }),
        // new HtmlWebpackPlugin({
        //     title: 'Payment Info',
        //     filename: 'pay-info/index.html',  // intentionally not pay-info-page!
        //     template: 'pay-info-page/index.ejs',
        //     chunks: ['pay-info'],
        // }),
    ],
    optimization: {
        splitChunks: {
            chunks: "all",
        },
    },
    module: {
        rules: [
            {
                test: /\.html$/i,
                loader: "html-loader",
            },
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif|wav|ogg|mp3)$/i,
                type: 'asset/resource',
            },
            { 
                test: /\.handlebars$/, 
                loader: "handlebars-loader" 
            },
            {
                exclude: [path.join(__dirname, "scripts")],
            }
        ],
    },
    resolve: {
        modules: [
            __dirname,
            path.join(__dirname, "node_modules"),
            path.join(__dirname, "../", "common/api/node_modules"),
            path.join(__dirname, "../", "common/auth/node_modules"),
            path.join(__dirname, "../", "common/db/node_modules"),
            path.join(__dirname, "../", "common/logger/node_modules"),
            // path.join(__dirname, "../..", "common/pay-info/node_modules"),
        ],
    },
};
