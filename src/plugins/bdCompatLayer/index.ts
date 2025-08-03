/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

"use strict";
/* eslint-disable eqeqeq */
// import { readFileSync } from "fs";
// const process = require("~process");
import { Settings } from "@api/Settings";
import { copyToClipboard } from "@utils/clipboard";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, PluginDef } from "@utils/types";
import { React } from "@webpack/common";

import { PluginMeta } from "~plugins";

import { PLUGIN_NAME,ZENFS_BUILD_HASH } from "./constants";
import { cleanupGlobal, createGlobalBdApi, getGlobalApi } from "./fakeBdApi";
import { addContextMenu, addDiscordModules, FakeEventEmitter, fetchWithCorsProxyFallback, Patcher } from "./fakeStuff";
import { injectSettingsTabs, unInjectSettingsTab } from "./fileSystemViewer";
import { addCustomPlugin, convertPlugin, removeAllCustomPlugins } from "./pluginConstructor";
import { ReactUtils_filler } from "./stuffFromBD";
import { aquireNative, FSUtils, getDeferred, reloadCompatLayer, simpleGET, ZIPUtils } from "./utils";
// String.prototype.replaceAll = function (search, replacement) {
//     var target = this;
//     return target.split(search).join(replacement);
// };

const thePlugin = {
    name: PLUGIN_NAME,
    description: "Converts BD plugins to run in Vencord",
    authors: [
        Devs.Davvy,
        Devs.WhoIsThis,
    ],
    // patches: [
    //     {
    //         match: (/(\w+)\.\w+\s*=\s*function\(\w+\,\w+\){for\(var\s+\w\s+in\s\w+\)\w\.o\(\w,\w\)&&!\w\.o\(\w,\w\)&&Object.defineProperty\(\w,\w,{enumerable:!0,get:\w\[\w\]}\)}/.toString()),
    //         replace: `$1.d = function (target, exports) { console.log("hello there"); for (const key in exports) { Object.defineProperty( target, key, {get: () => exports[key](),set: e => { exports[key] = () => e }, enumerable: !0, configurable: !1}); } }`
    //     }
    // ],
    options: {
        enableExperimentalRequestPolyfills: {
            description: "Enables request polyfills that first try to request using normal fetch, then using a cors proxy when the normal one fails",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: false,
        },
        corsProxyUrl: {
            description: "CORS proxy used to bypass CORS",
            type: OptionType.STRING,
            default: "https://cors-get-proxy.sirjosh.workers.dev/?url=",
            restartNeeded: true,
        },
        useIndexedDBInstead: {
            description: "Uses indexedDB instead of localStorage. It may cause memory usage issues but prevents exceeding localStorage quota. Note, after switching, you have to import your stuff back manually",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: true,
        },
        useRealFsInstead: {
            description: "Uses true, real filesystem hosted locally mounted on RealFS server's mount point instead of localStorage. It may cause memory usage issues but prevents exceeding localStorage quota. Note, after switching, you have to import your stuff back manually",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: true,
        },
        ...(!IS_WEB && {
            usePoorlyMadeRealFs: {
                description: "Uses your very own filesystem to manage plugins, etc. Not recommended as there is no security for this option. Use at your own risk, basically. Not functional right now.",
                type: OptionType.BOOLEAN,
                default: false,
                restartNeeded: true,
            }
        }),
        safeMode: {
            description: "Loads only filesystem",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: true,
        },
        pluginUrl1: {
            description: "Plugin url 1",
            type: OptionType.STRING,
            default: "",
            restartNeeded: true,
        },
        pluginUrl2: {
            description: "Plugin url 2",
            type: OptionType.STRING,
            default: "",
            restartNeeded: true,
        },
        pluginUrl3: {
            description: "Plugin url 3",
            type: OptionType.STRING,
            default: "",
            restartNeeded: true,
        },
        pluginUrl4: {
            description: "Plugin url 4",
            type: OptionType.STRING,
            default: "",
            restartNeeded: true,
        },
        pluginsStatus: {
            description: "",
            default: {},
            type: OptionType.COMPONENT,
            component() {
                return React.createElement("div");
            }
        }
    },
    originalBuffer: {},
    globalWasNotExisting: false,
    globalDefineWasNotExisting: false,
    start() {
        injectSettingsTabs();
        const reimplementationsReady = getDeferred<void>();
        // const proxyUrl = "https://api.allorigins.win/raw?url=";
        // const proxyUrl = "https://cors-get-proxy.sirjosh.workers.dev/?url=";
        const proxyUrl = Settings.plugins[this.name].corsProxyUrl ?? this.options.corsProxyUrl.default;
        // eslint-disable-next-line no-prototype-builtins
        if (!Settings.plugins[this.name].hasOwnProperty("pluginsStatus")) {
            Settings.plugins[this.name].pluginsStatus = this.options.pluginsStatus.default;
        }
        // const Filer = this.simpleGET(proxyUrl + "https://github.com/jvilk/BrowserFS/releases/download/v1.4.3/browserfs.js");
        const reallyUsePoorlyMadeRealFs = IS_WEB ? false : (Settings.plugins[this.name].usePoorlyMadeRealFs ?? this.options.usePoorlyMadeRealFs!.default);
        if (!reallyUsePoorlyMadeRealFs) {
            fetch(
                proxyUrl +
                // "https://github.com/jvilk/BrowserFS/releases/download/v1.4.3/browserfs.min.js"
                // "http://localhost:8080/browserfs.min.js"
                // `https://github.com/LosersUnited/BrowserFS-builds/raw/${BROWSERFS_BUILD_HASH}/dist/browserfs.min.js` // TODO: Add option to change this
                `https://github.com/LosersUnited/ZenFS-builds/raw/${ZENFS_BUILD_HASH}/bin/bundle.js` // TODO: Add option to change this
            )
                .then(out => out.text())
                .then(out2 => {
                    out2 += "\n//# sourceURL=betterDiscord://internal/BrowserFs.js";
                    eval.call(
                        window,
                        // out2.replaceAll(
                        //     ".localStorage",
                        //     ".Vencord.Util.localStorage"
                        // )
                        out2
                    );
                    const zen = globalThis.ZenFS_Aquire();
                    const ZenFs = zen.zenfs;
                    const ZenFsDom = zen.zenfs_dom;

                    const temp: any = {};
                    const target = {
                        browserFSSetting: {},
                    }; // because "let" sucks
                    /*
                    if (Settings.plugins[this.name].useRealFsInstead === true) {
                        target.browserFSSetting = {
                            fs: "AsyncMirror",
                            options: {
                                sync: { fs: "InMemory" },
                                async: { fs: "RealFS", options: { apiUrl: "http://localhost:2137/api" } },
                            },
                        };
                    } else*/ if (Settings.plugins[this.name].useIndexedDBInstead === true) {
                        target.browserFSSetting = {
                            // fs: "AsyncMirror",
                            // options: {
                            //     sync: { fs: "InMemory" },
                            //     async: { fs: "IndexedDB", options: { storeName: "VirtualFS" } },
                            // },
                            backend: ZenFsDom.IndexedDB,
                            storeName: "VirtualFS",
                        };
                    } else {
                        target.browserFSSetting = {
                            // fs: "LocalStorage",
                            backend: ZenFsDom.WebStorage, storage: Vencord.Util.localStorage,
                        };
                    }
                    // window.BrowserFS.install(temp);
                    // window.BrowserFS.configure(
                    //     target.browserFSSetting,
                    ZenFs.configureSingle(target.browserFSSetting).then(
                        // {
                        // fs: "InMemory"
                        // fs: "LocalStorage",
                        // fs: "IndexedDB",
                        // options: {
                        //     "storeName": "VirtualFS"
                        // },
                        // fs: "AsyncMirror",
                        // options: {
                        //     sync: { fs: "InMemory" },
                        //     async: { fs: "IndexedDB", options: { storeName: "VirtualFS" } },
                        // }
                        // },
                        async () => {
                            // window.BdApi.ReqImpl.fs = temp.require("fs");
                            // window.BdApi.ReqImpl.path = temp.require("path");
                            // ReImplementationObject.fs = temp.require("fs");

                            // reimplementationsReady should be checked but nahh
                            // ReImplementationObject.fs = patchReadFileSync(patchMkdirSync(temp.require("fs")));
                            ReImplementationObject.fs = ZenFs.fs;
                            const path = await (await fetch("https://cdn.jsdelivr.net/npm/path-browserify@1.0.1/index.js")).text();
                            const result = eval.call(window,"(()=>{const module = {};" + path + "return module.exports;})();\n//# sourceURL=betterDiscord://internal/path.js");
                            // ReImplementationObject.path = /*temp.require("path")*/;
                            ReImplementationObject.path = result;
                            if (Settings.plugins[this.name].safeMode == undefined || Settings.plugins[this.name].safeMode == false)
                                // @ts-ignore
                                windowBdCompatLayer.fsReadyPromise.resolve();
                        }
                    );
                });
        }
        else {
            const native = aquireNative();
            console.warn("Waiting for reimplementation object to be ready...");
            reimplementationsReady.promise.then(async () => {
                console.warn("Enabling real fs...");
                // const nativeBridge = await native.getBridge();
                // ReImplementationObject.fs = nativeBridge.fs;
                // ReImplementationObject.path = nativeBridge.path;
                // ReImplementationObject.process.env._home_secret = nativeBridge.getUserHome()!;
                const req = (await native.unsafe_req()) as globalThis.NodeRequire;
                ReImplementationObject.fs = await req("fs");
                ReImplementationObject.path = await req("path");
                ReImplementationObject.process.env._home_secret = (await native.getUserHome())!;
                if (Settings.plugins[this.name].safeMode == undefined || Settings.plugins[this.name].safeMode == false)
                    // @ts-ignore
                    windowBdCompatLayer.fsReadyPromise.resolve();
            });
        }
        // const Utils = {
        //     stream2buffer(stream) {
        //         return new Promise((resolve, reject) => {
        //             const _buf = [];
        //             stream.on("data", chunk => _buf.push(chunk));
        //             stream.on("end", () => resolve(Buffer.concat(_buf)));
        //             stream.on("error", err => reject(err));
        //         });
        //     },
        // };
        let _Router = null;
        const windowBdCompatLayer = {
            // Utils,
            // exportZip,
            // completeFileSystem,
            // downloadZip,
            // importZip,
            // importFile,
            FSUtils,
            ZIPUtils,
            reloadCompatLayer,
            fsReadyPromise: getDeferred(),
            mainObserver: {},
            mainRouterListener: () =>
                window.GeneratedPlugins.forEach(plugin =>
                    BdApiReImplementation.Plugins.isEnabled(plugin.name) && typeof plugin.instance.onSwitch === "function" && plugin.instance.onSwitch()
                ),
            get Router() {
                if (_Router == null)
                    _Router = BdApiReImplementation.Webpack.getModule(x => x.listeners && x.flushRoute);
                return _Router as null | { listeners: Set<Function>; };
            },
            fakeClipboard: undefined,
            wrapPluginCode: (code: string, filename = "RuntimeGenerated.plugin.js") => { return convertPlugin(code, filename, false); },
            queuedPlugins: [],
        };
        window.BdCompatLayer = windowBdCompatLayer;

        window.GeneratedPlugins = [];
        const ReImplementationObject = {
            // request: (url, cb) => {
            //     cb({ err: "err" }, undefined, undefined);
            // },
            fs: {},
            path: {},
            https: {
                get_(url: string, options, cb: (em: typeof FakeEventEmitter.prototype) => void) {
                    const ev = new ReImplementationObject.events.EventEmitter();
                    const ev2 = new ReImplementationObject.events.EventEmitter();
                    const fetchResponse = fetchWithCorsProxyFallback(url, { ...options, method: "get" }, proxyUrl);
                    fetchResponse.then(async x => {
                        ev2.emit("response", ev);
                        if (x.body) {
                            const reader = x.body.getReader();
                            let result = await reader.read();
                            while (!result.done) {
                                ev.emit("data", result.value);
                                result = await reader.read();
                            }
                        }
                        ev.emit("end", Object.assign({}, x, {
                            statusCode: x.status,
                            headers: Object.fromEntries(x.headers.entries()),
                        }));
                    });
                    cb(ev);
                    fetchResponse.catch(reason => {
                        // eslint-disable-next-line @typescript-eslint/dot-notation
                        if (ev2.callbacks["error"]) // https://nodejs.org/api/http.html#class-httpclientrequest "For backward compatibility, res will only emit 'error' if there is an 'error' listener registered."
                            ev2.emit("error", reason);
                    });
                    return ev2;
                },
                get get() {
                    if (Settings.plugins[thePlugin.name].enableExperimentalRequestPolyfills === true)
                        return this.get_;
                    return undefined;
                }
            },
            get request_() {
                const fakeRequest = function (url: string, cb = (...args) => { }, headers = {}) {
                    const stuff = { theCallback: cb };
                    if (typeof headers === "function") {
                        // @ts-ignore
                        cb = headers;
                        headers = stuff.theCallback;
                    }
                    // @ts-ignore
                    delete stuff.theCallback;
                    // cb({ err: "err" }, undefined, undefined);
                    const fetchOut = fetchWithCorsProxyFallback(url, { ...headers, method: "get" }, proxyUrl);
                    // uh did somebody say "compatibility"? no? I didn't hear that either.
                    fetchOut.then(async x => {
                        // cb(undefined, x, await x.text());
                        cb(undefined, Object.assign({}, x, {
                            statusCode: x.status,
                            headers: Object.fromEntries(x.headers.entries()),
                        }), await x.text()); // shouldn't this be arrayBuffer?
                    });
                    fetchOut.catch(x => {
                        cb(x, undefined, undefined);
                    });
                };
                // fakeRequest.stuffHere = function () {}
                fakeRequest.get = function (url: string, cb = (...args) => { }, options = {}) {
                    return this(url, cb, { ...options, method: "get" });
                };
                return fakeRequest;
            },
            get request() {
                if (Settings.plugins[thePlugin.name].enableExperimentalRequestPolyfills === true)
                    return this.request_;
                return undefined;
            },
            events: {
                EventEmitter: FakeEventEmitter,
            },
            electron: {},
            process: {
                env: {
                    // HOME: "/home/fake",
                    _home_secret: "",
                    get HOME() {
                        if (reallyUsePoorlyMadeRealFs) {
                            return this._home_secret;
                        }
                        const target = "/home/fake";
                        FSUtils.mkdirSyncRecursive(target);
                        return target;
                    }
                },
            },
        };
        reimplementationsReady.resolve();
        const FakeRequireRedirect = (name: keyof typeof ReImplementationObject) => {
            return ReImplementationObject[name];
        };
        const BdApiReImplementation = createGlobalBdApi();
        window.BdApi = BdApiReImplementation;
        if (PluginMeta[PLUGIN_NAME].userPlugin === true) {
            BdApiReImplementation.UI.showConfirmationModal("Error", "BD Compatibility Layer will not work as a user plugin!", { cancelText: null, onCancel: null });
            console.warn("Removing settings tab...");
            unInjectSettingsTab();
            console.warn("Removing compat layer...");
            delete window.BdCompatLayer;
            console.warn("Removing BdApi...");
            cleanupGlobal();
            delete window.BdApi;
            throw new Error("BD Compatibility Layer will not work as a user plugin!");
        }
        window // Talk about being tedious
            .nuhuh = // Why the hell did vencord not expose process??
            (bool = true) => {
                BdApiReImplementation
                    .Webpack
                    .getModule(
                        x =>
                            x
                                .logout)
                    .logout();
                console
                    .log(
                        "HAHAHAHH GET NUHUH'ED");
            };
        // window.BdApi.UI = new UI();
        // @ts-ignore
        window.require = FakeRequireRedirect;
        this.originalBuffer = window.Buffer;
        window.Buffer = BdApiReImplementation.Webpack.getModule(x => x.INSPECT_MAX_BYTES)?.Buffer;
        if (typeof window.global === "undefined") {
            this.globalWasNotExisting = true;
            this.globalDefineWasNotExisting = true;
        } else if (typeof window.global.define === "undefined") {
            this.globalDefineWasNotExisting = true;
        }
        window.global = window.global || globalThis;
        window.global.define = window.global.define || function () { };
        // window.BdApi.ReqImpl = ReImplementationObject;
        windowBdCompatLayer.fakeClipboard = (() => {
            const try1 = BdApiReImplementation.Webpack.getModule(x => x.clipboard);
            if (try1) {
                return try1.clipboard;
            }
            return {
                copy: copyToClipboard,
            };
        })();

        const injectedAndPatched = new Promise<void>((resolve, reject) => {
            ReactUtils_filler.setup({ React: React });
            addDiscordModules(proxyUrl).then(DiscordModulesInjectorOutput => {
                const DiscordModules = DiscordModulesInjectorOutput.output;
                const makeOverrideOriginal = Patcher.makeOverride;
                Patcher.makeOverride = function makeOverride(...args) {
                    const ret = makeOverrideOriginal.call(this, ...args);
                    Object.defineProperty(ret, "name", { value: "BDPatcher" });
                    return ret;
                };
                Patcher.setup(DiscordModules);
                addContextMenu(DiscordModules, proxyUrl).then(ContextMenuInjectorOutput => {
                    const ContextMenu = ContextMenuInjectorOutput.output;
                    BdApiReImplementation.ContextMenu = ContextMenu;
                    resolve();
                }, reject);
            }, reject);
        });

        const fakeLoading = document.createElement("span");
        fakeLoading.style.display = "none";
        fakeLoading.id = "bd-loading-icon";
        document.body.appendChild(fakeLoading);
        setTimeout(() => {
            fakeLoading.remove();
        }, 500);
        const fakeBdHead = document.createElement("bd-head");
        document.body.appendChild(fakeBdHead);
        const fakeBdStyles = document.createElement("bd-styles");
        fakeBdHead.appendChild(fakeBdStyles);
        const fakeBdScripts = document.createElement("bd-scripts");
        fakeBdHead.appendChild(fakeBdScripts);
        // const checkInterval = setInterval(() => {
        //     if (window.BdApi.ReqImpl.fs === undefined)
        //         return;
        //     clearInterval(checkInterval);
        Promise.all([windowBdCompatLayer.fsReadyPromise.promise, injectedAndPatched]).then(() => {
            // getGlobalApi().DOM.addStyle("bd-compat-layer-stuff", '.bd-compat-setting > div > h2 { display: none; } .bd-compat-setting label { height: 0px; width: 0px; } .bd-compat-setting div[class^="labelRow_"] { height: 0px; }');
            getGlobalApi().DOM.addStyle("bd-compat-layer-stuff", ".bd-compat-setting .vc-plugins-setting-title { display: none; }");
            windowBdCompatLayer.Router?.listeners.add(windowBdCompatLayer.mainRouterListener);
            const observer = new MutationObserver(mutations => mutations.forEach(m => window.GeneratedPlugins.forEach(p => BdApiReImplementation.Plugins.isEnabled(p.name) && p.instance.observer?.(m))));
            observer.observe(document, {
                childList: true,
                subtree: true
            });
            windowBdCompatLayer.mainObserver = observer;
            const localFs = window.require("fs");
            if (!localFs.existsSync(BdApiReImplementation.Plugins.folder)) {
                // localFs.mkdirSync(BdApiReimpl.Plugins.rootFolder);
                // localFs.mkdirSync(BdApiReimpl.Plugins.folder);
                // Utils.mkdirSyncRecursive(BdApiReImplementation.Plugins.folder);
                FSUtils.mkdirSyncRecursive(BdApiReImplementation.Plugins.folder);
            }
            for (const key in this.options) {
                if (Object.hasOwnProperty.call(this.options, key)) {
                    if (Settings.plugins[this.name][key] && key.startsWith("pluginUrl")) {
                        try {
                            const url = Settings.plugins[this.name][key];
                            // const filenameFromUrl = url.split("/").pop();
                            const response = simpleGET(proxyUrl + url);
                            const filenameFromUrl = response.responseURL
                                .split("/")
                                .pop();
                            // this.convertPlugin(this.simpleGET(proxyUrl + url).responseText, filenameFromUrl).then(plugin => {

                            localFs.writeFileSync(
                                BdApiReImplementation.Plugins.folder +
                                "/" +
                                filenameFromUrl,
                                response.responseText
                            );
                        } catch (error) {
                            console.error(
                                error,
                                "\nWhile loading: " +
                                Settings.plugins[this.name][key]
                            );
                        }
                    }
                }
            }

            const pluginFolder = localFs
                .readdirSync(BdApiReImplementation.Plugins.folder)
                .sort();
            const plugins = pluginFolder.filter(x =>
                x.endsWith(".plugin.js")
            );
            for (let i = 0; i < plugins.length; i++) {
                const element = plugins[i];
                const pluginJS = localFs.readFileSync(
                    BdApiReImplementation.Plugins.folder + "/" + element,
                    "utf8"
                );
                convertPlugin(pluginJS, element, true, BdApiReImplementation.Plugins.folder).then(plugin => {
                    addCustomPlugin(plugin);
                });
            }
        });
        BdApiReImplementation.DOM.addStyle("OwOStylesOwO", `
            .custom-notification {
                display: flex;
                flex-direction: column;
                position: absolute;
                bottom: 20px; right: 20px;
                width: 440px; height: 270px;
                overflow: hidden;
                background-color: var(--modal-background);
                color: white;
                border-radius: 5px;
                box-shadow: var(--legacy-elevation-border),var(--legacy-elevation-high);
                animation: 1s slide cubic-bezier(0.39, 0.58, 0.57, 1);
            }
            @keyframes slide {
                0% {
                    right: -440px;
                }
                100% {
                    right: 20px;
                }
            }
            .custom-notification.close {
                animation: 1s gobyebye cubic-bezier(0.39, 0.58, 0.57, 1) forwards;
                right: 20px;
            }

            @keyframes gobyebye {
                0% {
                    right: 20px;
                }
                100% {
                    right: -440px;
                }
            }
            .custom-notification .top-box {padding: 16px;}
            .custom-notification .notification-title {font-size: 20px; font-weight: bold;}
            .custom-notification .content {
                padding: 0 16px 20px;
                flex: 1 1 auto;
                overflow: hidden;
            }
            .custom-notification .bottom-box {
                background-color: var(--modal-footer-background);
                padding: 16px;
                display: flex;
                justify-content: flex-end;
                align-items: center;
            }
            .custom-notification .confirm-button {
                background-color: #007bff;
                color: white;
                border-radius: 5px;
                padding: 5px 10px;
                margin: 0 5px;
            }
            .custom-notification .cancel-button {
                background-color: red;
                color: white;
                border-radius: 5px;
                padding: 5px 10px;
                margin: 0 5px;
            }
            .button-with-svg {
                position: absolute;
                right: 15px;
                margin-top: -0px !important;
                background: transparent;
            }
        `);
    },
    async stop() {
        console.warn("Disabling observer...");
        window.BdCompatLayer.mainObserver.disconnect();
        console.warn("Removing onSwitch listener...");
        window.BdCompatLayer.Router.listeners.delete(window.BdCompatLayer.mainRouterListener);
        console.warn("UnPatching context menu...");
        getGlobalApi().Patcher.unpatchAll("ContextMenuPatcher");
        console.warn("Removing plugins...");
        await removeAllCustomPlugins();
        console.warn("Removing added css...");
        getGlobalApi().DOM.removeStyle("OwOStylesOwO");
        getGlobalApi().DOM.removeStyle("bd-compat-layer-stuff");
        console.warn("Removing settings tab...");
        unInjectSettingsTab();
        // console.warn("Freeing blobs...");
        // Object.values(window.GeneratedPluginsBlobs).forEach(x => {
        //     URL.revokeObjectURL(x);
        //     delete window.GeneratedPluginsBlobs[x];
        // });
        // URL.revokeObjectURL(window.BdCompatLayer.contextMenuBlobUrl);
        // URL.revokeObjectURL(window.BdCompatLayer.discordModulesBlobUrl);
        if (this.globalDefineWasNotExisting === true) {
            console.warn("Removing global.define...");
            delete window.global.define;
        }
        if (this.globalWasNotExisting === true) {
            console.warn("Removing global...");
            // @ts-ignore
            delete window.global;
        }
        console.warn("Removing compat layer...");
        delete window.BdCompatLayer;
        console.warn("Removing BdApi...");
        cleanupGlobal();
        delete window.BdApi;
        if (window.zip) {
            console.warn("Removing ZIP...");
            delete window.zip;
        }
        console.warn("Removing FileSystem...");
        delete window.BrowserFS;
        console.warn("Restoring buffer...");
        window.Buffer = this.originalBuffer as BufferConstructor;
    },
};

export default definePlugin({
    name: "BD Compatibility Layer",
    ...thePlugin
} as PluginDef);
