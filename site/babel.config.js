module.exports = {
    plugins: [
        '@babel/plugin-transform-destructuring',
        '@babel/plugin-transform-regenerator',
        '@babel/plugin-transform-runtime'
    ],
    presets: ['@babel/preset-env'],
    env: {
        'test': {
            'presets': [
                ['@babel/preset-env', { 'targets': { 'node': 'current' } }]
            ]
        }
    }
};
