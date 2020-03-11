module.exports = {
    env: {
        browser: true,
        node: true,
        es6: true,
        mocha: true,
        jest: true,
        jasmine: true
    },
    parser: "babel-eslint",
    rules: {
        indent: [
            'error',
            2,
            {
                SwitchCase: 1,
                flatTernaryExpressions: true
            }
        ],
        semi: ["error", "always"],
        // 'import/no-extraneous-dependencies': 'off',
        // 'complexity': 'off',
        'no-unused-vars': 'off',
        // 'no-extra-parens': 'off',
        // 'newline-per-chained-call': 'off',
        // 'max-params': 'off',
    },
};
