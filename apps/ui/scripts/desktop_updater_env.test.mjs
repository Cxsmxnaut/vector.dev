import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {transformSync} = require('@babel/core');
const {expoInlineEnvVars} = require('babel-preset-expo/build/inline-env-vars');
const sourceUrl = new URL('../sources/desktop/updates/desktopUpdater.ts', import.meta.url);
const publicFlag = 'EXPO_PUBLIC_HAPPIER_DESKTOP_UPDATES_ENABLED';

for (const value of ['0', '1']) {
    test(`desktop update override ${value} is embedded in the production web bundle`, async () => {
        const previous = process.env[publicFlag];
        process.env[publicFlag] = value;
        try {
            const resolvedOverrides = [];
            // Exercise the real Expo compiler boundary. Host process.env tests alone cannot
            // detect an override that disappears when the code runs inside a webview.
            transformSync(await readFile(sourceUrl, 'utf8'), {
                filename: sourceUrl.pathname,
                babelrc: false,
                configFile: false,
                caller: {name: 'metro', isDev: false},
                parserOpts: {plugins: ['typescript']},
                plugins: [
                    expoInlineEnvVars,
                    () => ({visitor: {CallExpression: {exit(path) {
                        if (path.node.callee.type !== 'Identifier' || path.node.callee.name !== 'parseOptionalBoolean') return;
                        const [argument] = path.node.arguments;
                        resolvedOverrides.push(argument?.type === 'StringLiteral' ? argument.value : undefined);
                    }}}}),
                ],
            });
            assert.deepEqual(resolvedOverrides, [value]);
        } finally {
            if (previous === undefined) delete process.env[publicFlag];
            else process.env[publicFlag] = previous;
        }
    });
}
