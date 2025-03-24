const path = require('path');

module.exports = {
    entry: './src/index.js',  // 入口文件
    output: {  // 输出配置
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    devServer: {  // 开发服务器配置
        static: {
            directory: path.join(__dirname, 'dist'),  // 指定静态文件的根目录
        },
        compress: true,
        port: 3000,  // 可以指定一个端口，默认是 8080
        open: true,  // 自动打开浏览器窗口
        host: '0.0.0.0', // 允许从外部访问
        proxy: [{
            context: ['/socket.io'],
            target: 'http://localhost:3001',
            ws: true,
            changeOrigin: true
        }]
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    }
};
