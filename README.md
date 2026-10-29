# vector.dev

vector.dev is a branded fork of [Happier](https://github.com/happier-dev/happier), the desktop, web, and mobile client for coding agents. This repository retains Happier’s application, CLI, relay server, packages, tests, MIT license, and upstream Git history.

The fork starts from upstream stable `main` at [`97dd7ad63576d5678983b18acc7769d40433adb7`](https://github.com/happier-dev/happier/commit/97dd7ad63576d5678983b18acc7769d40433adb7). Changes apply the vector.dev name, wordmark, app icons, and localized product copy to the existing application. Agent, encryption, session, and synchronization implementations remain upstream code.

## Mac application

Development builds will be available under [Releases](https://github.com/Cxsmxnaut/vector.dev/releases). A compatible coding agent and a Happier account/relay connection are still required. The Mac build targets Apple Silicon and macOS 13 or newer.

The default Relay/API URL is `https://api.happier.dev`; the browser app/sign-in URL is `https://cloud.happier.dev`. Use the same Relay and Happier account on your devices, then choose **Set up this computer** in the desktop app. Explicit relay environment overrides remain supported for custom builds.

This fork retains Happier’s existing session synchronization and direct-session integrations. It does not establish exact two-way synchronization with every private Codex desktop sidebar setting.

The application can use Happier’s existing relay infrastructure or a self-hosted relay. Service names such as Happier Cloud and Happier Voice identify upstream services. vector.dev does not operate those services. Model calls use your existing subscription or API credits; optional third-party services can have their own costs.

Upstream desktop and mobile application updates are disabled in fork builds. Updates require a future vector.dev release and its own signing infrastructure. Unsigned development downloads are not Apple-notarized and macOS may block them.

## Build from source

Use Node.js 24, Yarn Classic 1.22.22, Bun, Rust 1.94.1 or newer, and the macOS Command Line Tools. Full Xcode is needed for upstream’s optional Liquid Glass icon workflow; this fork uses generated PNG/ICNS icons instead.

```sh
git clone https://github.com/Cxsmxnaut/vector.dev.git
cd vector.dev
git switch main
yarn install --frozen-lockfile
yarn --cwd apps/ui tauri:build:production
```

The build uses Happier’s Expo frontend and Rust/Tauri desktop shell, with its bundled setup sidecar. Output is under `apps/ui/src-tauri/target/release/bundle/`.

For the web development interface:

```sh
yarn ui:web
```

Generate the vector.dev artwork on macOS with `node scripts/generateVectorBranding.mjs` after installing dependencies.

## Upstream and compatibility

The original project documentation is preserved in [README.upstream.md](README.upstream.md), with contributor setup in [CONTRIBUTING.md](CONTRIBUTING.md) and detailed guides at [Happier Docs](https://docs.happier.dev). Its download and release links refer to Happier’s builds.

Package names, CLI commands, protocols, deep-link schemes, mobile bundle IDs, and service data formats keep their upstream identifiers for interoperability. Mobile distribution still requires the appropriate platform provisioning; this fork currently distributes the Mac application. The Mac application has its own bundle identity, `dev.vector.desktop`, so it can coexist with Happier.

The earlier `v0.2.0` application was an independent prototype, not a Happier fork. Its code and release are preserved separately at [vector.dev-prototype](https://github.com/Cxsmxnaut/vector.dev-prototype).

Happier and its contributors retain their original attribution under [LICENCE](LICENCE). vector.dev is an independent fork and is not an official Happier or OpenAI release.
